'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';
import { dueSoon, itemStatus, nextDueFrom, summarise } from '../../../lib/compliance';
import { vendorNameKey } from '../../../lib/vendorName.js';

/**
 * app/operations/compliance/page.js — the compliance register.
 *
 * What a restaurant must legally hold, what its suppliers must hold for it,
 * and what has to be done again and again. Three kinds of thing, one table,
 * one page:
 *
 *   Ours       a licence we hold — FSSAI, fire NOC, insurance
 *   Vendors    a supplier's own certificate, filed against them
 *   Recurring  a duty that repeats — pest control, calibration, deep cleaning
 *
 * A licence and a certificate are valid UNTIL a date. A recurring duty was
 * LAST DONE on a date and is NEXT DUE on another. Both are judged by
 * `lib/compliance.js`, so the page and any future reminder job say the same
 * thing about the same row.
 *
 * The bottom of the page reads the daily checklists, because a hygiene check
 * that was missed is a compliance fact too.
 */

const CATEGORIES = [
  'Regulatory', 'Food safety', 'Fire safety', 'Insurance', 'Statutory',
  'Environment', 'Equipment', 'Vendor', 'Other',
];

const CADENCES = [
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every three months' },
  { value: 'half_yearly', label: 'Every six months' },
  { value: 'annual', label: 'Every year' },
];

// What a restaurant normally holds. The empty state offers these so the
// register starts from the real list rather than a blank page — each one is
// a suggestion, not a record with a made-up date.
const START_HERE = [
  { name: 'FSSAI Food Licence', category: 'Regulatory', authority: 'Food Safety & Standards Authority' },
  { name: 'FoSTaC Certificate — food safety supervisor', category: 'Food safety', authority: 'FSSAI' },
  { name: 'Fire NOC', category: 'Fire safety', authority: 'State Fire Services' },
  { name: 'Trade Licence (Shops & Establishments)', category: 'Regulatory' },
  { name: 'Municipal / Corporation Licence', category: 'Regulatory' },
  { name: 'Legal Metrology Registration', category: 'Statutory' },
  { name: 'Pollution Control Board Consent', category: 'Environment' },
  { name: 'Fire & Public Liability Insurance', category: 'Insurance' },
  { name: 'Pest Control Contract', category: 'Vendor', recurring: true, cadence: 'monthly' },
  { name: 'Fire Extinguisher Servicing', category: 'Fire safety', recurring: true, cadence: 'annual' },
  { name: 'Deep Kitchen Cleaning — ducts & hoods', category: 'Food safety', recurring: true, cadence: 'half_yearly' },
  { name: 'Thermometer & Scale Calibration', category: 'Equipment', recurring: true, cadence: 'annual' },
];

const KINDS = [
  { value: 'licence', label: 'Our licence' },
  { value: 'vendor_cert', label: 'Vendor certification' },
  { value: 'recurring', label: 'Recurring duty' },
];

const EMPTY_FORM = {
  kind: 'licence',
  name: '',
  category: 'Regulatory',
  authority: '',
  reference_no: '',
  issued_on: '',
  expires_on: '',
  cadence: '',
  last_done_on: '',
  next_due_on: '',
  vendor_id: '',
  owner_employee_id: '',
  cost: '',
  payment_status: '',
  document_url: '',
  notes: '',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysAgo(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const STATUS_PILL = {
  expired: 'pill-bad',
  due_soon: 'pill-warn',
  due: 'pill-warn',
  ok: 'pill-good',
  unknown: 'pill-quiet',
};

const STATUS_LABEL = {
  expired: 'Expired',
  due_soon: 'Due soon',
  due: 'Due',
  ok: 'Valid',
  unknown: 'No date',
};

export default function CompliancePage() {
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [openVendor, setOpenVendor] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [vendorSearch, setVendorSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [itemsRes, vendorsRes, employeesRes, templatesRes, runsRes] = await Promise.all([
        supabase.from('compliance_items').select('*').order('id'),
        supabase.from('vendors').select('id,name,description').order('name'),
        supabase.from('employees').select('employee_id,name,designation').eq('status', 'active').order('name'),
        supabase.from('checklist_templates').select('id,title,cadence,department,schedule_times,is_active').eq('is_active', true),
        supabase.from('checklist_runs').select('id,template_id,title,status,due_at,submitted_at,approved_at,department')
          .order('due_at', { ascending: false }).limit(400),
      ]);
      const failure = [itemsRes, vendorsRes, employeesRes, templatesRes, runsRes].find(r => r.error);
      if (failure) throw new Error(failure.error.message);
      setItems(itemsRes.data || []);
      setVendors(vendorsRes.data || []);
      setEmployees(employeesRes.data || []);
      setTemplates(templatesRes.data || []);
      setRuns(runsRes.data || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const vendorById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);
  const employeeById = useMemo(() => new Map(employees.map(e => [e.employee_id, e])), [employees]);

  const stats = useMemo(() => summarise(items), [items]);

  // ---- the daily checks: the other half of compliance --------------------
  const dailyChecks = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return templates.map(t => {
      const own = runs.filter(r => r.template_id === t.id);
      const recent = own.filter(r => r.due_at && new Date(r.due_at).getTime() >= cutoff);
      const done = recent.filter(r => r.status === 'completed');
      const missed = recent.filter(r => r.status === 'missed' || r.status === 'overdue');
      const last = own
        .filter(r => r.submitted_at || r.due_at)
        .sort((a, b) => new Date(b.due_at || 0) - new Date(a.due_at || 0))[0];
      const lastDays = last ? daysAgo(last.submitted_at || last.due_at) : null;
      return {
        template: t,
        runs30: recent.length,
        completed30: done.length,
        missed30: missed.length,
        last,
        lastDays,
        state: !last ? 'never'
          : missed.length > 0 ? 'missed'
          : lastDays !== null && lastDays > 1 ? 'quiet'
          : 'ok',
      };
    });
  }, [templates, runs]);

  // A check that has not run on time is the truth here. Counting only the
  // misses would read "0 missed" on a kitchen whose last closing check was
  // fifty days ago — which is not what anyone means by compliance.
  const checksLate = useMemo(
    () => dailyChecks.filter(c => c.state !== 'ok').length,
    [dailyChecks]
  );

  // ---- the register ------------------------------------------------------
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(item => {
      if (tab !== 'all' && item.kind !== tab) return false;
      if (!term) return true;
      const vendor = item.vendor_id ? vendorById.get(item.vendor_id) : null;
      return [item.name, item.category, item.authority, item.reference_no, vendor?.name]
        .filter(Boolean).some(field => String(field).toLowerCase().includes(term));
    });
  }, [items, tab, search, vendorById]);

  const vendorGroups = useMemo(() => {
    const groups = new Map();
    for (const item of visibleItems) {
      if (item.kind !== 'vendor_cert') continue;
      const key = item.vendor_id || `free:${item.name}`;
      if (!groups.has(key)) groups.set(key, { vendorId: item.vendor_id, name: item.vendor_id ? vendorById.get(item.vendor_id)?.name || 'Unknown vendor' : item.name, items: [] });
      groups.get(key).items.push(item);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleItems, vendorById]);

  const plainItems = useMemo(
    // In the Vendors tab a supplier's certificates sit under the supplier, so
    // they are drawn as groups below. Everywhere else the register is one flat
    // list — otherwise a certificate would be filed away where nobody looks.
    () => (tab === 'vendor_cert' ? [] : visibleItems),
    [visibleItems, tab]
  );

  const dueList = useMemo(() => dueSoon(items, 90), [items]);

  // ---- the form ----------------------------------------------------------
  const openAdd = (preset = {}) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, ...preset });
    setVendorSearch('');
    setShowForm(true);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEdit = (item) => {
    setEditing(item.id);
    setForm({
      kind: item.kind,
      name: item.name || '',
      category: item.category || 'Regulatory',
      authority: item.authority || '',
      reference_no: item.reference_no || '',
      issued_on: item.issued_on || '',
      expires_on: item.expires_on || '',
      cadence: item.cadence || '',
      last_done_on: item.last_done_on || '',
      next_due_on: item.next_due_on || '',
      vendor_id: item.vendor_id || '',
      owner_employee_id: item.owner_employee_id || '',
      cost: item.cost ?? '',
      payment_status: item.payment_status || '',
      document_url: item.document_url || '',
      notes: item.notes || '',
    });
    setShowForm(true);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const setKind = (kind) => setForm(prev => ({
    ...prev,
    kind,
    // A vendor certificate belongs to a supplier; the other two are ours.
    vendor_id: kind === 'vendor_cert' ? prev.vendor_id : '',
    cadence: kind === 'recurring' ? (prev.cadence || 'monthly') : '',
    last_done_on: kind === 'recurring' ? prev.last_done_on : '',
    next_due_on: kind === 'recurring' ? prev.next_due_on : '',
    expires_on: kind === 'recurring' ? '' : prev.expires_on,
  }));

  // The vendor picker: choose from the vendors already on the list.
  const vendorMatches = useMemo(() => {
    const term = vendorSearch.trim().toLowerCase();
    if (!term) return vendors.slice(0, 8);
    return vendors.filter(v => v.name.toLowerCase().includes(term)).slice(0, 12);
  }, [vendors, vendorSearch]);

  const selectedVendor = form.vendor_id ? vendorById.get(Number(form.vendor_id)) : null;

  const onLastDoneChange = (value) => {
    const next = value && form.cadence ? nextDueFrom(form.cadence, value) : '';
    setForm(prev => ({ ...prev, last_done_on: value, next_due_on: next || prev.next_due_on }));
  };

  const uploadDocument = async (file) => {
    if (!file) return;
    setError('');
    try {
      const path = `compliance/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);
      setField('document_path', path);
      setMessage('The certificate was attached. Remember to save.');
    } catch (err) {
      setError(`The file could not be attached: ${err.message}`);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!form.name.trim()) {
      setError('Give it a name — what is it?');
      return;
    }
    if (form.kind === 'vendor_cert' && !form.vendor_id) {
      setError('Choose the supplier this certificate belongs to.');
      return;
    }

    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      category: form.category || null,
      authority: form.authority.trim() || null,
      reference_no: form.reference_no.trim() || null,
      issued_on: form.issued_on || null,
      expires_on: form.kind === 'recurring' ? null : (form.expires_on || null),
      cadence: form.kind === 'recurring' ? (form.cadence || null) : null,
      last_done_on: form.kind === 'recurring' ? (form.last_done_on || null) : null,
      next_due_on: form.kind === 'recurring' ? (form.next_due_on || null) : null,
      vendor_id: form.kind === 'vendor_cert' ? Number(form.vendor_id) : null,
      owner_employee_id: form.owner_employee_id || null,
      cost: form.cost === '' ? null : Number(form.cost),
      payment_status: form.payment_status || null,
      document_url: form.document_url.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editing) {
        const { error: updErr } = await supabase.from('compliance_items').update(payload).eq('id', editing);
        if (updErr) throw new Error(updErr.message);
        setMessage('Saved.');
      } else {
        const { error: insErr } = await supabase.from('compliance_items').insert(payload);
        if (insErr) throw new Error(insErr.message);
        setMessage('Added to the register.');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Take this off the register?')) return;
    const { error: delErr } = await supabase.from('compliance_items').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    else await load();
  };

  const openDocument = async (item) => {
    if (item.document_url) {
      window.open(item.document_url, '_blank');
      return;
    }
    if (!item.document_path) return;
    const { data, error: signErr } = await supabase.storage.from('documents').createSignedUrl(item.document_path, 3600);
    if (signErr) { setError(signErr.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const renderStatus = (item) => {
    const s = itemStatus(item);
    return (
      <span className={`pill ${STATUS_PILL[s.status]} text-xs`} title={s.label}>
        {STATUS_LABEL[s.status]}
      </span>
    );
  };

  const dueCell = (item) => {
    const s = itemStatus(item);
    return (
      <div>
        <div className="text-xs">{item.kind === 'recurring' ? formatDate(item.next_due_on) : formatDate(item.expires_on)}</div>
        <div className={`text-xs ${s.status === 'expired' ? 'text-[#A41B1B]' : 'text-[#7A7168]'}`}>{s.label}</div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Operations</Link>
          <span className="text-ink-muted text-sm">Module / Operations</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Compliance</h1>
          <p className="page-purpose text-ink-muted text-base lg:text-lg mt-3">
            What we must legally hold, what our suppliers must hold for us, and what has to be done again and again.
          </p>
        </div>

        {loadError && (
          <div className="panel bg-white border border-[#EBC9C2] rounded-card mb-6">
            <div className="panel-body p-5 text-sm text-[#A41B1B]">The register could not be loaded: {loadError}</div>
          </div>
        )}

        {/* ---- the three figures ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-8">
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">Due in 30 days</p>
              <p className="figure">{stats.dueIn30}</p>
              <p className="note mt-1">A licence or a certificate about to expire</p>
            </div>
          </div>
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">Overdue</p>
              <p className="figure">{stats.overdue}</p>
              <p className="note mt-1">Already past its date</p>
            </div>
          </div>
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">Daily checks late</p>
              <p className="figure">{checksLate}</p>
              <p className="note mt-1">Not run when they should have been</p>
            </div>
          </div>
        </div>

        {/* ---- due next ---- */}
        {dueList.length > 0 && (
          <div className="panel bg-white border border-rule-soft rounded-card mb-8">
            <div className="panel-body p-6 lg:p-8">
              <h2 className="font-serif text-xl mb-1">Due next</h2>
              <p className="text-ink-muted text-sm mb-5">What wants attention, soonest first.</p>
              <div className="hairline-list">
                {dueList.slice(0, 8).map(({ item, label, status }) => {
                  const vendor = item.vendor_id ? vendorById.get(item.vendor_id) : null;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-4 py-3 border-b border-rule-soft last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-ink-muted">
                          {item.kind === 'vendor_cert' ? `${vendor?.name || 'Vendor'} · ${item.category || 'Certificate'}` : ''}
                          {item.kind !== 'vendor_cert' && (item.kind === 'recurring' ? item.cadence : item.authority || '—')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs ${status === 'expired' ? 'text-[#A41B1B]' : 'text-ink-muted'}`}>{label}</span>
                        <span className={`pill ${STATUS_PILL[status]} text-xs`}>{STATUS_LABEL[status]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ---- the form ---- */}
        {showForm && (
          <form onSubmit={save} className="panel bg-white border border-rule rounded-card shadow-sm mb-8">
            <div className="panel-body p-6 lg:p-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-xl">{editing ? 'Edit this' : 'Add to the register'}</h2>
                <button type="button" onClick={() => setShowForm(false)} className="btn-quiet text-xs px-2.5 py-1.5">Cancel</button>
              </div>

              {error && <p className="text-sm text-[#A41B1B] mb-4">{error}</p>}
              {message && <p className="text-sm text-[#15803D] mb-4">{message}</p>}

              <div className="flex flex-wrap gap-2 mb-6">
                {KINDS.map(k => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`text-xs px-3 py-1.5 rounded-control border transition-colors ${
                      form.kind === k.value
                        ? 'border-accent text-accent bg-accent-wash'
                        : 'border-rule text-ink-muted hover:text-ink'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="field-label">What is it</label>
                  <input className="field text-sm" value={form.name} onChange={e => setField('name', e.target.value)}
                    placeholder="FSSAI Food Licence" required />
                </div>

                <div>
                  <label className="field-label">Group</label>
                  <select className="field text-sm bg-white" value={form.category} onChange={e => setField('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="field-label">Issued by</label>
                  <input className="field text-sm" value={form.authority} onChange={e => setField('authority', e.target.value)}
                    placeholder="Food Safety & Standards Authority" />
                </div>

                <div>
                  <label className="field-label">Number on the certificate</label>
                  <input className="field text-sm" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)}
                    placeholder="11223344000987" />
                </div>

                {form.kind === 'vendor_cert' && (
                  <div className="md:col-span-2">
                    <label className="field-label">Which supplier</label>
                    {selectedVendor ? (
                      <div className="flex items-center gap-3">
                        <span className="pill pill-quiet text-xs">{selectedVendor.name}</span>
                        <button type="button" onClick={() => setField('vendor_id', '')} className="btn-quiet text-xs px-2 py-1">Change</button>
                      </div>
                    ) : (
                      <>
                        <input className="field text-sm" value={vendorSearch} onChange={e => setVendorSearch(e.target.value)}
                          placeholder="Search the vendors already on the list" />
                        <div className="mt-2 border border-rule-soft rounded-control divide-y divide-rule-soft max-h-48 overflow-y-auto">
                          {vendorMatches.length === 0 && (
                            <p className="text-xs text-ink-muted p-3">No supplier by that name. Add them on the Suppliers page first.</p>
                          )}
                          {vendorMatches.map(v => (
                            <button key={v.id} type="button" onClick={() => { setField('vendor_id', String(v.id)); setVendorSearch(''); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-page flex items-center justify-between">
                              <span>{v.name}</span>
                              {v.description && <span className="text-xs text-ink-muted">{v.description}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {form.kind === 'recurring' ? (
                  <>
                    <div>
                      <label className="field-label">How often</label>
                      <select className="field text-sm bg-white" value={form.cadence} onChange={e => setField('cadence', e.target.value)}>
                        <option value="">Choose</option>
                        {CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Last done on</label>
                      <input type="date" className="field text-sm" value={form.last_done_on} onChange={e => onLastDoneChange(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Next due on</label>
                      <input type="date" className="field text-sm" value={form.next_due_on} onChange={e => setField('next_due_on', e.target.value)} />
                      <p className="text-xs text-ink-muted mt-1">Filled in from the last time it was done — change it if it differs.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="field-label">Issued on</label>
                      <input type="date" className="field text-sm" value={form.issued_on} onChange={e => setField('issued_on', e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Valid until</label>
                      <input type="date" className="field text-sm" value={form.expires_on} onChange={e => setField('expires_on', e.target.value)} />
                    </div>
                  </>
                )}

                <div>
                  <label className="field-label">Who is answerable for it</label>
                  <select className="field text-sm bg-white" value={form.owner_employee_id} onChange={e => setField('owner_employee_id', e.target.value)}>
                    <option value="">Nobody yet</option>
                    {employees.map(emp => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.name}{emp.designation ? ` — ${emp.designation}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">What the renewal costs</label>
                  <input type="number" min="0" step="0.01" className="field text-sm" value={form.cost}
                    onChange={e => setField('cost', e.target.value)} placeholder="0" />
                </div>

                <div>
                  <label className="field-label">Has it been paid</label>
                  <select className="field text-sm bg-white" value={form.payment_status} onChange={e => setField('payment_status', e.target.value)}>
                    <option value="">Not known</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Link to the document</label>
                  <input className="field text-sm" value={form.document_url} onChange={e => setField('document_url', e.target.value)}
                    placeholder="https://…" />
                </div>

                <div className="md:col-span-2">
                  <label className="field-label">Attach the certificate</label>
                  <input type="file" className="field text-sm" accept="application/pdf,image/*"
                    onChange={e => uploadDocument(e.target.files?.[0])} />
                  {form.document_path && <p className="text-xs text-[#15803D] mt-1">The file is attached — save to keep it.</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="field-label">Notes</label>
                  <textarea className="field text-sm" rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)}
                    placeholder="Anything worth remembering" />
                </div>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add to the register'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-4 py-2">Cancel</button>
              </div>
            </div>
          </form>
        )}

        {/* ---- the register ---- */}
        <div className="panel bg-white border border-rule-soft rounded-card shadow-sm mb-8">
          <div className="panel-body p-0">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 lg:p-8 pb-4">
              <div>
                <h2 className="font-serif text-xl">The register</h2>
                <p className="text-ink-muted text-sm mt-1">
                  {items.length} item{items.length === 1 ? '' : 's'} · ours, our suppliers’ certificates, and the duties that repeat.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openAdd()} className="btn-primary text-sm px-4 py-2">+ Add</button>
                <button type="button" onClick={() => openAdd({ kind: 'vendor_cert', category: 'Vendor' })}
                  className="btn-secondary text-sm px-4 py-2">+ Vendor certification</button>
                <button type="button" onClick={() => openAdd({ kind: 'recurring', category: 'Food safety', cadence: 'monthly' })}
                  className="btn-secondary text-sm px-4 py-2">+ Recurring duty</button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-6 lg:px-8 pb-4">
              <div className="flex gap-1.5">
                {[['all', 'All'], ['licence', 'Ours'], ['vendor_cert', 'Vendors'], ['recurring', 'Recurring']].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)}
                    className={`text-xs px-3 py-1.5 rounded-control transition-colors ${
                      tab === value ? 'bg-page text-ink font-medium' : 'text-ink-muted hover:text-ink'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <input className="field text-sm max-w-xs" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Find something" />
            </div>

            {loading ? (
              <div className="p-6 lg:p-8 text-sm text-ink-muted">Loading the register…</div>
            ) : items.length === 0 ? (
              <div className="px-6 lg:px-8 pb-8">
                <p className="text-sm text-ink-muted mb-4">
                  Nothing on the register yet. Start with what a restaurant normally holds — each one is a
                  suggestion, and the dates are yours to fill in.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {START_HERE.map(s => (
                    <button key={s.name} type="button"
                      onClick={() => openAdd({
                        kind: s.recurring ? 'recurring' : 'licence',
                        name: s.name,
                        category: s.category,
                        authority: s.authority || '',
                        cadence: s.cadence || '',
                      })}
                      className="text-left text-sm px-4 py-3 border border-rule-soft rounded-control hover:border-rule hover:bg-page">
                      + {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-rule-soft bg-page">
                      <th className="table-head text-left px-6 lg:px-8 py-2.5">What</th>
                      <th className="table-head text-left px-4 py-2.5">Who / what</th>
                      <th className="table-head text-left px-4 py-2.5">Due</th>
                      <th className="table-head text-left px-4 py-2.5">Status</th>
                      <th className="table-head text-right px-6 lg:px-8 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plainItems.map(item => (
                      <tr key={item.id} className="border-b border-rule-soft hover:bg-page/60">
                        <td className="table-cell px-6 lg:px-8 py-3">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-ink-muted">
                            {item.category || '—'}{item.reference_no ? ` · ${item.reference_no}` : ''}
                          </div>
                        </td>
                        <td className="table-cell px-4 py-3 text-xs text-ink-muted">
                          {item.kind === 'vendor_cert'
                            ? (vendorById.get(item.vendor_id)?.name || 'Vendor')
                            : item.kind === 'recurring' ? (item.cadence || '—') : (item.authority || '—')}
                          {item.owner_employee_id && employeeById.get(item.owner_employee_id) && (
                            <div>{employeeById.get(item.owner_employee_id).name}</div>
                          )}
                        </td>
                        <td className="table-cell px-4 py-3">{dueCell(item)}</td>
                        <td className="table-cell px-4 py-3">{renderStatus(item)}</td>
                        <td className="table-cell px-6 lg:px-8 py-3 text-right whitespace-nowrap">
                          {(item.document_path || item.document_url) && (
                            <button type="button" onClick={() => openDocument(item)} className="btn-quiet text-xs px-2 py-1 mr-1">Open</button>
                          )}
                          <button type="button" onClick={() => openEdit(item)} className="btn-quiet text-xs px-2 py-1 mr-1">Edit</button>
                          <button type="button" onClick={() => remove(item.id)} className="btn-quiet text-xs px-2 py-1">Remove</button>
                        </td>
                      </tr>
                    ))}

                    {tab === 'vendor_cert' && vendorGroups.map(group => {
                      const isOpen = openVendor === (group.vendorId || `free:${group.name}`);
                      return (
                        <>
                          <tr key={`v-${group.vendorId}`} className="border-b border-rule-soft hover:bg-page/60">
                            <td className="table-cell px-6 lg:px-8 py-3">
                              <button type="button" onClick={() => setOpenVendor(isOpen ? null : (group.vendorId || `free:${group.name}`))}
                                className="font-medium flex items-center gap-2 text-left">
                                <span className="text-[#8b6f4e]">{isOpen ? '▾' : '▸'}</span>
                                {group.name}
                              </button>
                              <div className="text-xs text-ink-muted pl-5">{group.items.length} certificate{group.items.length === 1 ? '' : 's'} on file</div>
                            </td>
                            <td className="table-cell px-4 py-3 text-xs text-ink-muted">Vendor</td>
                            <td className="table-cell px-4 py-3" />
                            <td className="table-cell px-4 py-3" />
                            <td className="table-cell px-6 lg:px-8 py-3 text-right whitespace-nowrap">
                              <button type="button" onClick={() => openAdd({ kind: 'vendor_cert', category: 'Vendor', vendor_id: String(group.vendorId || ''), name: group.vendorId ? '' : group.name })}
                                className="btn-quiet text-xs px-2 py-1">+ Certificate</button>
                            </td>
                          </tr>
                          {isOpen && group.items.map(item => (
                            <tr key={item.id} className="border-b border-rule-soft bg-page/40">
                              <td className="table-cell px-6 lg:px-8 py-3 pl-14">
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-ink-muted">
                                  {item.category || '—'}{item.reference_no ? ` · ${item.reference_no}` : ''}
                                </div>
                              </td>
                              <td className="table-cell px-4 py-3 text-xs text-ink-muted">{item.authority || '—'}</td>
                              <td className="table-cell px-4 py-3">{dueCell(item)}</td>
                              <td className="table-cell px-4 py-3">{renderStatus(item)}</td>
                              <td className="table-cell px-6 lg:px-8 py-3 text-right whitespace-nowrap">
                                {(item.document_path || item.document_url) && (
                                  <button type="button" onClick={() => openDocument(item)} className="btn-quiet text-xs px-2 py-1 mr-1">Open</button>
                                )}
                                <button type="button" onClick={() => openEdit(item)} className="btn-quiet text-xs px-2 py-1 mr-1">Edit</button>
                                <button type="button" onClick={() => remove(item.id)} className="btn-quiet text-xs px-2 py-1">Remove</button>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
                {visibleItems.length === 0 && (
                  <p className="px-6 lg:px-8 py-6 text-sm text-ink-muted">Nothing here under that filter.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- the daily checks ---- */}
        <div className="panel bg-white border border-rule-soft rounded-card shadow-sm">
          <div className="panel-body p-6 lg:p-8">
            <h2 className="font-serif text-xl mb-1">Daily checks</h2>
            <p className="text-ink-muted text-sm mb-5">
              A hygiene check that was missed is a compliance fact too. These are the checks the floor runs.
            </p>

            {loading ? (
              <p className="text-sm text-ink-muted">Loading the checks…</p>
            ) : dailyChecks.length === 0 ? (
              <p className="text-sm text-ink-muted">No checklists are set up yet.</p>
            ) : (
              <div className="hairline-list">
                {dailyChecks.map(check => (
                  <div key={check.template.id} className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-rule-soft last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{check.template.title}</p>
                      <p className="text-xs text-ink-muted">
                        {check.template.department || 'Everyone'}
                        {check.template.schedule_times?.length ? ` · ${check.template.schedule_times.join(', ')}` : ''}
                        {check.runs30 > 0 ? ` · ${check.completed30} of ${check.runs30} done in 30 days` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {check.state === 'never' && <span className="pill pill-bad text-xs">Never run</span>}
                      {check.state === 'missed' && <span className="pill pill-bad text-xs">{check.missed30} missed</span>}
                      {check.state === 'quiet' && <span className="pill pill-warn text-xs">Last run {check.lastDays} days ago</span>}
                      {check.state === 'ok' && <span className="pill pill-good text-xs">Running</span>}
                      <span className="text-xs text-ink-muted">
                        {check.last ? `Last: ${formatDate(check.last.submitted_at || check.last.due_at)}` : 'No runs yet'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

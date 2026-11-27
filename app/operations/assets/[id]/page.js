'use client';

/**
 * app/operations/assets/[id]/page.js — one asset, in full.
 *
 * The master record of a single thing the restaurant owns: what it is, where
 * it is, who has it, what it cost, what its warranty is, and — the two parts
 * that make it a record rather than a list — **what has been done to it** and
 * **what has changed about it**.
 *
 *   The maintenance history  every job raised against this asset, newest
 *                           first, linking to the job's own page.
 *   The change history       every field that was changed, who changed it and
 *                           when — written by the server when the change is
 *                           saved, not typed in by hand.
 *
 * Nothing on this page is made up. If the books say nothing about the brand,
 * the brand is blank.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../../../lib/supabaseClient';
import { CONDITIONS, STATUSES, STATUS_TONE, warrantyTill } from '../../../../lib/assets.js';

const EMPTY_FORM = {
  name: '',
  brand: '',
  model_name: '',
  serial_number: '',
  category_id: '',
  type_id: '',
  condition: 'Brand New',
  status: 'Available',
  location_id: '',
  assigned_employee_id: '',
  purchase_date: '',
  purchase_price: '',
  warranty_months: '12',
  extended_warranty: false,
  extended_warranty_months: '0',
  warranty_contact: '',
  vendor_id: '',
  invoice_url: '',
  notes: '',
};

const ISSUE_KEYS = [
  'Physical damage', 'Not functioning', 'Damaged part', 'Cosmetic repair',
  'Water leak', 'Cooling issue', 'Poor functioning', 'Other',
];

export default function AssetDetailPage({ params }) {
  const assetId = params?.id;
  const supabase = useMemo(() => createClient(), []);

  const [asset, setAsset] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    serviceType: 'Routine Service',
    issues: Object.fromEntries(ISSUE_KEYS.map(k => [k, false])),
    comments: '',
    priority: 'Normal',
  });

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [supabase]);

  /** The asset, its work and its history — all from the books. */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/assets?asset_number=${encodeURIComponent(assetId)}`, {
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The asset could not be read.');

      setAsset(json.asset || null);
      setJobs(json.jobs || []);
      setHistory(json.history || []);
      setCategories(json.categories || []);
      setTypes(json.types || []);
      setLocations(json.locations || []);
      setEmployees(json.employees || []);
      setVendors(json.vendors || []);

      const a = json.asset || {};
      const next = {
        name: a.name || '',
        brand: a.brand || '',
        model_name: a.model_name || '',
        serial_number: a.serial_number || a.asset_number || '',
        category_id: a.category_id ? String(a.category_id) : '',
        type_id: a.type_id ? String(a.type_id) : '',
        condition: a.condition || 'Brand New',
        status: a.status || 'Available',
        location_id: a.location_id ? String(a.location_id) : '',
        assigned_employee_id: a.assigned_employee_id || '',
        purchase_date: a.purchase_date || '',
        purchase_price: a.purchase_price === null || a.purchase_price === undefined ? '' : String(a.purchase_price),
        warranty_months: a.warranty_months === null || a.warranty_months === undefined ? '0' : String(a.warranty_months),
        extended_warranty: !!a.extended_warranty,
        extended_warranty_months: a.extended_warranty_months ? String(a.extended_warranty_months) : '0',
        warranty_contact: a.warranty_contact || '',
        vendor_id: a.vendor_id ? String(a.vendor_id) : '',
        invoice_url: a.invoice_url || '',
        notes: a.notes || '',
      };
      setForm(next);
      setOriginal(next);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [assetId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const typesForCategory = useMemo(() => {
    const category = categories.find(c => String(c.id) === form.category_id);
    if (!category) return types;
    return types.filter(t => t.category === category.name);
  }, [types, categories, form.category_id]);

  const employeeName = (id) => employees.find(e => e.employee_id === id)?.name || id;
  const vendorName = (id) => vendors.find(v => String(v.id) === String(id))?.name || '';

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  /** The warranty's last day, worked out from what was bought and the warranty. */
  const warrantyEnd = useMemo(
    () => warrantyTill(form.purchase_date, Number(form.warranty_months) || 0),
    [form.purchase_date, form.warranty_months],
  );

  /** What the person changed, said the way a person would say it. */
  const describeChange = (field, from, to) => {
    const labels = {
      name: 'Name', brand: 'Brand', model_name: 'Model', serial_number: 'Serial number',
      category_id: 'Category', type_id: 'Type', condition: 'Condition', status: 'Status',
      location_id: 'Location', assigned_employee_id: 'Held by', purchase_date: 'Bought on',
      purchase_price: 'Buying price', warranty_months: 'Warranty period',
      extended_warranty: 'Extended warranty', extended_warranty_months: 'Extended warranty period',
      warranty_contact: 'Warranty contact', vendor_id: 'Vendor', invoice_url: 'Invoice',
      notes: 'Notes',
    };
    const label = labels[field] || field;
    const value = (v) => {
      if (v === null || v === undefined || v === '') return 'nothing';
      if (field === 'category_id') return categories.find(c => String(c.id) === String(v))?.name || v;
      if (field === 'type_id') return types.find(t => String(t.id) === String(v))?.name || v;
      if (field === 'location_id') return locations.find(l => String(l.id) === String(v))?.name || v;
      if (field === 'assigned_employee_id') return employeeName(v);
      if (field === 'vendor_id') return vendorName(v);
      if (field === 'extended_warranty') return v ? 'yes' : 'no';
      return v;
    };
    if (from === null || from === undefined || from === '') return `${label} set to ${value(to)}`;
    return `${label} changed from "${value(from)}" to "${value(to)}"`;
  };

  /** What changed on the form, compared with what was loaded. */
  const detectChanges = () => {
    if (!original) return [];
    const changes = [];
    for (const key of Object.keys(form)) {
      if (String(form[key] ?? '') !== String(original[key] ?? '')) {
        changes.push({ field: key, oldValue: original[key], newValue: form[key] });
      }
    }
    return changes;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const changes = detectChanges();
    if (changes.length === 0) {
      setMessage('Nothing has been changed.');
      return;
    }
    setPendingChanges(changes);
    setShowCommentDialog(true);
  };

  /** Save the changes, and let the server write what changed into the history. */
  const saveChanges = async (comment) => {
    setSaving(true);
    setError('');
    try {
      const body = {
        asset_number: assetId,
        name: form.name,
        brand: form.brand,
        model_name: form.model_name,
        serial_number: form.serial_number,
        category_id: form.category_id || null,
        type_id: form.type_id || null,
        condition: form.condition,
        status: form.status,
        location_id: form.location_id || null,
        assigned_employee_id: form.assigned_employee_id || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        warranty_months: Number(form.warranty_months) || 0,
        warranty_till: warrantyEnd,
        extended_warranty: form.extended_warranty,
        extended_warranty_months: Number(form.extended_warranty_months) || 0,
        warranty_contact: form.warranty_contact,
        vendor_id: form.vendor_id || null,
        invoice_url: form.invoice_url || null,
        notes: form.notes,
        note: comment || null,
      };

      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The changes could not be saved.');

      setShowCommentDialog(false);
      setPendingChanges(null);
      setMessage('Saved. The change is in the history below.');
      await load();
    } catch (err) {
      setError(err.message);
      setShowCommentDialog(false);
      setPendingChanges(null);
    } finally {
      setSaving(false);
    }
  };

  /** Raise a maintenance job against this asset. */
  const handleMaintenanceSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in to raise a maintenance request.');

      const res = await fetch('/api/maintenance/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          asset_serial: assetId,
          asset_name: form.name || asset?.name || assetId,
          service_type: maintenanceForm.serviceType,
          issues: maintenanceForm.issues,
          priority: maintenanceForm.priority,
          comments: maintenanceForm.comments,
          requested_by: 'Signed in from the asset page',
          status: 'pending_approval',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The maintenance request could not be raised.');

      setShowMaintenanceModal(false);
      setMessage(`Maintenance requested — ${json.job?.id || 'the job'} is open on this asset.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24 text-center text-ink-muted">
          Loading the asset…
        </div>
      </main>
    );
  }

  if (!asset) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
          <Link href="/operations/assets" className="btn-secondary text-xs px-3 py-1.5">← Assets</Link>
          <div className="panel bg-white border border-rule-soft rounded-card mt-6">
            <div className="panel-body p-8 text-center">
              <p className="font-serif text-xl mb-2">That asset is not on the register</p>
              <p className="text-sm text-ink-muted">{loadError || `Nothing is filed under ${assetId}.`}</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const openJobs = (jobs || []).filter(j => j.status !== 'Completed' && j.status !== 'Rejected');

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-3xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations/assets" className="btn-secondary text-xs px-3 py-1.5">← Assets</Link>
          <span className="text-ink-muted text-sm">Operations / Assets</span>
        </div>

        <div className="page-head mb-8">
          <h1 className="page-title font-serif text-3xl lg:text-4xl">{asset.name || 'Asset'}</h1>
          <p className="page-purpose text-ink-muted text-sm mt-2">
            {asset.asset_number}
            {asset.category_name ? ` · ${asset.category_name}` : ''}
            {asset.location_name ? ` · ${asset.location_name}` : ''}
          </p>
        </div>

        {message && (
          <div className="panel bg-white border border-rule-soft rounded-card mb-5">
            <div className="panel-body p-4 text-sm text-[#15803D]">{message}</div>
          </div>
        )}
        {error && (
          <div className="panel bg-white border border-[#EBC9C2] rounded-card mb-5">
            <div className="panel-body p-4 text-sm text-[#A41B1B]">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="panel bg-white border border-rule rounded-card shadow-sm">
          <div className="panel-body p-6 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <label className="block">
                <span className="field-label">Asset #</span>
                <input className="field text-sm bg-page text-ink-muted" disabled value={asset.asset_number} />
                <span className="text-xs text-ink-muted mt-1 block">Its number cannot change</span>
              </label>
              <label className="block">
                <span className="field-label">Name</span>
                <input name="name" value={form.name} onChange={e => setField('name', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Brand</span>
                <input name="brand" value={form.brand} onChange={e => setField('brand', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Model number</span>
                <input name="model_name" value={form.model_name} onChange={e => setField('model_name', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Serial number</span>
                <input name="serial_number" value={form.serial_number} onChange={e => setField('serial_number', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Category</span>
                <select
                  name="category_id"
                  value={form.category_id}
                  onChange={e => { setField('category_id', e.target.value); setField('type_id', ''); }}
                  className="field text-sm bg-white"
                >
                  <option value="">Not set</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Type of asset</span>
                <select name="type_id" value={form.type_id} onChange={e => setField('type_id', e.target.value)} className="field text-sm bg-white">
                  <option value="">Not set</option>
                  {typesForCategory.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Condition</span>
                <select name="condition" value={form.condition} onChange={e => setField('condition', e.target.value)} className="field text-sm bg-white">
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Status</span>
                <select name="status" value={form.status} onChange={e => setField('status', e.target.value)} className="field text-sm bg-white">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Where it is</span>
                <select name="location_id" value={form.location_id} onChange={e => setField('location_id', e.target.value)} className="field text-sm bg-white">
                  <option value="">Not set</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">With</span>
                <select
                  name="assigned_employee_id"
                  value={form.assigned_employee_id}
                  onChange={e => setField('assigned_employee_id', e.target.value)}
                  className="field text-sm bg-white"
                >
                  <option value="">Nobody</option>
                  {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Bought on</span>
                <input name="purchase_date" type="date" value={form.purchase_date} onChange={e => setField('purchase_date', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Vendor</span>
                <select name="vendor_id" value={form.vendor_id} onChange={e => setField('vendor_id', e.target.value)} className="field text-sm bg-white">
                  <option value="">Not set</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Buying price (₹)</span>
                <input name="purchase_price" type="number" min="0" value={form.purchase_price} onChange={e => setField('purchase_price', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Warranty (months)</span>
                <input name="warranty_months" type="number" min="0" value={form.warranty_months} onChange={e => setField('warranty_months', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Warranty until</span>
                <input className="field text-sm bg-page text-ink-muted" disabled value={warrantyEnd || '—'} />
                <span className="text-xs text-ink-muted mt-1 block">Worked out from the date and the warranty</span>
              </label>
              <label className="block">
                <span className="field-label">Extended warranty</span>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.extended_warranty}
                    onChange={e => setField('extended_warranty', e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>Yes</span>
                  {form.extended_warranty && (
                    <input
                      type="number"
                      min="0"
                      placeholder="Months"
                      value={form.extended_warranty_months}
                      onChange={e => setField('extended_warranty_months', e.target.value)}
                      className="field text-sm w-24 ml-2"
                    />
                  )}
                </div>
              </label>
              <label className="block">
                <span className="field-label">Warranty contact</span>
                <input name="warranty_contact" value={form.warranty_contact} onChange={e => setField('warranty_contact', e.target.value)} className="field text-sm" />
              </label>
              <label className="block">
                <span className="field-label">Invoice link</span>
                <input name="invoice_url" value={form.invoice_url} onChange={e => setField('invoice_url', e.target.value)} className="field text-sm" placeholder="https://…" />
              </label>
              <label className="block md:col-span-3">
                <span className="field-label">Notes</span>
                <textarea name="notes" value={form.notes} rows={3} onChange={e => setField('notes', e.target.value)} className="field text-sm w-full" placeholder="Anything worth knowing about this thing…" />
              </label>
            </div>

            {/* ---- the maintenance history ---- */}
            <div className="mt-8 pt-6 border-t border-rule-soft">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl">Maintenance history</h2>
                {openJobs.length > 0 && (
                  <span className="pill pill-bad text-xs">{openJobs.length} open</span>
                )}
              </div>
              {jobs.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {jobs.map(job => (
                    <Link
                      key={job.id}
                      href={`/operations/maintenance/${encodeURIComponent(job.id)}`}
                      className="flex items-center justify-between gap-4 py-2 border-b border-rule-soft last:border-b-0 hover:bg-page/60 px-1"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{job.service_type || 'Maintenance'}</span>
                        <span className="text-xs text-ink-muted ml-2">{job.id}</span>
                        {job.comments ? <span className="block text-xs text-ink-muted">{job.comments}</span> : null}
                      </span>
                      <span className="text-xs text-ink-muted whitespace-nowrap">
                        {job.requested_at ? String(job.requested_at).slice(0, 10) : ''}
                      </span>
                      <span className={`pill pill-${job.status === 'Completed' ? 'good' : job.status === 'Rejected' ? 'quiet' : 'warn'} text-xs whitespace-nowrap`}>
                        {job.status}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Nothing has been raised against this asset.</p>
              )}
            </div>

            {/* ---- the change history ---- */}
            <div className="mt-8 pt-6 border-t border-rule-soft">
              <h2 className="font-serif text-xl mb-4">Change history</h2>
              <div className="space-y-3 text-xs">
                {history.length > 0 ? (
                  history.map(entry => (
                    <div key={entry.id} className="flex gap-3">
                      <span className="text-ink-muted whitespace-nowrap">
                        {entry.created_at ? String(entry.created_at).slice(0, 16).replace('T', ' ') : ''}
                      </span>
                      <span>
                        <span className="font-medium">{entry.performed_by || 'Someone'}</span>{' '}
                        {entry.action === 'created' ? 'added this asset' : 'changed it'}
                        {entry.previous_value || entry.new_value ? (
                          <> — {entry.notes || `${entry.previous_value || 'nothing'} → ${entry.new_value || 'nothing'}`}</>
                        ) : null}
                        {entry.notes && entry.action !== 'created' ? (
                          <span className="block text-ink-muted italic">{entry.notes}</span>
                        ) : null}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-ink-muted">Nothing has changed since this asset was added.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-rule-soft">
              <button type="submit" disabled={saving} className="btn-primary text-sm px-5">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(true)}
                className="btn-secondary text-sm px-5 border-[#e11d48] text-[#e11d48] hover:bg-[#fff1f2]"
              >
                Requires maintenance
              </button>
              <Link href="/operations/assets" className="btn-secondary text-sm px-5">Back</Link>
            </div>
          </div>
        </form>

        {/* ---- the change comment ---- */}
        {showCommentDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-md mx-4 p-6 border border-rule-soft">
              <h3 className="font-serif text-xl mb-2">What changed</h3>
              <div className="text-sm text-ink-muted mb-4">
                <p className="font-medium mb-1">These will be written into the history:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {pendingChanges?.map((change, i) => (
                    <li key={i}>{describeChange(change.field, change.oldValue, change.newValue)}</li>
                  ))}
                </ul>
              </div>
              <label className="block">
                <span className="field-label">A note about the change</span>
                <textarea
                  id="commentText"
                  rows={3}
                  className="field text-sm w-full"
                  placeholder="Why it changed, or anything else worth keeping…"
                  autoFocus
                  defaultValue=""
                />
              </label>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => saveChanges(document.getElementById('commentText')?.value || '')}
                  disabled={saving}
                  className="btn-primary text-sm px-4 py-2"
                >
                  Save with the note
                </button>
                <button onClick={() => saveChanges('')} disabled={saving} className="btn-secondary text-sm px-4 py-2">
                  Save
                </button>
                <button
                  onClick={() => { setShowCommentDialog(false); setPendingChanges(null); }}
                  className="btn-quiet text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- the maintenance request ---- */}
        {showMaintenanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-card shadow-2xl max-w-lg mx-4 p-8 border border-rule-soft w-full max-h-[90vh] overflow-y-auto">
              <h3 className="font-serif text-2xl mb-2">Request maintenance</h3>
              <p className="text-xs text-ink-muted mb-6">
                {asset.asset_number} — {asset.name}
              </p>

              <div className="space-y-4 text-sm">
                <div>
                  <label className="field-label">Service type</label>
                  <select
                    className="field text-sm w-full bg-white"
                    value={maintenanceForm.serviceType}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, serviceType: e.target.value })}
                  >
                    <option>Routine Service</option>
                    <option>Faulty or defective repair</option>
                  </select>
                </div>

                <div>
                  <label className="field-label mb-2 block">What is wrong</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ISSUE_KEYS.map(issue => (
                      <label key={issue} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={maintenanceForm.issues[issue]}
                          onChange={e => setMaintenanceForm({
                            ...maintenanceForm,
                            issues: { ...maintenanceForm.issues, [issue]: e.target.checked },
                          })}
                          className="h-4 w-4"
                        />
                        <span>{issue}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="field-label">Priority</label>
                  <select
                    className="field text-sm w-full bg-white"
                    value={maintenanceForm.priority}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}
                  >
                    <option>Low</option>
                    <option>Normal</option>
                    <option>Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Details</label>
                  <textarea
                    rows={3}
                    className="field text-sm w-full"
                    value={maintenanceForm.comments}
                    onChange={e => setMaintenanceForm({ ...maintenanceForm, comments: e.target.value })}
                    placeholder="Describe the problem, the symptoms, where it is…"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-rule-soft">
                <button type="button" onClick={handleMaintenanceSubmit} disabled={saving} className="btn-primary text-sm px-5 py-2">
                  {saving ? 'Sending…' : 'Submit request'}
                </button>
                <button type="button" onClick={() => setShowMaintenanceModal(false)} className="btn-secondary text-sm px-5 py-2">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

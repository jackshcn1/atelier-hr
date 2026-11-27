'use client';

/**
 * app/operations/assets/page.js — the asset register.
 *
 * One list of everything the restaurant owns: a chiller, a freezer, a table,
 * a staff uniform. Each one is filed under a **category** (Kitchen Equipment,
 * Furniture, Uniform, Electronics), is a **type** within that category, and
 * sits in a **location** (Kitchen, Restaurant, Office, Sales Counter).
 *
 * The register reads by category, because that is how a kitchen thinks: all
 * the chillers together, all the furniture together. Each category expands to
 * show the individual things under it, with the state of each — its
 * condition, where it is, who has it, and what is open on it.
 *
 * Two things are said in `lib/assets.js` and nowhere else: how an asset
 * number is made, and what "condition" and "status" mean.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';
import {
  CONDITIONS,
  STATUSES,
  STATUS_TONE,
  CONDITION_TONE,
  groupByCategory,
  assetFigures,
} from '../../../lib/assets.js';

const EMPTY_FORM = {
  category_id: '',
  type_id: '',
  location_id: '',
  name: '',
  quantity: '1',
  brand: '',
  model_name: '',
  condition: 'Brand New',
  status: 'Available',
  assigned_employee_id: '',
  purchase_date: '',
  purchase_price: '',
  warranty_months: '12',
  vendor_id: '',
  notes: '',
};

export default function AssetsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [openGroups, setOpenGroups] = useState({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  /** The bearer token the API route needs, so the database's own rules apply. */
  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/assets', { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The asset register could not be read.');
      setAssets(json.assets || []);
      setCategories(json.categories || []);
      setTypes(json.types || []);
      setLocations(json.locations || []);
      setEmployees(json.employees || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const employeeById = useMemo(
    () => new Map(employees.map(e => [e.employee_id, e])),
    [employees],
  );
  const typeById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);

  // The types that belong to the category chosen in the form.
  const typesForForm = useMemo(
    () => types.filter(t => !form.category_id || t.category === categories.find(c => String(c.id) === String(form.category_id))?.name),
    [types, categories, form.category_id],
  );

  const figures = useMemo(() => assetFigures(assets), [assets]);

  const groups = useMemo(() => groupByCategory(assets, categories), [assets, categories]);

  // What the search and the filter leave.
  const visibleGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return groups
      .map(group => {
        let list = group.assets;
        if (filter === 'maintenance') list = list.filter(a => (a.open_maintenance_jobs || []).length > 0);
        else if (filter === 'holder') list = list.filter(a => !!a.assigned_employee_id);
        else if (filter === 'available') list = list.filter(a => a.status === 'Available');
        if (needle) {
          list = list.filter(a => [
            a.asset_number, a.name, a.brand, a.model_name, a.location_name, a.type_name,
          ].filter(Boolean).join(' ').toLowerCase().includes(needle));
        }
        return { ...group, assets: list };
      })
      .filter(group => group.assets.length > 0 || (!needle && filter === 'all'));
  }, [groups, search, filter]);

  const toggleGroup = (id) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openForm = () => {
    setForm({ ...EMPTY_FORM, category_id: categories[0] ? String(categories[0].id) : '' });
    setError('');
    setMessage('');
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const quantity = Math.max(1, Number(form.quantity) || 1);
      const body = {
        category_id: form.category_id || null,
        type_id: form.type_id || null,
        location_id: form.location_id || null,
        name: form.name || typeById.get(Number(form.type_id))?.name || '',
        quantity,
        brand: form.brand || null,
        model_name: form.model_name || null,
        condition: form.condition,
        status: form.status,
        assigned_employee_id: form.assigned_employee_id || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        warranty_months: Number(form.warranty_months) || 0,
        vendor_id: form.vendor_id || null,
        notes: form.notes || null,
      };

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The asset could not be saved.');
      setMessage(
        json.created === 1
          ? 'Added to the register.'
          : `${json.created} assets added to the register.`,
      );
      setShowForm(false);
      await load();
      // Open the category the new things landed in, so they can be seen
      // rather than filed away behind a collapsed row.
      if (form.category_id) {
        setOpenGroups(prev => ({ ...prev, [form.category_id]: true }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (assetNumber) => {
    if (!window.confirm(`Take ${assetNumber} off the register?`)) return;
    setError('');
    try {
      const res = await fetch(`/api/assets?asset_number=${encodeURIComponent(assetNumber)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The asset could not be removed.');
      setMessage(`${assetNumber} was taken off the register.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const statusPill = (asset) => {
    const tone = STATUS_TONE[asset.status] || 'quiet';
    const jobs = asset.open_maintenance_jobs || [];
    if (jobs.length > 0) {
      return (
        <span className={`pill pill-${tone} text-xs`} title={jobs.map(j => `${j.id} — ${j.status}`).join('\n')}>
          In maintenance
        </span>
      );
    }
    return <span className={`pill pill-${tone} text-xs`}>{asset.status}</span>;
  };

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-shell mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/operations" className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">← Operations</Link>
          <span className="text-ink-muted text-sm">Module / Operations</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl lg:text-5xl">Assets</h1>
          <p className="page-purpose text-ink-muted text-base lg:text-lg mt-3">
            Everything the restaurant owns — by category, then one by one.
          </p>
        </div>

        {loadError && (
          <div className="panel bg-white border border-[#EBC9C2] rounded-card mb-6">
            <div className="panel-body p-5 text-sm text-[#A41B1B]">The register could not be loaded: {loadError}</div>
          </div>
        )}

        {message && (
          <div className="panel bg-white border border-rule-soft rounded-card mb-6">
            <div className="panel-body p-5 text-sm text-[#15803D]">{message}</div>
          </div>
        )}
        {error && (
          <div className="panel bg-white border border-[#EBC9C2] rounded-card mb-6">
            <div className="panel-body p-5 text-sm text-[#A41B1B]">{error}</div>
          </div>
        )}

        {/* ---- the three figures ---- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-8">
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">Assets on the books</p>
              <p className="figure">{figures.total}</p>
              <p className="note mt-1">Everything we own, counted</p>
            </div>
          </div>
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">In maintenance</p>
              <p className="figure">{figures.inMaintenance}</p>
              <p className="note mt-1">Something is open on it</p>
            </div>
          </div>
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-6">
              <p className="figure-label">With a person</p>
              <p className="figure">{figures.withHolder}</p>
              <p className="note mt-1">Signed out to a member of staff</p>
            </div>
          </div>
        </div>

        {/* ---- the toolbar ---- */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={openForm} className="btn-primary text-sm px-4 py-2">+ Add assets</button>
          <div className="flex gap-2">
            {[
              ['all', 'All'],
              ['maintenance', 'In maintenance'],
              ['holder', 'With a person'],
              ['available', 'Available'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`text-xs px-3 py-1.5 rounded-control border transition-colors ${
                  filter === value ? 'border-accent text-accent bg-accent-wash' : 'border-rule text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="field text-sm flex-1 min-w-[220px]"
            placeholder="Find something — a name, a number, a brand"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ---- the form ---- */}
        {showForm && (
          <form onSubmit={save} className="panel bg-white border border-rule rounded-card shadow-sm mb-8">
            <div className="panel-body p-6 lg:p-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-xl">Add to the register</h2>
                <button type="button" onClick={() => setShowForm(false)} className="btn-quiet text-xs px-2.5 py-1.5">Cancel</button>
              </div>

              <p className="text-sm text-ink-muted mb-5">
                Enter a quantity of more than one and each one gets its own number — twelve tables become twelve assets,
                not one row saying twelve.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="field-label" htmlFor="asset-category">Category</label>
                  <select
                    className="field text-sm bg-white"
                    id="asset-category" value={form.category_id}
                    onChange={e => { setField('category_id', e.target.value); setField('type_id', ''); }}
                  >
                    <option value="">Choose</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-type">Type</label>
                  <select className="field text-sm bg-white" id="asset-type" value={form.type_id} onChange={e => setField('type_id', e.target.value)} required>
                    <option value="">Choose</option>
                    {typesForForm.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-quantity">How many</label>
                  <input type="number" min="1" max="200" className="field text-sm" id="asset-quantity" value={form.quantity} onChange={e => setField('quantity', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="field-label" htmlFor="asset-name">Name</label>
                  <input className="field text-sm" id="asset-name" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Leave blank to use the type" />
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-location">Where it is</label>
                  <select className="field text-sm bg-white" id="asset-location" value={form.location_id} onChange={e => setField('location_id', e.target.value)}>
                    <option value="">Not set</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-brand">Brand</label>
                  <input className="field text-sm" id="asset-brand" value={form.brand} onChange={e => setField('brand', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="field-label" htmlFor="asset-condition">Condition</label>
                  <select className="field text-sm bg-white" id="asset-condition" value={form.condition} onChange={e => setField('condition', e.target.value)}>
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-status">Status</label>
                  <select className="field text-sm bg-white" id="asset-status" value={form.status} onChange={e => setField('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-holder">With</label>
                  <select className="field text-sm bg-white" id="asset-holder" value={form.assigned_employee_id} onChange={e => setField('assigned_employee_id', e.target.value)}>
                    <option value="">Nobody</option>
                    {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-model">Model</label>
                  <input className="field text-sm" id="asset-model" value={form.model_name} onChange={e => setField('model_name', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="field-label" htmlFor="asset-purchased">Bought on</label>
                  <input type="date" className="field text-sm" id="asset-purchased" value={form.purchase_date} onChange={e => setField('purchase_date', e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-price">Buying price (₹)</label>
                  <input type="number" min="0" className="field text-sm" id="asset-price" value={form.purchase_price} onChange={e => setField('purchase_price', e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="asset-warranty">Warranty (months)</label>
                  <input type="number" min="0" className="field text-sm" id="asset-warranty" value={form.warranty_months} onChange={e => setField('warranty_months', e.target.value)} />
                </div>
              </div>

              <div className="mb-4">
                <label className="field-label" htmlFor="asset-notes">Notes</label>
                <textarea className="field text-sm" rows={2} id="asset-notes" value={form.notes} onChange={e => setField('notes', e.target.value)} />
              </div>

              <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2">
                {saving ? 'Saving…' : 'Add to the register'}
              </button>
            </div>
          </form>
        )}

        {/* ---- the register ---- */}
        {loading ? (
          <p className="text-sm text-ink-muted">Loading the register…</p>
        ) : visibleGroups.length === 0 ? (
          <div className="panel bg-white border border-rule-soft rounded-card">
            <div className="panel-body p-8 text-center">
              <p className="font-serif text-xl mb-2">Nothing on the register yet</p>
              <p className="text-sm text-ink-muted">
                Start with what is in the kitchen — the chillers, the freezer, the tables — and add each one.
              </p>
              <button onClick={openForm} className="btn-primary text-sm px-4 py-2 mt-5">+ Add assets</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleGroups.map(group => {
              const isOpen = openGroups[group.id] || search.trim().length > 0;
              return (
                <div key={group.id} className="panel bg-white border border-rule-soft rounded-card">
                  <div className="panel-body p-0">
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full text-left px-6 lg:px-8 py-5 flex items-center justify-between hover:bg-page/60 transition-colors"
                    >
                      <div className="flex items-baseline gap-3">
                        <h3 className="font-serif text-xl">{group.name}</h3>
                        <span className="text-sm text-ink-muted">
                          {group.assets.length} {group.assets.length === 1 ? 'asset' : 'assets'}
                        </span>
                        {group.openJobs > 0 && (
                          <span className="pill pill-bad text-xs">{group.openJobs} open</span>
                        )}
                      </div>
                      <span className="btn-secondary text-xs px-3 py-1">{isOpen ? 'Collapse' : 'Expand'}</span>
                    </button>

                    {isOpen && group.assets.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-y border-rule-soft bg-page">
                              <th className="table-head text-left px-6 lg:px-8 py-2.5">Asset #</th>
                              <th className="table-head text-left px-4 py-2.5">What it is</th>
                              <th className="table-head text-left px-4 py-2.5">Condition</th>
                              <th className="table-head text-left px-4 py-2.5">Status</th>
                              <th className="table-head text-left px-4 py-2.5">Where</th>
                              <th className="table-head text-left px-4 py-2.5">With</th>
                              <th className="table-head text-right px-6 lg:px-8 py-2.5">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.assets.map(asset => (
                              <tr key={asset.asset_number} className="border-b border-rule-soft hover:bg-page/60">
                                <td className="table-cell px-6 lg:px-8 py-3 font-medium">
                                  <Link href={`/operations/assets/${encodeURIComponent(asset.asset_number)}`} className="hover:underline">
                                    {asset.asset_number}
                                  </Link>
                                </td>
                                <td className="table-cell px-4 py-3">
                                  <div>{asset.name}</div>
                                  <div className="text-xs text-ink-muted">
                                    {[asset.brand, asset.model_name].filter(Boolean).join(' · ') || asset.type_name || '—'}
                                  </div>
                                </td>
                                <td className="table-cell px-4 py-3">
                                  <span className={`pill pill-${CONDITION_TONE[asset.condition] || 'quiet'} text-xs`}>
                                    {asset.condition || '—'}
                                  </span>
                                </td>
                                <td className="table-cell px-4 py-3">{statusPill(asset)}</td>
                                <td className="table-cell px-4 py-3 text-xs">{asset.location_name || '—'}</td>
                                <td className="table-cell px-4 py-3 text-xs">
                                  {asset.assigned_employee_id
                                    ? (employeeById.get(asset.assigned_employee_id)?.name || asset.assigned_employee_id)
                                    : '—'}
                                </td>
                                <td className="table-cell px-6 lg:px-8 py-3 text-right whitespace-nowrap">
                                  <button onClick={() => remove(asset.asset_number)} className="btn-quiet text-xs px-2 py-1">Remove</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

'use client';

/**
 * app/settings/assets-config/page.js — what the asset register may hold.
 *
 * Three lists: the **categories** an asset can be filed under, the **types**
 * within them, and the **locations** they sit in. They used to live in the
 * browser's memory, which meant they were forgotten the moment the page was
 * closed — and the register's pickers were a different, hard-coded list.
 *
 * Now they are the tables the register actually reads. A category also
 * carries a **prefix**, the two letters an asset number starts with: KI for
 * Kitchen Equipment, so a chiller in it is KICH00001.
 *
 * A list that something is already filed under cannot be removed — the
 * assets that use it are shown, so it is clear what would be left hanging.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabaseClient';

export default function AssetConfigPage() {
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assets, setAssets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [catName, setCatName] = useState('');
  const [catPrefix, setCatPrefix] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typePrefix, setTypePrefix] = useState('');
  const [typeCategory, setTypeCategory] = useState('');
  const [locName, setLocName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, typeRes, locRes, assetRes] = await Promise.all([
        supabase.from('asset_categories').select('*').order('name'),
        supabase.from('asset_types').select('*').order('name'),
        supabase.from('asset_locations').select('*').order('name'),
        supabase.from('assets').select('asset_number, category_id, type_id, location_id'),
      ]);
      const failure = [catRes, typeRes, locRes, assetRes].find(r => r.error);
      if (failure) throw new Error(failure.error.message);
      setCategories(catRes.data || []);
      setTypes(typeRes.data || []);
      setLocations(locRes.data || []);
      setAssets(assetRes.data || []);
      if (!typeCategory && (typeRes.data || []).length) {
        setTypeCategory(String(typeRes.data[0].category ? (catRes.data || []).find(c => c.name === typeRes.data[0].category)?.id || '' : ''));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, typeCategory]);

  useEffect(() => { load(); }, [load]);

  /** How many assets use each thing — so it is clear what cannot be removed. */
  const useCount = useMemo(() => ({
    category: id => assets.filter(a => a.category_id === id).length,
    type: id => assets.filter(a => a.type_id === id).length,
    location: id => assets.filter(a => a.location_id === id).length,
  }), [assets]);

  const save = async (label, fn) => {
    setError('');
    setMessage('');
    try {
      const { error: err } = await fn();
      if (err) throw new Error(err.message);
      setMessage(`${label} saved.`);
      await load();
      return true;
    } catch (err) {
      setError(
        /row-level security|permission denied/i.test(err.message)
          ? 'Only an administrator, or someone with the settings permission, can change these lists.'
          : err.message
      );
      return false;
    }
  };

  const addCategory = async () => {
    const name = catName.trim();
    if (!name) return;
    const prefix = (catPrefix.trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 2)).toUpperCase();
    const ok = await save(`The category “${name}”`, () =>
      supabase.from('asset_categories').insert({ name, prefix })
    );
    if (ok) { setCatName(''); setCatPrefix(''); }
  };

  const addType = async () => {
    const name = typeName.trim();
    if (!name) return;
    const category = categories.find(c => String(c.id) === typeCategory);
    if (!category) { setError('Choose the category this type belongs to.'); return; }
    const prefix = (typePrefix.trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 2)).toUpperCase();
    const ok = await save(`The type “${name}”`, () =>
      supabase.from('asset_types').insert({ name, prefix, category: category.name })
    );
    if (ok) { setTypeName(''); setTypePrefix(''); }
  };

  const addLocation = async () => {
    const name = locName.trim();
    if (!name) return;
    const ok = await save(`The location “${name}”`, () =>
      supabase.from('asset_locations').insert({ name })
    );
    if (ok) setLocName('');
  };

  const remove = async (label, table, id, used) => {
    if (used > 0) {
      setError(`“${label}” is used by ${used} asset${used === 1 ? '' : 's'} — it cannot be removed.`);
      return;
    }
    if (!window.confirm(`Remove “${label}”?`)) return;
    await save(`“${label}” removed`, () => supabase.from(table).delete().eq('id', id));
  };

  const listPanel = (title, description, rows, table, countFn, extra) => (
    <div className="panel bg-white border border-rule-soft rounded-card shadow-sm mb-8">
      <div className="panel-body p-8">
        <h3 className="font-serif text-xl mb-1">{title}</h3>
        <p className="text-sm text-ink-muted mb-4">{description}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing here yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              const used = countFn(row.id);
              return (
                <div key={row.id} className="flex items-center justify-between gap-4 py-2 border-b border-rule-soft last:border-b-0">
                  <span className="text-sm">
                    {row.name}
                    {extra ? extra(row) : null}
                    {used > 0 && (
                      <span className="text-xs text-ink-muted ml-2">{used} asset{used === 1 ? '' : 's'}</span>
                    )}
                  </span>
                  <button
                    onClick={() => remove(row.name, table, row.id, used)}
                    className="btn-quiet text-xs px-2 py-1"
                  >
                    {used > 0 ? 'In use' : 'Remove'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="max-w-4xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="btn-secondary text-xs px-3 py-1.5">← Settings</Link>
          <span className="text-ink-muted text-sm">Settings / Asset config</span>
        </div>

        <div className="page-head mb-10">
          <h1 className="page-title font-serif text-4xl">Asset configuration</h1>
          <p className="page-purpose text-ink-muted">
            The categories, types and locations the asset register offers.
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

        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <>
            <div className="panel bg-white border border-rule-soft rounded-card shadow-sm mb-8">
              <div className="panel-body p-8">
                <h3 className="font-serif text-xl mb-1">Categories</h3>
                <p className="text-sm text-ink-muted mb-4">
                  What kind of thing it is — Kitchen Equipment, Furniture, Uniform. The prefix is the two letters
                  an asset number starts with.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <input className="field text-sm flex-1 min-w-[180px]" placeholder="New category…" value={catName} onChange={e => setCatName(e.target.value)} />
                  <input className="field text-sm w-28" placeholder="Prefix" maxLength={3} value={catPrefix} onChange={e => setCatPrefix(e.target.value)} />
                  <button onClick={addCategory} className="btn-primary text-xs px-3">Add</button>
                </div>
              </div>
            </div>

            {listPanel(
              'Categories on the books',
              'A category that something is filed under cannot be removed.',
              categories,
              'asset_categories',
              id => useCount.category(id),
              row => <span className="text-xs text-ink-muted ml-2">{row.prefix}</span>,
            )}

            <div className="panel bg-white border border-rule-soft rounded-card shadow-sm mb-8">
              <div className="panel-body p-8">
                <h3 className="font-serif text-xl mb-1">Add a type</h3>
                <p className="text-sm text-ink-muted mb-4">
                  What it is within the category — Chiller within Kitchen Equipment.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <select className="field text-sm bg-white" value={typeCategory} onChange={e => setTypeCategory(e.target.value)}>
                    <option value="">Choose a category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className="field text-sm flex-1 min-w-[160px]" placeholder="New type…" value={typeName} onChange={e => setTypeName(e.target.value)} />
                  <input className="field text-sm w-28" placeholder="Prefix" maxLength={3} value={typePrefix} onChange={e => setTypePrefix(e.target.value)} />
                  <button onClick={addType} className="btn-primary text-xs px-3">Add</button>
                </div>
              </div>
            </div>

            {listPanel(
              'Types on the books',
              'A type that something is filed under cannot be removed.',
              types,
              'asset_types',
              id => useCount.type(id),
              row => (
                <span className="text-xs text-ink-muted ml-2">
                  {row.prefix} · {row.category}
                </span>
              ),
            )}

            <div className="panel bg-white border border-rule-soft rounded-card shadow-sm mb-8">
              <div className="panel-body p-8">
                <h3 className="font-serif text-xl mb-1">Add a location</h3>
                <p className="text-sm text-ink-muted mb-4">Where it is — Kitchen, Restaurant, Office, Storage.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <input className="field text-sm flex-1 min-w-[180px]" placeholder="New location…" value={locName} onChange={e => setLocName(e.target.value)} />
                  <button onClick={addLocation} className="btn-primary text-xs px-3">Add</button>
                </div>
              </div>
            </div>

            {listPanel(
              'Locations on the books',
              'A location that something is filed under cannot be removed.',
              locations,
              'asset_locations',
              id => useCount.location(id),
            )}
          </>
        )}
      </div>
    </main>
  );
}

'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '../../../lib/supabaseClient';

// The JD library is a company-wide document. A role has at most one
// canonical description here, and the recruitment form reads it when a
// headcount listing is created for that role.
export default function JobDescriptionsPage() {
  const supabase = createClient();

  const [designations, setDesignations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  // The designation currently being edited. Templates are edited one role at
  // a time so the screen never shows several long text areas at once.
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ job_description_title: '', job_description_text: '' });

  async function load() {
    setLoading(true);
    setError('');

    // Each query is raced against a timeout. A Supabase request that never
    // settles (RLS rejecting silently, a dropped connection) would otherwise
    // leave this screen on "Loading…" forever with no way out.
    const withTimeout = (promise, fallback) =>
      Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), 8000)),
      ]);

    const [designationsRes, templatesRes] = await Promise.all([
      withTimeout(
        supabase.from('designations').select('name, department').order('name'),
        { data: [], error: null }
      ),
      withTimeout(
        supabase.from('job_description_templates').select('*'),
        { data: [], error: null }
      ),
    ]);

    if (designationsRes.error) setError(designationsRes.error.message);
    if (templatesRes.error) setError(templatesRes.error.message);

    setDesignations(designationsRes.data || []);
    setTemplates(templatesRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const templateMap = useMemo(() => {
    const map = {};
    templates.forEach(t => { map[t.designation] = t; });
    return map;
  }, [templates]);

  const filtered = useMemo(() => {
    if (!search.trim()) return designations;
    const q = search.trim().toLowerCase();
    return designations.filter(d =>
      d.name?.toLowerCase().includes(q) || d.department?.toLowerCase().includes(q)
    );
  }, [designations, search]);

  function startEdit(designation) {
    const existing = templateMap[designation.name];
    setEditing(designation.name);
    setDraft({
      job_description_title: existing?.job_description_title || '',
      job_description_text: existing?.job_description_text || '',
    });
    setMessage('');
    setError('');
  }

  async function saveTemplate() {
    if (!editing) return;

    if (!draft.job_description_text.trim()) {
      setError('Write the job description, or cancel to leave this role blank.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      designation: editing,
      job_description_title: draft.job_description_title.trim() || editing,
      job_description_text: draft.job_description_text.trim()
    };

    // Upsert rather than insert-then-patch: a role may be edited many times
    // over its life, and this keeps the single-row-per-role guarantee without
    // the delete/reinsert churn that would briefly break the lookup.
    const { error: saveErr } = await supabase
      .from('job_description_templates')
      .upsert(payload, { onConflict: 'designation' });

    setSaving(false);

    if (saveErr) {
      setError(saveErr.message);
    } else {
      setMessage(`Saved the ${editing} job description.`);
      await load();
    }
  }

  async function clearTemplate(designation) {
    if (!window.confirm(
      `Clear the saved job description for ${designation}? New listings for this role will start blank instead.`
    )) return;

    setSaving(true);
    setError('');

    const { error: delErr } = await supabase
      .from('job_description_templates')
      .delete()
      .eq('designation', designation);

    setSaving(false);

    if (delErr) {
      setError(delErr.message);
    } else {
      setMessage(`Cleared the ${designation} job description.`);
      setEditing(null);
      await load();
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-ink-muted">Loading job description library…</p>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="page-head">
        <div>
          <h1 className="page-title">Job descriptions</h1>
          <p className="page-purpose">
            Write a role&rsquo;s description once here. Every new headcount listing for
            that role starts pre-filled with this text, which you can still edit per
            listing. A role with no description below starts blank.
          </p>
        </div>
        <a href="/settings" className="btn-secondary">Settings</a>
      </div>

      {message && (
        <div className="mb-6 rounded-card border border-good/30 bg-good-wash px-4 py-3 text-sm text-good">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-card border border-bad/30 bg-bad-wash px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      {designations.length === 0 ? (
        <div className="note">
          <p className="text-ink">No designations exist yet.</p>
          <p className="mt-1">
            Add roles under Settings &rarr; Departments &amp; Designations first — each
            job description here belongs to one of them.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 w-full sm:w-auto sm:min-w-[18rem]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search roles or departments…"
              className="field text-sm"
            />
          </div>

          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-rule bg-page/50">
                    <th className="table-head">Role</th>
                    <th className="table-head">Department</th>
                    <th className="table-head">Description</th>
                    <th className="table-head w-px"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule-soft">
                  {filtered.map(d => {
                    const tpl = templateMap[d.name];
                    const isOpen = editing === d.name;

                    return (
                      <tr key={d.name} className={isOpen ? 'bg-page/40' : ''}>
                        <td className="table-cell align-top font-medium text-ink">
                          {d.name}
                        </td>
                        <td className="table-cell align-top text-ink-muted">
                          {d.department || '—'}
                        </td>

                        {isOpen ? (
                          <td className="table-cell align-top" colSpan={2}>
                            <div className="space-y-3 py-2">
                              <div>
                                <label className="field-label">Short title (used in listings)</label>
                                <input
                                  type="text"
                                  value={draft.job_description_title}
                                  onChange={e => setDraft(prev => ({ ...prev, job_description_title: e.target.value }))}
                                  placeholder={d.name}
                                  className="field text-sm"
                                />
                              </div>
                              <div>
                                <label className="field-label">Job description</label>
                                <textarea
                                  rows={12}
                                  value={draft.job_description_text}
                                  onChange={e => setDraft(prev => ({ ...prev, job_description_text: e.target.value }))}
                                  placeholder={'About the role\n\nResponsibilities:\n- …\n\nRequirements:\n- …\n\nShift timings:\n- …'}
                                  className="field font-sans text-sm leading-relaxed"
                                />
                                <p className="mt-1.5 text-2xs text-ink-muted">
                                  Plain text with line breaks. This is the text you paste
                                  into the Indeed or Instagram listing.
                                </p>
                              </div>

                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={saveTemplate}
                                  disabled={saving}
                                  className="btn-primary text-sm"
                                >
                                  {saving ? 'Saving…' : 'Save description'}
                                </button>
                                <button
                                  onClick={() => { setEditing(null); setError(''); }}
                                  className="btn-secondary text-sm"
                                >
                                  Cancel
                                </button>
                                {tpl && (
                                  <button
                                    onClick={() => clearTemplate(d.name)}
                                    disabled={saving}
                                    className="btn-quiet text-sm text-bad"
                                  >
                                    Delete saved copy
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="table-cell align-top">
                              {tpl ? (
                                <span className="pill-good">Saved</span>
                              ) : (
                                <span className="pill-quiet">Not written yet</span>
                              )}
                            </td>
                            <td className="table-cell align-top text-right">
                              <button
                                onClick={() => startEdit(d)}
                                className="btn-secondary text-sm whitespace-nowrap"
                              >
                                {tpl ? 'Edit' : 'Write description'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <p className="py-8 text-center text-sm text-ink-muted">
                          No roles match &ldquo;{search}&rdquo;.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
'use client';
import { useState, useEffect, Suspense } from 'react';
import { createClient } from '../../../lib/supabaseClient';

function VariablePayConfigContent() {
  const supabase = createClient();

  const [schemes, setSchemes] = useState([]);
  const [selectedSchemeId, setSelectedSchemeId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [editingScheme, setEditingScheme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadSchemes();
  }, []);

  async function loadSchemes() {
    setLoading(true);
    setError('');

    const { data: depts } = await supabase.from('departments').select('name').order('name');
    setDepartments((depts || []).map(d => d.name));

    const { data: schemeList, error: sErr } = await supabase
      .from('variable_pay_schemes')
      .select('*')
      .order('id', { ascending: true });

    if (sErr) setError(sErr.message);
    else {
      setSchemes(schemeList || []);
      if (schemeList && schemeList.length > 0 && !selectedSchemeId) {
        setSelectedSchemeId(schemeList[0].id);
        setEditingScheme(JSON.parse(JSON.stringify(schemeList[0])));
      }
    }

    setLoading(false);
  }

  function handleSelectScheme(scheme) {
    setSelectedSchemeId(scheme.id);
    setEditingScheme(JSON.parse(JSON.stringify(scheme)));
    setError('');
    setMessage('');
  }

  function handleAddMetric() {
    if (!editingScheme) return;
    const newMetric = {
      id: `metric_${Date.now()}`,
      name: 'New Performance Metric',
      weight: 0.10,
      type: 'binary',
      direction: 'higher',
      target: 100,
      floor: null,
      ceiling: null,
      unit: '%',
      scope: 'individual',
      comments: 'Describe measurement criteria'
    };

    setEditingScheme(prev => ({
      ...prev,
      metrics: [...(prev.metrics || []), newMetric]
    }));
  }

  function handleRemoveMetric(index) {
    setEditingScheme(prev => {
      const updated = [...prev.metrics];
      updated.splice(index, 1);
      return { ...prev, metrics: updated };
    });
  }

  function handleMetricChange(index, field, value) {
    setEditingScheme(prev => {
      const updated = [...prev.metrics];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return { ...prev, metrics: updated };
    });
  }

  async function handleSaveScheme(e) {
    e.preventDefault();
    if (!editingScheme) return;

    // Validate total weight sums to 1.0 (100%)
    const totalWeight = (editingScheme.metrics || []).reduce((sum, m) => sum + Number(m.weight || 0), 0);
    const roundedTotal = Math.round(totalWeight * 100) / 100;

    if (roundedTotal !== 1.0) {
      if (!window.confirm(`Warning: Total metric distribution weights sum to ${(roundedTotal * 100)}% (expected 100%). Do you still want to save?`)) {
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');

    const { error: upErr } = await supabase
      .from('variable_pay_schemes')
      .update({
        display_name: editingScheme.display_name,
        department: editingScheme.department || null,
        metrics: editingScheme.metrics,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingScheme.id);

    setSaving(false);
    if (upErr) {
      setError(`Failed to save scheme: ${upErr.message}`);
    } else {
      setMessage(`✓ "${editingScheme.display_name}" variable pay scheme updated successfully.`);
      loadSchemes();
    }
  }

  const currentTotalWeight = (editingScheme?.metrics || []).reduce((sum, m) => sum + Number(m.weight || 0), 0);
  const totalWeightPct = Math.round(currentTotalWeight * 100);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Variable Pay Incentive Schemes</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Configure role-based metric distribution weights, qualification floors, and overachievement ceilings.
          </p>
        </div>
        <a
          href="/settings"
          style={{
            background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
            padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13
          }}
        >
          ← Back to Settings
        </a>
      </div>

      {/* Notifications */}
      {message && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontWeight: 500 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Layout: Schemes List on Left, Configurator on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* Left Column: Schemes List */}
        <div style={{ background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 10 }}>
            Configured Schemes ({schemes.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {schemes.map(s => {
              const isSelected = selectedSchemeId === s.id;
              const metricCount = (s.metrics || []).length;

              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectScheme(s)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : 'white',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#1e40af' : '#111827' }}>
                    {s.display_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {s.department || 'All Departments'} • {metricCount} Metric{metricCount !== 1 ? 's' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Scheme Editor */}
        {editingScheme && (
          <div style={{ background: 'white', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', flex: 2 }}>
            <form onSubmit={handleSaveScheme}>
              {/* Scheme Title & Dept */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 2px 0', fontSize: 18, fontWeight: 800, color: '#111827' }}>
                    {editingScheme.display_name}
                  </h2>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    System Identifier: <code style={{ color: '#0369a1' }}>{editingScheme.name}</code>
                  </span>
                </div>

                <div style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 'bold',
                  background: totalWeightPct === 100 ? '#ecfdf5' : '#fffbeb',
                  color: totalWeightPct === 100 ? '#065f46' : '#92400e',
                  border: totalWeightPct === 100 ? '1px solid #a7f3d0' : '1px solid #fde68a'
                }}>
                  Total Weight: {totalWeightPct}% {totalWeightPct === 100 ? '✓' : '(Must sum to 100%)'}
                </div>
              </div>

              {/* Metrics Table / Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {(editingScheme.metrics || []).map((m, idx) => (
                  <div
                    key={m.id || idx}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}
                  >
                    {/* Row 1: Name, Weight, Type, Direction */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'center' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Metric Name
                        </label>
                        <input
                          type="text"
                          value={m.name}
                          onChange={e => handleMetricChange(idx, 'name', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontWeight: 600, boxSizing: 'border-box' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Distribution Weight (% of pool)
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={m.weight}
                          onChange={e => handleMetricChange(idx, 'weight', Number(e.target.value))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                        />
                        <span style={{ fontSize: 10, color: '#64748b' }}>= {Math.round(Number(m.weight || 0) * 100)}%</span>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Attainment Type
                        </label>
                        <select
                          value={m.type || 'binary'}
                          onChange={e => handleMetricChange(idx, 'type', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, background: 'white' }}
                        >
                          <option value="binary">Binary (Hit / Miss)</option>
                          <option value="proportional">Proportional / Scaled</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Direction (Better)
                        </label>
                        <select
                          value={m.direction || 'higher'}
                          onChange={e => handleMetricChange(idx, 'direction', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, background: 'white' }}
                        >
                          <option value="higher">Higher is Better (Sales, Reviews)</option>
                          <option value="lower">Lower is Better (Wastage, Return)</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Target, Floor, Ceiling, Unit */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, alignItems: 'center' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Target
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={m.target ?? ''}
                          onChange={e => handleMetricChange(idx, 'target', e.target.value === '' ? '' : Number(e.target.value))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </div>

                      {m.type === 'proportional' && (
                        <>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                              Floor (Min required)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={m.floor ?? ''}
                              onChange={e => handleMetricChange(idx, 'floor', e.target.value === '' ? null : Number(e.target.value))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                              Ceiling (Max capped)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={m.ceiling ?? ''}
                              onChange={e => handleMetricChange(idx, 'ceiling', e.target.value === '' ? null : Number(e.target.value))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                          Unit / Scope
                        </label>
                        <input
                          type="text"
                          value={m.unit || ''}
                          placeholder="e.g. ₹, %, count, mins"
                          onChange={e => handleMetricChange(idx, 'unit', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveMetric(idx)}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>

                    {/* Row 3: Comments / Rule Notes */}
                    <div>
                      <input
                        type="text"
                        placeholder="Guideline / Measurement comments for this metric"
                        value={m.comments || ''}
                        onChange={e => handleMetricChange(idx, 'comments', e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11, color: '#64748b', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Metric & Save Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleAddMetric}
                  style={{
                    background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '8px 14px',
                    borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer'
                  }}
                >
                  + Add Metric to Scheme
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#059669', color: 'white', border: 'none', padding: '9px 24px',
                    borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
                  }}
                >
                  {saving ? 'Saving Scheme...' : '💾 Save Variable Pay Scheme'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VariablePayConfigPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading variable pay configuration...</div>}>
      <VariablePayConfigContent />
    </Suspense>
  );
}

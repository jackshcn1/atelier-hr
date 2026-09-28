'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

function OrgNode({ emp, childrenMap, allEmployees, onReassign, depth = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const kids = childrenMap[emp.employee_id] || [];
  const isExited = emp.status === 'exited';
  const hasReports = kids.length > 0;
  const flagged = isExited && hasReports;

  const initials = String(emp.name || 'E')
    .split(/\s+/)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Connector line from parent */}
      {depth > 0 && (
        <div style={{
          width: 2, height: 16,
          background: '#cbd5e1', borderRadius: 2,
          marginBottom: -2
        }} />
      )}

      {/* Node Card */}
      <div style={{
        background: flagged ? '#fffbeb' : 'white',
        border: flagged ? '2px solid #f59e0b' : '2px solid #e2e8f0',
        borderRadius: 10,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
        minWidth: 180,
        maxWidth: 240,
        position: 'relative'
      }}>
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: isExited ? '#fee2e2' : '#eff6ff',
          color: isExited ? '#991b1b' : '#1d4ed8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, flexShrink: 0,
          border: `2px solid ${isExited ? '#fca5a5' : '#bfdbfe'}`
        }}>
          {emp.passport_photo_url ? (
            <img
              src={`https://wzxswmopfxnucmeygqeg.supabase.co/storage/v1/object/public/documents/${emp.passport_photo_url}`}
              alt=""
              onError={(e) => { e.target.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : initials}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 80 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <a
              href={`/employees/${emp.employee_id}`}
              style={{ fontWeight: 800, fontSize: 12, color: '#111827', textDecoration: 'none' }}
            >
              {emp.name}
            </a>
            {isExited && (
              <span style={{ fontSize: 9, background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>
                Exited
              </span>
            )}
          </div>

          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>
            <span style={{ fontWeight: 600 }}>{emp.designation || 'Staff'}</span>
            {emp.department && (
              <span style={{ color: '#6b7280' }}> • {emp.department}</span>
            )}
          </div>

          {flagged && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#b45309', fontWeight: 600 }}>
              ⚠ Exited Manager — {kids.length} direct report(s) need reassignment:
              <div style={{ marginTop: 2 }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      kids.forEach(k => onReassign(k.employee_id, e.target.value));
                    }
                  }}
                  style={{ fontSize: 9, padding: '2px 4px', borderRadius: 3, border: '1px solid #f59e0b', background: 'white' }}
                >
                  <option value="">Reassign all reports to…</option>
                  {allEmployees.filter(m => m.status !== 'exited' && m.employee_id !== emp.employee_id).map(m => (
                    <option key={m.employee_id} value={m.employee_id}>{m.name} ({m.designation || 'Staff'})</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Collapse / Expand Toggle for Managers */}
        {hasReports && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand team' : 'Collapse team'}
            style={{
              position: 'absolute', top: -8, right: -8,
              background: '#2563eb', color: 'white',
              border: 'none', borderRadius: '50%',
              width: 20, height: 20, fontSize: 10, fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {collapsed ? '+' : '▼'}
          </button>
        )}
      </div>

      {/* Child Nodes — rendered in a single horizontal row (family tree style) */}
      {!collapsed && kids.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginTop: 14, position: 'relative'
        }}>
          {/* Vertical connector from manager down to horizontal bar */}
          <div style={{
            width: 2, height: 14,
            background: '#cbd5e1', borderRadius: 2
          }} />

          {/* Horizontal connector bar spanning all reports */}
          {kids.length > 1 && (
            <div style={{
              position: 'absolute', top: 14,
              width: `${Math.max(kids.length * 180, 200)}px`, height: 2,
              background: '#cbd5e1', borderRadius: 2
            }} />
          )}

          {/* Reports row — all direct reports side by side on one line, sorted A→Z */}
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'nowrap', justifyContent: 'center',
            marginTop: kids.length > 1 ? 14 : 0,
            overflowX: 'auto',
            maxWidth: '100%'
          }}>
            {[...kids].sort((a, b) => a.name.localeCompare(b.name)).map(k => (
              <OrgNode
                key={k.employee_id}
                emp={k}
                childrenMap={childrenMap}
                allEmployees={allEmployees}
                onReassign={onReassign}
                depth={depth + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const supabase = createClient();
  const [tree, setTree] = useState({ roots: [], map: {} });
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadTree() {
    setLoading(true);
    const { data } = await supabase.from('employees').select('*').is('deleted_at', null).order('name');
    if (data) {
      setAllEmployees(data);
      const map = {};
      data.forEach(e => {
        if (!e.reporting_manager_id) return;
        map[e.reporting_manager_id] = map[e.reporting_manager_id] || [];
        map[e.reporting_manager_id].push(e);
      });

      // Roots: active employees without a manager, or exited managers who still have unreassigned reports
      const roots = data.filter(e =>
        e.status !== 'exited' ? !e.reporting_manager_id : (map[e.employee_id] || []).length > 0
      );

      setTree({ roots, map });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTree();
  }, []);

  async function handleReassign(employeeId, newManagerId) {
    await supabase.from('employees').update({ reporting_manager_id: newManagerId || null }).eq('employee_id', employeeId);
    loadTree();
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Organization Chart</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Visual team reporting structure built automatically from each employee's assigned reporting manager.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href="/employees"
            style={{
              background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
              padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13
            }}
          >
            ← Back to Employees
          </a>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Building organizational hierarchy...
        </div>
      ) : tree.roots.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 40, textAlign: 'center', color: '#6b7280' }}>
          No active employees found, or no top-level managers without an assigned reporting manager.
        </div>
      ) : (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '32px 24px', overflowX: 'auto', minHeight: 'calc(100vh - 200px)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👑</span>
            <span>Top of Hierarchy ({tree.roots.length} Root Lead{tree.roots.length !== 1 ? 's' : ''})</span>
          </div>

          {/* Family Tree - roots displayed horizontally */}
          <div style={{ display: 'flex', gap: 40, flexWrap: 'nowrap', justifyContent: 'center', alignItems: 'flex-start', overflowX: 'auto', maxWidth: '100%' }}>
            {[...tree.roots].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
              <OrgNode
                key={r.employee_id}
                emp={r}
                childrenMap={tree.map}
                allEmployees={allEmployees}
                onReassign={handleReassign}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

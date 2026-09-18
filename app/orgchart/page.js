'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

function Node({ emp, childrenMap }) {
  const kids = childrenMap[emp.employee_id] || [];
  const flagged = emp.status === 'exited' && kids.length > 0;
  return (
    <div style={{ marginLeft: 20, borderLeft: '2px solid #ddd', paddingLeft: 12, marginTop: 8 }}>
      <div style={{
        background: flagged ? '#fff3cd' : 'white',
        border: flagged ? '1px solid #ffe08a' : 'none',
        padding: '6px 10px', borderRadius: 6, display: 'inline-block'
      }}>
        <strong>{emp.name}</strong> <span style={{ color: '#777' }}>— {emp.designation}</span>
        {flagged && <span style={{ marginLeft: 8, color: '#856404' }}>⚠ exited — reassign their reports</span>}
      </div>
      {kids.map(k => <Node key={k.employee_id} emp={k} childrenMap={childrenMap} />)}
    </div>
  );
}

export default function OrgChart() {
  const supabase = createClient();
  const [tree, setTree] = useState({ roots: [], map: {} });

  useEffect(() => {
    // include exited managers so their (unreassigned) reports still render, flagged
    supabase.from('employees').select('*').is('deleted_at', null).then(({ data }) => {
      if (!data) return;
      const map = {};
      data.forEach(e => {
        if (!e.reporting_manager_id) return;
        map[e.reporting_manager_id] = map[e.reporting_manager_id] || [];
        map[e.reporting_manager_id].push(e);
      });
      // roots = active employees with no manager, or exited managers who still have reports
      const roots = data.filter(e =>
        e.status !== 'exited' ? !e.reporting_manager_id : (map[e.employee_id] || []).length > 0
      );
      setTree({ roots, map });
    });
  }, []);

  return (
    <div>
      <h1>Org chart</h1>
      <p style={{ color: '#777' }}>Built automatically from each employee's reporting manager — no separate upkeep needed.</p>
      {tree.roots.map(r => <Node key={r.employee_id} emp={r} childrenMap={tree.map} />)}
      {tree.roots.length === 0 && <p>No employees yet, or none without a manager set.</p>}
    </div>
  );
}

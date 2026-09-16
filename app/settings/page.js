'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function PayrollSettings() {
  const supabase = createClient();
  const [floor, setFloor] = useState('');
  const [hraPct, setHraPct] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('payroll_settings').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) setError(error.message + ' (only admins can view/edit payroll settings)');
      if (data) { setFloor(data.basic_da_floor); setHraPct(data.hra_split_percent); }
    });
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSaved(false);
    const { error } = await supabase.from('payroll_settings')
      .update({ basic_da_floor: floor, hra_split_percent: hraPct, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) setError(error.message);
    else setSaved(true);
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Payroll settings</h1>
      <p style={{ color: '#777' }}>
        Controls how fixed salary splits into basic+DA / HRA / other allowances for gratuity and payroll purposes.
        Changing this only affects salary entries recorded from now on — past salary history keeps whatever split
        was calculated at the time, so old records and past gratuity figures never silently change.
      </p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'white', padding: 16, borderRadius: 8 }}>
        <label>Basic + DA floor (₹/month) — Kerala minimum wage floor for your staff's grade, revised quarterly with DA
          <input type="number" value={floor} onChange={e => setFloor(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <label>Of the amount above the floor, % assigned to HRA (rest goes to other allowances)
          <input type="number" value={hraPct} onChange={e => setHraPct(e.target.value)} min="0" max="100" style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" style={{ padding: 10 }}>Save</button>
        {saved && <p style={{ color: 'green' }}>Saved.</p>}
      </form>
    </div>
  );
}

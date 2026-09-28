'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function SettingsPage() {
  const supabase = createClient();

  // Payroll split settings
  const [floor, setFloor] = useState('');
  const [hraPct, setHraPct] = useState('');
  const [payrollSaved, setPayrollSaved] = useState(false);

  // Company policy text
  const [guidelines, setGuidelines] = useState('');
  const [leavePolicy, setLeavePolicy] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [policiesSaved, setPoliciesSaved] = useState(false);

  // Deposit amounts
  const [uniformDeposit, setUniformDeposit] = useState('');
  const [accommodationDeposit, setAccommodationDeposit] = useState('');
  const [depositsSaved, setDepositsSaved] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('payroll_settings').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) setError(error.message + ' (only admins can view/edit settings)');
      if (data) { setFloor(data.basic_da_floor); setHraPct(data.hra_split_percent); }
    });
    supabase.from('company_policies').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) { setGuidelines(data.guidelines_text); setLeavePolicy(data.leave_policy_text); setNoticePeriod(data.notice_period_text); }
    });
    supabase.from('deposit_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) { setUniformDeposit(data.uniform_deposit_amount); setAccommodationDeposit(data.accommodation_deposit_amount); }
    });
  }, []);

  async function savePayroll(e) {
    e.preventDefault();
    setError(''); setPayrollSaved(false);
    const { error } = await supabase.from('payroll_settings')
      .update({ basic_da_floor: floor, hra_split_percent: hraPct, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) setError(error.message); else setPayrollSaved(true);
  }

  async function savePolicies(e) {
    e.preventDefault();
    setError(''); setPoliciesSaved(false);
    const { error } = await supabase.from('company_policies')
      .update({ guidelines_text: guidelines, leave_policy_text: leavePolicy, notice_period_text: noticePeriod, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) setError(error.message); else setPoliciesSaved(true);
  }

  async function saveDeposits(e) {
    e.preventDefault();
    setError(''); setDepositsSaved(false);
    const { error } = await supabase.from('deposit_settings')
      .update({ uniform_deposit_amount: uniformDeposit, accommodation_deposit_amount: accommodationDeposit, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) setError(error.message); else setDepositsSaved(true);
  }

  const sectionStyle = { background: 'white', padding: 16, borderRadius: 8, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Company Settings</h1>
          <p style={{ color: '#666', margin: 0 }}>Manage user access permissions, payroll split formulas, deposits, and company policies.</p>
        </div>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 24, maxWidth: 800 }}>
        <a
          href="/settings/users"
          style={{
            background: 'white', padding: 16, borderRadius: 8, border: '1px solid #c084fc', textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(124, 58, 237, 0.08)', display: 'block'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#7c3aed', marginBottom: 4 }}>
            👥 User & Access Management →
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Assign custom permission toggles, department scopes, manage role presets, and handle access revocations.
          </p>
        </a>

        <a
          href="/settings/departments-designations"
          style={{
            background: 'white', padding: 16, borderRadius: 8, border: '1px solid #60a5fa', textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.08)', display: 'block'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2563eb', marginBottom: 4 }}>
            🏢 Departments & Designations →
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Configure company departments, role designations, and department heads for onboarding dropdowns.
          </p>
        </a>

        <a
          href="/settings/variable-pay"
          style={{
            background: 'white', padding: 16, borderRadius: 8, border: '1px solid #6ee7b7', textDecoration: 'none',
            boxShadow: '0 2px 6px rgba(5, 150, 105, 0.08)', display: 'block'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#059669', marginBottom: 4 }}>
            🎯 Variable Pay Schemes →
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Configure role targets, metric weights, floors & ceilings for Captains, Kitchen, B2B, and Service staff.
          </p>
        </a>

        <a
          href="/settings/document-templates"
          style={{
            background: 'white', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'block'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937', marginBottom: 4 }}>
            📄 Document Templates →
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            Manage per-department onboarding document packets and checklist templates.
          </p>
        </a>
      </div>

      <h2>Payroll split</h2>
      <p style={{ color: '#777', maxWidth: 560 }}>
        Controls how fixed salary splits into basic+DA / HRA / other allowances for statutory/payroll purposes.
        Changing this only affects salary entries recorded from now on — past salary history keeps whatever split
        was calculated at the time.
      </p>
      <form onSubmit={savePayroll} style={sectionStyle}>
        <label>Basic + DA floor (₹/month) — Kerala minimum wage floor for your staff's grade, revised quarterly with DA
          <input type="number" value={floor} onChange={e => setFloor(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <label>Of the amount above the floor, % assigned to HRA (rest goes to other allowances)
          <input type="number" value={hraPct} onChange={e => setHraPct(e.target.value)} min="0" max="100" style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" style={{ padding: 10 }}>Save</button>
        {payrollSaved && <p style={{ color: 'green' }}>Saved.</p>}
      </form>

      <h2>Deposit amounts</h2>
      <p style={{ color: '#777', maxWidth: 560 }}>
        Fixed amounts. Changing these only affects deposits recorded for employees added or updated after the change —
        existing employees keep whatever amount was recorded for them at the time.
      </p>
      <form onSubmit={saveDeposits} style={sectionStyle}>
        <label>Uniform deposit (₹)
          <input type="number" value={uniformDeposit} onChange={e => setUniformDeposit(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <label>Accommodation deposit (₹) — only applies to employees using company accommodation
          <input type="number" value={accommodationDeposit} onChange={e => setAccommodationDeposit(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" style={{ padding: 10 }}>Save</button>
        {depositsSaved && <p style={{ color: 'green' }}>Saved.</p>}
      </form>

      <h2>Company policies (shown on the onboarding acknowledgment document)</h2>
      <form onSubmit={savePolicies} style={sectionStyle}>
        <label>Company guidelines
          <textarea value={guidelines} onChange={e => setGuidelines(e.target.value)} rows={4} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <label>Leave policy
          <textarea value={leavePolicy} onChange={e => setLeavePolicy(e.target.value)} rows={4} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <label>Notice period terms
          <textarea value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} rows={4} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" style={{ padding: 10 }}>Save</button>
        {policiesSaved && <p style={{ color: 'green' }}>Saved.</p>}
      </form>
    </div>
  );
}

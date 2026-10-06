'use client';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function SettingsPage() {
  const supabase = createClient();

  const [floor, setFloor] = useState('');
  const [hraPct, setHraPct] = useState('');
  const [payrollSaved, setPayrollSaved] = useState(false);

  const [guidelines, setGuidelines] = useState('');
  const [leavePolicy, setLeavePolicy] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [policiesSaved, setPoliciesSaved] = useState(false);

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

  return (
    <div className="pb-20 max-w-4xl mx-auto px-4 sm:px-6">
      <div className="mb-8 pt-2">
        <h1 className="font-serif text-2.5xl sm:text-3xl font-bold text-ink">Company Settings</h1>
        <p className="text-sm text-ink-muted mt-2">Manage access, payroll, deposits, and policies.</p>
      </div>
      {error && <p className="text-bad text-sm mb-4">{error}</p>}

      {/* Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {[
          { href: '/settings/users', label: 'Users & Access', color: 'accent' },
          { href: '/settings/departments-designations', label: 'Departments & Roles', color: 'good' },
          { href: '/settings/variable-pay', label: 'Variable Pay Schemes', color: 'accent' },
          { href: '/settings/document-templates', label: 'Doc Templates', color: 'ink' },
          { href: '/employees/deleted', label: 'Deleted Employees', color: 'bad' },
        ].map(item => (
          <a key={item.label} href={item.href} className={`panel flex items-center justify-between p-4 border-${item.color}/10 hover:border-${item.color}/30 transform transition-transform hover:-translate-y-0.5`}>
            <span className={`font-semibold text-sm text-${item.color}`}>{item.label}</span>
            <span className={`text-${item.color}`}>→</span>
          </a>
        ))}
      </div>

      <div className="space-y-8">
        <section className="panel panel-body">
          <h2 className="panel-title mb-4">Payroll formula</h2>
          <form onSubmit={savePayroll} className="space-y-4">
            <label className="field-label">Basic + DA floor (₹/month)
              <input type="number" value={floor} onChange={e => setFloor(e.target.value)} className="field" />
            </label>
            <label className="field-label">HRA % of surplus
              <input type="number" value={hraPct} onChange={e => setHraPct(e.target.value)} min="0" max="100" className="field" />
            </label>
            <button type="submit" className="btn-primary text-xs">Save</button>
            {payrollSaved && <span className="text-good text-xs ml-3">✓ Saved</span>}
          </form>
        </section>

        <section className="panel panel-body">
          <h2 className="panel-title mb-4">Company policies</h2>
          <form onSubmit={savePolicies} className="space-y-4">
            <label className="field-label">Guidelines
              <textarea value={guidelines} onChange={e => setGuidelines(e.target.value)} rows={4} className="field" />
            </label>
            <label className="field-label">Leave policy
              <textarea value={leavePolicy} onChange={e => setLeavePolicy(e.target.value)} rows={4} className="field" />
            </label>
            <label className="field-label">Notice period terms
              <textarea value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} rows={4} className="field" />
            </label>
            <button type="submit" className="btn-primary text-xs">Save</button>
            {policiesSaved && <span className="text-good text-xs ml-3">✓ Saved</span>}
          </form>
        </section>
      </div>
    </div>
  );
}

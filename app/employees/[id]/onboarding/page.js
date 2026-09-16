'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabaseClient';

export default function OnboardingDocument() {
  const { id } = useParams();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);
  const [policies, setPolicies] = useState(null);
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    supabase.from('employees').select('*').eq('employee_id', id).single().then(({ data }) => setEmployee(data));
    supabase.from('company_policies').select('*').eq('id', 1).single().then(({ data }) => setPolicies(data));
    supabase.from('employee_deposits').select('*').eq('employee_id', id).then(({ data }) => setDeposits(data || []));
  }, [id]);

  if (!employee || !policies) return <p>Loading…</p>;

  const totalDeposit = deposits.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <a href={`/employees/${id}`}>← Back to employee</a>{' '}
        <button onClick={() => window.print()} style={{ marginLeft: 16, padding: '6px 14px' }}>Print</button>
      </div>

      <div style={{ background: 'white', padding: 32, maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>Onboarding Acknowledgment</h1>
        <p><strong>Name:</strong> {employee.name}<br />
          <strong>Designation:</strong> {employee.designation}<br />
          <strong>Department:</strong> {employee.department}<br />
          <strong>Date of joining:</strong> {employee.date_of_joining}</p>

        <h3>Company Guidelines</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{policies.guidelines_text}</p>

        <h3>Leave Policy</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{policies.leave_policy_text}</p>

        <h3>Notice Period</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{policies.notice_period_text}</p>

        <h3>Deposits</h3>
        {deposits.length === 0 ? (
          <p>No deposits applicable to this role.</p>
        ) : (
          <>
            <ul>
              {deposits.map(d => (
                <li key={d.id}>{d.deposit_type === 'uniform' ? 'Uniform deposit' : 'Accommodation deposit'}: ₹{d.amount}</li>
              ))}
            </ul>
            <p><strong>Total deposit: ₹{totalDeposit}</strong></p>
          </>
        )}

        <p style={{ marginTop: 40 }}>
          I acknowledge that I have read and understood the company guidelines, leave policy, notice period terms,
          and the deposit amount(s) listed above, and agree to abide by them.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60 }}>
          <div>
            _____________________<br />
            Employee signature &amp; date
          </div>
          <div>
            _____________________<br />
            HR signature &amp; date
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

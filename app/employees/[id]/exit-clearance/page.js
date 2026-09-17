'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabaseClient';

export default function ExitClearance() {
  const { id } = useParams();
  const supabase = createClient();
  const [employee, setEmployee] = useState(null);
  const [exitRecord, setExitRecord] = useState(null);
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    supabase.from('employees').select('*').eq('employee_id', id).single().then(({ data }) => setEmployee(data));
    supabase.from('exit_records').select('*').eq('employee_id', id).maybeSingle().then(({ data }) => setExitRecord(data));
    supabase.from('employee_deposits').select('*').eq('employee_id', id).then(({ data }) => setDeposits(data || []));
  }, [id]);

  if (!employee) return <p>Loading…</p>;

  const assets = exitRecord?.assets_issued || [];
  const totalDeposit = deposits.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <a href={`/employees/${id}`}>← Back to employee</a>{' '}
        <button onClick={() => window.print()} style={{ marginLeft: 16, padding: '6px 14px' }}>Print</button>
      </div>

      <div style={{ background: 'white', padding: 32, maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>Exit Clearance Form</h1>
        <p><strong>Name:</strong> {employee.name}<br />
          <strong>Designation:</strong> {employee.designation}<br />
          <strong>Department:</strong> {employee.department}<br />
          <strong>Date of leaving:</strong> {employee.date_of_leaving || '—'}<br />
          <strong>Exit reason:</strong> {employee.exit_reason ? employee.exit_reason.replace('_', ' ') : '—'}</p>

        <h3>Assets issued and return status</h3>
        {assets.length === 0 ? (
          <p>No assets recorded for this employee.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Item</th><th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Returned?</th></tr>
            </thead>
            <tbody>
              {assets.map((a, i) => (
                <tr key={i}><td>{a.name}</td><td>{a.returned ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <p style={{ marginTop: 16 }}>Uniform returned: <strong>{exitRecord?.uniform_returned ? 'Yes' : 'No'}</strong></p>

        <h3>Deposits held</h3>
        {deposits.length === 0 ? (
          <p>No deposits on record.</p>
        ) : (
          <>
            <ul>
              {deposits.map(d => (
                <li key={d.id}>{d.deposit_type === 'uniform' ? 'Uniform deposit' : 'Accommodation deposit'}: ₹{d.amount}</li>
              ))}
            </ul>
            <p><strong>Total held: ₹{totalDeposit}</strong> — to be refunded pending clearance, less any deductions for unreturned items.</p>
          </>
        )}

        <p style={{ marginTop: 20, fontSize: 18 }}>
          Overall clearance status: <strong>{exitRecord?.clearance_status === 'cleared' ? 'CLEARED' : 'PENDING'}</strong>
        </p>

        <p style={{ marginTop: 40 }}>
          I confirm that all assets and uniform issued to me during my employment have been returned as indicated above.
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

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function MyPayslipsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [runsMap, setRunsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmployeePayslips();
  }, []);

  async function loadEmployeePayslips() {
    setLoading(true);
    setError('');

    // 1. Get current logged-in user
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      router.push('/login');
      return;
    }
    setCurrentUser(user);

    const userEmail = (user.email || '').toLowerCase().trim();

    // 2. Find employee record matching this email
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .ilike('email', userEmail)
      .maybeSingle();

    if (empErr) {
      setError(`Error fetching profile: ${empErr.message}`);
      setLoading(false);
      return;
    }

    if (!emp) {
      setError(`No employee profile found for "${userEmail}". Please ensure your email matches the one on file with HR.`);
      setLoading(false);
      return;
    }

    setEmployee(emp);

    // 3. Fetch payroll runs
    const { data: runs } = await supabase
      .from('payroll_runs')
      .select('id, period, period_start, period_end, generated_on');

    const rMap = {};
    (runs || []).forEach(r => { rMap[r.id] = r; });
    setRunsMap(rMap);

    // 4. Fetch payslips / line items for this employee
    const { data: items, error: itemsErr } = await supabase
      .from('payroll_line_items')
      .select('*')
      .eq('employee_id', emp.employee_id)
      .not('payslip_number', 'is', null)
      .order('id', { ascending: false });

    if (itemsErr) {
      setError(`Error fetching payslips: ${itemsErr.message}`);
    } else {
      setPayslips(items || []);
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <div>Loading your payslips...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '12px 8px 40px 8px' }}>
      {/* Mobile-Friendly Profile Card Header */}
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '20px 18px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e5e7eb',
          marginBottom: 20
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Employee Self-Service
            </span>
            <h1 style={{ margin: '4px 0 2px 0', fontSize: 20, fontWeight: 800, color: '#111827' }}>
              {employee?.name || 'My Portal'}
            </h1>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              ID: <strong>{employee?.employee_id}</strong> • {employee?.department || '—'}
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
              {employee?.designation || '—'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db',
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Log out
          </button>
        </div>

        {/* Quick Links for Employees */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href="/tasks"
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 8,
              padding: '10px 14px',
              textDecoration: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#065f46'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>My Tasks & Shift Checklists</span>
            </div>
            <span style={{ fontSize: 13, color: '#059669', fontWeight: 'bold' }}>Open Hub →</span>
          </a>

          <a
            href="/documents"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '10px 14px',
              textDecoration: 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#1f2937'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📚</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Training Materials, SOPs & Policies</span>
            </div>
            <span style={{ fontSize: 13, color: '#6b7280' }}>→</span>
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 14, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Payslips List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
            My Salary Payslips ({payslips.length})
          </h2>
        </div>

        {payslips.length === 0 ? (
          <div style={{ background: 'white', padding: 32, textAlign: 'center', borderRadius: 10, border: '1px solid #e5e7eb', color: '#6b7280' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: '#374151' }}>No payslips issued yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Your monthly salary payslips will appear here once processed by HR.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payslips.map(item => {
              const run = runsMap[item.payroll_run_id];
              const periodText = run?.period_start && run?.period_end
                ? `${run.period_start} to ${run.period_end}`
                : run?.period || '—';
              const isPaid = item.payment_status === 'processed';
              const netAmount = Number(item.total_pay || item.net_pay || 0);

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}
                >
                  {/* Card Header: Payslip ID & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 13, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: 4 }}>
                        📄 {item.payslip_number}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
                        background: isPaid ? '#dcfce7' : '#fef3c7',
                        color: isPaid ? '#15803d' : '#b45309'
                      }}
                    >
                      {isPaid ? '✓ Paid' : '⏳ Processing'}
                    </span>
                  </div>

                  {/* Card Body: Period & Amount */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                        Pay Period
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginTop: 2 }}>
                        {periodText}
                      </div>
                      {isPaid && item.salary_paid_date && (
                        <div style={{ fontSize: 12, color: '#15803d', marginTop: 3 }}>
                          Paid on {item.salary_paid_date}
                          {item.bank_reference_number && <span> • Ref: {item.bank_reference_number}</span>}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                        Net Salary
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                        ₹{netAmount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Card Action Button (Mobile-friendly large touch target) */}
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                    <a
                      href={`/payslips/${encodeURIComponent(item.payslip_number || item.id)}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'center',
                        background: '#059669',
                        color: 'white',
                        padding: '10px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    >
                      📄 View & Download Payslip PDF
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

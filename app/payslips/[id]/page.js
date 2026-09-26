'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';
import { numberToWordsINR } from '../../../lib/numberToWords';
import { computeSalarySplit } from '../../../lib/salarySplit';

export default function PayslipViewPage() {
  const params = useParams();
  const rawId = params?.id;
  const supabase = createClient();

  const [lineItem, setLineItem] = useState(null);
  const [payrollRun, setPayrollRun] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [sensitiveInfo, setSensitiveInfo] = useState(null);
  const [payrollSettings, setPayrollSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (rawId) loadPayslipData(rawId);
  }, [rawId]);

  async function loadPayslipData(identifier) {
    setLoading(true);
    setError('');

    const decoded = decodeURIComponent(identifier).trim();

    // Query line item by payslip_number or id
    let query = supabase.from('payroll_line_items').select('*');
    if (/^\d+$/.test(decoded)) {
      query = query.or(`id.eq.${decoded},payslip_number.eq.${decoded}`);
    } else {
      query = query.eq('payslip_number', decoded);
    }

    const { data: items, error: itemErr } = await query.limit(1);

    if (itemErr || !items || items.length === 0) {
      setError(`Payslip "${decoded}" not found.`);
      setLoading(false);
      return;
    }

    const item = items[0];
    setLineItem(item);

    // Fetch parent run
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('id', item.payroll_run_id)
      .single();
    setPayrollRun(run);

    // Fetch employee
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('employee_id', item.employee_id)
      .single();
    setEmployee(emp);

    // Fetch sensitive info (bank details)
    const { data: sens } = await supabase
      .from('employee_sensitive_info')
      .select('*')
      .eq('employee_id', item.employee_id)
      .maybeSingle();
    setSensitiveInfo(sens);

    // Fetch payroll settings for basic/hra split display
    const { data: settings } = await supabase
      .from('payroll_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    setPayrollSettings(settings);

    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
        Loading payslip details...
      </div>
    );
  }

  if (error || !lineItem) {
    return (
      <div style={{ padding: 30, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 16, borderRadius: 8 }}>
          {error || 'Payslip not found.'}
        </div>
        <div style={{ marginTop: 16 }}>
          <a href="/payslips" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            ← Back to All Payslips
          </a>
        </div>
      </div>
    );
  }

  const fixedPaid = Number(lineItem.fixed_pay || 0);
  const split = computeSalarySplit(fixedPaid, payrollSettings);

  const varAmt = Number(lineItem.variable_pay || 0);
  const bonusAmt = Number(lineItem.bonus_pay || 0);
  const deductionAmt = Number(lineItem.deduction_amount || 0);
  const priorPayoutsAmt = Number(lineItem.prior_payouts_deduction || 0);
  const netPay = Number(lineItem.total_pay || lineItem.net_pay || 0);

  // Clean Bank Narration
  const cleanPayslip = String(lineItem.payslip_number || '').replace(/[^a-zA-Z0-9]/g, '');
  const firstName = String(employee?.name || '').trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '');
  const bankNarration = `${cleanPayslip}${firstName}`;

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Top Action Bar (Hidden in Print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, maxWidth: 800, margin: '0 auto 20px auto' }}>
        <a href="/payslips" style={{ color: '#4b5563', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
          ← Back to Payslips Directory
        </a>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => window.print()}
            style={{
              background: '#059669', color: 'white', border: 'none', padding: '8px 20px',
              borderRadius: 6, fontWeight: 'bold', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            🖨️ Print / Download PDF
          </button>
        </div>
      </div>

      {/* Printable A4 Payslip Container */}
      <div
        className="payslip-container"
        style={{
          width: '100%',
          maxWidth: 800,
          margin: '0 auto',
          background: 'white',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: '32px 36px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#1f2937',
          boxSizing: 'border-box'
        }}
      >
        {/* Company Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #1f2937', paddingBottom: 16, marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Atelier Next Plate Innovations LLP
          </h1>
          <p style={{ margin: '0 0 3px 0', fontSize: 12, color: '#4b5563' }}>
            Koluthara Towers, Pattom, Trivandrum 695004, Kerala
          </p>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#374151' }}>
            GSTIN: 32ACLFA9308E1ZL
          </p>
          <div style={{ marginTop: 10, display: 'inline-block', background: '#f3f4f6', padding: '3px 14px', borderRadius: 12, fontSize: 12, fontWeight: 'bold', color: '#1f2937' }}>
            SALARY PAYSLIP
          </div>
        </div>

        {/* Payslip & Pay Period Meta Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
          <div>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 11 }}>Payslip Number</span>
            <strong style={{ fontSize: 14, color: '#0369a1' }}>{lineItem.payslip_number || '—'}</strong>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 11 }}>Pay Period</span>
            <strong style={{ fontSize: 13, color: '#111827' }}>
              {payrollRun?.period_start && payrollRun?.period_end
                ? `${payrollRun.period_start} to ${payrollRun.period_end}`
                : payrollRun?.period || '—'}
            </strong>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 11 }}>Payment Status & Date</span>
            <strong style={{ fontSize: 12, color: lineItem.payment_status === 'processed' ? '#15803d' : '#b45309' }}>
              {lineItem.payment_status === 'processed'
                ? `PAID on ${lineItem.salary_paid_date || '—'}`
                : 'PENDING PROCESSING'}
            </strong>
          </div>
          <div>
            <span style={{ color: '#6b7280', display: 'block', fontSize: 11 }}>Bank Reference / Narration</span>
            <strong style={{ fontSize: 12, color: '#111827' }}>
              {lineItem.bank_reference_number ? `Ref: ${lineItem.bank_reference_number}` : '—'}
              <span style={{ color: '#6b7280', fontWeight: 'normal', marginLeft: 6 }}>({bankNarration})</span>
            </strong>
          </div>
        </div>

        {/* Employee & Bank Information Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, border: '1px solid #e5e7eb', borderRadius: 6, padding: 14, marginBottom: 20, fontSize: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
              Employee Details
            </div>
            <div style={{ lineHeight: '1.7' }}>
              <div><span style={{ color: '#6b7280' }}>Employee Name:</span> <strong style={{ color: '#111827' }}>{employee?.name || lineItem.employee_id}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Employee ID (Petpooja):</span> <strong style={{ color: '#111827' }}>{lineItem.employee_id}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Designation:</span> <strong>{employee?.designation || '—'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Department:</span> <strong>{employee?.department || '—'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Date of Joining:</span> <strong>{employee?.date_of_joining || '—'}</strong></div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
              Bank & Payment Account
            </div>
            <div style={{ lineHeight: '1.7' }}>
              <div><span style={{ color: '#6b7280' }}>Account Holder:</span> <strong>{sensitiveInfo?.bank_account_holder_name || employee?.name || '—'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Bank Name:</span> <strong>{sensitiveInfo?.bank_name || '—'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Account Number:</span> <strong style={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>{sensitiveInfo?.bank_account_number || '—'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>IFSC Code:</span> <strong style={{ fontFamily: 'monospace' }}>{sensitiveInfo?.bank_ifsc_code || '—'}</strong></div>
            </div>
          </div>
        </div>

        {/* Attendance & Hours Summary */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>DAYS PRESENT</div>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>{lineItem.days_present ?? '—'}</strong>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>DAYS ABSENT</div>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>{lineItem.days_absent ?? '—'}</strong>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>PAID OFFS</div>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>{lineItem.offs_paid ?? '—'}</strong>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>TOTAL PAID DAYS</div>
              <strong style={{ fontSize: 13, color: '#0369a1' }}>{lineItem.total_paid_days ?? '—'}</strong>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>EXPECTED HRS</div>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>{lineItem.expected_hours ?? '—'} h</strong>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b' }}>ACTUAL WORKED</div>
              <strong style={{ fontSize: 13, color: '#1e293b' }}>{lineItem.actual_hours ?? '—'} h</strong>
            </div>
          </div>
        </div>

        {/* Earnings & Deductions Tables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
          {/* Earnings */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: '#f3f4f6', padding: '8px 12px', fontWeight: 'bold', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>
              EARNINGS (₹)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '7px 12px', color: '#4b5563' }}>Basic + DA</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>₹{split.basic_da.toLocaleString('en-IN')}</td>
                </tr>
                {split.hra > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>HRA (House Rent Allowance)</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>₹{split.hra.toLocaleString('en-IN')}</td>
                  </tr>
                )}
                {split.other_allowances > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>Other Allowances</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>₹{split.other_allowances.toLocaleString('en-IN')}</td>
                  </tr>
                )}
                {varAmt > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>
                      Variable Pay ({lineItem.variable_percent || 0}% Target)
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>₹{varAmt.toLocaleString('en-IN')}</td>
                  </tr>
                )}
                {bonusAmt > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>
                      Bonus {lineItem.bonus_description ? `(${lineItem.bonus_description})` : ''}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>₹{bonusAmt.toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb', fontWeight: 'bold' }}>
                  <td style={{ padding: '8px 12px' }}>Total Gross Earnings</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#111827' }}>
                    ₹{(fixedPaid + varAmt + bonusAmt).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ background: '#f3f4f6', padding: '8px 12px', fontWeight: 'bold', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>
              DEDUCTIONS (₹)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {deductionAmt > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>
                      {lineItem.deduction_reason ? `Deduction (${lineItem.deduction_reason})` : 'Other Deductions'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                      -₹{deductionAmt.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}
                {priorPayoutsAmt > 0 && (
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', color: '#4b5563' }}>
                      Less: Prior Mid-term Payouts
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                      -₹{priorPayoutsAmt.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}
                {deductionAmt === 0 && priorPayoutsAmt === 0 && (
                  <tr>
                    <td colSpan="2" style={{ padding: '16px 12px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                      No deductions for this pay period.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb', fontWeight: 'bold' }}>
                  <td style={{ padding: '8px 12px' }}>Total Deductions</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#dc2626' }}>
                    -₹{(deductionAmt + priorPayoutsAmt).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Net Salary Payable Highlight Box */}
        <div style={{ background: '#ecfdf5', border: '2px solid #059669', borderRadius: 8, padding: '16px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#047857', textTransform: 'uppercase' }}>
              NET SALARY PAID
            </div>
            <div style={{ fontSize: 13, color: '#065f46', marginTop: 3, fontWeight: 500 }}>
              {numberToWordsINR(netPay)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#047857' }}>
              ₹{netPay.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Signatures & Computer generated note */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 24, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280' }}>
          <div>
            <div>This is a computer-generated payslip and does not require a physical signature.</div>
            <div style={{ marginTop: 4 }}>For questions regarding this statement, contact HR / Management.</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 140, borderTop: '1px solid #9ca3af', paddingTop: 4, fontWeight: 600, color: '#374151' }}>
              Authorized Signatory
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Atelier Next Plate Innovations LLP</div>
          </div>
        </div>
      </div>

      {/* Print-specific Stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          nav, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
          .payslip-container {
            border: none !important;
            box-shadow: none !important;
            padding: 20px !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}

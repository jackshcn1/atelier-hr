'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

function getBankNarration(payslipNumber, employeeName) {
  const cleanPayslip = String(payslipNumber || '').replace(/[^a-zA-Z0-9]/g, '');
  const firstName = String(employeeName || '').trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '');
  return `${cleanPayslip}${firstName}`;
}

function SalaryProcessingContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const runIdParam = searchParams.get('runId');

  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(runIdParam || '');
  const [lineItems, setLineItems] = useState([]);
  const [employeesMap, setEmployeesMap] = useState({});
  const [sensitiveInfoMap, setSensitiveInfoMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'processed'
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Payment form state per item: { [lineItemId]: { paidDate: '', bankRef: '' } }
  const [formState, setFormState] = useState({});

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadRunDetails(selectedRunId);
    }
  }, [selectedRunId]);

  async function loadRuns() {
    setLoading(true);
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('id, period, period_start, period_end, generated_on, total_amount, status')
      .order('id', { ascending: false });

    if (!error && data && data.length > 0) {
      setRuns(data);
      if (!selectedRunId) {
        setSelectedRunId(data[0].id.toString());
      }
    }
    setLoading(false);
  }

  async function loadRunDetails(runId) {
    setLoading(true);
    setError('');

    // 1. Fetch line items for this run
    const { data: items, error: itemsError } = await supabase
      .from('payroll_line_items')
      .select('*')
      .eq('payroll_run_id', runId)
      .order('id', { ascending: true });

    if (itemsError) {
      setError(`Failed to load line items: ${itemsError.message}`);
      setLoading(false);
      return;
    }

    setLineItems(items || []);

    // Initialise form states with today's date or saved values
    const today = new Date().toISOString().slice(0, 10);
    const initialForms = {};
    (items || []).forEach(item => {
      initialForms[item.id] = {
        paidDate: item.salary_paid_date || today,
        bankRef: item.bank_reference_number || ''
      };
    });
    setFormState(initialForms);

    // 2. Fetch employee details for matching
    const empIds = (items || []).map(i => i.employee_id);
    if (empIds.length > 0) {
      const { data: empData } = await supabase
        .from('employees')
        .select('employee_id, name, designation, department, phone')
        .in('employee_id', empIds);

      const eMap = {};
      (empData || []).forEach(e => { eMap[e.employee_id] = e; });
      setEmployeesMap(eMap);

      // 3. Fetch sensitive info (bank details)
      const { data: sensitiveData } = await supabase
        .from('employee_sensitive_info')
        .select('employee_id, bank_account_holder_name, bank_name, bank_account_number, bank_ifsc_code')
        .in('employee_id', empIds);

      const sMap = {};
      (sensitiveData || []).forEach(s => { sMap[s.employee_id] = s; });
      setSensitiveInfoMap(sMap);
    }

    setLoading(false);
  }

  function handleFormChange(itemId, field, value) {
    setFormState(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  }

  function copyToClipboard(text, fieldKey) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleSavePayment(item) {
    const form = formState[item.id] || {};
    const paidDate = form.paidDate || new Date().toISOString().slice(0, 10);
    const bankRef = (form.bankRef || '').trim();

    if (!bankRef) {
      setError(`Please enter a bank payment reference (UTR / transaction ID) for ${employeesMap[item.employee_id]?.name || item.employee_id}`);
      return;
    }

    setProcessingId(item.id);
    setError('');
    setMessage('');

    const user = (await supabase.auth.getUser()).data.user?.email || 'admin';

    const updates = {
      payment_status: 'processed',
      salary_paid_date: paidDate,
      bank_reference_number: bankRef,
      processed_at: new Date().toISOString(),
      processed_by: user
    };

    const { error: updateError } = await supabase
      .from('payroll_line_items')
      .update(updates)
      .eq('id', item.id);

    if (updateError) {
      setError(`Failed to save payment: ${updateError.message}`);
      setProcessingId(null);
      return;
    }

    // Audit log
    await supabase.from('audit_log').insert([{
      actor: user,
      action: item.payment_status === 'processed' ? 'updated salary payment reference' : 'processed salary payment',
      record_affected: `${item.employee_id} (${employeesMap[item.employee_id]?.name || 'Employee'}) - Payslip ${item.payslip_number}, Ref: ${bankRef}`
    }]);

    // Update local state
    setLineItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
    setProcessingId(null);
    setMessage(`✓ Payment recorded for ${employeesMap[item.employee_id]?.name || item.employee_id} (${item.payslip_number})`);
    setTimeout(() => setMessage(''), 4000);

    // Auto-collapse after successful processing
    setExpandedId(null);
  }

  async function handleRevertToPending(item) {
    setProcessingId(item.id);
    setError('');

    const user = (await supabase.auth.getUser()).data.user?.email || 'admin';
    const updates = {
      payment_status: 'pending',
      salary_paid_date: null,
      bank_reference_number: null,
      processed_at: null,
      processed_by: null
    };

    const { error: updateError } = await supabase
      .from('payroll_line_items')
      .update(updates)
      .eq('id', item.id);

    if (updateError) {
      setError(`Failed to revert status: ${updateError.message}`);
      setProcessingId(null);
      return;
    }

    await supabase.from('audit_log').insert([{
      actor: user,
      action: 'reverted salary payment to pending',
      record_affected: `${item.employee_id} (${employeesMap[item.employee_id]?.name || 'Employee'}) - Payslip ${item.payslip_number}`
    }]);

    setLineItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
    setProcessingId(null);
  }

  // Filtered line items
  const filteredItems = useMemo(() => {
    return lineItems.filter(item => {
      const emp = employeesMap[item.employee_id] || {};
      const statusMatch =
        filter === 'all' ? true :
        filter === 'pending' ? item.payment_status !== 'processed' :
        item.payment_status === 'processed';

      if (!statusMatch) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (item.employee_id || '').toLowerCase().includes(q) ||
        (item.payslip_number || '').toLowerCase().includes(q) ||
        (item.bank_reference_number || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q)
      );
    });
  }, [lineItems, employeesMap, filter, searchQuery]);

  // Statistics
  const totalCount = lineItems.length;
  const processedCount = lineItems.filter(i => i.payment_status === 'processed').length;
  const pendingCount = totalCount - processedCount;

  const totalAmount = lineItems.reduce((sum, i) => sum + Number(i.total_pay || i.net_pay || 0), 0);
  const processedAmount = lineItems.filter(i => i.payment_status === 'processed').reduce((sum, i) => sum + Number(i.total_pay || i.net_pay || 0), 0);
  const pendingAmount = totalAmount - processedAmount;

  const currentRun = runs.find(r => r.id.toString() === selectedRunId);

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Salary Processing (Bank Payouts)</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Review employee bank details, copy pre-generated payslip numbers for bank narration, and record payment transaction references.
          </p>
        </div>
        <a
          href="/payroll"
          style={{
            background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
            padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13
          }}
        >
          ← Back to Payroll Calculation
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

      {/* Run Selection & Overview Bar */}
      <div style={{ background: 'white', padding: 18, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937' }}>Select Payroll Run:</label>
            <select
              value={selectedRunId}
              onChange={e => setSelectedRunId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, fontWeight: 500 }}
            >
              {runs.map(r => (
                <option key={r.id} value={r.id.toString()}>
                  Run #{r.id} ({r.period_start && r.period_end ? `${r.period_start} to ${r.period_end}` : r.period}) — ₹{(r.total_amount || 0).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>

          {currentRun && (
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Period: <strong>{currentRun.period_start && currentRun.period_end ? `${currentRun.period_start} to ${currentRun.period_end}` : currentRun.period}</strong>
            </div>
          )}
        </div>

        {/* Progress KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>TOTAL PAYOUT</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginTop: 2 }}>
              ₹{totalAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{totalCount} Employees</div>
          </div>

          <div style={{ background: '#ecfdf5', padding: 12, borderRadius: 6, border: '1px solid #a7f3d0' }}>
            <div style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>PROCESSED (PAID)</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#065f46', marginTop: 2 }}>
              ₹{processedAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>{processedCount} of {totalCount} completed</div>
          </div>

          <div style={{ background: '#fffbeb', padding: 12, borderRadius: 6, border: '1px solid #fde68a' }}>
            <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>PENDING PROCESSING</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#92400e', marginTop: 2 }}>
              ₹{pendingAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>{pendingCount} remaining</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: filter === 'all' ? '#1f2937' : 'white', color: filter === 'all' ? 'white' : '#374151'
            }}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter('pending')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid #fde68a', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: filter === 'pending' ? '#f59e0b' : '#fffbeb', color: filter === 'pending' ? 'white' : '#92400e'
            }}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('processed')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid #a7f3d0', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: filter === 'processed' ? '#059669' : '#ecfdf5', color: filter === 'processed' ? 'white' : '#065f46'
            }}
          >
            Processed ({processedCount})
          </button>
        </div>

        <input
          type="text"
          placeholder="🔍 Search name, ID, payslip #, bank ref..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', width: 260, fontSize: 13 }}
        />
      </div>

      {/* Employee Accordion List */}
      {loading ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          Loading salary processing data...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          No employees found matching the filter or search query.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredItems.map(item => {
            const emp = employeesMap[item.employee_id] || {};
            const sensitive = sensitiveInfoMap[item.employee_id] || {};
            const isProcessed = item.payment_status === 'processed';
            const isExpanded = expandedId === item.id;
            const form = formState[item.id] || { paidDate: '', bankRef: '' };
            const dueAmount = Number(item.total_pay || item.net_pay || 0);

            return (
              <div
                key={item.id}
                style={{
                  background: isProcessed ? '#f0fdf4' : 'white',
                  border: isProcessed ? '1px solid #86efac' : '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Accordion Row Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isProcessed ? '#f0fdf4' : isExpanded ? '#f9fafb' : 'white'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                    {/* Status Pill */}
                    <span
                      style={{
                        padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 'bold',
                        background: isProcessed ? '#dcfce7' : '#fef3c7',
                        color: isProcessed ? '#15803d' : '#b45309',
                        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                      }}
                    >
                      {isProcessed ? '✓ PROCESSED' : '⏳ PENDING'}
                    </span>

                    {/* Employee Info */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', fontSize: 15, color: '#111827' }}>
                        {emp.name || item.employee_id}
                        <span style={{ fontWeight: 'normal', fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                          (ID: {item.employee_id}) • {emp.department || '—'} • {emp.designation || '—'}
                        </span>
                      </div>
                      {isProcessed && item.bank_reference_number && (
                        <div style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
                          Paid on {item.salary_paid_date || '—'} • Bank Ref: <strong>{item.bank_reference_number}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side of row header: Payslip ID, Amount, Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 12 }}>
                    {/* Payslip & Bank Narration badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <div
                        onClick={e => {
                          e.stopPropagation();
                          const narration = getBankNarration(item.payslip_number, emp.name);
                          copyToClipboard(narration, `header-ps-${item.id}`);
                        }}
                        title="Click to copy Bank Narration (e.g. ATLEMP00023Manai)"
                        style={{
                          background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: 4,
                          fontSize: 12, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        📄 {getBankNarration(item.payslip_number, emp.name)}
                        <span style={{ fontSize: 10 }}>{copiedField === `header-ps-${item.id}` ? '✓ Copied' : '📋'}</span>
                      </div>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Payslip: {item.payslip_number}</span>
                    </div>

                    {/* Amount Due */}
                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#059669' }}>
                        ₹{dueAmount.toLocaleString('en-IN')}
                      </div>
                    </div>

                    {/* Chevron Icon */}
                    <span style={{ fontSize: 14, color: '#9ca3af', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Expanded Accordion Body */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid #f3f4f6' }}>

                    {/* Section 1: Bank Account Details (Highlighted for Transfer) */}
                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: 14, marginTop: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🏦 Bank Transfer Details</span>
                        <span style={{ fontSize: 11, fontWeight: 'normal', color: '#64748b' }}>Use these details in your banking portal</span>
                      </div>

                      {sensitive.bank_account_number ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                          <div>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Account Holder</span>
                            <strong style={{ fontSize: 13, color: '#1e293b' }}>
                              {sensitive.bank_account_holder_name || emp.name || '—'}
                            </strong>
                          </div>

                          <div>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Bank Name</span>
                            <strong style={{ fontSize: 13, color: '#1e293b' }}>
                              {sensitive.bank_name || '—'}
                            </strong>
                          </div>

                          <div>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Account Number</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ fontSize: 14, color: '#1e293b', letterSpacing: 0.5 }}>
                                {sensitive.bank_account_number}
                              </strong>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(sensitive.bank_account_number, `acc-${item.id}`)}
                                style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
                              >
                                {copiedField === `acc-${item.id}` ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <div>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>IFSC Code</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ fontSize: 14, color: '#1e293b' }}>
                                {sensitive.bank_ifsc_code}
                              </strong>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(sensitive.bank_ifsc_code, `ifsc-${item.id}`)}
                                style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
                              >
                                {copiedField === `ifsc-${item.id}` ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4 }}>
                          ⚠️ Bank details not added in employee profile. Please check sensitive info table or employee record.
                        </div>
                      )}

                      {/* Payslip Number for Narration */}
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 13, color: '#334155' }}>
                          Bank Narration / Remarks (no special characters):
                          <strong style={{ color: '#0369a1', marginLeft: 6, fontSize: 14, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                            {getBankNarration(item.payslip_number, emp.name)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const narration = getBankNarration(item.payslip_number, emp.name);
                            copyToClipboard(narration, `narration-${item.id}`);
                          }}
                          style={{
                            background: '#0284c7', color: 'white', border: 'none', borderRadius: 4,
                            padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                          }}
                        >
                          {copiedField === `narration-${item.id}` ? '✓ Copied Narration' : '📋 Copy Narration for Bank'}
                        </button>
                      </div>
                    </div>

                    {/* Section 2: Salary Calculation Details */}
                    <div style={{ marginTop: 14, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 }}>
                        📊 Calculation Summary
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: 12 }}>
                        <div><span style={{ color: '#64748b' }}>Present:</span> <strong>{item.days_present ?? '—'} days</strong></div>
                        <div><span style={{ color: '#64748b' }}>Absent:</span> <strong>{item.days_absent ?? '—'} days</strong></div>
                        <div><span style={{ color: '#64748b' }}>Paid Offs:</span> <strong>{item.offs_paid ?? '—'} days</strong></div>
                        <div><span style={{ color: '#64748b' }}>Total Paid Days:</span> <strong>{item.total_paid_days ?? '—'}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Expected Hours:</span> <strong>{item.expected_hours ?? '—'} hrs</strong></div>
                        <div><span style={{ color: '#64748b' }}>Actual Hours:</span> <strong>{item.actual_hours ?? '—'} hrs</strong></div>
                        <div><span style={{ color: '#64748b' }}>Per-Day Salary:</span> <strong>₹{item.per_day_salary ?? '—'}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Fixed Pay:</span> <strong>₹{(item.fixed_pay || 0).toLocaleString('en-IN')}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Variable ({item.variable_percent || 0}%):</span> <strong>₹{(item.variable_pay || 0).toLocaleString('en-IN')}</strong></div>
                        <div><span style={{ color: '#64748b' }}>Bonus:</span> <strong>₹{(item.bonus_pay || 0).toLocaleString('en-IN')}</strong> {item.bonus_description && `(${item.bonus_description})`}</div>
                        <div><span style={{ color: '#64748b' }}>Deductions:</span> <strong style={{ color: '#dc2626' }}>-₹{(item.deduction_amount || 0).toLocaleString('en-IN')}</strong> {item.deduction_reason && `(${item.deduction_reason})`}</div>
                        {item.prior_payouts_deduction > 0 && (
                          <div style={{ gridColumn: 'span 2', color: '#b91c1c', background: '#fef2f2', padding: '4px 8px', borderRadius: 4 }}>
                            <span>Less Mid-term Payouts:</span> <strong>-₹{Number(item.prior_payouts_deduction).toLocaleString('en-IN')}</strong>
                            {item.prior_payouts_notes && <span style={{ fontSize: 11, marginLeft: 6, color: '#7f1d1d' }}>({item.prior_payouts_notes})</span>}
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: '#059669', gridColumn: 'span 2' }}>
                          <span>Final Net Payout Due:</span> <strong style={{ fontSize: 16 }}>₹{dueAmount.toLocaleString('en-IN')}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Payment Confirmation Form */}
                    <div style={{ marginTop: 14, background: isProcessed ? '#ecfdf5' : '#fffbeb', border: isProcessed ? '1px solid #a7f3d0' : '1px solid #fde68a', borderRadius: 6, padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: isProcessed ? '#065f46' : '#92400e', marginBottom: 10 }}>
                        {isProcessed ? '✓ Payment Details Recorded' : '💳 Record Bank Payment'}
                      </div>

                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                          Salary Paid Date
                          <input
                            type="date"
                            value={form.paidDate}
                            onChange={e => handleFormChange(item.id, 'paidDate', e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                          />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151', flex: 1, minWidth: 220 }}>
                          Bank Payment Reference / UTR Number *
                          <input
                            type="text"
                            placeholder="e.g. UTR1234567890 or IMPS transaction ref"
                            value={form.bankRef}
                            onChange={e => handleFormChange(item.id, 'bankRef', e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => handleSavePayment(item)}
                          disabled={processingId === item.id}
                          style={{
                            background: isProcessed ? '#0284c7' : '#059669',
                            color: 'white',
                            border: 'none',
                            padding: '8px 20px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: 13,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {processingId === item.id ? 'Saving...' : isProcessed ? 'Update Reference' : '✓ Mark as Processed'}
                        </button>

                        {isProcessed && (
                          <>
                            <a
                              href={`/payslips/${encodeURIComponent(item.payslip_number || item.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: '#10b981',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: 6,
                                textDecoration: 'none',
                                fontWeight: 'bold',
                                fontSize: 13,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              📄 View Payslip
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRevertToPending(item)}
                              disabled={processingId === item.id}
                              style={{
                                background: 'transparent',
                                color: '#6b7280',
                                border: '1px solid #d1d5db',
                                padding: '8px 12px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12
                              }}
                            >
                              Reset to Pending
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SalaryProcessingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading salary processing...</div>}>
      <SalaryProcessingContent />
    </Suspense>
  );
}


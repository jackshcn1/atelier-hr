'use client';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { createClient } from '../../lib/supabaseClient';

function PayslipsListContent() {
  const supabase = createClient();

  const [lineItems, setLineItems] = useState([]);
  const [employeesMap, setEmployeesMap] = useState({});
  const [runsMap, setRunsMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    loadAllPayslips();
  }, []);

  async function loadAllPayslips() {
    setLoading(true);
    setError('');

    // 1. Fetch all payroll runs
    const { data: runs, error: runsErr } = await supabase
      .from('payroll_runs')
      .select('*')
      .order('id', { ascending: false });

    if (runsErr) {
      setError(runsErr.message);
      setLoading(false);
      return;
    }

    const rMap = {};
    (runs || []).forEach(r => { rMap[r.id] = r; });
    setRunsMap(rMap);

    // 2. Fetch all line items with payslip numbers
    const { data: items, error: itemsErr } = await supabase
      .from('payroll_line_items')
      .select('*')
      .not('payslip_number', 'is', null)
      .order('id', { ascending: false });

    if (itemsErr) {
      setError(itemsErr.message);
      setLoading(false);
      return;
    }

    setLineItems(items || []);

    // 3. Fetch employee details
    const { data: emps } = await supabase
      .from('employees')
      .select('employee_id, name, designation, department');

    const eMap = {};
    (emps || []).forEach(e => { eMap[e.employee_id] = e; });
    setEmployeesMap(eMap);

    setLoading(false);
  }

  function copyToClipboard(text, fieldKey) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  }

  // Filter options for dropdown
  const uniquePeriods = useMemo(() => {
    const periods = new Set();
    Object.values(runsMap).forEach(r => {
      const label = r.period_start && r.period_end ? `${r.period_start} to ${r.period_end}` : r.period;
      if (label) periods.add(label);
    });
    return Array.from(periods);
  }, [runsMap]);

  // Filtered line items
  const filteredItems = useMemo(() => {
    return lineItems.filter(item => {
      const emp = employeesMap[item.employee_id] || {};
      const run = runsMap[item.payroll_run_id] || {};
      const runPeriodLabel = run.period_start && run.period_end ? `${run.period_start} to ${run.period_end}` : run.period;

      // Status filter
      if (selectedStatus === 'paid' && item.payment_status !== 'processed') return false;
      if (selectedStatus === 'pending' && item.payment_status === 'processed') return false;

      // Period filter
      if (selectedPeriod !== 'all' && runPeriodLabel !== selectedPeriod) return false;

      // Search query filter (matches Employee Name, ID, Payslip ID, Bank Reference, Department)
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (item.employee_id || '').toLowerCase().includes(q) ||
        (item.payslip_number || '').toLowerCase().includes(q) ||
        (item.bank_reference_number || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q) ||
        (emp.designation || '').toLowerCase().includes(q)
      );
    });
  }, [lineItems, employeesMap, runsMap, searchQuery, selectedPeriod, selectedStatus]);

  const totalAmount = filteredItems.reduce((sum, i) => sum + Number(i.total_pay || i.net_pay || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0' }}>Payslips Directory</h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Search, view, and print official A4 salary payslips for all historical employee payouts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a
            href="/payroll/processing"
            style={{
              background: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: 6,
              textDecoration: 'none', fontWeight: 'bold', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            💳 Salary Processing →
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div style={{ background: 'white', padding: 18, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Search Bar */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <input
            type="text"
            placeholder="🔍 Search Employee name, Payslip ID, Bank UTR ref..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
          >
            <option value="all">All Pay Periods</option>
            {uniquePeriods.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid Only</option>
            <option value="pending">Pending Payment Only</option>
          </select>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13, color: '#4b5563' }}>
        <div>
          Showing <strong>{filteredItems.length}</strong> payslips
          {searchQuery && <span> matching "<em>{searchQuery}</em>"</span>}
        </div>
        <div style={{ fontWeight: 'bold', color: '#111827' }}>
          Total Value: <span style={{ color: '#059669' }}>₹{totalAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Payslips Table */}
      {loading ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          Loading payslips directory...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ background: 'white', padding: 40, textAlign: 'center', borderRadius: 8, color: '#6b7280' }}>
          No payslips found matching your search.
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '10px 14px' }}>Payslip ID</th>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Pay Period</th>
                <th>Payment Date</th>
                <th>Net Paid</th>
                <th>Bank Ref (UTR)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', paddingRight: 14 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const emp = employeesMap[item.employee_id] || {};
                const run = runsMap[item.payroll_run_id] || {};
                const isPaid = item.payment_status === 'processed';
                const periodText = run.period_start && run.period_end ? `${run.period_start} to ${run.period_end}` : run.period;
                const netPay = Number(item.total_pay || item.net_pay || 0);

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#0369a1' }}>{item.payslip_number}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.payslip_number, `list-ps-${item.id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
                          title="Copy Payslip ID"
                        >
                          {copiedField === `list-ps-${item.id}` ? '✓' : '📋'}
                        </button>
                      </div>
                    </td>

                    <td style={{ fontWeight: 600, color: '#111827' }}>
                      {emp.name || item.employee_id}
                      <span style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 'normal' }}>
                        ID: {item.employee_id}
                      </span>
                    </td>

                    <td style={{ color: '#4b5563' }}>{emp.department || '—'}</td>
                    <td style={{ color: '#4b5563', fontSize: 12 }}>{periodText || '—'}</td>
                    <td style={{ color: '#4b5563' }}>{item.salary_paid_date || '—'}</td>

                    <td style={{ fontWeight: 'bold', color: '#059669' }}>
                      ₹{netPay.toLocaleString('en-IN')}
                    </td>

                    <td style={{ fontFamily: 'monospace', color: '#374151', fontSize: 12 }}>
                      {item.bank_reference_number ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{item.bank_reference_number}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.bank_reference_number, `list-ref-${item.id}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
                            title="Copy Bank Ref"
                          >
                            {copiedField === `list-ref-${item.id}` ? '✓' : '📋'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
                          background: isPaid ? '#dcfce7' : '#fef3c7',
                          color: isPaid ? '#15803d' : '#b45309'
                        }}
                      >
                        {isPaid ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right', paddingRight: 14 }}>
                      <a
                        href={`/payslips/${encodeURIComponent(item.payslip_number || item.id)}`}
                        style={{
                          background: '#059669', color: 'white', padding: '5px 12px', borderRadius: 4,
                          textDecoration: 'none', fontSize: 12, fontWeight: 600, display: 'inline-block'
                        }}
                      >
                        📄 View / Print PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PayslipsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading payslips directory...</div>}>
      <PayslipsListContent />
    </Suspense>
  );
}

// Exit clearance — works out what is still outstanding for someone leaving.
//
// Deliberately a pure function so the same logic can run in the clearance form,
// on the employee record, and in the pending-exits list without three copies
// drifting apart.

// A deposit row only counts as held if money was actually recorded against it.
// Early data had every deposit at zero, which is a placeholder rather than a
// real amount, and must not be treated as money to refund.
function depositsHeld(deposits) {
  return (deposits || [])
    .map(d => Number(d.amount) || 0)
    .filter(a => a > 0);
}

export function summariseExitClearance({ exitRecord, employee, deposits }) {
  const rec = exitRecord || {};
  const emp = employee || {};

  const assetsIssued = Array.isArray(rec.assets_issued) ? rec.assets_issued : [];
  const assetsOutstanding = assetsIssued.filter(a => !a.returned);

  const held = depositsHeld(deposits);
  const depositsTotal = held.reduce((s, a) => s + a, 0);

  const openItems = [];

  if (!rec.last_working_day && !rec.exit_date && !emp.date_of_leaving) {
    openItems.push({ key: 'last_working_day', label: 'Last working day not recorded', severity: 'high' });
  }

  if (assetsOutstanding.length > 0) {
    openItems.push({
      key: 'assets',
      label: `${assetsOutstanding.length} asset(s) not returned: ${assetsOutstanding.map(a => a.name).join(', ')}`,
      severity: 'high',
    });
  }

  if (rec.uniform_returned === null || rec.uniform_returned === undefined) {
    openItems.push({ key: 'uniform', label: 'Uniform return not confirmed', severity: 'medium' });
  } else if (rec.uniform_returned === false) {
    openItems.push({ key: 'uniform', label: 'Uniform not returned', severity: 'high' });
  }

  if (depositsTotal > 0 && !rec.deposit_settled) {
    openItems.push({ key: 'deposits', label: `Deposits of ₹${depositsTotal.toLocaleString('en-IN')} not settled`, severity: 'high' });
  }

  if (rec.exit_type === null || rec.exit_type === undefined) {
    openItems.push({ key: 'exit_type', label: 'Exit type not recorded', severity: 'low' });
  }

  if (!rec.notice_served) {
    openItems.push({ key: 'notice', label: 'Notice period not marked as served', severity: 'low' });
  }

  if (rec.gratuity_payable > 0 && !rec.gratuity_paid) {
    openItems.push({ key: 'gratuity', label: `Gratuity of ₹${Number(rec.gratuity_payable).toLocaleString('en-IN')} unpaid`, severity: 'high' });
  }

  const pendingDues = Array.isArray(rec.pending_dues) ? rec.pending_dues : [];
  if (pendingDues.length > 0) {
    openItems.push({ key: 'dues', label: `${pendingDues.length} pending due(s): ${pendingDues.map(d => d.label || d.type).join(', ')}`, severity: 'medium' });
  }

  const isCleared = rec.clearance_status === 'cleared';

  return {
    openItems,
    openCount: openItems.length,
    isCleared,
    // Uniform and assets are the legally meaningful returns; deposits are a
    // separate financial settlement that does not have to be marked 'cleared'.
    hasBlockingIssues: openItems.some(i => i.severity === 'high'),
    assetsIssued: assetsIssued.length,
    assetsOutstanding: assetsOutstanding.length,
    depositsTotal,
    settledOn: rec.settled_on || null,
    settledBy: rec.settled_by || null,
  };
}
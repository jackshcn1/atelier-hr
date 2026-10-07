// Exit clearance — works out what is still outstanding for someone leaving.
//
// Deliberately a pure function so the same logic can run in the clearance form,
// on the employee record, and in the pending-exits list without three copies
// drifting apart.

// A deposit row only counts as held if money was actually recorded against it.
function depositsHeld(deposits) {
  return (deposits || [])
    .map(d => Number(d.amount) || 0)
    .filter(a => a > 0);
}

/**
 * Calculates statutory gratuity based on the Payment of Gratuity Act, 1972 (India).
 * Formula: (15 * Last_Drawn_Basic_DA * Completed_Years) / 26
 * Eligibility: 5 continuous years of service (or 4 years 240 days).
 */
export function calculateGratuity({ dateOfJoining, lastWorkingDay, monthlyBasicDA }) {
  if (!dateOfJoining) {
    return {
      eligible: false,
      amount: 0,
      completedYears: 0,
      totalMonths: 0,
      reason: 'Date of joining not recorded on file.'
    };
  }

  const start = new Date(dateOfJoining);
  const end = lastWorkingDay ? new Date(lastWorkingDay) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return {
      eligible: false,
      amount: 0,
      completedYears: 0,
      totalMonths: 0,
      reason: 'Invalid joining or leaving dates.'
    };
  }

  // Calculate difference in months
  let totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;

  // Gratuity act 5-year eligibility threshold
  if (years < 5) {
    return {
      eligible: false,
      amount: 0,
      completedYears: years,
      totalMonths,
      tenureText: `${years} yr${years === 1 ? '' : 's'} ${remainingMonths} mo${remainingMonths === 1 ? '' : 's'}`,
      reason: `Not eligible (< 5 years continuous service: ${years}y ${remainingMonths}m).`
    };
  }

  // Under statutory rules, >= 6 months in the final year is rounded up to 1 full year
  const roundedYears = remainingMonths >= 6 ? years + 1 : years;
  const basicDA = Number(monthlyBasicDA) || 0;
  const amount = Math.round((15 * basicDA * roundedYears) / 26);

  return {
    eligible: true,
    amount,
    completedYears: roundedYears,
    totalMonths,
    tenureText: `${years} yr${years === 1 ? '' : 's'} ${remainingMonths} mo${remainingMonths === 1 ? '' : 's'}`,
    reason: `Statutory calculation: ₹${basicDA.toLocaleString('en-IN')} (Basic+DA) × 15/26 × ${roundedYears} completed years.`
  };
}

export function summariseExitClearance({ exitRecord, employee, deposits, assets }) {
  const rec = exitRecord || {};
  const emp = employee || {};

  const assetList = Array.isArray(assets) && assets.length > 0
    ? assets
    : (Array.isArray(rec.assets_issued) ? rec.assets_issued : []);

  const assetsOutstanding = assetList.filter(a => !a.returned);

  const held = depositsHeld(deposits);
  const depositsTotal = held.reduce((s, a) => s + a, 0);

  const openItems = [];

  if (!rec.last_working_day && !rec.exit_date && !emp.date_of_leaving) {
    openItems.push({ key: 'last_working_day', label: 'Last working day not recorded', severity: 'high' });
  }

  if (assetsOutstanding.length > 0) {
    openItems.push({
      key: 'assets',
      label: `${assetsOutstanding.length} asset(s) not returned: ${assetsOutstanding.map(a => `${a.name}${a.asset_number ? ` (#${a.asset_number})` : ''}`).join(', ')}`,
      severity: 'high',
    });
  }

  if (rec.uniform_returned === null || rec.uniform_returned === undefined) {
    openItems.push({ key: 'uniform', label: 'Uniform return not confirmed', severity: 'medium' });
  } else if (rec.uniform_returned === false) {
    openItems.push({ key: 'uniform', label: 'Uniform not returned', severity: 'high' });
  }

  if (depositsTotal > 0 && !rec.deposit_settled) {
    openItems.push({ key: 'deposits', label: `Deposits of ₹${depositsTotal.toLocaleString('en-IN')} not settled/refunded`, severity: 'high' });
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
    hasBlockingIssues: openItems.some(i => i.severity === 'high'),
    assetsIssued: assetList.length,
    assetsOutstanding: assetsOutstanding.length,
    depositsTotal,
    settledOn: rec.settled_on || null,
    settledBy: rec.settled_by || null,
  };
}

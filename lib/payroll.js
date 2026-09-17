// Parses Petpooja's "10h 38m" style strings into decimal hours. "-" or
// blank means 0 (absent / no punch).
export function parseHours(str) {
  if (!str || typeof str !== 'string' || str.trim() === '-' || str.trim() === '') return 0;
  const match = str.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
  const h = match?.[1] ? parseInt(match[1], 10) : 0;
  const m = match?.[2] ? parseInt(match[2], 10) : 0;
  return h + m / 60;
}

// Number of calendar days between two ISO date strings, inclusive.
export function daysInPeriod(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

// Weekly offs earned out of the standard 4/month allowance, given how many
// absent days exceed that allowance. 5-11 extra = lose 1, 12-18 = lose 2,
// etc. (confirmed rule: threshold steps of ~7, starting at 5).
export function offsEarned(daysAbsent, standardOffs = 4) {
  const extra = Math.max(0, daysAbsent - standardOffs);
  if (extra < 5) return standardOffs;
  const lost = Math.min(standardOffs, Math.floor((extra - 5) / 7) + 1);
  return standardOffs - lost;
}

// Full per-employee payroll calculation for one pay period.
// attendanceRows: array of { status, hours } for this employee within the period.
export function calculateEmployeePayroll({
  fixedSalary, standardHoursPerDay, totalDaysInPeriod, attendanceRows, standardOffs = 4
}) {
  const daysPresent = attendanceRows.filter(r => r.status === 'FD' || r.status === 'HD').length;
  const daysAbsent = totalDaysInPeriod - daysPresent;
  const totalHours = attendanceRows.reduce((sum, r) => sum + (r.hours || 0), 0);

  const effectiveDaysFromHours = Math.min(
    Math.round(totalHours / standardHoursPerDay),
    daysPresent
  );
  const offsPaid = offsEarned(daysAbsent, standardOffs);
  const totalPaidDays = Math.min(effectiveDaysFromHours + offsPaid, totalDaysInPeriod);

  const perDaySalary = fixedSalary / totalDaysInPeriod;
  const fixedPay = Math.round(perDaySalary * totalPaidDays);

  return {
    daysPresent, daysAbsent, totalHours: Math.round(totalHours * 100) / 100,
    effectiveDaysFromHours, offsPaid, totalPaidDays, perDaySalary: Math.round(perDaySalary * 100) / 100,
    fixedPay
  };
}

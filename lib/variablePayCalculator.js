// Variable Pay Incentive Calculation Engine
// Implements Binary/Milestone and Proportional/Capped attainment formulas

export function calculateMetricAttainment(metric, actualValue) {
  const actual = Number(actualValue) || 0;
  const target = Number(metric.target) || 1;
  const weight = Number(metric.weight) || 0;
  const floor = metric.floor !== null && metric.floor !== undefined ? Number(metric.floor) : null;
  const ceiling = metric.ceiling !== null && metric.ceiling !== undefined ? Number(metric.ceiling) : null;
  const direction = metric.direction || 'higher';
  const type = metric.type || 'binary';

  let attainmentRate = 0; // 1.0 = 100%

  if (type === 'binary') {
    if (direction === 'higher') {
      attainmentRate = actual >= target ? 1.0 : 0.0;
    } else {
      // Lower is better (e.g. wastage <= 5000, prep time <= 20 mins)
      attainmentRate = actual <= target ? 1.0 : 0.0;
    }
  } else if (type === 'proportional') {
    if (direction === 'higher') {
      // If below qualification floor threshold -> 0%
      if (floor !== null && actual < floor) {
        attainmentRate = 0.0;
      } else {
        // Capped at ceiling if actual exceeds ceiling
        const effectiveActual = ceiling !== null ? Math.min(actual, ceiling) : actual;
        attainmentRate = target > 0 ? (effectiveActual / target) : 0;
      }
    } else {
      // Lower is better proportional
      if (floor !== null && actual > floor) {
        attainmentRate = 0.0;
      } else {
        const effectiveActual = ceiling !== null ? Math.max(actual, ceiling) : actual;
        attainmentRate = effectiveActual > 0 ? (target / effectiveActual) : 1.0;
      }
    }
  }

  // Round attainment rate to 4 decimal places for clean calculations
  attainmentRate = Math.round(attainmentRate * 10000) / 10000;
  const earnedWeightFraction = Math.round(attainmentRate * weight * 10000) / 10000;

  return {
    metric_id: metric.id,
    metric_name: metric.name,
    weight,
    type,
    direction,
    target,
    floor,
    ceiling,
    unit: metric.unit || '',
    actual,
    attainmentRate, // e.g. 0.923 (92.3%)
    attainmentPct: Math.round(attainmentRate * 1000) / 10, // e.g. 92.3%
    earnedWeightFraction, // e.g. 0.3692
    earnedWeightPct: Math.round(earnedWeightFraction * 1000) / 10 // e.g. 36.9%
  };
}

export function computeEmployeeVariablePayout(scheme, actualInputs, variablePoolAmount) {
  const pool = Number(variablePoolAmount) || 0;
  // A missing pool must not blank out the scorecards: attainment percentages
  // are independent of the rupee pool, which only scales the payout. Bailing
  // out here would hide every metric from an employee whose variable salary
  // has not been set yet.
  if (!scheme || !Array.isArray(scheme.metrics) || scheme.metrics.length === 0) {
    return {
      totalEarnedFraction: 0,
      totalEarnedPct: 0,
      totalPayoutAmount: 0,
      breakdown: []
    };
  }

  const breakdown = scheme.metrics.map(metric => {
    const inputVal = actualInputs?.[metric.id] ?? actualInputs?.[metric.name] ?? 0;
    const result = calculateMetricAttainment(metric, inputVal);
    const payoutAmount = Math.round(result.earnedWeightFraction * pool);
    return {
      ...result,
      payoutAmount
    };
  });

  const totalPayoutAmount = breakdown.reduce((sum, item) => sum + item.payoutAmount, 0);

  // Weighted attainment: the sum of each metric's weight multiplied by how far
  // it got. This is the honest overall figure and, unlike payout/pool, still
  // reads correctly when the rupee pool has not been set. With a pool set the
  // two agree exactly, because payout = weight x attainment x pool.
  const totalEarnedFraction = breakdown.reduce((sum, item) => sum + (item.earnedWeightFraction || 0), 0);
  const totalEarnedPct = Math.round(totalEarnedFraction * 1000) / 10;

  return {
    totalEarnedFraction,
    totalEarnedPct, // e.g. 92.3%
    totalPayoutAmount, // e.g. ₹923
    breakdown
  };
}

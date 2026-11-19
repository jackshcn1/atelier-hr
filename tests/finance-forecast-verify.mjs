/**
 * tests/finance-forecast-verify.mjs
 *
 * The forecast is the one figure on the finance pages that is not read from
 * the books — it is worked out from them. So it has to be pinned down:
 *
 *   - the festival factors have to be the ones that were agreed, and they
 *     have to be applied to the right months;
 *   - the level has to be the middle of the complete months, with the
 *     festival effect taken out first — and a month that is still running
 *     must not be in it;
 *   - the variable cost ratio has to follow the last few months, because
 *     the share of the revenue that the purchases run at has been falling;
 *   - a month in progress has to be measured against what it should have
 *     reached by now, and the costs that are booked for the whole month must
 *     not be put on that footing;
 *   - the forecast for December has to be the Christmas month, even though
 *     there is no December on record to learn it from.
 *
 * Run: npm run test:forecast
 */

import assert from 'node:assert/strict';
import {
  seasonFactor,
  seasonNote,
  median,
  completeMonths,
  revenueLevel,
  variableRatio,
  forecastMonth,
  forecastSeries,
  buildForecast,
  PETTY_FORECAST_MONTHLY,
  RATIO_WINDOW,
} from '../lib/financeForecast.js';
import { elapsedFraction } from '../lib/financePeriod.js';

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exitCode = 1;
  }
}

const near = (actual, expected, tolerance, what) => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${what}: got ${actual}, expected about ${expected}`);
  }
};

// The months on record, as they are in the books: March to October 2026
// complete, and November running to the 19th.
const HISTORY = {
  standingMonthly: 306687,
  salaryMonthly: 225000,
  months: [
    { key: '2026-03', complete: true, revenue: { dine_in: 718678, pick_up: 516654, delivery: 337923, total: 1573255 }, variable: 1287200, fixed: 306687, petty: 0, salaryForecast: 144500, salaryActual: 0, salaryAmount: 144500 },
    { key: '2026-04', complete: true, revenue: { dine_in: 757259, pick_up: 320171, delivery: 544152, total: 1621582 }, variable: 948379, fixed: 304917, petty: 0, salaryForecast: 159500, salaryActual: 0, salaryAmount: 159500 },
    { key: '2026-05', complete: true, revenue: { dine_in: 842249, pick_up: 385847, delivery: 624962, total: 1853057 }, variable: 1167910, fixed: 306451, petty: 0, salaryForecast: 207500, salaryActual: 0, salaryAmount: 207500 },
    { key: '2026-06', complete: true, revenue: { dine_in: 700243, pick_up: 344409, delivery: 590326, total: 1634979 }, variable: 1079279, fixed: 306687, petty: 0, salaryForecast: 193500, salaryActual: 0, salaryAmount: 193500 },
    { key: '2026-07', complete: true, revenue: { dine_in: 837175, pick_up: 405377, delivery: 633835, total: 1876387 }, variable: 1014830, fixed: 306687, petty: 0, salaryForecast: 207500, salaryActual: 0, salaryAmount: 207500 },
    { key: '2026-08', complete: true, revenue: { dine_in: 854585, pick_up: 450706, delivery: 768212, total: 2073504 }, variable: 1055958, fixed: 306687, petty: 0, salaryForecast: 207500, salaryActual: 0, salaryAmount: 207500 },
    { key: '2026-09', complete: true, revenue: { dine_in: 729702, pick_up: 292190, delivery: 656456, total: 1678349 }, variable: 774902, fixed: 321687, petty: 0, salaryForecast: 225000, salaryActual: 196758, salaryAmount: 196758 },
    { key: '2026-10', complete: true, revenue: { dine_in: 743462, pick_up: 321409, delivery: 762246, total: 1827117 }, variable: 824781, fixed: 306687, petty: 0, salaryForecast: 225000, salaryActual: 223066, salaryAmount: 223066 },
    { key: '2026-11', complete: false, revenue: { dine_in: 435082, pick_up: 201759, delivery: 486457, total: 1123298 }, variable: 651400, fixed: 306687, petty: 0, salaryForecast: 225000, salaryActual: 0, salaryAmount: 225000 },
  ],
};

await check('the festival factors are the ones that were agreed', () => {
  const expected = {
    1: 1.02, 2: 0.98, 3: 1.00, 4: 1.02, 5: 1.00, 6: 0.96,
    7: 1.00, 8: 1.10, 9: 0.92, 10: 1.04, 11: 1.05, 12: 1.30,
  };
  for (const [month, factor] of Object.entries(expected)) {
    const key = `2026-${String(month).padStart(2, '0')}`;
    assert.equal(seasonFactor(key), factor, `the factor for ${key}`);
  }
});

await check('the festival months say what is going on', () => {
  assert.match(seasonNote('2026-08'), /Onam/);
  assert.match(seasonNote('2026-11'), /Deepavali/);
  assert.match(seasonNote('2026-12'), /Christmas/);
  assert.equal(seasonNote('2026-07'), '');
});

await check('the middle of a set of numbers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
});

await check('a month that is still running is left out of the level', () => {
  const months = completeMonths(HISTORY, 'all');
  assert.equal(months.length, 8, 'complete months');
  assert.ok(!months.some((month) => month.key === '2026-11'), 'November is running');
});

await check('the level is the middle of the complete months', () => {
  const level = revenueLevel(HISTORY, { window: 'all' });
  near(level.dine_in, 759653, 2, 'dine-in');
  near(level.pick_up, 372303, 2, 'pick-up');
  near(level.delivery, 629398, 2, 'delivery');
  // The total is the parts added up, so the parts always make the whole.
  near(level.total, level.dine_in + level.pick_up + level.delivery, 0.01, 'the total');
});

await check('the variable cost ratio follows the last few months', () => {
  // 50.9%, 46.2%, 45.1% and 54.1% — the last four complete months.
  near(variableRatio(HISTORY, { window: RATIO_WINDOW }), 0.4855, 0.001, 'the ratio');
  // The ratio over every month on record is stale — the share has fallen.
  assert.ok(variableRatio(HISTORY, { window: 'all' }) > 0.55, 'the old ratio is higher');
});

await check('November is forecast with its Deepavali month on top', () => {
  const forecast = forecastMonth(HISTORY, '2026-11');
  near(forecast.factor, 1.05, 0.0001, 'the factor');
  near(forecast.revenue.dine_in, 759653 * 1.05, 2, 'dine-in');
  near(forecast.revenue.total, forecast.revenue.dine_in + forecast.revenue.pick_up + forecast.revenue.delivery, 0.01, 'the total');
});

await check('December is the Christmas month, with no December on record', () => {
  const forecast = forecastMonth(HISTORY, '2026-12');
  near(forecast.factor, 1.30, 0.0001, 'the factor');
  assert.ok(forecast.revenue.total > forecastMonth(HISTORY, '2026-11').revenue.total,
    'December is forecast above November');
  // The costs follow the sales.
  near(forecast.costs.variable, forecast.revenue.total * forecast.ratio, 1, 'the variable costs');
});

await check('fixed costs, petty cash and salary are known amounts', () => {
  const forecast = forecastMonth(HISTORY, '2026-11');
  assert.equal(forecast.costs.fixed, 306687, 'the standing-cost list');
  assert.equal(forecast.costs.petty, PETTY_FORECAST_MONTHLY, 'petty cash');
  assert.equal(forecast.costs.salary, 225000, 'the salary');
  near(
    forecast.costs.total,
    forecast.costs.variable + forecast.costs.fixed + forecast.costs.petty + forecast.costs.salary,
    0.01,
    'the total'
  );
});

await check('a span of months is the months added up', () => {
  const series = forecastSeries(HISTORY, '2026-11', '2026-12');
  assert.equal(series.length, 2);
  const summed = series.reduce((total, month) => total + month.revenue.total, 0);
  near(summed, forecastMonth(HISTORY, '2026-11').revenue.total + forecastMonth(HISTORY, '2026-12').revenue.total, 0.01, 'the sum');
});

await check('a month in progress is measured against what it should have reached by now', () => {
  const built = buildForecast(HISTORY, { from: '2026-11', to: '2026-11', label: 'November 2026' }, {
    elapsed: { '2026-11': elapsedFraction({ isCurrentMonth: true, through: '2026-11-19', end: '2026-11-30' }) },
  });
  const view = built.view;
  // Nineteen days of thirty.
  near(view.expected.revenue.total, view.revenue.total * (19 / 30), 1, 'the revenue expected by now');
  near(view.expected.costs.variable, view.costs.variable * (19 / 30), 1, 'the purchases expected by now');
  // The standing costs and the salary are booked for the whole month, so
  // they are not put on the same footing as the sales.
  assert.equal(view.expected.costs.fixed, view.costs.fixed, 'the fixed costs');
  assert.equal(view.expected.costs.salary, view.costs.salary, 'the salary');
});

await check('a month that is over is measured against the whole month', () => {
  const built = buildForecast(HISTORY, { from: '2026-10', to: '2026-10', label: 'October 2026' }, {
    elapsed: { '2026-10': 1 },
  });
  near(built.view.expected.revenue.total, built.view.revenue.total, 0.01, 'the revenue');
  near(built.view.expected.costs.variable, built.view.costs.variable, 0.01, 'the purchases');
});

await check('the series runs from the first month on record to the month after this one', () => {
  const built = buildForecast(HISTORY, { from: '2026-11', to: '2026-11', label: 'November 2026' });
  const keys = built.series.map((row) => row.key);
  assert.equal(keys[0], '2026-03', 'the first month on record');
  assert.equal(keys[keys.length - 1], '2026-12', 'the month after this one');
  assert.ok(built.basis.months.length === 8, 'the complete months behind it');
});

await check('a month that is still running is projected, not measured as if it were over', () => {
  const built = buildForecast(HISTORY, { from: '2026-11', to: '2026-11', label: 'November 2026' }, {
    elapsed: { '2026-11': 19 / 30 },
  });
  const november = built.series.find((row) => row.key === '2026-11');
  assert.ok(november.projected, 'November is projected');
  near(november.projected.revenue, november.actual.revenue / (19 / 30), 1, 'the projected revenue');
  // The standing costs are booked for the whole month, so they are not
  // carried forward with the sales.
  near(
    november.projected.costs,
    november.projected.variable + november.actual.fixed + november.actual.petty + november.actual.salary,
    0.01,
    'the projected costs'
  );
  // A month that is over is not projected.
  const october = built.series.find((row) => row.key === '2026-10');
  assert.equal(october.projected, null, 'October is not projected');
});

await check('a month that has not happened yet shows the forecast alone', () => {
  const built = buildForecast(HISTORY, { from: '2026-11', to: '2026-11', label: 'November 2026' });
  const december = built.series.find((row) => row.key === '2026-12');
  assert.equal(december.actual.revenue, 0, 'no actual yet');
  assert.ok(december.forecast.revenue > 0, 'a forecast');
  assert.equal(december.projected, null, 'nothing to project');
});

await check('the forecast is never better than a guess dressed up as a fact', () => {
  // The basis has to say what it is built on, so the page can say so.
  const built = buildForecast(HISTORY, { from: '2026-11', to: '2026-11', label: 'November 2026' });
  assert.match(built.basis.label, /March 2026 – October 2026/);
  assert.ok(built.basis.ratio > 0 && built.basis.ratio < 1, 'the ratio');
  assert.ok(built.basis.level.total > 0, 'the level');
});

await check('a month is measured against the day the figures reach to', () => {
  // A month that is over is all of it.
  assert.equal(elapsedFraction({ isCurrentMonth: false, through: '2026-10-31', end: '2026-10-31' }), 1);
  // A month still running is only part way through.
  assert.equal(
    elapsedFraction({ isCurrentMonth: true, through: '2026-11-19', end: '2026-11-30' }),
    19 / 30
  );
  // And never more than the whole month.
  assert.equal(elapsedFraction({ isCurrentMonth: true, through: '2026-11-30', end: '2026-11-30' }), 1);
});

console.log(`\n${passed} check(s) passed`);

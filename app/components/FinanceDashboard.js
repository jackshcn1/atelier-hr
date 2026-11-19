'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, {
  monthFromLocation,
  setMonthInLocation,
  rangeFromLocation,
  setRangeInLocation,
} from './FinanceMonthPicker';
import { monthLabel } from '../../lib/financePeriod.js';

/**
 * How a bar is coloured.
 *
 * The measure is the figure against where the month should have reached by
 * now. More revenue is good and less cost is good, so the two read
 * differently — a revenue bar that is short is a warning, a cost bar that is
 * long is one.
 */
const BAR_COLOR = {
  good: 'bg-emerald-600',
  warn: 'bg-[#c08a3e]',
  bad: 'bg-rose-600',
  none: 'bg-[#c9c2ba]',
};

/** 'up' — more is better. 'down' — less is better. */
function paceStatus(actual, expectation, direction) {
  if (!expectation || expectation <= 0) return 'none';
  const ratio = actual / expectation;
  if (direction === 'up') {
    if (ratio >= 0.9) return 'good';
    if (ratio >= 0.75) return 'warn';
    return 'bad';
  }
  if (ratio <= 1.1) return 'good';
  if (ratio <= 1.25) return 'warn';
  return 'bad';
}

/** How far a figure is from its forecast, in the way that reads well. */
function varianceText(actual, forecast) {
  if (!forecast) return '';
  const diff = actual - forecast;
  const percent = Math.round(Math.abs(diff / forecast) * 100);
  if (percent === 0) return 'on forecast';
  return `${diff > 0 ? '+' : '−'}${percent}%`;
}

function varianceTone(actual, forecast, direction) {
  if (!forecast || !actual) return 'text-[#8b6f4e]';
  const diff = actual - forecast;
  // Within a couple of per cent, it is on forecast — not a miss.
  if (Math.abs(diff / forecast) <= 0.02) return 'text-[#6b635c]';
  const good = direction === 'up' ? diff > 0 : diff < 0;
  return good ? 'text-emerald-700' : 'text-rose-700';
}

/** The day's number as an ordinal — the 19th, the 1st, the 23rd. */
function ordinal(day) {
  const num = Number(day);
  if (!Number.isFinite(num)) return day;
  if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
  return `${num}${['th', 'st', 'nd', 'rd'][num % 10] || 'th'}`;
}

/**
 * The finance dashboard, reported on a plain calendar month.
 *
 * The 20th-19th pay cycle is what salary and variable pay are built on; this
 * is the other question — how is this calendar month going? — so the window
 * is the calendar month, and it starts again on the 1st.
 *
 * It can also report on several months at once — the last three, six or
 * twelve — which is the question an owner asks over time rather than on one
 * month's page. The month stays the last month of the span, so the arrows
 * move the whole window.
 *
 * Every figure on this page is a real number read from the books. The
 * "YTD / Forecasted" lines that used to sit at the bottom of each panel were
 * fixed guesses, and so was the drilldown behind each bar; both are now
 * built from the rows behind the totals.
 */
export default function FinanceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState(null);
  const [month, setMonth] = useState(null);
  const [range, setRange] = useState(1);

  const load = useCallback(async (target, span) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (target) params.set('month', target);
      if (span && span > 1) params.set('range', String(span));
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/finance/dashboard${query}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setMonth(json.data.period.key);
        setRange(json.data.range?.months || 1);
        setMonthInLocation(json.data.period.key);
        setRangeInLocation(json.data.range?.months || 1);
      }
    } catch {
      /* the empty state below says so */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation(), rangeFromLocation());
  }, [load]);

  if (loading) return <div className="text-sm text-[#6b635c] p-6 animate-pulse">Loading telemetry...</div>;
  if (!data) return <div className="text-sm text-red-600 p-6">Load failed.</div>;

  const isProfit = data.net_pl >= 0;
  const formatINR = (num) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  const period = data.period;

  // The month's costs, salary included. Salary is an operating cost, so it
  // belongs in the total the three bars and the salary line are shares of —
  // otherwise the panel would show a salary and then a total without it.
  const totalCosts = data.costs.total + (data.salary?.amount || 0);

  // A span of months rather than one month.
  //
  // The month named is the last month of the span, so the arrows move the
  // whole window. Everything on the page is then the sum of those months,
  // except the money owed by customers, which is where things stand today.
  const months = data.range?.months || 1;
  const isRange = months > 1;
  const spanName = isRange ? `the last ${months} months` : `for ${period.label}`;
  const missingRevenueMonths = (data.revenue.missingMonths || []).map((key) => monthLabel(key));

  // Are all the sales figures behind this view in? If not, the profit is
  // what is on record so far, not a settled figure.
  const revenueIncomplete = data.revenue.synced === false;

  // The forecast: what this month was expected to look like, and how much of
  // the month has happened. A month in progress is measured against what it
  // should have reached by now, not against the whole month.
  const forecast = data.forecast || null;
  const fc = forecast?.view || null;
  const isRunning = !isRange && period.isCurrentMonth && !!fc;

  const DrilldownModal = ({ title, items, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-serif text-lg">{title}</h4>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-[#6b635c]">Nothing recorded for this month.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between p-3 border-b border-[#f2efec]">
                <span className="text-sm text-[#6b635c]">{item.label}</span>
                <span className="text-sm font-semibold">{formatINR(item.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // A bar shows how much of the month's forecast has been met.
  //
  // The bar is the actual against the forecast: if the month was forecast at
  // ₹1,00,000 and ₹40,000 has come in, the bar is 40% full. The marker is
  // where the month should have reached by now, so a bar that is behind can
  // be told apart from a bar that is simply early in the month.
  const ForecastMeter = ({ label, actual, forecast, expected, direction, hint, onClick }) => {
    const fill = forecast > 0 ? Math.min((actual / forecast) * 100, 100) : 0;
    const marker = expected != null && forecast > 0
      ? Math.min((expected / forecast) * 100, 100)
      : null;
    const color = BAR_COLOR[paceStatus(actual, expected ?? forecast, direction)];

    return (
      <button
        className="mb-4 w-full text-left hover:bg-[#faf8f6] p-2 rounded-lg transition"
        onClick={onClick}
        disabled={!onClick}
      >
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[#6b635c]">{label}</span>
          <span className="font-semibold text-[#1e1812]">{formatINR(actual)}</span>
        </div>
        <div className="relative w-full h-3 bg-[#f2efec] rounded-full">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${fill}%` }} />
          {marker !== null && marker < 99 && (
            <div className="absolute top-0 h-full w-[2px] bg-[#1e1812]/70" style={{ left: `${marker}%` }} />
          )}
        </div>
        <div className="text-[11px] text-[#8b6f4e] mt-1">
          {forecast > 0
            ? `${fill.toFixed(0)}% of the ${formatINR(forecast)} forecast`
            : 'No forecast for this month yet'}
        </div>
        {hint && <div className="text-[11px] text-[#6b635c] mt-0.5">{hint}</div>}
      </button>
    );
  };

  // What a month in progress says under the bar: where it should have
  // reached by now, and where it is heading at this rate.
  const paceHint = (actual, forecast, expected, { project = true } = {}) => {
    if (!isRunning || !forecast || !expected) return null;
    const through = period.coveredThrough || period.through;
    const bits = [`${formatINR(expected)} expected by the ${ordinal(through.slice(-2))}`];
    if (project) {
      bits.push(`on this pace the month ends at ${formatINR((actual * forecast) / expected)}`);
    }
    return bits.join(' · ');
  };

  // One figure in the month-by-month table: what it came to, and what it
  // was expected to come to.
  //
  // A month that is still running is shown as it is heading, not as it
  // stands — nineteen days of sales measured against a whole month would
  // read as a disaster. A month that has not happened yet shows the
  // forecast on its own.
  const forecastCell = (row, kind, direction) => {
    const forecast = row.forecast[kind];
    const actual = row.actual[kind];
    const projected = row.projected?.[kind];

    if (projected) {
      return (
        <>
          <div className="font-medium">
            {formatINR(projected)}
            <span className={`text-[11px] ml-1 ${varianceTone(projected, forecast, direction)}`}>
              {varianceText(projected, forecast)}
            </span>
          </div>
          <div className="text-[11px] text-[#6b635c]">on this pace · {formatINR(actual)} so far</div>
          <div className="text-[11px] text-[#8b6f4e]">forecast {formatINR(forecast)}</div>
        </>
      );
    }

    if (!actual) {
      return (
        <>
          <div className="font-medium">{formatINR(forecast)}</div>
          <div className="text-[11px] text-[#8b6f4e]">expected</div>
        </>
      );
    }

    return (
      <>
        <div className="font-medium">
          {formatINR(actual)}
          <span className={`text-[11px] ml-1 ${varianceTone(actual, forecast, direction)}`}>
            {varianceText(actual, forecast)}
          </span>
        </div>
        <div className="text-[11px] text-[#8b6f4e]">forecast {formatINR(forecast)}</div>
      </>
    );
  };

  // The profit is the difference of two figures, so it is compared in rupees
  // rather than in per cent — a percentage of a small forecast reads badly.
  const netCell = (row) => {
    const forecast = row.forecast.revenue - row.forecast.costs;
    const actual = row.actual.revenue - row.actual.costs;
    const projected = row.projected ? row.projected.revenue - row.projected.costs : null;
    const shown = projected ?? actual;
    const diff = shown - forecast;
    const tone = Math.abs(diff) <= Math.abs(forecast) * 0.02
      ? 'text-[#6b635c]'
      : diff > 0
        ? 'text-emerald-700'
        : 'text-rose-700';

    if (!row.actual.revenue && !projected) {
      return (
        <>
          <div className="font-medium text-emerald-700">{formatINR(forecast)}</div>
          <div className="text-[11px] text-[#8b6f4e]">expected</div>
        </>
      );
    }

    return (
      <>
        <div className="font-medium">
          {shown < 0 ? `−${formatINR(Math.abs(shown))}` : formatINR(shown)}
          <span className={`text-[11px] ml-1 ${tone}`}>
            {diff >= 0 ? '+' : '−'}{formatINR(Math.abs(diff))}
          </span>
        </div>
        {projected ? (
          <div className="text-[11px] text-[#6b635c]">on this pace</div>
        ) : null}
        <div className="text-[11px] text-[#8b6f4e]">forecast {formatINR(forecast)}</div>
      </>
    );
  };

  const revenueItems = [
    { label: 'Dine-in', amount: data.revenue.breakdown.dine_in },
    { label: 'Pick Up', amount: data.revenue.breakdown.pick_up },
    { label: 'Delivery', amount: data.revenue.breakdown.delivery },
  ];

  return (
    <div className="space-y-6">
      {drilldown && <DrilldownModal title={drilldown.title} items={drilldown.items} onClose={() => setDrilldown(null)} />}

      {/* The title gives way, not the controls: the picker stays on one line
          at the right, and the title wraps inside its own column. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#6b635c]">
            {period.label}
            <span className="text-[#8b6f4e]">
              {' '}· {isRange ? `last ${months} months` : period.isCurrentMonth ? `month so far (1 – ${period.through})` : 'complete month'}
            </span>
          </p>
          <p className="text-xs text-[#8b6f4e] mt-1">
            {isRange
              ? 'The months added up, ending at the month named. The 20–19 pay cycle still drives salary and variable pay.'
              : 'Calendar month, refreshed on the 1st. The 20–19 pay cycle still drives salary and variable pay.'}
          </p>
        </div>
        <FinanceMonthPicker
          month={period.key}
          currentMonth={period.key}
          available={data.availableMonths || []}
          range={months}
          onRangeChange={(count) => load(month, count)}
          onChange={(key) => load(key, months)}
        />
      </div>

      <div className="flex justify-end">
        {/*
            A profit is only a real profit when the sales figures behind it are
            in. If some months of the span have not been pulled from Petpooja
            yet, the figure below is what is on record — so it says so, and
            says it in amber rather than in a confident red.
        */}
        <div
          className={`px-5 py-3 rounded-xl border flex items-center gap-3 shadow-sm ${
            revenueIncomplete
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : isProfit
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="text-xs font-medium uppercase tracking-wider">
            {revenueIncomplete
              ? `${isProfit ? 'Net Profit' : 'Net Loss'} on record`
              : isProfit
                ? 'Net Profit'
                : 'Net Loss'}{' — '}
            {spanName}
          </span>
          <span className="text-lg font-serif font-bold">
            {isProfit ? '+' : ''}{formatINR(Math.abs(data.net_pl))}
          </span>
        </div>
      </div>

      <p className="text-xs text-[#8b6f4e] -mt-2">
        Net is revenue minus the costs on record. Fixed costs and petty cash are entered by hand, so they
        are only counted once they have been entered.
      </p>

      {/* A month in progress does not have a real profit yet: the revenue
          covers only the days that have happened, while the salary and the
          standing costs are for the whole month. */}
      {period.isCurrentMonth && data.revenue.asOf && (
        <p className="text-xs text-[#8b6f4e] -mt-1">
          {isRange
            ? `The revenue above covers 1 – ${period.coveredThrough || period.through} ${monthLabel(period.key)}, while the salary and the standing costs are for the whole month. The month's profit settles at month end.`
            : `The revenue above covers 1 – ${period.coveredThrough || period.through} ${period.label}, while the salary and the standing costs are for the whole month. The month's profit settles at month end.`}
        </p>
      )}

      {data.revenue.synced === false && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          {isRange
            ? `Revenue has not been pulled from Petpooja for ${missingRevenueMonths.length} of the ${months} months (${missingRevenueMonths.join(', ')}). The nightly sync fills this in — the figures below are the costs that are already on record.`
            : `Revenue for ${period.label} has not been pulled from Petpooja yet. The nightly sync fills this in — the figures below are the costs that are already on record.`}
        </div>
      )}

      {/* What is filled in, and what is still empty.
          A profit shown without its fixed costs is not a real profit, so the
          page says which parts of the month are still waiting. */}
      {data.missing?.length > 0 && (
        <div className="px-4 py-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-amber-900 text-sm font-medium mb-2">
            This month is not fully on the books yet
          </p>
          <ul className="space-y-1">
            {data.missing.map((item) => (
              <li key={item.key} className="text-amber-900 text-sm">
                <span className="font-medium">{item.label}:</span> {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The readiness line — every part of the picture at a glance. */}
      {data.readiness && (
        <div className="flex flex-wrap gap-2">
          {data.readiness.map((item) => (
            <span
              key={item.key}
              className={`pill ${item.state === 'ok' ? 'pill-good' : item.state === 'pending' ? 'pill-quiet' : 'pill-warn'}`}
              title={item.detail}
            >
              {item.label}: {item.detail}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#f2efec]">
              <h3 className="font-serif text-xl font-medium text-[#1e1812]">Revenue Channels</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
                {isRange ? `last ${months} months` : period.label}
              </span>
            </div>
            <ForecastMeter
              label="Dine-in"
              actual={data.revenue.breakdown.dine_in}
              forecast={fc?.revenue.dine_in}
              expected={fc?.expected.revenue.dine_in}
              direction="up"
              hint={paceHint(data.revenue.breakdown.dine_in, fc?.revenue.dine_in, fc?.expected.revenue.dine_in)}
              onClick={() => setDrilldown({ title: `Revenue — ${isRange ? `last ${months} months` : period.label}`, items: revenueItems })}
            />
            <ForecastMeter
              label="Pick Up"
              actual={data.revenue.breakdown.pick_up}
              forecast={fc?.revenue.pick_up}
              expected={fc?.expected.revenue.pick_up}
              direction="up"
              hint={paceHint(data.revenue.breakdown.pick_up, fc?.revenue.pick_up, fc?.expected.revenue.pick_up)}
              onClick={() => setDrilldown({ title: `Revenue — ${isRange ? `last ${months} months` : period.label}`, items: revenueItems })}
            />
            <ForecastMeter
              label="Delivery"
              actual={data.revenue.breakdown.delivery}
              forecast={fc?.revenue.delivery}
              expected={fc?.expected.revenue.delivery}
              direction="up"
              hint={paceHint(data.revenue.breakdown.delivery, fc?.revenue.delivery, fc?.expected.revenue.delivery)}
              onClick={() => setDrilldown({ title: `Revenue — ${isRange ? `last ${months} months` : period.label}`, items: revenueItems })}
            />
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Revenue</span>
              <span className="text-lg font-serif font-bold text-emerald-800">{formatINR(data.revenue.total)}</span>
            </div>
            {fc && (
              <div className="flex justify-between items-center text-xs text-[#6b635c]">
                <span>Forecast {formatINR(fc.revenue.total)}</span>
                <span>
                  {fc.revenue.total > 0
                    ? `${((data.revenue.total / fc.revenue.total) * 100).toFixed(0)}% of forecast`
                    : 'no forecast yet'}
                </span>
              </div>
            )}
            <div className="text-xs text-[#6b635c] text-right">
              {data.revenue.asOf
                ? isRange
                  ? `Petpooja sales over the last ${months} months, to ${data.revenue.asOf}`
                  : `Petpooja sales, ${period.start} → ${data.revenue.asOf}`
                : 'Not synced yet for this month'}
            </div>
            {fc && isRunning && (
              <div className="text-xs text-[#6b635c] text-right">
                {paceHint(data.revenue.total, fc.revenue.total, fc.expected.revenue.total)}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#f2efec]">
              <h3 className="font-serif text-xl font-medium text-[#1e1812]">Cost Breakdown</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
                {isRange ? `last ${months} months` : period.label}
              </span>
            </div>
            <ForecastMeter
              label="Fixed Costs"
              actual={data.costs.fixed}
              forecast={fc?.costs.fixed}
              expected={fc?.expected.costs.fixed}
              direction="down"
              hint={isRunning ? 'Booked for the whole month, not day by day' : null}
              onClick={() => setDrilldown({ title: 'Fixed costs', items: data.costs.breakdown.fixed })}
            />
            <ForecastMeter
              label="Variable Costs"
              actual={data.costs.variable}
              forecast={fc?.costs.variable}
              expected={fc?.expected.costs.variable}
              direction="down"
              hint={paceHint(data.costs.variable, fc?.costs.variable, fc?.expected.costs.variable)}
              onClick={() => setDrilldown({ title: 'Variable costs', items: data.costs.breakdown.variable })}
            />
            <ForecastMeter
              label="Petty Expenses"
              actual={data.costs.petty}
              forecast={fc?.costs.petty}
              expected={fc?.expected.costs.petty}
              direction="down"
              hint={data.costs.petty === 0 ? 'Nothing entered yet this month' : null}
              onClick={() => setDrilldown({ title: 'Petty cash', items: data.costs.breakdown.petty })}
            />

            {/* Staff salary sits with the operating costs, not with the cost
                of making a sale — so the gross margin still means something.
                It is a forecast until the payroll for the cycle is run. */}
            {data.salary && (
              <div className="mb-4 pt-4 border-t border-[#f2efec]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#6b635c]">Staff salary</span>
                  <span className="font-semibold text-[#1e1812]">{formatINR(data.salary.amount)}</span>
                </div>
                <p className="text-[11px] text-[#8b6f4e]">
                  {isRange
                    ? `${data.salary.state === 'actual' ? 'Actual' : 'Forecast'} — the salary of each of the ${months} months, added up`
                    : data.salary.state === 'actual'
                      ? `Actual — the payroll for ${data.salary.cycle.start} → ${data.salary.cycle.end} has been processed`
                      : `Forecast — every active employee a full month, for ${data.salary.cycle.start} → ${data.salary.cycle.end}`}
                </p>
                {fc && fc.costs.salary > 0 && Math.abs(fc.costs.salary - data.salary.amount) >= 1 && (
                  <p className="text-[11px] text-[#6b635c] mt-0.5">
                    The forecast for this cycle was {formatINR(fc.costs.salary)} —{' '}
                    {data.salary.amount > fc.costs.salary ? 'more' : 'less'} than planned.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Costs</span>
              <span className="text-lg font-serif font-bold text-rose-800">{formatINR(totalCosts)}</span>
            </div>
            {fc && (
              <div className="flex justify-between items-center text-xs text-[#6b635c]">
                <span>Forecast {formatINR(fc.costs.total)}</span>
                <span>
                  {fc.costs.total > 0
                    ? `${((totalCosts / fc.costs.total) * 100).toFixed(0)}% of forecast`
                    : 'no forecast yet'}
                </span>
              </div>
            )}
            <div className="text-xs text-[#6b635c] text-right">
              {isRange
                ? `Costs recorded over the last ${months} months`
                : period.isCurrentMonth
                  ? `Costs recorded 1 – ${period.through} ${period.label}`
                  : `Costs recorded in ${period.label}`}
            </div>
            {fc && isRunning && (
              <div className="text-xs text-[#6b635c] text-right">
                Fixed costs and salary are booked for the whole month, so they are already counted in full.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Month by month against the forecast.
          The bars above say how this month is going. This says how every
          month has gone against what it was expected to do — and what the
          months ahead are forecast at. */}
      {forecast?.series?.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#f2efec]">
            <h3 className="font-serif text-xl font-medium text-[#1e1812]">
              Month by month against the forecast
            </h3>
            <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
              Built from {forecast.basis.label}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="table-head">
                  <th className="text-left">Month</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Costs</th>
                  <th className="text-right">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {forecast.series.map((row) => {
                  const current = row.key === period.key;
                  const upcoming = !row.actual.revenue && !row.projected && row.forecast.revenue > 0;
                  return (
                    <tr key={row.key} className={`border-t border-[#f2efec] ${current ? 'bg-[#faf8f6]' : ''}`}>
                      <td className="py-3 pr-3 align-top">
                        <div className="font-medium text-[#1e1812]">{row.label}</div>
                        <div className="text-[11px] text-[#8b6f4e]">
                          {upcoming
                            ? row.note
                              ? `forecast — ${row.note}`
                              : 'forecast'
                            : row.complete
                              ? row.note || 'no festival'
                              : 'still running'}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right align-top whitespace-nowrap">
                        {forecastCell(row, 'revenue', 'up')}
                      </td>
                      <td className="py-3 px-2 text-right align-top whitespace-nowrap">
                        {forecastCell(row, 'costs', 'down')}
                      </td>
                      <td className="py-3 pl-2 text-right align-top whitespace-nowrap">
                        {netCell(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-[#8b6f4e] mt-4">
            Built from {forecast.basis.label}. Revenue is the median of what each channel earned in those
            months, with each month's festival effect taken out — December is forecast at 1.3 times a
            normal month, for Christmas and New Year. Variable costs are forecast at the share of the
            revenue they ran at over the last {forecast.basis.ratioWindow} months. Fixed costs are the
            standing-cost list, petty cash is ₹15,000 a month, and staff salary is what the payroll for
            that cycle was forecast to cost.
          </p>
        </div>
      )}

      {/* Where the business stands.
          Money owed by customers is money that will come in; money owed to
          suppliers is money that will go out. Neither is in the P&L, and
          both change what the month is really worth. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#f2efec]">
            <h3 className="font-serif text-xl font-medium text-[#1e1812]">Money owed by customers</h3>
            <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
              {isRange ? 'as of now' : period.label}
            </span>
          </div>
          {data.receivables?.totals?.customerCount > 0 ? (
            <>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-[#8b6f4e] text-sm">Still to come in</p>
                  <p className="text-3xl font-medium text-[#1e1812]">
                    {formatINR(data.receivables.totals.outstanding)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#8b6f4e] text-sm">Overdue</p>
                  <p className={`text-xl font-medium ${data.receivables.totals.overdue > 0 ? 'text-[#c44c4c]' : 'text-[#6b635c]'}`}>
                    {formatINR(data.receivables.totals.overdue)}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.receivables.customers.slice(0, 6).map((row) => (
                    <tr key={row.customer} className="border-t border-[#f2efec]">
                      <td className="py-2 pr-2 truncate">{row.customer}</td>
                      <td className="py-2 text-right text-[#6b635c] text-xs whitespace-nowrap">{row.invoices} inv</td>
                      <td className="py-2 pl-2 text-right font-medium whitespace-nowrap">{formatINR(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href="/finance/cashflow" className="inline-block mt-4 text-xs text-[#8b6f4e] hover:underline">
                See the full list on Cashflow →
              </Link>
            </>
          ) : (
            <p className="text-sm text-[#6b635c]">
              Nothing pulled yet — the nightly sync fills this in from the Due Payment report.
            </p>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#f2efec]">
            <h3 className="font-serif text-xl font-medium text-[#1e1812]">Money owed to suppliers</h3>
            <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
              {isRange ? `last ${months} months` : period.label}
            </span>
          </div>
          {data.payables?.totals?.billCount > 0 ? (
            <>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-[#8b6f4e] text-sm">Still to go out</p>
                  <p className="text-3xl font-medium text-[#1e1812]">
                    {formatINR(data.payables.totals.unpaid)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#8b6f4e] text-sm">Suppliers</p>
                  <p className="text-xl font-medium text-[#6b635c]">{data.payables.totals.vendorCount}</p>
                </div>
              </div>
              <p className="text-sm text-[#6b635c]">
                {data.payables.totals.billCount} unpaid bill(s) from the {isRange ? `${months} months` : period.label} bills.
              </p>
              {data.payables.totals.credit > 0 && (
                <p className="text-sm text-[#6b635c] mt-1">
                  ₹{data.payables.totals.credit.toLocaleString('en-IN')} of goods were returned in credit notes —
                  a credit to claim, which is why the purchases cost less than the bills.
                </p>
              )}
              <Link href="/finance/bills" className="inline-block mt-4 text-xs text-[#8b6f4e] hover:underline">
                See the full list of bills →
              </Link>
            </>
          ) : (
            <p className="text-sm text-[#6b635c]">
              Nothing unpaid for this month — every bill on record has been settled.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

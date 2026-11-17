'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FinanceMonthPicker, { monthFromLocation, setMonthInLocation } from './FinanceMonthPicker';

/**
 * The finance dashboard, reported on a plain calendar month.
 *
 * The 20th-19th pay cycle is what salary and variable pay are built on; this
 * is the other question — how is this calendar month going? — so the window
 * is the calendar month, and it starts again on the 1st.
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

  const load = useCallback(async (target) => {
    setLoading(true);
    try {
      const query = target ? `?month=${encodeURIComponent(target)}` : '';
      const res = await fetch(`/api/finance/dashboard${query}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setMonth(json.data.period.key);
        setMonthInLocation(json.data.period.key);
      }
    } catch {
      /* the empty state below says so */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthFromLocation());
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

  // A bar shows how much of the month's total it is. There is no invented
  // forecast to compare against any more — the bar is the share of the month.
  const Meter = ({ label, actual, total, onClick }) => {
    const percentage = total > 0 ? Math.min((actual / total) * 100, 100) : 0;
    const color = onClick ? 'bg-[#8b6f4e]' : 'bg-[#6b635c]';
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
        <div className="w-full bg-[#f2efec] h-3 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
        </div>
        <div className="text-[11px] text-[#8b6f4e] mt-1">
          {total > 0 ? `${percentage.toFixed(0)}% of the month's ${formatINR(total)}` : 'No figure for this month yet'}
        </div>
      </button>
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[#6b635c]">
            {period.label}
            <span className="text-[#8b6f4e]">
              {' '}· {period.isCurrentMonth ? `month so far (1 – ${period.through})` : 'complete month'}
            </span>
          </p>
          <p className="text-xs text-[#8b6f4e] mt-1">
            Calendar month, refreshed on the 1st. The 20–19 pay cycle still drives salary and variable pay.
          </p>
        </div>
        <FinanceMonthPicker
          month={period.key}
          currentMonth={period.key}
          available={data.availableMonths || []}
          onChange={(key) => load(key)}
        />
      </div>

      <div className="flex justify-end">
        <div className={`px-5 py-3 rounded-xl border flex items-center gap-3 shadow-sm ${isProfit ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <span className="text-xs font-medium uppercase tracking-wider">{isProfit ? 'Net Profit' : 'Net Loss'} for {period.label}</span>
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
          The revenue above covers 1 – {period.through} {period.label}, while the salary and the standing
          costs are for the whole month. The month's profit settles at month end.
        </p>
      )}

      {data.revenue.synced === false && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          Revenue for {period.label} has not been pulled from Petpooja yet. The nightly sync fills this in —
          the figures below are the costs that are already on record.
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
                {period.label}
              </span>
            </div>
            <Meter
              label="Dine-in"
              actual={data.revenue.breakdown.dine_in}
              total={data.revenue.total}
              onClick={() => setDrilldown({ title: `Revenue — ${period.label}`, items: revenueItems })}
            />
            <Meter
              label="Pick Up"
              actual={data.revenue.breakdown.pick_up}
              total={data.revenue.total}
              onClick={() => setDrilldown({ title: `Revenue — ${period.label}`, items: revenueItems })}
            />
            <Meter
              label="Delivery"
              actual={data.revenue.breakdown.delivery}
              total={data.revenue.total}
              onClick={() => setDrilldown({ title: `Revenue — ${period.label}`, items: revenueItems })}
            />
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Revenue</span>
              <span className="text-lg font-serif font-bold text-emerald-800">{formatINR(data.revenue.total)}</span>
            </div>
            <div className="text-xs text-[#6b635c] text-right">
              {data.revenue.asOf
                ? `Petpooja sales, ${period.start} → ${data.revenue.asOf}`
                : 'Not synced yet for this month'}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#f2efec]">
              <h3 className="font-serif text-xl font-medium text-[#1e1812]">Cost Breakdown</h3>
              <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
                {period.label}
              </span>
            </div>
            <Meter
              label="Fixed Costs"
              actual={data.costs.fixed}
              total={totalCosts}
              onClick={() => setDrilldown({ title: 'Fixed costs', items: data.costs.breakdown.fixed })}
            />
            <Meter
              label="Variable Costs"
              actual={data.costs.variable}
              total={totalCosts}
              onClick={() => setDrilldown({ title: 'Variable costs', items: data.costs.breakdown.variable })}
            />
            <Meter
              label="Petty Expenses"
              actual={data.costs.petty}
              total={totalCosts}
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
                  {data.salary.state === 'actual'
                    ? `Actual — the payroll for ${data.salary.cycle.start} → ${data.salary.cycle.end} has been processed`
                    : `Forecast — every active employee a full month, for ${data.salary.cycle.start} → ${data.salary.cycle.end}`}
                </p>
              </div>
            )}
          </div>
          <div className="mt-8 pt-4 border-t border-[#ebe8e4] flex flex-col gap-2 bg-[#faf8f6] p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#1e1812]">Total Costs</span>
              <span className="text-lg font-serif font-bold text-rose-800">{formatINR(totalCosts)}</span>
            </div>
            <div className="text-xs text-[#6b635c] text-right">
              {period.isCurrentMonth ? `Costs recorded 1 – ${period.through} ${period.label}` : `Costs recorded in ${period.label}`}
            </div>
          </div>
        </div>
      </div>

      {/* Where the business stands.
          Money owed by customers is money that will come in; money owed to
          suppliers is money that will go out. Neither is in the P&L, and
          both change what the month is really worth. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-[#ebe8e4] shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#f2efec]">
            <h3 className="font-serif text-xl font-medium text-[#1e1812]">Money owed by customers</h3>
            <span className="text-xs font-medium px-2.5 py-1 bg-[#f6f4f2] text-[#8b6f4e] rounded-full">
              {period.label}
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
              {period.label}
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
                {data.payables.totals.billCount} unpaid bill(s) from the {period.label} bills.
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

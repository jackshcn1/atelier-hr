import { getSupabase } from '../../../../lib/supabaseServer.js';
import { financePeriod, lastMonthKeys } from '../../../../lib/financePeriod.js';
import { monthCosts } from '../../../../lib/financeCosts.js';
import { monthPosition, monthReadiness } from '../../../../lib/financePosition.js';
import { cycleEndingIn, salaryForCycle } from '../../../../lib/financeSalary.js';
import { monthsOnRecord, rangeDashboard } from '../../../../lib/financeRange.js';

// The finance dashboards report on the plain calendar month.
//
// The 20th-19th pay cycle is a different question — it is the basis for salary
// processing and variable pay — and it stays exactly as it is. Revenue for a
// calendar month comes from its own table, which the nightly sync fills from
// the Petpooja Executive Sales Summary.
//
// The costs come from lib/financeCosts.js, which the P&L uses as well, so the
// two pages can never disagree about a month.
//
// `?range=N` widens the window: the month named is the last month of the
// span, and the last N months are added up. The span is for the months that
// are worth looking at together — the last three, six or twelve.
export async function GET(req) {
  try {
    const supabase = getSupabase();
    const params = new URL(req.url).searchParams;
    const period = financePeriod(params.get('month'));
    const range = Math.min(Math.max(Number(params.get('range')) || 1, 1), 24);

    // More than one month is a different question, and it is answered in
    // lib/financeRange.js — the same helpers, with the months added up.
    if (range > 1) {
      const periods = lastMonthKeys(period.key, range).map((key) => financePeriod(key));
      const data = await rangeDashboard(supabase, periods);
      data.availableMonths = await monthsOnRecord(supabase, period.key);
      return Response.json({ success: true, data });
    }

    // Revenue for the calendar month, split by order type.
    const { data: revenueRow } = await supabase
      .from('finance_monthly_revenue')
      .select('*')
      .eq('month', period.key)
      .maybeSingle();

    const revenue = {
      breakdown: {
        dine_in: Number(revenueRow?.dine_in || 0),
        pick_up: Number(revenueRow?.pick_up || 0),
        delivery: Number(revenueRow?.delivery || 0),
      },
      total: Number(revenueRow?.total || 0),
      // The day the figures actually cover. For a month that is still
      // running this is today, so the dashboard says "so far" and means it.
      asOf: revenueRow?.window_end || null,
      isComplete: revenueRow?.is_complete === true,
      synced: !!revenueRow,
      source: revenueRow?.source || null,
    };

    const costs = await monthCosts(supabase, period);

    // Staff salary.
    //
    // A forecast until the payroll for the cycle has been run, the real
    // figure after. The cycle that ends in this month is the one that
    // counts, because that is when the salary is paid.
    const salary = await salaryForCycle(supabase, cycleEndingIn(period.key));

    const netProfitOrLoss = revenue.total - costs.total - salary.amount;

    // The balance-sheet side: what customers owe, what suppliers are owed.
    const position = await monthPosition(supabase, period);

    // How much of the month's picture is actually filled in. A profit shown
    // without its fixed costs is not a real profit, so the pages are told
    // which parts are still empty.
    // The count comes back in `count`, not in `data` — a head query returns
    // no rows at all, only the number of rows there are.
    const { count: pettyEntryCount } = await supabase
      .from('petty_cash_ledger')
      .select('id', { count: 'exact', head: true })
      .gte('date', period.start)
      .lte('date', period.end);

    const readiness = monthReadiness({
      revenueSynced: !!revenueRow,
      revenueAsOf: revenueRow?.window_end || null,
      // The bills on record for the month — paid or not, and not counting
      // the credit notes, which are a credit back rather than a bill.
      variableBillCount: position.payables.totals.billCountTotal,
      fixedCostCount: costs.standing.length,
      standingOutstanding: costs.standingOutstanding.length,
      pettyEntryCount: pettyEntryCount || 0,
      receivableCount: position.receivables.totals.invoiceCount,
      unpaidBillCount: position.payables.totals.billCount,
      salaryState: salary.state,
      salaryAmount: salary.amount,
      salaryEmployeeCount: salary.state === 'actual' ? salary.actual.employeeCount : salary.forecast.employeeCount,
      salaryCycle: salary.cycle,
    });

    // The months worth offering on the dropdown.
    //
    // Not the months with a sales figure — the costs go back a long way
    // before the sales figures do, and a month with only costs on it is
    // still a month the owner may want to look at. Every month from the
    // earliest one with figures to the month on the clock is offered.
    const availableMonths = await monthsOnRecord(supabase, period.key);

    return Response.json({
      success: true,
      data: {
        period: {
          key: period.key,
          label: period.label,
          start: period.start,
          end: period.end,
          through: period.through,
          isCurrentMonth: period.isCurrentMonth,
          isComplete: period.isComplete,
          previousKey: period.previousKey,
          nextKey: period.nextKey,
        },
        // The span this page reports on. One month is the plain case; a
        // wider span says how many months were added up.
        range: {
          months: 1,
          from: period.key,
          to: period.key,
          label: period.label,
        },
        revenue,
        costs,
        salary,
        net_pl: netProfitOrLoss,
        ...position,
        readiness,
        // The parts of the month that are not filled in yet.
        missing: readiness
          .filter((item) => item.state === 'empty' && item.missing)
          .map((item) => ({ key: item.key, label: item.label, message: item.missing })),
        availableMonths: availableMonths || [],
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

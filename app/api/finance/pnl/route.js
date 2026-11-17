import { createClient } from '@supabase/supabase-js';
import { financePeriod } from '../../../../lib/financePeriod.js';
import { monthCosts } from '../../../../lib/financeCosts.js';
import { monthPosition, monthReadiness } from '../../../../lib/financePosition.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// The P&L is a calendar-month statement, like every other finance metric.
//
// The figures used to be placeholders — revenue was a hardcoded 50 lakh and
// the profit was that number times 0.85 and then 0.9 — so the page showed a
// confident, entirely made-up profit. Everything below is now real:
//
//   revenue          calendar-month revenue (Petpooja, split by order type)
//   cost of revenue  the variable costs of the month
//   gross profit     revenue - cost of revenue
//   operating costs  the month's standing costs: fixed costs and petty cash
//   operating profit gross profit - operating costs
//   net profit       operating profit. Nothing sits between them yet: there
//                    is no interest, depreciation or tax in the books.
//
// A month that is still running is a month so far — the figures cover the
// days that have happened, and say so.
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const period = financePeriod(params.get('month'));

    const { data: revenueRow } = await supabase
      .from('finance_monthly_revenue')
      .select('*')
      .eq('month', period.key)
      .maybeSingle();

    const revenue = Number(revenueRow?.total || 0);

    const costs = await monthCosts(supabase, period);
    const costOfRevenue = costs.variable;
    const operatingCosts = costs.fixed + costs.petty;

    const totalExpenses = costOfRevenue + operatingCosts;
    const grossProfit = revenue - costOfRevenue;
    const operatingProfit = grossProfit - operatingCosts;
    const netProfit = operatingProfit;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    // What is filled in, and what is still missing.
    //
    // The profit above is only as good as the costs behind it. A month with
    // no fixed costs configured shows a profit that has not had rent,
    // salaries or power subtracted from it — so the page is told, and says
    // so in plain words.
    const position = await monthPosition(supabase, period);

    const { count: fixedCostCount } = await supabase
      .from('fixed_costs')
      .select('id', { count: 'exact', head: true });

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
      fixedCostCount: fixedCostCount || 0,
      pettyEntryCount: pettyEntryCount || 0,
      receivableCount: position.receivables.totals.invoiceCount,
      unpaidBillCount: position.payables.totals.billCount,
    });

    const missing = readiness.filter((item) => item.state === 'empty' && item.missing);

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
        },
        revenue,
        revenue_synced: !!revenueRow,
        revenue_as_of: revenueRow?.window_end || null,
        total_expenses: totalExpenses,
        cost_of_revenue: costOfRevenue,
        operating_costs: operatingCosts,
        gross_profit: grossProfit,
        operating_profit: operatingProfit,
        net_profit: netProfit,
        profit_margin: profitMargin,
        readiness,
        // The parts of the month that are not filled in yet. The profit is
        // only as true as these allow.
        missing: missing.map((item) => ({ label: item.label, message: item.missing })),
        receivables: position.receivables.totals,
        payables: position.payables.totals,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

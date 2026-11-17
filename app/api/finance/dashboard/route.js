import { createClient } from '@supabase/supabase-js';
import { financePeriod } from '../../../../lib/financePeriod.js';
import { monthCosts } from '../../../../lib/financeCosts.js';
import { monthPosition, monthReadiness } from '../../../../lib/financePosition.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// The finance dashboards report on the plain calendar month.
//
// The 20th-19th pay cycle is a different question — it is the basis for salary
// processing and variable pay — and it stays exactly as it is. Revenue for a
// calendar month comes from its own table, which the nightly sync fills from
// the Petpooja Executive Sales Summary.
//
// The costs come from lib/financeCosts.js, which the P&L uses as well, so the
// two pages can never disagree about a month.
export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const period = financePeriod(params.get('month'));

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
    const netProfitOrLoss = revenue.total - costs.total;

    // The balance-sheet side: what customers owe, what suppliers are owed.
    const position = await monthPosition(supabase, period);

    // How much of the month's picture is actually filled in. A profit shown
    // without its fixed costs is not a real profit, so the pages are told
    // which parts are still empty.
    // The count comes back in `count`, not in `data` — a head query returns
    // no rows at all, only the number of rows there are.
    const { count: billCount } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .gte('invoice_date', period.start)
      .lte('invoice_date', period.end);

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
      variableBillCount: billCount || 0,
      fixedCostCount: fixedCostCount || 0,
      pettyEntryCount: pettyEntryCount || 0,
      receivableCount: position.receivables.totals.invoiceCount,
      unpaidBillCount: position.payables.totals.billCount,
    });

    // The months that have figures, so the dashboard can offer the ones worth
    // looking at.
    const { data: availableMonths } = await supabase
      .from('finance_monthly_revenue')
      .select('month, window_end, is_complete')
      .order('month', { ascending: false })
      .limit(24);

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
        revenue,
        costs,
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

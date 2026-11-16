import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getActivePeriodId() {
  const { data: period } = await supabase
    .from('variable_pay_periods')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  return period?.id || null;
}

// The expenses table is not scoped to a period — the Petpooja sync adds the
// vendor bills of every cycle to it. Without a window, the dashboard would
// keep adding each month's bills to the next month's total. Rows without an
// invoice date (manually entered costs) are always included.
async function getActivePeriodWindow() {
  const { data: period } = await supabase
    .from('variable_pay_periods')
    .select('period_start, period_end')
    .eq('status', 'open')
    .maybeSingle();
  if (!period?.period_start || !period?.period_end) return null;
  return { start: period.period_start, end: period.period_end };
}

function queryExpensesInWindow(query, window) {
  if (!window) return query;
  // Rows without an invoice date (manually entered costs) are always included.
  return query.or(
    `invoice_date.gte.${window.start},invoice_date.lte.${window.end},invoice_date.is.null`
  );
}

async function getMetricSum(periodId, metricId) {
  const { data } = await supabase
    .from('variable_metric_inputs')
    .select('actual_value')
    .eq('period_id', periodId)
    .eq('metric_id', metricId)
    .is('employee_id', null);
  return (data || []).reduce((sum, row) => sum + Number(row.actual_value || 0), 0);
}

export async function GET() {
  try {
    const periodId = await getActivePeriodId();

    const { data: fixedCosts } = await supabase.from('fixed_costs').select('amount');
    const totalFixedActual = (fixedCosts || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const { data: pettyCash } = await supabase.from('petty_cash_ledger').select('amount, type');
    const totalPettyActual = (pettyCash || [])
      .filter(item => item.type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const { data: expenses } = await queryExpensesInWindow(
      supabase.from('expenses').select('amount, cost_type, category'),
      await getActivePeriodWindow()
    );
    const totalVariableActual = (expenses || [])
      .filter(e => e.cost_type === 'variable' || !e.cost_type)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const totalCosts = totalFixedActual + totalPettyActual + totalVariableActual;

    // Real revenue breakdown: Dine-in, Pick Up, Delivery
    let revenueBreakdown = { dine_in: 0, pick_up: 0, delivery: 0 };
    let totalRevenue = 0;

    if (periodId) {
      const [dineIn, pickUp, delivery] = await Promise.all([
        getMetricSum(periodId, 'rev_dine_in'),
        getMetricSum(periodId, 'rev_pick_up'),
        getMetricSum(periodId, 'rev_delivery'),
      ]);

      // Fallback to counter & delivery metrics if executive summary not yet synced
      const fallbackDineIn = dineIn || await getMetricSum(periodId, 'b2b_counter_sales');
      const fallbackDelivery = delivery || await getMetricSum(periodId, 'acc_delivery_sales');

      revenueBreakdown = {
        dine_in: Math.round(fallbackDineIn),
        pick_up: Math.round(pickUp),
        delivery: Math.round(fallbackDelivery),
      };
      totalRevenue = revenueBreakdown.dine_in + revenueBreakdown.pick_up + revenueBreakdown.delivery;
    }

    const netProfitOrLoss = totalRevenue - totalCosts;

    return Response.json({
      success: true,
      data: {
        revenue: {
          breakdown: revenueBreakdown,
          total: totalRevenue,
        },
        costs: {
          fixed: totalFixedActual,
          petty: totalPettyActual,
          variable: totalVariableActual,
          total: totalCosts,
        },
        net_pl: netProfitOrLoss,
      }
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

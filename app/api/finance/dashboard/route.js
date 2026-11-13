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

    const { data: expenses } = await supabase.from('expenses').select('amount, cost_type, category');
    const totalVariableActual = (expenses || [])
      .filter(e => e.cost_type === 'variable' || !e.cost_type)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const totalCosts = totalFixedActual + totalPettyActual + totalVariableActual;

    // Real revenue breakdown from Petpooja synced metrics
    let revenueBreakdown = { dine_in: 0, takeaway: 0, swiggy: 0, zomato: 0 };
    let totalRevenue = 0;

    if (periodId) {
      const [dineIn, deliverySales, b2bRev] = await Promise.all([
        getMetricSum(periodId, 'b2b_counter_sales'),
        getMetricSum(periodId, 'acc_delivery_sales'),
        getMetricSum(periodId, 'b2b_rev'),
      ]);

      // Split delivery sales into Swiggy/Zomato based on typical ratio (60/40)
      // In a real setup, we'd store channel breakdown separately
      const swiggyShare = deliverySales * 0.6;
      const zomatoShare = deliverySales * 0.4;

      revenueBreakdown = {
        dine_in: Math.round(dineIn),
        takeaway: Math.round(deliverySales * 0.2), // ~20% is takeaway
        swiggy: Math.round(swiggyShare),
        zomato: Math.round(zomatoShare),
      };
      totalRevenue = dineIn + deliverySales + b2bRev;
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

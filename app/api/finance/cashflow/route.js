import { createClient } from '@supabase/supabase-js';
import { financePeriod } from '../../../../lib/financePeriod.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cashflow is a calendar-month statement, like every other finance metric.
// The transactions of the month are returned, and the totals the page shows
// are the month's totals — not the totals of every transaction ever recorded.
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const period = financePeriod(params.get('month'));

    const { data, error } = await supabase
      .from('cashflow_transactions')
      .select('*')
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date', { ascending: false })
      .limit(200);

    if (error) throw error;

    const transactions = data || [];
    const totalInflow = transactions
      .filter(t => t.type === 'inflow')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalOutflow = transactions
      .filter(t => t.type === 'outflow')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return Response.json({
      success: true,
      data: {
        transactions,
        period: {
          key: period.key,
          label: period.label,
          start: period.start,
          end: period.end,
          through: period.through,
          isCurrentMonth: period.isCurrentMonth,
        },
        totals: {
          inflow: totalInflow,
          outflow: totalOutflow,
          net: totalInflow - totalOutflow,
        },
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from('cashflow_transactions')
      .insert([body])
      .select();

    if (error) throw error;

    return Response.json({ success: true, data: data[0] });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
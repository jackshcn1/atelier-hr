import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('amount')
      .eq('status', 'approved')
      .eq('entry_type', 'actual');

    if (expError) throw expError;

    const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

    const revenue = 5000000;
    const grossProfit = revenue - totalExpenses;
    const operatingProfit = grossProfit * 0.85;
    const netProfit = operatingProfit * 0.9;
    const profitMargin = (netProfit / revenue) * 100;

    return Response.json({
      success: true,
      data: {
        revenue,
        total_expenses: totalExpenses,
        gross_profit: grossProfit,
        operating_profit: operatingProfit,
        net_profit: netProfit,
        profit_margin: profitMargin,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
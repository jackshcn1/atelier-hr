import { getSupabase } from '../../../../lib/supabaseServer.js';
import { financePeriod } from '../../../../lib/financePeriod.js';

// Cashflow is a calendar-month statement, like every other finance metric.
// The transactions of the month are returned, and the totals the page shows
// are the month's totals — not the totals of every transaction ever recorded.
export async function GET(request) {
  try {
    const supabase = getSupabase();
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

    // The money owed by customers.
    //
    // These are the invoices that are still open — money that is expected to
    // come in but has not. They are not cash movements, so they sit beside
    // the transactions rather than inside them.
    const { data: receivableRows } = await supabase
      .from('finance_receivables')
      .select('customer_name, invoice_no, invoice_date, remaining_amount, age_days, is_overdue, synced_at')
      .eq('month', period.key)
      .order('remaining_amount', { ascending: false })
      .limit(1000);

    const receivables = receivableRows || [];

    // One line per customer, biggest first.
    //
    // An invoice with no customer name on it still has an invoice number,
    // and that is what identifies it — so it is filed under its own number
    // rather than lumped in with every other unnamed invoice.
    const byCustomer = new Map();
    for (const row of receivables) {
      const name = row.customer_name || `Invoice ${row.invoice_no || '—'}`;
      const line = byCustomer.get(name) || {
        customer: name,
        amount: 0,
        invoices: 0,
        overdueAmount: 0,
        oldestDays: 0,
      };
      const amount = Number(row.remaining_amount || 0);
      line.amount += amount;
      line.invoices += 1;
      if (row.is_overdue) line.overdueAmount += amount;
      line.oldestDays = Math.max(line.oldestDays, Number(row.age_days || 0));
      byCustomer.set(name, line);
    }
    const customers = [...byCustomer.values()]
      .map((line) => ({
        ...line,
        amount: Math.round(line.amount * 100) / 100,
        overdueAmount: Math.round(line.overdueAmount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    const receivableTotals = {
      outstanding: Math.round(customers.reduce((sum, line) => sum + line.amount, 0) * 100) / 100,
      overdue: Math.round(customers.reduce((sum, line) => sum + line.overdueAmount, 0) * 100) / 100,
      invoiceCount: receivables.length,
      customerCount: customers.length,
      asOf: receivables[0]?.synced_at || null,
    };

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
        receivables: {
          customers,
          totals: receivableTotals,
        },
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
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
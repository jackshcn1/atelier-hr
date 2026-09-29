import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { periodStart, periodEnd, metrics, sourceFilename = 'Browser 1-Click Sync' } = body;

    if (!periodStart || !periodEnd || !metrics) {
      return NextResponse.json({ error: 'Missing periodStart, periodEnd, or metrics payload.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wzxswmopfxnucmeygqeg.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get or create period
    let { data: period } = await supabase
      .from('variable_pay_periods')
      .select('*')
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .maybeSingle();

    if (!period) {
      const { data: newPeriod, error: pErr } = await supabase
        .from('variable_pay_periods')
        .insert([{ period_start: periodStart, period_end: periodEnd, status: 'open' }])
        .select()
        .single();
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      period = newPeriod;
    }

    if (period.status === 'locked' || period.status === 'paid') {
      return NextResponse.json({ error: `Period is ${period.status}. Cannot overwrite locked numbers.` }, { status: 400 });
    }

    // 2. Upsert metrics
    let savedCount = 0;
    for (const item of metrics) {
      const { metricId, value, employeeId = null, detail = {} } = item;
      const payload = {
        period_id: period.id,
        scheme_name: detail.scheme_name || '',
        metric_id: metricId,
        employee_id: employeeId || null,
        actual_value: value,
        source_type: 'petpooja',
        source_filename: sourceFilename,
        source_detail: detail
      };

      const { error: upErr } = await supabase
        .from('variable_metric_inputs')
        .upsert(payload, { onConflict: 'period_id,metric_id,employee_id' });

      if (!upErr) savedCount++;
    }

    return NextResponse.json({
      success: true,
      periodId: period.id,
      savedMetricsCount: savedCount,
      message: `Successfully synchronized ${savedCount} variable pay metric(s) for period ${periodStart} to ${periodEnd}.`
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

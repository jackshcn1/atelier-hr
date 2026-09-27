// Checklist Scheduler & Overdue Evaluator Engine
// Automatically generates active runs for templates and tracks rollover/overdue status

export function formatDelayString(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  if (sec === 0) return 'On time';

  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Compute next/current due timestamp for a template
export function computeDueTimestamp(cadence, scheduleTimes, baseDate = new Date()) {
  const times = Array.isArray(scheduleTimes) && scheduleTimes.length > 0 ? scheduleTimes : ['21:00'];
  const firstTime = times[0];
  const [h, m] = firstTime.split(':').map(Number);

  const due = new Date(baseDate);
  due.setHours(h || 21, m || 0, 0, 0);

  return due.toISOString();
}

// Synchronizes template schedules with active checklist runs
export async function syncChecklistRuns(supabase) {
  try {
    const { data: templates, error: tErr } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('is_active', true);

    if (tErr || !templates) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    for (const t of templates) {
      const times = Array.isArray(t.schedule_times) && t.schedule_times.length > 0 ? t.schedule_times : ['21:00'];

      for (const timeStr of times) {
        const [h, m] = timeStr.split(':').map(Number);
        const shiftDue = new Date(now);
        shiftDue.setHours(h || 21, m || 0, 0, 0);

        // Check if a run already exists for this template + shift date
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: existingRuns } = await supabase
          .from('checklist_runs')
          .select('id, status, due_at')
          .eq('template_id', t.id)
          .gte('due_at', startOfDay.toISOString())
          .lte('due_at', endOfDay.toISOString());

        if (!existingRuns || existingRuns.length === 0) {
          // Create new active run
          await supabase.from('checklist_runs').insert([{
            template_id: t.id,
            title: t.title,
            department: t.department || null,
            due_at: shiftDue.toISOString(),
            status: 'pending',
            responses: {}
          }]);
        }
      }
    }

    // Evaluate overdue vs missed runs
    const { data: activeRuns } = await supabase
      .from('checklist_runs')
      .select('id, template_id, status, due_at, checklist_templates(rollover_if_missed)')
      .in('status', ['pending', 'overdue', 'recheck_requested']);

    if (activeRuns) {
      for (const run of activeRuns) {
        const dueTime = new Date(run.due_at).getTime();
        const nowTime = now.getTime();

        if (nowTime > dueTime) {
          const rollover = run.checklist_templates?.rollover_if_missed ?? true;
          const diffSeconds = Math.round((nowTime - dueTime) / 1000);

          if (!rollover) {
            // Check if day has passed -> mark as missed
            const isDifferentDay = new Date(run.due_at).getDate() !== now.getDate();
            if (isDifferentDay) {
              await supabase.from('checklist_runs').update({
                status: 'missed',
                is_overdue: true,
                delay_seconds: diffSeconds,
                updated_at: now.toISOString()
              }).eq('id', run.id);
              continue;
            }
          }

          // Mark overdue
          if (run.status === 'pending') {
            await supabase.from('checklist_runs').update({
              status: 'overdue',
              is_overdue: true,
              delay_seconds: diffSeconds,
              updated_at: now.toISOString()
            }).eq('id', run.id);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error syncing checklist runs:', err);
  }
}

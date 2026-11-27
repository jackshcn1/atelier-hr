// lib/complianceReminders.js — the 90-day reminder.
//
// A licence that expires in three months is not a problem today. It is a
// problem in three months, when nobody remembers it. So the register looks
// ahead: anything due inside the window gets a task in the Tasks hub, and
// the owner is told about it — once, when it enters the window, and again if
// it becomes overdue.
//
// Two rules keep it from nagging:
//   one task per item   — the task's id is written back onto the item
//   told once           — when it was last told is written back too, and an
//                         overdue item is only nagged once a week
//
// The planning is pure, so it can be tested without a database. The doing is
// in `runReminders`.

import { dueDateOf, daysUntil } from './compliance.js';

/** How far ahead the register looks. */
export const REMINDER_WINDOW_DAYS = 90;

/** How long an overdue item is left alone before it is mentioned again. */
export const OVERDUE_NAG_DAYS = 7;

/** Names come from the register, so they are escaped before they are mailed. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * What should happen for each item.
 *
 * @param {object[]} items the compliance register
 * @param {object} [options]
 * @param {Date} [options.today]
 * @param {number} [options.withinDays]
 * @param {Map<number, object>} [options.tasks] the tasks already made for the items
 * @returns {object[]} one entry per item that wants attention
 */
export function planReminders(items, { today = new Date(), withinDays = REMINDER_WINDOW_DAYS, tasks = new Map() } = {}) {
  const now = today.getTime();
  const plan = [];

  for (const item of items || []) {
    const due = dueDateOf(item);
    const days = daysUntil(due, today);
    if (days === null) continue;          // nothing to be reminded about
    if (days > withinDays) continue;      // not in the window yet

    const task = item.reminder_task_id ? tasks.get(item.reminder_task_id) : null;
    // A task id that points at nothing means the task was deleted by hand.
    // The item still needs one, so a new task is made for it.
    const taskMissing = !!item.reminder_task_id && !task;
    const dateMoved = !!task && task.due_date !== due;
    const taskDone = !!task && task.status === 'completed';

    const lastNotified = item.reminder_notified_at ? new Date(item.reminder_notified_at).getTime() : null;
    const naggedBefore =
      lastNotified !== null && now - lastNotified >= OVERDUE_NAG_DAYS * 86400000;

    // The owner is told when the item is new to them, when its date has
    // moved, when the task was closed but the item is still due, or when it
    // has been overdue for a week with no word.
    const notify =
      lastNotified === null ||
      dateMoved ||
      taskDone ||
      (days < 0 && naggedBefore);

    plan.push({
      item,
      due,
      days,
      createTask: !item.reminder_task_id || taskMissing,
      updateTaskDate: dateMoved,
      reopenTask: taskDone,
      notify,
      // The most urgent fact wins: an item that is already overdue says so,
      // however new it is to the register.
      reason: days < 0 ? 'overdue'
        : !item.reminder_task_id ? 'new to the window'
        : taskMissing ? 'its task was deleted by hand'
        : dateMoved ? 'the date moved'
        : taskDone ? 'the task was closed but the item is still due'
        : 'in the window',
    });
  }

  // Soonest first — the list is read, not skimmed.
  return plan.sort((a, b) => a.days - b.days);
}

/** The task that stands for a compliance item. */
export function taskFor(item, { actor = 'compliance-reminder', days = null } = {}) {
  const recurring = item.kind === 'recurring';
  // The closer it is, the louder the task is.
  const priority = days !== null && days < 0 ? 'urgent'
    : days !== null && days <= 30 ? 'high'
    : 'normal';
  return {
    title: `${recurring ? 'Do' : 'Renew'}: ${item.name}`,
    description: [
      recurring
        ? `A recurring duty — ${item.cadence || 'scheduled'}. It was last done on ${item.last_done_on || '—'}.`
        : `Valid until ${item.expires_on || '—'}.`,
      item.authority ? `Issued by ${item.authority}.` : '',
      item.reference_no ? `Number ${item.reference_no}.` : '',
      'Renew it, or record what was done, on the Compliance page.',
    ].filter(Boolean).join(' '),
    priority,
    cadence: 'adhoc',
    due_date: dueDateOf(item),
    due_time: '09:00:00',
    assigned_type: item.owner_employee_id ? 'individual' : 'all_staff',
    assigned_employee_id: item.owner_employee_id || null,
    assigned_employee_ids: [],
    subtasks: [],
    mandatory_proofs: [],
    created_by: actor,
    updated_at: new Date().toISOString(),
  };
}

/**
 * The note that tells the owner what is due.
 *
 * One mail for the whole run, not one per item — a morning with three
 * expiries in it should be one mail with three lines, not three mails.
 *
 * @param {object[]} entries the plan entries that want telling
 * @returns {{subject: string, html: string, text: string}}
 */
export function buildDigest(entries) {
  const list = entries || [];
  const name = list.length === 1 ? list[0].item.name : `${list.length} things`;

  const when = (days) => {
    if (days === null) return 'no date';
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
    if (days === 0) return 'due today';
    return `due in ${days} day${days === 1 ? '' : 's'}`;
  };

  const lines = list.map((e) => {
    const what = e.item.kind === 'recurring' ? 'Recurring duty' : 'Licence / certificate';
    return `${e.item.name} — ${when(e.days)} (${what})`;
  });

  const text = [
    `Compliance: ${name}`,
    '',
    ...lines,
    '',
    'Renew it, or record what was done, on the Compliance page.',
  ].join('\n');

  const rows = list.map((e) => `
      <tr>
        <td style="padding:8px 12px 8px 0;border-bottom:1px solid #e8e4dc;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1917;">
          ${escapeHtml(e.item.name)}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e8e4dc;font-size:13px;color:#6b6259;white-space:nowrap;">
          ${escapeHtml(when(e.days))}
        </td>
      </tr>`).join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f4ee;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e4dc;border-radius:6px;padding:24px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f6d;">Atelier · Compliance</p>
      <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#1c1917;">
        ${escapeHtml(name)}
      </h1>
      <table style="width:100%;border-collapse:collapse;">${rows}
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#6b6259;">
        Renew it, or record what was done, on the Compliance page.
      </p>
    </div>
  </body>
</html>`;

  return {
    subject: `Compliance: ${name}`,
    html,
    text,
  };
}

/**
 * Run the reminders.
 *
 * @param {object} input
 * @param {object} input.supabase a service-role client
 * @param {(message: object) => Promise<boolean>} [input.sendMail] the mailer; omit for a dry run
 * @param {Date} [input.today]
 * @param {number} [input.withinDays]
 * @param {string} [input.actor]
 * @returns {Promise<object>} what the run did
 */
export async function runReminders({
  supabase,
  sendMail = null,
  today = new Date(),
  withinDays = REMINDER_WINDOW_DAYS,
  actor = 'compliance-reminder',
} = {}) {
  const { data: items, error: itemsErr } = await supabase
    .from('compliance_items')
    .select('*');
  if (itemsErr) throw new Error(`the register could not be read: ${itemsErr.message}`);

  const taskIds = (items || []).map(i => i.reminder_task_id).filter(Boolean);
  const tasks = new Map();
  if (taskIds.length) {
    const { data: taskRows, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .in('id', taskIds);
    if (taskErr) throw new Error(`the tasks could not be read: ${taskErr.message}`);
    for (const t of taskRows || []) tasks.set(t.id, t);
  }

  const plan = planReminders(items || [], { today, withinDays, tasks });

  let created = 0;
  let updated = 0;
  let reopened = 0;
  const problems = [];

  for (const entry of plan) {
    const { item } = entry;

    // One item that cannot be written must not stop the others — a bad row
    // on one licence cannot be allowed to silence the whole register.
    try {
      if (entry.createTask) {
        const { data: createdRow, error: insErr } = await supabase
          .from('tasks')
          .insert([taskFor(item, { actor, days: entry.days })])
          .select()
          .single();
        if (insErr) throw new Error(`the task could not be made: ${insErr.message}`);
        await supabase
          .from('compliance_items')
          .update({ reminder_task_id: createdRow.id, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        item.reminder_task_id = createdRow.id;
        created += 1;
        continue;
      }

      if (entry.updateTaskDate) {
        const priority = entry.days < 0 ? 'urgent' : entry.days <= 30 ? 'high' : 'normal';
        await supabase
          .from('tasks')
          .update({ due_date: entry.due, priority, updated_at: new Date().toISOString() })
          .eq('id', item.reminder_task_id);
        updated += 1;
      }

      if (entry.reopenTask) {
        await supabase
          .from('tasks')
          .update({ status: 'reopened', is_overdue: false, updated_at: new Date().toISOString() })
          .eq('id', item.reminder_task_id);
        reopened += 1;
      }
    } catch (err) {
      problems.push({ id: item.id, name: item.name, error: err.message });
    }
  }

  // The mail: one note listing everything that wants attention.
  const toTell = plan.filter(e => e.notify);
  let emailed = false;
  let emailError = null;

  if (toTell.length > 0 && sendMail) {
    const digest = buildDigest(toTell);
    try {
      emailed = await sendMail(digest);
      if (!emailed) emailError = 'the mail could not be sent — the items stay on the list for the next run';
    } catch (err) {
      emailError = err.message;
    }
  }

  // The items are marked as told only when the mail actually went out —
  // otherwise a failed mail would silence the reminder for good.
  if (toTell.length > 0 && emailed) {
    const ids = toTell.map(e => e.item.id);
    await supabase
      .from('compliance_items')
      .update({ reminder_notified_at: new Date().toISOString() })
      .in('id', ids);
  }

  return {
    due: plan.length,
    created,
    updated,
    reopened,
    toTell: toTell.map(e => ({
      id: e.item.id,
      name: e.item.name,
      due: e.due,
      days: e.days,
      reason: e.reason,
    })),
    emailed,
    emailError,
    problems,
  };
}

// Checks the hourly schedule logic in scripts/petpooja-sync.mjs.
//
//   node tests/sync-plan-verify.mjs
//
// The Supabase client is faked, so nothing here touches the real database
// and nothing here needs a network connection.
//
// The timestamps below are UTC. The IST hour is 5 hours 30 minutes ahead:
//   2026-11-16T22:10:00Z = 2026-11-17 03:40 IST
//   2026-11-16T22:50:00Z = 2026-11-17 04:20 IST
//   2026-11-16T22:55:00Z = 2026-11-17 04:25 IST
//   2026-11-16T20:00:00Z = 2026-11-17 01:30 IST
//   2026-11-15T20:00:00Z = 2026-11-16 01:30 IST  (the day before)

import { planReportGroup } from '../scripts/petpooja-sync.mjs';

// The fake answers only what planReportGroup asks for.
function fakeClient(rows) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        async maybeSingle() { return { data: { id: 1 } }; },
        async then(resolve) { resolve({ data: rows }); return { data: rows }; },
      };
    },
  };
}

const ROWS = [
  { metric_id: 'cap_sales',         updated_at: '2026-11-16T22:10:00Z' }, // group 1, 03:40 IST today
  { metric_id: 'cap_pax_avg',       updated_at: '2026-11-16T22:50:00Z' }, // group 2, 04:20 IST today
  { metric_id: 'b2b_rev',            updated_at: '2026-11-16T22:55:00Z' }, // group 4, 04:25 IST today
  { metric_id: 'b2b_counter_sales', updated_at: '2026-11-15T20:00:00Z' }, // group 3, yesterday
];

const cases = [
  ['group 6, the hour already has 2 groups',    6, '2026-11-16T22:56:00Z', {},                 'skip'],
  ['group 6, the hour has 1 group',             6, '2026-11-16T22:15:00Z', {},                 'run'],
  ['group 6, the hour is empty',                6, '2026-11-16T20:00:00Z', {},                 'run'],
  ['group 6, the catch-up lifts the limit',     6, '2026-11-16T22:56:00Z', { catchup: true }, 'run'],
  ['group 1, already ran today',                1, '2026-11-16T22:56:00Z', {},                 'skip'],
  ['group 3, last ran yesterday',               3, '2026-11-16T20:00:00Z', {},                 'run'],
  ['group 9, writes no metric',                 9, '2026-11-16T22:56:00Z', {},                 'run'],
];

let failed = 0;
for (const [label, group, now, opts, expected] of cases) {
  const plan = await planReportGroup(group, { now, client: fakeClient(ROWS), ...opts });
  const ok = plan.action === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} | ${label.padEnd(42)} -> ${plan.action.toUpperCase().padEnd(5)} (expected ${expected})` +
    ` | ranThisHour=${plan.ranThisHour} | ${plan.reason}`
  );
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);

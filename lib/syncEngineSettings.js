/**
 * lib/syncEngineSettings.js — the sync engine's settings, saved and put back.
 *
 * The Petpooja engine is told its window, its reports and its mode through
 * the environment, and **it does not clear them when it is done**. A
 * serverless instance is reused, so a run that set the 90-day window would
 * leave that window behind for the **next** request the same instance
 * serves — and the next request may be the nightly pull, which must read the
 * running pay cycle and not 90 days.
 *
 * So the settings are saved before a run and put back after it. This lives
 * here, and not in the route, so it can be checked on its own: the route
 * pulls in `next/headers`, which cannot be loaded outside Next's runtime.
 */

// The settings the sync engine reads from the environment.
export const ENGINE_SETTINGS = [
  'SYNC_FINANCE_ONLY',
  'SYNC_GROUP',
  'SYNC_REPORTS',
  'SYNC_LAST_GROUP',
  'SYNC_START_DATE',
  'SYNC_END_DATE',
  'SYNC_REVENUE_MONTH',
  'SYNC_PURCHASE_REFRESH',
  'PETPOOJA_HEADLESS',
  'PETPOOJA_CHROMIUM_ARGS',
  'PETPOOJA_CHROMIUM_EXECUTABLE_PATH',
];

/**
 * The engine's settings, as they are now.
 *
 * A setting that was not set is remembered as "not set" — so putting it back
 * means removing it, rather than leaving an empty string where a value used
 * to be.
 *
 * @returns {Record<string, string|undefined>}
 */
export function snapshotEngineSettings() {
  const saved = {};
  for (const name of ENGINE_SETTINGS) {
    saved[name] = process.env[name];
  }
  return saved;
}

/**
 * Put the engine's settings back the way they were found.
 *
 * @param {Record<string, string|undefined>} saved from snapshotEngineSettings()
 */
export function restoreEngineSettings(saved) {
  for (const name of Object.keys(saved || {})) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
}

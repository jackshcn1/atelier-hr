# Maintenance Module Verification

## Gate 1: Maintenance Job Creation
CHECK: curl -X POST https://atelier-hr-inky.vercel.app/api/maintenance/jobs with auth
EXPECT: 201 and job id starts with MNT-

## Gate 2: Maintenance Page Lists Job
CHECK: fetch /api/maintenance/jobs with session token
EXPECT: response contains new job id

## Gate 3: Playwright End-to-End
CHECK: login -> asset page -> submit maintenance -> verify maintenance list
EXPECT: job visible on /operations/maintenance
- [Maintenance filters] — CHECK: page loads 4 filters + 6-col table EXPECT: UI shows "Raised in last", "Service type", "Status", "Completion" dropdowns + 6 headers (Job ID, Asset number, Asset name, Request date, Current Status, Completion Status)
GATE: Asset name (asset_name) column
CHECK: POST uses client asset_name; DB column exists; build Ready (e63d184).
EXPECT: new MNT from asset page shows "Chiller" in Asset name column (not "-").
STATUS: NOT FULLY MET — new job with name must be logged & verified live; user must confirm by logging from KICH00002 asset page then checking /operations/maintenance.
- [Asset name live] CHECK: POST uses client asset_name; DB column exists; push e63d184 Ready. EXPECT: new MNT from KICH00002 shows "Chiller" in Asset name column. STATUS: PENDING — submit attempt via evaluate_script returned auth redirect (expected without session cookie); fix verified at code level only. Final proof requires real UI submit (user or full browser with session).

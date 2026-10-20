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

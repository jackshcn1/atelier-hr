---
name: salary-split-logic
description: "Salary split rules - Kerala minimum wage floor, Basic+DA/HRA breakdown"
metadata:
  node_type: memory
  type: project
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-24T12:39:09.578Z
---

**DO NOT CHANGE WITHOUT ASKING THE USER.**

- Fixed salary ≤ ₹18,000/month → no split, entire amount = Basic+DA (Kerala minimum wage floor)
- Fixed salary > ₹18,000/month → Basic+DA stays at ₹18,000 floor, remainder split into HRA + other allowances
- Floor amount and split ratio adjustable in app settings
- Changes apply only to **future** salary entries, never retroactively

**Deposits (uniform, accommodation):**
- Fixed amounts, vary by company accommodation status
- Adjustable in back-end; changes apply only to future deposits, not retrospectively

**Why:** Legal compliance with Kerala minimum wage rules and standard Indian salary structuring.
**How to apply:** Never modify the split formula or floor amount in code without confirming with the user first. Settings changes must be forward-only.

Related: [[payroll-business-logic]], [[project-atelier-hr]]

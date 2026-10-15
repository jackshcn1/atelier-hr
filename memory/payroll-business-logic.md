---
name: payroll-business-logic
description: Petpooja-based payroll calculation formula — do not change without asking
metadata:
  node_type: memory
  type: project
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-24T12:39:02.572Z
---

**DO NOT CHANGE WITHOUT ASKING THE USER.**

- Pay period: 20th of previous month → 19th of current month, paid on 1st of following month
- Per-day salary = fixed salary ÷ total calendar days in period
- Standard hours/day = 10 (exception: employee code 15 "Nayana" = 9 hours)
- 4 paid weekly offs/month; unused ones forfeited, not paid extra
- No overtime pay
- Effective days = hours worked ÷ standard hours/day, rounded to nearest whole day, capped at days actually marked present
- Weekly offs lost in blocks of 7 absent days beyond 4-day allowance: 5–11 extra absent = −1 off, 12–18 = −2, etc.
- Mid-period new joinees flagged for manual review, not auto-calculated
- Variable pay entered manually per employee (auto-calc is future work)
- Always show final verification table before saving payroll numbers

**Employee ID** = Petpooja code (entered in Petpooja first, that code is used here).

**Why:** This is the core payroll logic matching the restaurant's actual pay practices. Changing it incorrectly means wrong paychecks.
**How to apply:** When touching payroll code, verify every calc step against these rules. Ask before modifying any formula.

Related: [[project-atelier-hr]], [[salary-split-logic]]

---
name: variable-pay-engine
description: Atelier Variable Pay Calculation Engine rules, metric weights, floors, ceilings, and payslip itemization
metadata:
  node_type: memory
  type: reference
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-28T05:46:42.835Z
---

**Atelier Variable Pay Incentive System Rules (confirmed from `Variable Pay - Claude (1).xlsx`):**

1. **Target Pool**: Fixed monthly amount per employee on file (e.g. ₹1,500/month).
2. **Metric Distribution Weights**: Sum to exactly 100% (1.0) per scheme.
3. **Attainment Formulas**:
   - **Binary Criteria (Hit / Miss)**:
     - Higher is better: `actual >= target ? 100% : 0%`
     - Lower is better (e.g. wastage, prep time): `actual <= target ? 100% : 0%`
   - **Proportional Criteria (Scaled Attainment)**:
     - Higher is better: If `floor` set and `actual < floor`, attainment = 0%. Otherwise `min(actual, ceiling || actual) / target`. Overachievement allowed up to ceiling cap.
     - Lower is better: If `floor` set and `actual > floor`, attainment = 0%. Otherwise `target / max(actual, ceiling || actual)`.
4. **The 6 Configured Schemes**:
   - `service_captain`: 40% Sales (₹2.6L target, ₹2.2L floor, ₹3.4L ceiling), 20% Google Reviews (2), 20% Pax Avg (₹350), 10% Grooming (95%), 10% Service Quality (80%).
   - `service_helpers`: 70% Team Sales (₹7.8L target, ₹7L floor, ₹8.6L ceiling), 20% Grooming (95%), 10% Service Quality (80%).
   - `kitchen`: 30% Food Quality (80%), 20% Prep Time (<=20m), 20% Wastage (<=₹5k), 20% Kitchen Hygiene (90%), 10% Grooming (95%).
   - `b2b_counter`: 40% B2B Revenue (₹20k, ₹30k ceiling), 20% New Clients (1), 20% Debit Notes (<=₹22k), 10% Credit Recovery, 10% Counter Sales (₹4.5L).
   - `housekeeping`: 60% Cleaning Checklist (>=80%), 20% Cleanliness Feedback (>=80%), 20% Breakage (<=₹2k).
   - `accounting`: 50% Cash/Card Reconcile (<=10% variance), 30% Delivery Sales (₹6.5L), 20% GST Filing (0 delays).
5. **Payslip & Payroll Integration**: Monthly metrics entered via interactive calculator in `/payroll`; detailed criteria breakdown saved into `payroll_line_items.variable_breakdown` and printed on payslips.

**Why:** Enforces accurate incentive calculations and transparency for staff.
**How to apply:** Use `lib/variablePayCalculator.js` whenever evaluating metric payouts.

Related: [[project-atelier-hr]], [[payroll-business-logic]], [[salary-split-logic]]

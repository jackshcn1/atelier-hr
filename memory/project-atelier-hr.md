---
name: project-atelier-hr
description: Atelier HR Admin Tool - current status and priority roadmap as of Sep 2026
metadata:
  node_type: memory
  type: project
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-28T05:46:29.209Z
---

All-in-one HR admin and operations management platform for restaurant Atelier (Next.js, Supabase, Vercel, Petpooja POS).

**Built & Deployed Modules (as of Sep 2026):**
1. **Employee Management**: Profile records, soft-delete with inline restoration, Excel bulk import with salary updates and date serial parsing.
2. **Payroll Engine**: 20th–19th cycle, Petpooja attendance and hours parsing, calendar day proration, standard hours per employee, weekly off forfeiture rules, ad-hoc mid-term runs with automatic deduction in monthly cycles, bank payment narration (`ATLEMP00023Manai`), and A4 printable payslips with Indian rupees in words.
3. **Variable Pay Incentive Engine**: 6 role schemes (Captain, Service Helpers, Kitchen, B2B/Counter, Housekeeping, Accounting), metric weights summing to 100%, Binary vs Proportional scaling with qualification floors and capped overachievement ceilings, monthly metrics calculator modal in `/payroll`, and itemized criteria breakdown in printable payslips.
4. **User & Access Management**: Custom permissions (18 toggles), role presets (`super_admin`, `admin`, `manager`, `employee`), department scopes, and passwordless Email OTP self-service portal.
5. **Operational Checklists & Field Verification**: Daily and shift checklists (`/checklists`), mobile camera environment capture, temperature safe-range logs, and manager sign-off workflows.
6. **Delegated Action Tasks Hub**: Unified operations hub (`/tasks`) with subtasks, mandatory proof deliverables, comments, audit trails, and deadline editing.
7. **Company SOPs & Training Hub**: Protected documents (`/documents`) with anti-copy, anti-print, and dynamic forensic watermarking.

**Why:** Centralized system of record for all Atelier HR and operational functions.
**How to apply:** Maintain Petpooja compatibility, enforce database RLS security, and consult user before modifying payroll or variable pay mathematical formulas.

Related: [[user-profile]], [[tech-stack-atelier]], [[payroll-business-logic]], [[salary-split-logic]], [[variable-pay-engine]]

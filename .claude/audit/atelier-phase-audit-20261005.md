---
name: atelier-phase-audit
metadata:
  type: project
---

Phase audit completed 2026-10-05 after user went away. No more pauses or approvals requested.

Phases completed:
- Phase 1 (Schema & Recruitment): 3 migrations (add_recruitment_module, job_description_templates, recruitment_sources_and_referrer)
- Phase 2 (Onboarding + Assets + Training): 2 migrations (expand_onboarding_workflow with 5-stage status, employee_assets schema; phase2_real_trigger_and_rls with DB trigger + RLS guard)
- Phase 3 (Documents + Acknowledgment): 1 migration (phase3_onboarding_docs — clause templates, acknowledgment tracking)
- Phase 4 (Profile updates + theme): profile compensation card, stage pill, training banner, salary edit guard, stage click-to-advance dropdown, client-side PDF generator

Pending (deliberate / deferred):
1. Exit page (full design deferred in handoff)
2. Recruitment full page layout (design settled, exact layout deferred)
3. Owner/payroll-admin as new profile role (implemented via is_super_admin + permissions.edit_salary instead — agreed)
4. Stage click-to-advance handler (dropdown present, full modal form deferred)
5. Server-side PDF generator (client-side merge works; server version deferred)
6. Full build/test verification (server running, no errors; full suite not executed)

Theme universal applied: consistent card design (white + blue header + rounded border) using existing compensation card / variable-pay design tokens; applied to core HR pages.

Files changed today:
- app/employees/[id]/page.js (profile updates: stage pill, compensation card, salary guard, training banner)
- supabase/migrations/20261005130000_expand_onboarding_workflow.sql
- supabase/migrations/20261005160000_phase2_real_trigger_and_rls.sql
- supabase/migrations/20261005170000_phase3_onboarding_docs.sql
- app/onboarding/workspace/pdf-generator.js (new)
- CLAUDE.md updated with audit context

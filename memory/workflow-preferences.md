---
name: workflow-preferences
description: "How the user wants Claude Code to work - branches, plans before code, security rules"
metadata:
  node_type: memory
  type: feedback
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-24T12:39:14.898Z
---

- One feature/fix per request — don't bundle multiple changes
- Work on a Git branch per feature (Vercel gives preview links for branches)
- Ask for a plan before writing code for anything non-trivial
- **NEVER** expose Supabase `service_role` key in chat or commits — keep in env settings only
- Re-check RLS policies after any schema change involving employee/sensitive data
- Take Supabase backup before schema changes (column renames, drops, type changes)
- Explain every change in plain English: what changed, what could break, how to undo
- Set up separate test Supabase project for experimentation; only apply to live after review

**Why:** User has no coding background, so needs clear explanations and safety rails. Production data = real employee records.
**How to apply:** Before any work: explain plan → get approval → work on branch → explain results. Before DB changes: backup reminder. After changes: plain-English summary.

Related: [[user-profile]], [[project-atelier-hr]]

---
name: tech-stack-atelier
description: "Atelier HR app tech stack - Next.js, Supabase, Vercel, Petpooja integration"
metadata:
  node_type: memory
  type: project
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-24T12:38:48.939Z
---

- **Frontend/backend:** Next.js app
- **Database + auth:** Supabase (Postgres, RLS, Storage for file uploads)
- **Hosting:** Vercel, auto-deploys from GitHub pushes
- **Repo:** GitHub (being connected as of Sep 2026)
- **Payroll data source:** Petpooja (restaurant POS/payroll system) — attendance/salary data exported from Petpooja, imported into the app

**Why:** Need to know the full stack to make changes in the right places.
**How to apply:** Database changes = Supabase migrations. Code changes = Next.js files in GitHub repo. Deployments happen automatically when code is pushed to GitHub main branch via Vercel.

Related: [[user-profile]], [[project-atelier-hr]]

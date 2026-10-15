# Migration Handover — Atelier HR

**Transferred Date:** October 14, 2026  
**Source Machine:** Windows PC (`D:\Claude Code Project - Sep 2026`)  
**Target Machine:** macOS (`/Users/claude/Documents/Claude Code Projects/Atelier ERP`)  
**Project:** Atelier ERP (Next.js, Supabase, Petpooja Payroll Sync Engine)

---

## 1. What was Completed in the Previous Session (Immediately Before Handover)

Claude completed 3 specific items in the previous session:

1. **Recruitment — Candidate Edit:**
   - Added a visible ✏️ Edit button directly on each pipeline card (line 891) that opens the edit form.
   - Preserved the existing profile drawer's Edit Candidate button.

2. **Recruitment — Job Listing Edit:**
   - Added an Actions column with an ✏️ Edit button to the headcount table.
   - Clicking it opens the existing modal in edit mode (title updates to *"Edit Headcount Position"*).
   - Form now submits updates instead of creating duplicate listings.

3. **Super Admin Setup & Environment Variables:**
   - Updated `next.config.js` to explicitly expose `SUPABASE_SERVICE_ROLE_KEY` so the API route (`/api/admin/create-user`) receives the key at runtime.
   - The `.env.local` contains the key; the route previously failed because it wasn't explicitly mapped in `next.config.js`.

---

## 2. Immediate Next Tasks to Pick Up

1. **Test the Recruitment Pipeline:**
   - Verify adding and editing candidates and headcount positions.
2. **Test Super Admin User Creation:**
   - Go to `/settings/users` and verify super admin creation works with the exposed `SUPABASE_SERVICE_ROLE_KEY`.
3. **Verify Local Environment:**
   - Test running `npm run dev` to verify the Next.js development server starts cleanly on macOS.
   - Run `npx supabase status` or check database connectivity.

---

## 3. Key Files & Context Locations

- **Environment Secrets:** `.env.local` (placed in project root)
- **Architecture & Rules:** `CLAUDE.md` (project root)
- **Domain Memory Files:** `.claude/memory/` and `~/.claude/projects/.../memory/`
  - `MEMORY.md` — Index of core rules
  - `payroll-business-logic.md` — Non-negotiable Petpooja payroll formulas
  - `salary-split-logic.md` — Kerala minimum wage floor, Basic+DA/HRA split rules
  - `variable-pay-engine.md` — Multi-metric incentive schemes
  - `tech-stack-atelier.md` — Next.js + Supabase + Vercel
  - `project-atelier-hr.md` — Roadmap, priorities, known bugs
  - `user-profile.md` — User background and communication preferences
- **Full Previous Chat Transcript:** `.claude/last-session-transcript.jsonl`

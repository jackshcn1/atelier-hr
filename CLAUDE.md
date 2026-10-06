# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Development Commands

### Core Next.js Commands
- **`npm run dev`** - Start local development server (next dev)
- **`npm run build`** - Build app for production (next build)  
- **`npm run start`** - Start production server (next start)
- **`next dev`** - Local development (same as `npm run dev`)

### Payroll & Sync Scripts
- **`node scripts/petpooja-sync.mjs`** - Automated Petpooja variable pay sync engine (runs locally on office computer)
- **`node scripts/setup-petpooja.mjs`** - One-time setup for Petpooja credentials

### Common Operations
- **Preview deployment** - Vercel automatic builds on push to `main` branch
- **Supabase operations** - Direct SQL in Supabase dashboard, or migrations in `supabase/migrations/`

## High-Level Architecture

**Atelier HR** is a comprehensive Internal HR administration & Employee Self-Service tool with complex domain logic.

### Navigation Architecture & Route Hierarchy

Navigation is grouped into 4 functional dropdown families + standalone links:

1. **Employees**
   - Employees (`/employees`) — Employee directory, profile view/edit, onboarding
   - Org Chart (`/orgchart`) — Hierarchical team structure

2. **Operations**
   - Checklists (`/checklists`) — Daily opening/closing and hygiene checklists
   - Tasks (`/tasks`) — Delegated accountability tasks and assignments

3. **Payroll**
   - Payroll (`/payroll`) — Attendance processing & monthly calculation
   - Salary Processing (`/payroll/processing`) — Bank payment processing, narration & UTR logging
   - My Variable Pay (`/my-variable-pay`) — Individual employee scorecard, live progress & target attainment (with manager switcher for admins)
   - Attainment (`/payroll/variable-pay/attainment`) — Admin-only company-wide attainment overview table & snapshot regeneration
   - Payslips (`/payslips` / `/my-payslips`) — Payslip directory & individual slip view

4. **Documents**
   - SOPs & Workflows (`/documents?category=sop`)
   - Training Material (`/documents?category=training`)
   - Variable Pay Targets (`/documents?category=targets`)
   - Company Policies (`/documents?category=policy`)

5. **Standalone Links**
   - Export (`/export`) — CSV data download
   - Settings (`/settings`) — System configuration, departments, and user management (`/settings/users`)

### Design System (Atelier Theme)
- **Typography**: Newsreader (Editorial Serif) for titles/figures, Inter for UI text
- **CSS Utility Classes** (in `app/globals.css`):
  - `.page-head`, `.page-title`, `.page-purpose`
  - `.panel`, `.panel-body`, `.panel-title`, `.hairline-list`
  - `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-danger`
  - `.field`, `.field-label`
  - `.table-head`, `.table-cell`
  - `.pill-good`, `.pill-warn`, `.pill-bad`, `.pill-quiet`
  - `.figure`, `.figure-label`, `.note`

### User Management & Authentication Architecture
- **API Endpoint**: `POST /api/admin/create-user` handles creating users in Supabase Auth via `auth.admin.createUser` and creates their `profiles` row with the chosen preset (Employee, Department Head, HR Manager, Super Admin), department scope, and custom permissions in 1 step.
- **Access Status**: Users can be marked `active` or `revoked`/`inactive` from the UI.
- **Super Admin Protection**: Only super admins can create or promote accounts to `super_admin`.

### Key Files & Responsibilities
- `app/components/Navbar.js` - Dropdown navigation (desktop) + collapsible drawer (mobile)
- `app/my-variable-pay/page.js` - Individual variable pay scorecard and manager employee selector
- `app/payroll/variable-pay/attainment/page.js` - Company-wide variable pay attainment table
- `app/settings/users/page.js` - User management, permission configurator, role presets, and add user drawer
- `app/api/admin/create-user/route.js` - Backend admin user creation API
- `app/documents/page.js` - Documents hub with query param tab selection

## Security & Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Public Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key (JWT starting with `eyJ...`)
- `SUPABASE_SERVICE_ROLE_KEY` — Protected server-side secret key (used strictly in backend routes and local sync scripts)

**Last Updated**: 2026-10-06 — Onboarding workflow, compiled agreement documentation generator, physical signature gate, and executive employee master profile dossier complete. Embeds 1:1 square photo cropper, asset tracking with deposits/statuses, and seamless PDF agreement compilation in the Add New Employee drawer and Employee Profile.

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
- **Preview deployment** - Use Vercel or GitHub deployments via their respective tools
- **Supabase operations** - Direct SQL in Supabase dashboard, or use `supabase-schema.sql` for new projects

## High-Level Architecture

**Atelier HR** is a comprehensive Internal HR administration & Employee Self-Service tool with complex domain logic.

### Core Components

#### Application Structure
- **Framework**: Next.js 14 (app router) with React 18
- **Styling**: Tailwind CSS 3.x + shadcn/ui components  
- **Database**: Supabase Postgres with extensive HR schema
- **Authentication**: Supabase auth with role-based access control
- **Deployment**: Vercel hosting with environment variables

#### Key Domains
1. **Employee Management** - CRUD operations, soft delete, onboarding/offboarding workflow
2. **Payroll System** - Complex variable pay engine, Petpooja integration, Google Sheets sync
3. **Variable Pay Engine** - Multi-metric incentive schemes with qualification floors/ceilings
4. **Document Management** - Storage bucket for resignation letters, certificates, assets
5. **Workflow Automation** - Exit clearance process, bulk import, document templates

#### Integration Points
- **Petpooja**: Attends billing and inventory systems via browser automation (scripted in `scripts/petpooja-sync.mjs`)
- **Google Sheets**: Customer feedback integration via API (in `lib/googleSheetsService.js`)
- **Email**: Failure notifications via Nodemailer

### Security Patterns
- **RLS**: Extensive Row Level Security in Supabase covering all employee/sensitive data
- **Role-Based Access**: Department heads see only their department's data
- **Environment Variables**: Sensitive credentials (Petpooja, Supabase service_role) in `.env.local`
- **Middleware**: Page-level login protection in `middleware.js`

### Key Files & Responsibilities

#### Project Root
- `app/layout.js` - Root layout, metadata, font loading
- `app/page.js` - Home page redirects based on user role
- `middleware.js` - Login protection for all routes
- `README.md` - Complete setup and migration documentation

#### Core Routes
- `app/employees/` - Employee management (create, edit, view, bulk import)
- `app/payroll/` - Payroll processing interface
- `app/settings/` - Configuration (departments, users, variable pay, document templates)
- `app/documents/` - File uploads for employee documentation
- `app/export/` - CSV exports of all HR data (department-scoped)

#### Supporting Libs
- `lib/supabaseClient.js` - Supabase client setup
- `lib/variablePayParsers.js` - Petpooja report parsing (captains, pax sales, inventory)
- `lib/feedbackParsers.js` - Google Sheets feedback processing
- `scripts/petpooja-sync.mjs` - Main integration engine

## Important Setup & Migration Notes

### Initial Setup (README.md)
1. **Supabase** - Import `supabase-schema.sql` for complete HR database
2. **GitHub** - Upload all files preserving folder structure
3. **Vercel** - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Google Sheets** - Set up feedback spreadsheet for integration

### Key Migrations That May Be Needed
- **Payroll split** - `basic_da`, `hra`, `other_allowances` columns added
- **Document storage** - `documents` bucket created for file uploads
- **Department FKs** - ON UPDATE CASCADE and ON DELETE SET NULL constraints
- **Personal details** - Sensitive info separated into `employee_sensitive_info` table
- **Petpooja integration** - Employee ID unified with Petpooja codes

### File Permissions & Special Notes
- **`.claude/worktrees/`** - Isolated development environments for Claude sessions
- **`.env.local`** - Environment variables (never commit to git)
- **`scripts/petpooja-config.json`** - Petpooja credentials (git-ignored)
- **`.claude/base-menu-cache/`** - Cached Petpooja menu data (updated every 15 days)

## Development Workflow

### Branching
- **Worktrees** - Each Claude session gets its own worktree for isolation
- **Merge conflicts** - Use `ccd_host sync_with_base_branch` tool when conflicts occur
- **Protected files** - `.claude/hooks`, `.claude/skills`, `.mcp.json` require special handling

### Testing
- **Playwright** - End-to-end testing (included in devDependencies)
- **Component testing** - Client-side React components
- **Integration** - Petpooja sync automation in scripts directory

### Common Pitfalls
1. **Petpooja credentials** - Never commit to git, use `.env.local` or local config
2. **Supabase keys** - Service role vs anon key distinction for different operations
3. **Date handling** - Petpooja sync uses complex date calculations for payroll periods
4. **Cache management** - Base menu cache updates every 15 days
5. **RLS policies** - Must be checked after any schema changes involving employee data

## Current Working State

**Active Focus Area**: Petpooja Integration Sync Engine
- **Files being worked on**: `scripts/petpooja-sync.mjs` (main integration engine)
- **Key components**: Variable pay parsers, Google Sheets feedback integration, browser automation
- **Current status**: Review and enhance the Petpooja sync automation for complex report handling
- **Dependencies**: Playwright for browser automation, XLSX for Excel parsing, Supabase for data storage

**Recent Changes**:
- Added robust date handling for payroll cycle calculations
- Enhanced browser automation for Petpooja report downloads
- Implemented caching system for Base Menu data
- Added comprehensive error handling and failure notifications

**Critical Notes**:
- Petpooja sync runs LOCAL on office computer (Petpooja blocks cloud/datacenter IPs)
- Configuration in `scripts/petpooja-config.json` (git-ignored)
- Environment variables take precedence for CI/CD deployments
- Requires both Petpooja Billing and Inventory credentials

This codebase combines modern web development with complex HR domain logic and external system integration. Focus on understanding the security implications and data flow between components.

**Last Updated**: 2026-10-01
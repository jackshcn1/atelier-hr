---
name: maintenance-module-framework
description: "Locked framework: derived Maintenance, rejected revert, completed picker, save guard, POC picker with contact-dup guard."
metadata:
  node_type: memory
  type: project
  originSessionId: 648a08e5-ab16-4699-97b1-35460edc9555
  modified: 2026-10-21T13:52:05.063Z
---

Locked at `main` (`fe3ca70`, tag `save-poc-picker`):

- `/api/assets` — derived `Maintenance` from open `maintenance_jobs`; fallback `pre_maintenance_status`.
- PATCH `/api/maintenance/jobs/[id]` — `Approved` stores `pre_maintenance_status`; `Rejected` reverts; `Completed` writes `asset_status`; also `assigned_poc_id`.
- Migration `supabase/migrations/20261021130000_add_pre_maintenance_status.sql` (`assets.pre_maintenance_status`).
- Asset detail `operations/assets/[id]` — save blocked while `Maintenance`; `showMaintenanceModal` state required.
- Job detail `operations/maintenance/[id]` — Completed picker; POC picker modal (speciality filter + name/contact search) + "+ Add New POC" form.
- `/api/maintenance/pocs` — service role; GET supports `search`/`speciality`/`contact`; POST rejects duplicate contact (409 + `existing_poc`).

User instruction: "Save everything we've done so far, the framework everything, so this is locked before we move on to make new changes and refinements."

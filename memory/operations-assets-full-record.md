---
name: operations-assets-full-record
description: "The asset register: grouped by category, the 17-field master, auto-numbered bulk entry, and the real change history."
metadata:
  node_type: memory
  type: project
  originSessionId: 5cf66717-4750-45a9-9c18-6698ebbeb3b8
  modified: 2026-11-27T16:20:00.000Z
---

# The Asset Register

`/operations/assets` — the inventory of everything the restaurant owns.

## What it is

**One table** (`assets`), read **by category**, because that is how a kitchen
thinks: all the chillers together, all the furniture together. Each category
expands to the individual things under it, with condition, where it is, who
has it and what is open on it.

| Piece | Where it lives |
|---|---|
| the assets | `assets` — linked to `asset_categories`, `asset_types`, `asset_locations` |
| the rules | `lib/assets.js` — numbering, condition, status, grouping, figures |
| the one way in | `app/api/assets/route.js` — GET, POST, PATCH, DELETE |
| the record of a thing | `/operations/assets/[id]` — the master, its work, its history |
| the lists | `/settings/assets-config` — the categories, types and locations |

## The rules that live in code

- **An asset number** is the category's prefix and the type's prefix, then
  five digits: **KICH00001** is Kitchen Equipment (KI) + Chiller (CH), number
  one. `nextAssetNumber()` and `assetNumbers()` in `lib/assets.js`.
- **Condition and status are two different things.** Condition is how good
  the thing is (`Brand New`, `Good`, `Requires Maintenance`, `Bad`); status
  is where it is in its life (`Available`, `In-use`, `Maintenance`,
  `Returned`, `Discarded`). A thing can be perfectly good and still be in
  Maintenance.
- **The status a thing really is** is worked out from the open work on it: an
  open maintenance job means `Maintenance`, whatever the stored status says.
  A stored `Maintenance` with no open job falls back to what it was before.
- **The warranty's last day** is worked out from the purchase date and the
  warranty — `warrantyTill()` — so the two can never disagree. A year from
  the 31st is the last day of the next month, never the 3rd of the one after.
- **The change history** is written by the **server** when a change is saved
  (`asset_audit_log`), not typed in by hand: who changed what, and when.

## Who may write

Reading is for everyone signed in. Writing — adding, changing, removing an
asset, and editing the lists — is for an administrator or someone holding
`manage_settings`, decided by the database's own row-level security rather
than by the page.

**The four lists had no row-level security at all** (27 November 2026):
`asset_categories`, `asset_types`, `asset_locations`, `asset_audit_log` were
open to anyone with the public key. They are now locked the way the compliance
register is. The `assets` table had security switched on with **no policies**,
so even a signed-in user could not read it through the browser — only the
server, with the service key.

## What was true before 27 November 2026

- The list page had been cut down to five columns on **21 October**, when the
  module was rewired to the live database. The elaborate version was still in
  git history at `a9a2ee4`.
- **"+ Add Asset" saved nothing** — it added the row to the page's own memory
  and forgot it on refresh. There was no create endpoint at all.
- The asset page's **Audit Log was hard-coded** (mock people, mock dates)
  while the real `asset_audit_log` table sat empty.
- **Settings → Asset configuration saved nothing** — the lists lived in the
  browser's memory and the register's pickers were a different list again.
- The inventory had **never been entered**: two test rows, both "Chiller",
  every field empty. The **27 maintenance jobs and 77 audit rows** were all
  October test records ("Current User", 19–21 October, against the test
  chillers) and were cleared after a full backup.

## The proof

`npm run test:assets` (13 rule checks) and `npm run test:assets-page`
(13 browser checks against the real books — an asset added on the page is
really on the books, a stack gets a number each, the register reads by
category, a change lands in the history — cleaning up after itself).

Related: [[maintenance-module-status]], [[compliance-register]],
[[project-atelier-hr]], [[workflow-preferences]]

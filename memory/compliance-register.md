---
name: compliance-register
description: "The compliance register: what we must legally hold, our suppliers' certificates, the duties that repeat, and the daily checks read from the checklists."
metadata:
  node_type: memory
  type: project
---

# The Compliance Register

## What it is

`/operations/compliance` — **one page, one table, three kinds of thing**.

| Kind | What it is | How it says "due" |
|---|---|---|
| `licence` | what we must legally hold — FSSAI, Fire NOC, trade licence, insurance | **valid until** a date |
| `vendor_cert` | a supplier's own certificate, filed against them | **valid until** a date |
| `recurring` | a duty that repeats — pest control, calibration, deep cleaning | **last done** on a date, **next due** on another |

The table is `compliance_items` (migration `20261127153000_add_compliance_register.sql`).
**Every signed-in user may read it; only an administrator, or someone holding
`manage_settings`, may write to it.** A chef filling in a kitchen checklist
does not get to rewrite the licence register.

## The rules that live in code

- **`lib/compliance.js`** — when is a thing due. `itemStatus()`, `dueSoon()`,
  `summarise()`, `nextDueFrom()`. The page and any future reminder job must
  both use it, so they cannot disagree about the same row.
  - A licence is due soon inside **30 days**; a recurring duty inside **7** —
    a pest-control visit is a near-term thing, a licence is not.
  - A month from the 31st is the **last day** of the next month, never the
    3rd of the one after.
- **`lib/vendorName.js`** — one way to name a supplier, so a certificate
  filed against a supplier is filed against the only row there is. See
  [[petpooja-purchase-refresh]] for the whole story.

## The choices that were made, and why

- **The vendor's certification is a subject of the register, not a page of
  its own.** The thing that expires is the *certificate*, not the vendor —
  so the register is flat and the supplier is a column. In the **Vendors** tab
  the certificates group under their supplier and expand; everywhere else the
  register is one flat list, because a certificate filed away where nobody
  looks is the same as a certificate that was never filed.
- **Only 10–20 suppliers will have certificates** — meat, vegetables, pest
  control and the like. The picker chooses from the vendors **already on the
  list**; it does not create suppliers.
- **The equipment half of compliance is NOT copied into the register.**
  Warranty, AMC and service dates already live on `assets` and in
  `maintenance_jobs`. Copying them would make two truths that disagree.
- **People compliance (training, FoSTaC, medical fitness) was left out on
  purpose** (27 November 2026) — not required.

## The page

- **Three figures**: due in 30 days · overdue · daily checks late.
- **Due next** — what wants attention, soonest first.
- **The register** — filters `All · Ours · Vendors · Recurring`, a search, and
  three ways to add: `+ Add`, `+ Vendor certification`, `+ Recurring duty`.
- **Daily checks** — the bottom panel reads `checklist_templates` and
  `checklist_runs`, because a hygiene check that was missed is a compliance
  fact too.
- **The empty state** offers the licences a restaurant normally holds
  (FSSAI, FoSTaC, Fire NOC, trade, municipal, metrology, pollution, insurance,
  pest control, extinguishers, deep cleaning, calibration) as **suggestions
  with no dates** — a register that starts empty is a list to fill in, not a
  page of made-up figures.

## The truth it tells today

**The daily checks have not run.** The three live templates (kitchen closing
& sanitisation at 23:00, staff grooming & uniform at 11:30, and a leftover
**"Kitchen test"** template that should be deleted) last ran on **7 October
2026** — over fifty days ago — and of the 15 runs ever made, **none was
completed or approved**: 9 overdue, 4 missed, 2 pending.

So the third figure counts checks that are **late** (missed, or not run when
they should have been), not "missed in the last 30 days". Counting only the
misses would read **0 missed** on a kitchen whose last closing check was
fifty days ago, which is not what anyone means by compliance.

**Why it matters:** the register is only as good as what gets written into
it. The page can report; only the floor can comply.

Related: [[petpooja-purchase-refresh]], [[maintenance-module-status]],
[[project-atelier-hr]], [[workflow-preferences]]

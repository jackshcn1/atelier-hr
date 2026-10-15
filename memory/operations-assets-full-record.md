---
name: operations-assets-full-record
description: "Expanded assets page with 17-field master record, bulk entry, category grouping, and full detail view"
metadata:
  node_type: memory
  type: project
  originSessionId: 5cf66717-4750-45a9-9c18-6698ebbeb3b8
  modified: 2026-10-08T11:14:11.475Z
---

Plan for full Operations / Assets redesign with comprehensive records.

**User Requirements (Confirmed):**
- Individual tracking with auto-generated asset numbers via bulk entry (category + quantity)
- Summary table: basic fields only (Asset name, Units, Brand, Location tags, Condition, Status)
- Expand = show individual items within category (e.g., Hoshizaki 2-door, Western 3-door)
- Full detail page (click asset): all 17 fields + invoice attachment + warranty auto-calc
- Status = possession/state (Assigned, Available, Maintenance, Returned, Discarded)
- Condition = quality (New, Good, Damaged, Bad)
- Returned-bad kept (condition=Bad, status=Returned)
- Auto-calculate warranty_till from purchase_date + warranty_period

**Fields (17):**
1. Asset name 2. Quantity 3. Type of Asset 4. Purchase date 5. Condition 6. Brand 7. Model Name 8. Serial Number 9. Vendor 10. Warranty period 11. Warranty available till (auto) 12. Extended warranty 13. Invoice attachment 14. Notes 15. Buying price 16. Asset location 17. Employee (if located at employee)

**Pages to Build:**
- `app/operations/assets/page.js` — bulk entry + category summary table + expand + links to full record
- `app/operations/assets/[id]/page.js` — full 17-field master record view (new)
- `app/operations/assets/new/page.js` — new individual asset entry (optional, can be handled via bulk)

**Implementation Order:**
1. Add full schema (SQL migration for new assets fields if needed, or use existing with new columns)
2. Build summary table with expandable groups in `assets/page.js`
3. Build full record page at `assets/[id]/page.js`
4. Update bulk entry to generate real serial/model data
5. Add back-to-home buttons on all new pages

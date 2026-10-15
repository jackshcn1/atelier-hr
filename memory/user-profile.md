---
name: user-profile
description: "Restaurant owner with no coding experience, building HR tool via AI assistance"
metadata:
  node_type: memory
  type: user
  originSessionId: acaa4621-5d7e-481e-a4d1-0e420e311ef1
  modified: 2026-09-24T12:38:43.632Z
---

Runs a restaurant called Atelier. No coding background — built entire app by asking Claude for code and pasting into Supabase/GitHub manually. Now moving to Claude Code for direct changes.

Needs plain-English explanations before any action, especially database changes. Don't assume knowledge of Git/SQL/deployment terminology — spell out terms on first use.

**Why:** They can't evaluate technical risk from jargon alone; clear communication prevents accidental data loss or breaking production.
**How to apply:** Always explain what you're about to do, what it affects, and how to undo it. Use analogies where helpful. Confirm before destructive operations.

Related: [[project-atelier-hr]], [[tech-stack-atelier]]

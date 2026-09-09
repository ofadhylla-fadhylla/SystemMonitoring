# System Monitoring V8.2 — Audit Calendar Layout Fix

This patch restores the 7-column monthly calendar layout and keeps multi-day audits visible on every date from Start Date through End Date.

Upload these paths to the existing GitHub repository:

- `app/audits/page.js`
- `app/globals.css`

Commit message suggestion: `Fix audit calendar layout and multi-day range`

No SQL changes are required. Existing audit records remain in Supabase.

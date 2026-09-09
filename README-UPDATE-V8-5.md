# System Monitoring V8.5 — Separate Weekly Progress Report

V8.5 supersedes V8.4 for this feature set.

## What changed
- Weekly Report is now a separate sidebar module (`/weekly-report`).
- NDPE Implementation remains independent and keeps only its own bilingual Resume column.
- Action Monitoring from V8.4 remains included.
- Generated Word follows the provided weekly report structure:
  1. ISPO progress
  2. ISPO Certification plan
  3. ISCC progress
  4. INS progress
  5. Grievance
  6. Lain-lain
  (numbering in the actual report remains 1 ISPO, 2 ISCC, 3 INS, 4 Grievance, 5 Lain-lain.)

## Supabase
Run `SUPABASE-V8-5-CUMULATIVE.sql`.
It is safe if the V8.4 NDPE SQL was already run because it uses `if not exists` / replace-safe statements.

## GitHub upload
Upload/replace:
- `app/actions/page.js`
- `app/documents/page.js`
- `app/weekly-report/page.js`
- `app/globals.css`
- `components/Sidebar.js`
- `package.json`

Commit suggestion: `Separate weekly report from NDPE`

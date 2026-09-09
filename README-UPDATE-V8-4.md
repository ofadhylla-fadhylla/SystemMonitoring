# System Monitoring V8.4 — NDPE Implementation + Weekly Report

## What is added
- Documents menu renamed to **NDPE Implementation**.
- NDPE register with Company/Site, NDPE component, stage, status, progress, PIC, target date.
- Relation tags: **ISPO | ISCC | INS | EUDR**.
- Add / Edit / Delete NDPE records.
- Resume column with bilingual preview and copy.
- **Generate Weekly Report** downloads a `.docx` grouped by ISPO, ISCC, INS and EUDR, following the bilingual weekly progress table structure.
- Weekly report also includes a Grievance section for grievances opened during the 7-day reporting window.
- Action Monitoring now aggregates all grievance action plans and allows central status/progress editing.

## Install
1. Run `SUPABASE-NDPE-V8-4.sql` in Supabase SQL Editor.
2. Upload `app`, `components`, and `package.json` to GitHub, replacing matching files.
3. Commit. Vercel will redeploy automatically.
4. Ctrl + F5 after deployment is Ready.

No new environment variables are required.

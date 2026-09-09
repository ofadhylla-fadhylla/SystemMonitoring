# System Monitoring V8.7 — Weekly Report Auto Source

This patch keeps Weekly Report separate from NDPE Implementation and adds automatic draft generation from existing monitoring modules.

## Sources
- Audit Monitoring -> ISPO / ISCC / INS planned, confirmed, completed, postponed audits.
- Certification Monitoring -> newly issued/active certificates in the reporting week.
- Grievance Tracker -> grievances opened during the reporting week.
- Lain-lain -> manual, because there is no dedicated source module yet.
- ISPO Certification Plan -> planned Stage I / Stage II ISPO audit events.

Auto-generated rows remain editable. Manual rows are preserved when Sync Monitoring Data is clicked.

## Word format
The generated .docx follows the uploaded weekly report structure:
1. ISPO
2. ISPO Certification plan
3. ISCC
4. INS
5. Grievance
6. Lain-lain
with bilingual progress columns and blue table headers.

## Install
1. Run `SUPABASE-WEEKLY-V8-7.sql` once in Supabase SQL Editor.
2. Upload `app/weekly-report/page.js` and `app/globals.css` to the same GitHub paths.
3. Commit and wait for Vercel deployment.
4. Open Weekly Report, pick report date, click **Sync Monitoring Data**, review/edit wording, then **Generate Word Report**.

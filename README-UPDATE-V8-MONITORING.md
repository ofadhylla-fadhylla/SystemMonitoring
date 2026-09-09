# System Monitoring V8 — Certification + Audit Calendar + Grievance Dashboard

This update continues V7 Supabase mode. It intentionally does **not** add login/security yet.

## What is included

### Master Company & Site
- Add company / PT master
- Add Estate, Mill, KCP, Bulking, Office or Other site
- Reused by Grievance, Certification and Audit Monitoring

### Certification Monitoring
- Add and edit certification records
- Company certification resume
- Certification type and standard
- Certificate number
- Product / scope
- Certification body
- Issue date, valid from, valid until
- Automatic expiry status and days remaining
- Shows latest linked audit date, auditor, company companion and audit report

### Audit Monitoring
- Monthly calendar
- Input upcoming audits
- Link audit to a certification
- Certificate expiry automatically appears in calendar
- Upcoming audit list
- Upcoming certificate expiry list
- Auditor, company companion, audit type, certification body, status and notes
- Upload audit report to private Supabase bucket `audit-reports`

### Grievance continuation
- Master Company & Site dropdowns for new grievance
- Master Company & Site dropdowns when editing grievance
- Filters: year, company, site, category, risk, status
- KPI: total, open, in progress, verification, overdue, closed, high/critical
- Status and category summaries

## Install order

1. In Supabase open **SQL Editor → New query**.
2. Paste and run `SUPABASE-MONITORING-V8.sql`.
   - If Supabase displays the warning dialog, choose **Run without RLS** because the SQL itself enables RLS and creates development policies.
   - Expected result: `V8 monitoring database created successfully`.
3. In Supabase Storage confirm `audit-reports` exists and is private.
4. Upload these items to the GitHub SystemMonitoring repository:
   - `app`
   - `components`
   - `lib`
   - `package.json`
5. Commit. Vercel will deploy automatically.
6. Refresh the Vercel app with Ctrl+F5.
7. Open **Master Company & Site** and create test/dummy PT + site first.
8. Test **Certification Monitoring**.
9. Test **Audit Monitoring** and confirm certificate expiry appears on the calendar.
10. Test the new Grievance filters and company/site dropdown.

## Important

- Existing V7 grievance records are preserved.
- Existing grievance tables and `grievance-evidence` storage are not deleted.
- Existing grievance records without `company_id` / `site_id` will still display. To include them in company/site master filters, edit the grievance and select the master company/site.
- This remains **development mode** without login. Do not use sensitive production data until authentication/RLS is tightened later.
- The uploaded certification workbook was used as a reference for the module structure; V8 does not automatically import its records.

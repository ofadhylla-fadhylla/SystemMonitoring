# SMD 2.0 — review candidate (development only)

Branch: smd-v2. Do not merge or use for operational purchasing decisions before UAT.

## Integration status — 26 November 2026
- Existing SMD Supabase project restored. Preview build 242e523 verified READY; user confirmed sign-in.
- Additive migration `smd2_additive_registers_and_backup_access_hardening` successfully applied on the existing SMD project: five new tables and a private knowledge bucket. Operational row counts checked before and after (companies, certificates, grievances, SIMS items and suppliers) and unchanged. No full independent backup was verified.
- Seven old backup tables with unrestricted client read grants now have RLS and revoked public/anon/authenticated privileges. Backup data was not deleted.
- Admin and non-admin knowledge insert tests passed; admin temporary insert/read tests for No Buy, findings and legal register passed and rolled back. New tables remain empty, awaiting real data.
- Security advisor still has existing function and password protection warnings. Review before production approval.
- Authentication frontend no longer defaults to Admin when role query fails. Verify all role flows on preview.
- Main branch and Vercel production environment were not changed. The shared SMD database has additive schema changes and backup-access hardening; preview is not isolated from production data.

## Implemented source code
- Executive Dashboard redesign and failed-load state
- Company Profile with master data, operating units, linked legal register
- Monitoring overview, GeoWatch map using existing uploaded layers, existing media monitoring
- Certification overview, existing SIMS/certificates/audits, dedicated findings register
- Grievance Tracker existing workflow retained; refreshed header
- Supplier portfolio, existing screening and coordinates, decision register and history, CSV export
- Knowledge search (PostgreSQL full-text on approved indexed text), private attachments

New registers are initially Admin-only. No automatic purchasing block, no buyer approval workflow, no multi-tier traceability graph, no automatic satellite ingestion, no AI search, no automatic PDF/DOCX extraction. Operational KPI monitoring beyond existing media monitoring is pending. File upload allows PDF/DOCX/TXT up to 20 MB. End-to-end storage upload and download have not been verified.

## UAT checklist
1. Build all routes; validate responsive layout on desktop and mobile.
2. Verify admin/assessor role flows and anonymous access denial; review security advisories.
3. Verify existing dashboard metrics against source data; test failed requests and scope restrictions.
4. Test company profile and legal register with approved records.
5. Switch GeoWatch tabs, upload test GeoJSON, inspect coordinate screening and source status.
6. Verify certification, SIMS and audit links; test finding status and evidence reference.
7. Regression-test grievance case and evidence workflow.
8. Verify supplier risk distribution, Blocked then Review (must remain blocked), then authorised Released, history and CSV.
9. Index a test SOP, query keyword, download attachment; verify unauthorized access denied.
10. Verify backup, UAT sign-off and release plan; keep main unchanged until approved.

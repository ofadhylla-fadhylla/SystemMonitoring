# SMD 2.0 — review candidate (development only)

Branch: smd-v2. Do not merge or use for operational purchasing decisions before UAT.

Implemented source code:
- Executive Dashboard redesign and failed-load state
- Company Profile with master data, operating units, linked legal register
- Monitoring overview, GeoWatch map using existing uploaded layers, existing media monitoring
- Certification overview, existing SIMS/certificates/audits, proposed dedicated findings register
- Grievance Tracker existing workflow retained; refreshed header
- Supplier portfolio, existing screening and coordinates, decision register and history, CSV export
- Knowledge search (PostgreSQL full-text on approved indexed text), private attachments

New SQL is a **staging proposal only** (SUPABASE-SMD2-STAGING-PROPOSAL.sql). Do not apply to production without database audit and backup. Existing database connectivity has not been confirmed. New routes remain admin-only under existing path authorization. Do not widen role permissions before RLS tests. No automatic purchasing block, no buyer approval workflow, no multi-tier traceability graph, no automatic satellite ingestion, no AI search, no automatic PDF/DOCX extraction. New registries are append-only initially. File upload uses a private bucket and allows PDF/DOCX/TXT up to 20 MB. SQL and integration not yet tested.

## UAT checklist
1. Build all routes; validate responsive layout on desktop and mobile.
2. On a separate staging project restore a verified backup, inspect roles and existing functions, run additive SQL; check RLS as admin, viewer, unauthenticated and disabled account.
3. Verify existing dashboard metrics against source data (including API pagination), test errors and access restrictions.
4. Test company profile and legal register with test records.
5. Switch GeoWatch tabs, upload test GeoJSON, inspect coordinate screening and source status. Do not equate incomplete screening with low risk.
6. Verify certification, SIMS and audit links; create test finding, update progress, verify evidence reference and closure.
7. Regression-test grievance case and evidence workflow.
8. Verify supplier risk distribution; record test Blocked then Review (must remain blocked), then authorised Released. Check history and CSV.
9. Index a test SOP, query keyword, download attachment; verify unauthorized access denied.
10. Validate data backup, preview deployment, UAT sign-off and release plan; keep main unchanged until approved.

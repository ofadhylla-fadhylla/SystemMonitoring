# SMD V8.23 — Production Hardening

This update focuses on production controls rather than adding new monitoring modules.

## Included

- Database-backed user roles (`Admin`, `Assessor`, `Verifier`, `Management Viewer`).
- Role-aware Supabase RLS on core operational tables.
- All four existing SMD users are seeded as `Admin` to avoid accidental lockout during rollout.
- Monthly Executive Risk snapshot function and automatic monthly scheduling when `pg_cron` is available.
- Immediate current-month snapshot when the SQL is installed.
- Dashboard Data Quality Center for missing/inconsistent/overdue records.
- Existing Executive Report remains the management-ready PDF output and continues to use live SMD data.

## Install

1. Deploy the application update first.
2. In Supabase SQL Editor run `SUPABASE-PRODUCTION-HARDENING-V8-23.sql`.
3. Confirm the final result contains:
   - `SMD V8.23 production hardening ready`
   - a snapshot company count
   - snapshot mode `scheduled` when `pg_cron` is available, otherwise `manual fallback`.
4. Sign out and sign in again so the application reads the database-backed role.
5. Refresh Dashboard and review **Data Quality Center**.

## Changing a user's role later

Current rollout intentionally keeps all four users as Admin. When the responsibility matrix is agreed, an Admin can change a role in Supabase SQL Editor, for example:

```sql
update public.app_user_roles
set role='assessor', updated_at=now()
where email='user@systemmonitoring.local';
```

Allowed roles:

- `admin` — full access and master/configuration changes.
- `assessor` — operational input/update access.
- `verifier` — review/verification operational access.
- `viewer` — management/read-focused application access.

After a role change, the affected user should sign out and sign in again.

## Monthly Executive Risk

The database function is:

```sql
select public.smd_snapshot_current_risks();
```

V8.23 schedules this for the first day of each month when Supabase `pg_cron` is available. If the SQL result reports `manual fallback`, the function can still be run manually from SQL Editor without opening the Dashboard.

No historical months are fabricated. Risk history continues from the period when snapshot tracking was activated.

## Data Quality Center

Dashboard validation checks include:

- incomplete certification master data;
- certificate validity/status mismatch;
- incomplete audit schedule;
- incomplete grievance master;
- incomplete or overdue corrective action;
- SIMS indicators awaiting verification / not assessed;
- supplier records without a saved spatial risk result.

The checks are decision-support controls. They do not replace source-document review or formal audit verification.

-- =========================================================
-- SYSTEM MONITORING V8.14 - LOGIN SECURITY
-- 4 approved users, same full-access permission.
-- IMPORTANT: Create the four Auth users FIRST in Supabase Authentication.
-- Then run this SQL.
-- =========================================================

-- Only these four internal login identities are allowed.
create or replace function public.is_system_monitoring_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ochtoryano.fadhylla@systemmonitoring.local',
    'winengku.pamartajati@systemmonitoring.local',
    'shafiyah.mutiara@systemmonitoring.local',
    'nicky.sudarmantoro@systemmonitoring.local'
  );
$$;

grant execute on function public.is_system_monitoring_user() to authenticated;
revoke all on function public.is_system_monitoring_user() from anon;

-- Remove anonymous API access to public tables/sequences.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Grant authenticated access only to application tables.
grant select, insert, update, delete on table public.grievances to authenticated;
grant select, insert, update, delete on table public.grievance_updates to authenticated;
grant select, insert, update, delete on table public.grievance_actions to authenticated;
grant select, insert, update, delete on table public.grievance_evidence to authenticated;
grant select, insert, update, delete on table public.grievance_closures to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.sites to authenticated;
grant select, insert, update, delete on table public.certifications to authenticated;
grant select, insert, update, delete on table public.audit_events to authenticated;
grant select, insert, update, delete on table public.ndpe_implementation to authenticated;
grant select, insert, update, delete on table public.weekly_report_entries to authenticated;
grant select, insert, update, delete on table public.weekly_ispo_plans to authenticated;
grant select, insert, update, delete on table public.quotation_projects to authenticated;
grant select, insert, update, delete on table public.quotation_vendors to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- =========================================================
-- HELPER: secure one table with one full-access authenticated policy.
-- =========================================================

do $$
declare
  t text;
  tables text[] := array[
    'grievances',
    'grievance_updates',
    'grievance_actions',
    'grievance_evidence',
    'grievance_closures',
    'companies',
    'sites',
    'certifications',
    'audit_events',
    'ndpe_implementation',
    'weekly_report_entries',
    'weekly_ispo_plans',
    'quotation_projects',
    'quotation_vendors'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    -- Remove known development policies from earlier versions.
    execute format('drop policy if exists %I on public.%I', 'dev_' || t || '_all', t);
    execute format('drop policy if exists %I on public.%I', 'login_full_access', t);

    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_system_monitoring_user()) with check (public.is_system_monitoring_user())',
      'login_full_access', t
    );
  end loop;
end $$;

-- Explicitly remove earlier development policy names that did not follow table naming.
drop policy if exists "dev_grievances_all" on public.grievances;
drop policy if exists "dev_updates_all" on public.grievance_updates;
drop policy if exists "dev_actions_all" on public.grievance_actions;
drop policy if exists "dev_evidence_all" on public.grievance_evidence;
drop policy if exists "dev_closures_all" on public.grievance_closures;
drop policy if exists "dev_companies_all" on public.companies;
drop policy if exists "dev_sites_all" on public.sites;
drop policy if exists "dev_certifications_all" on public.certifications;
drop policy if exists "dev_audit_events_all" on public.audit_events;
drop policy if exists "dev_ndpe_all" on public.ndpe_implementation;
drop policy if exists "dev_weekly_report_entries_all" on public.weekly_report_entries;
drop policy if exists "dev_weekly_ispo_plans_all" on public.weekly_ispo_plans;
drop policy if exists "dev_quotation_projects_all" on public.quotation_projects;
drop policy if exists "dev_quotation_vendors_all" on public.quotation_vendors;

-- =========================================================
-- STORAGE: protect private evidence + audit report buckets.
-- =========================================================
drop policy if exists "dev_grievance_evidence_select" on storage.objects;
drop policy if exists "dev_grievance_evidence_insert" on storage.objects;
drop policy if exists "dev_grievance_evidence_update" on storage.objects;
drop policy if exists "dev_grievance_evidence_delete" on storage.objects;
drop policy if exists "dev_audit_reports_select" on storage.objects;
drop policy if exists "dev_audit_reports_insert" on storage.objects;
drop policy if exists "dev_audit_reports_update" on storage.objects;
drop policy if exists "dev_audit_reports_delete" on storage.objects;

drop policy if exists "sm_storage_select" on storage.objects;
create policy "sm_storage_select"
on storage.objects for select to authenticated
using (
  public.is_system_monitoring_user()
  and bucket_id in ('grievance-evidence', 'audit-reports')
);

drop policy if exists "sm_storage_insert" on storage.objects;
create policy "sm_storage_insert"
on storage.objects for insert to authenticated
with check (
  public.is_system_monitoring_user()
  and bucket_id in ('grievance-evidence', 'audit-reports')
);

drop policy if exists "sm_storage_update" on storage.objects;
create policy "sm_storage_update"
on storage.objects for update to authenticated
using (
  public.is_system_monitoring_user()
  and bucket_id in ('grievance-evidence', 'audit-reports')
)
with check (
  public.is_system_monitoring_user()
  and bucket_id in ('grievance-evidence', 'audit-reports')
);

drop policy if exists "sm_storage_delete" on storage.objects;
create policy "sm_storage_delete"
on storage.objects for delete to authenticated
using (
  public.is_system_monitoring_user()
  and bucket_id in ('grievance-evidence', 'audit-reports')
);

select 'V8.14 Login security enabled for 4 approved users' as result;

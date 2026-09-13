-- =========================================================
-- SMD V8.23 - PRODUCTION HARDENING
-- 1) Database-backed user roles
-- 2) Role-aware RLS on core SMD tables
-- 3) Automatic monthly Executive Risk snapshots
-- 4) Audit integration when V8.20 is installed
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- A. DATABASE-BACKED USER ROLES
-- ---------------------------------------------------------
create table if not exists public.app_user_roles (
  email text primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin','assessor','verifier','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_user_roles(email,user_id,display_name,role,active)
select lower(u.email),u.id,x.display_name,'admin',true
from auth.users u
join (values
  ('ochtoryano.fadhylla@systemmonitoring.local','Ochtoryano Fadhylla'),
  ('winengku.pamartajati@systemmonitoring.local','Winengku Pamartajati'),
  ('shafiyah.mutiara@systemmonitoring.local','Shafiyah Mutiara'),
  ('nicky.sudarmantoro@systemmonitoring.local','Nicky Sudarmantoro')
) x(email,display_name) on lower(u.email)=x.email
on conflict (email) do update set
  user_id=excluded.user_id,
  display_name=excluded.display_name,
  active=true,
  updated_at=now();

create or replace function public.smd_current_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select r.role
  from public.app_user_roles r
  where r.active=true
    and (
      r.user_id=auth.uid()
      or lower(r.email)=lower(coalesce(auth.jwt()->>'email',''))
    )
  limit 1;
$$;

create or replace function public.smd_is_approved_user()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role() is not null;
$$;

create or replace function public.smd_can_operate()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role() in ('admin','assessor','verifier');
$$;

create or replace function public.smd_is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role()='admin';
$$;

alter table public.app_user_roles enable row level security;
drop policy if exists app_user_roles_read on public.app_user_roles;
create policy app_user_roles_read on public.app_user_roles
for select to authenticated
using (
  lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  or public.smd_is_admin()
);
drop policy if exists app_user_roles_admin_insert on public.app_user_roles;
create policy app_user_roles_admin_insert on public.app_user_roles
for insert to authenticated with check (public.smd_is_admin());
drop policy if exists app_user_roles_admin_update on public.app_user_roles;
create policy app_user_roles_admin_update on public.app_user_roles
for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
drop policy if exists app_user_roles_admin_delete on public.app_user_roles;
create policy app_user_roles_admin_delete on public.app_user_roles
for delete to authenticated using (public.smd_is_admin());
grant select,insert,update,delete on public.app_user_roles to authenticated;

-- ---------------------------------------------------------
-- B. ROLE-AWARE RLS
-- Existing policies on these tables are replaced deliberately.
-- Current four production users are seeded as Admin, therefore
-- rollout does not reduce their current access.
-- ---------------------------------------------------------
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'certifications','audit_events','grievances','grievance_actions',
    'sims_assessments','sims_assessment_items','sims_action_plans',
    'spatial_suppliers','supplier_risk_assessments',
    'quotation_projects','quotation_vendors'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
      execute format('create policy smd_read_%I on public.%I for select to authenticated using (public.smd_is_approved_user())',t,t);
      execute format('create policy smd_insert_%I on public.%I for insert to authenticated with check (public.smd_can_operate())',t,t);
      execute format('create policy smd_update_%I on public.%I for update to authenticated using (public.smd_can_operate()) with check (public.smd_can_operate())',t,t);
      execute format('create policy smd_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin())',t,t);
      execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    end if;
  end loop;
end $$;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'companies','sites','sims_standards','sims_principles','sims_criteria','sims_indicators',
    'risk_weight_settings','executive_risk_snapshots'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
      execute format('create policy smd_read_%I on public.%I for select to authenticated using (public.smd_is_approved_user())',t,t);
      execute format('create policy smd_insert_%I on public.%I for insert to authenticated with check (public.smd_is_admin())',t,t);
      execute format('create policy smd_update_%I on public.%I for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin())',t,t);
      execute format('create policy smd_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin())',t,t);
      execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    end if;
  end loop;
end $$;

-- Audit log: approved users can read; only trigger/function writes it.
do $$
declare p record;
begin
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log enable row level security;
    for p in select policyname from pg_policies where schemaname='public' and tablename='audit_log' loop
      execute format('drop policy if exists %I on public.audit_log',p.policyname);
    end loop;
    create policy smd_read_audit_log on public.audit_log
      for select to authenticated using (public.smd_is_approved_user());
    grant select on public.audit_log to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------
-- C. AUTOMATIC EXECUTIVE RISK SNAPSHOT
-- Mirrors the current SMD Executive Risk logic.
-- ---------------------------------------------------------
create or replace function public.smd_snapshot_current_risks()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  c record;
  v_month date := date_trunc('month', timezone('Asia/Jakarta',now()))::date;
  v_cert_count integer;
  v_expired integer;
  v_expiring integer;
  v_cert_score numeric;
  v_open_grievances integer;
  v_open_actions integer;
  v_overdue_actions integer;
  v_grievance_score numeric;
  v_sims_total integer;
  v_sims_verified integer;
  v_sims_compliance numeric;
  v_sims_score numeric;
  v_spatial_score numeric;
  w_cert numeric := 25;
  w_grievance numeric := 25;
  w_sims numeric := 30;
  w_spatial numeric := 20;
  total_weight numeric;
  weighted_total numeric;
  final_score integer;
  final_level text;
  top_driver text;
  coverage integer;
  affected integer := 0;
begin
  if to_regclass('public.executive_risk_snapshots') is null then
    raise exception 'executive_risk_snapshots is missing. Run SUPABASE-RISK-HISTORY-V8-22.sql first.';
  end if;

  if to_regclass('public.risk_weight_settings') is not null then
    select certification,grievance_action,sims,spatial
    into w_cert,w_grievance,w_sims,w_spatial
    from public.risk_weight_settings
    where settings_key='executive';
  end if;

  for c in select id from public.companies where coalesce(status,'Active')<>'Inactive' loop
    select count(*),
      count(*) filter (where status='Expired' or (valid_until is not null and valid_until<current_date)),
      count(*) filter (where valid_until is not null and valid_until>=current_date and valid_until<=current_date+90)
    into v_cert_count,v_expired,v_expiring
    from public.certifications where company_id=c.id;
    v_cert_score := least(100,coalesce(v_expired,0)*30+coalesce(v_expiring,0)*10);

    select count(*) filter (where g.status<>'Closed')
    into v_open_grievances
    from public.grievances g where g.company_id=c.id;

    select
      count(*) filter (where a.status<>'Completed'),
      count(*) filter (where a.status<>'Completed' and a.target_date is not null and a.target_date<current_date)
    into v_open_actions,v_overdue_actions
    from public.grievance_actions a
    join public.grievances g on g.id=a.grievance_id
    where g.company_id=c.id;

    v_grievance_score := least(100,
      coalesce(v_open_grievances,0)*18 +
      coalesce(v_overdue_actions,0)*25 +
      greatest(0,coalesce(v_open_actions,0)-coalesce(v_overdue_actions,0))*4
    );

    with latest as (
      select distinct on (standard_id) id
      from public.sims_assessments
      where company_id=c.id
      order by standard_id,assessment_year desc,created_at desc nulls last
    )
    select count(*),count(*) filter (where i.self_status='Fulfilled' and i.verifier_status='Verified')
    into v_sims_total,v_sims_verified
    from public.sims_assessment_items i
    where i.assessment_id in (select id from latest);

    if coalesce(v_sims_total,0)>0 then
      v_sims_compliance := round(v_sims_verified::numeric/v_sims_total*100);
      v_sims_score := greatest(0,100-v_sims_compliance);
    else
      v_sims_compliance := null;
      v_sims_score := null;
    end if;

    with supplier_latest as (
      select distinct on (r.supplier_id) r.supplier_id,r.risk_score
      from public.supplier_risk_assessments r
      join public.spatial_suppliers s on s.id=r.supplier_id
      where s.company_id=c.id
      order by r.supplier_id,r.assessed_at desc nulls last,r.id desc
    )
    select max(risk_score) into v_spatial_score from supplier_latest;

    total_weight := w_grievance;
    weighted_total := v_grievance_score*w_grievance;
    coverage := 1;

    if v_cert_count>0 then total_weight:=total_weight+w_cert; weighted_total:=weighted_total+v_cert_score*w_cert; coverage:=coverage+1; end if;
    if v_sims_score is not null then total_weight:=total_weight+w_sims; weighted_total:=weighted_total+v_sims_score*w_sims; coverage:=coverage+1; end if;
    if v_spatial_score is not null then total_weight:=total_weight+w_spatial; weighted_total:=weighted_total+v_spatial_score*w_spatial; coverage:=coverage+1; end if;

    final_score := case when total_weight>0 then round(weighted_total/total_weight)::integer else 0 end;
    final_level := case when final_score>=75 then 'Critical' when final_score>=50 then 'High' when final_score>=25 then 'Moderate' else 'Low' end;

    top_driver := null;
    if v_cert_count>0 then top_driver:='Certification'; end if;
    if top_driver is null or v_grievance_score>coalesce(v_cert_score,-1) then top_driver:='Grievance & Actions'; end if;
    if v_sims_score is not null and v_sims_score>greatest(v_grievance_score,case when v_cert_count>0 then v_cert_score else -1 end) then top_driver:='SIMS Compliance'; end if;
    if v_spatial_score is not null and v_spatial_score>greatest(v_grievance_score,case when v_cert_count>0 then v_cert_score else -1 end,coalesce(v_sims_score,-1)) then top_driver:='Supplier Spatial Risk'; end if;

    insert into public.executive_risk_snapshots(
      company_id,snapshot_month,score,risk_level,
      certification_score,grievance_action_score,sims_score,spatial_score,
      weight_certification,weight_grievance_action,weight_sims,weight_spatial,
      coverage_available,coverage_total,top_driver,metrics,updated_at
    ) values (
      c.id,v_month,final_score,final_level,
      case when v_cert_count>0 then v_cert_score else null end,v_grievance_score,v_sims_score,v_spatial_score,
      w_cert,w_grievance,w_sims,w_spatial,
      coverage,4,top_driver,
      jsonb_build_object(
        'expired',v_expired,'expiring90',v_expiring,
        'openGrievances',v_open_grievances,'openActions',v_open_actions,'overdueActions',v_overdue_actions,
        'simsCompliance',v_sims_compliance,'spatialScore',v_spatial_score
      ),now()
    )
    on conflict (company_id,snapshot_month) do update set
      score=excluded.score,risk_level=excluded.risk_level,
      certification_score=excluded.certification_score,
      grievance_action_score=excluded.grievance_action_score,
      sims_score=excluded.sims_score,spatial_score=excluded.spatial_score,
      weight_certification=excluded.weight_certification,
      weight_grievance_action=excluded.weight_grievance_action,
      weight_sims=excluded.weight_sims,weight_spatial=excluded.weight_spatial,
      coverage_available=excluded.coverage_available,
      coverage_total=excluded.coverage_total,
      top_driver=excluded.top_driver,metrics=excluded.metrics,updated_at=now();

    affected:=affected+1;
  end loop;
  return affected;
end;
$$;

-- Create/update current month's snapshot immediately.
select public.smd_snapshot_current_risks() as companies_snapshotted;

-- Schedule monthly refresh automatically when pg_cron is available.
do $$
declare jid bigint;
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron could not be enabled automatically: %',sqlerrm;
  end;

  if to_regclass('cron.job') is not null then
    for jid in select jobid from cron.job where jobname='smd-monthly-executive-risk' loop
      perform cron.unschedule(jid);
    end loop;
    perform cron.schedule(
      'smd-monthly-executive-risk',
      '15 0 1 * *',
      'select public.smd_snapshot_current_risks();'
    );
  end if;
end $$;

-- ---------------------------------------------------------
-- D. AUDIT TRAIL EXTENSION
-- ---------------------------------------------------------
do $$
begin
  if to_regprocedure('public.smd_capture_audit_log()') is not null then
    if to_regclass('public.app_user_roles') is not null then
      drop trigger if exists trg_smd_audit_app_user_roles on public.app_user_roles;
      create trigger trg_smd_audit_app_user_roles after insert or update or delete on public.app_user_roles
      for each row execute function public.smd_capture_audit_log();
    end if;
  end if;
end $$;

select
  'SMD V8.23 production hardening ready' as result,
  public.smd_snapshot_current_risks() as snapshot_company_count,
  case when to_regclass('cron.job') is not null then 'scheduled' else 'manual fallback' end as monthly_snapshot_mode;

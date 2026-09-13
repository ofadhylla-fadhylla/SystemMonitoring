-- =========================================================
-- SMD V8.24 - USER ACCESS & PT SCOPE
-- Prerequisite: SUPABASE-PRODUCTION-HARDENING-V8-23.sql
-- Adds company-level scope, atomic admin RPCs, role separation,
-- company-aware RLS, and private-storage PT scoping.
-- =========================================================

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.app_user_roles') is null then
    raise exception 'app_user_roles is missing. Run SUPABASE-PRODUCTION-HARDENING-V8-23.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------
-- A. USER ROLE + COMPANY SCOPE MODEL
-- ---------------------------------------------------------
alter table public.app_user_roles
  add column if not exists company_scope text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='app_user_roles_company_scope_check'
      and conrelid='public.app_user_roles'::regclass
  ) then
    alter table public.app_user_roles
      add constraint app_user_roles_company_scope_check
      check (company_scope in ('all','selected'));
  end if;
end $$;

-- Admin always has portfolio-wide scope.
update public.app_user_roles set company_scope='all' where role='admin';

create table if not exists public.app_user_company_access (
  email text not null references public.app_user_roles(email) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (email, company_id)
);
create index if not exists idx_app_user_company_access_company
  on public.app_user_company_access(company_id, email);

create or replace function public.smd_current_email()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select lower(coalesce(auth.jwt()->>'email',''));
$$;

create or replace function public.smd_has_all_company_access()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.app_user_roles r
    where r.active=true
      and (r.user_id=auth.uid() or lower(r.email)=public.smd_current_email())
      and (r.role='admin' or r.company_scope='all')
  );
$$;

create or replace function public.smd_can_access_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select p_company_id is not null and exists(
    select 1
    from public.app_user_roles r
    where r.active=true
      and (r.user_id=auth.uid() or lower(r.email)=public.smd_current_email())
      and (
        r.role='admin'
        or r.company_scope='all'
        or exists(
          select 1 from public.app_user_company_access a
          where lower(a.email)=lower(r.email)
            and a.company_id=p_company_id
        )
      )
  );
$$;

create or replace function public.smd_can_operate_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role() in ('admin','assessor','verifier')
     and public.smd_can_access_company(p_company_id);
$$;

create or replace function public.smd_can_assess_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role() in ('admin','assessor')
     and public.smd_can_access_company(p_company_id);
$$;

create or replace function public.smd_can_verify_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.smd_current_role() in ('admin','verifier')
     and public.smd_can_access_company(p_company_id);
$$;

-- Atomic admin change: role + active flag + All/Selected PT scope.
create or replace function public.smd_set_user_access(
  p_email text,
  p_role text,
  p_company_scope text,
  p_company_ids uuid[] default '{}'::uuid[],
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email text := lower(trim(p_email));
  v_scope text := lower(trim(p_company_scope));
  v_role text := lower(trim(p_role));
  v_existing_role text;
  v_other_admins integer;
  v_uid uuid;
begin
  if not public.smd_is_admin() then
    raise exception 'Only Administrator can change user access.';
  end if;
  if v_role not in ('admin','assessor','verifier','viewer') then
    raise exception 'Invalid role: %',p_role;
  end if;
  if v_scope not in ('all','selected') then
    raise exception 'Invalid company scope: %',p_company_scope;
  end if;

  select role,user_id into v_existing_role,v_uid
  from public.app_user_roles where lower(email)=v_email;
  if not found then raise exception 'User % is not registered in app_user_roles.',v_email; end if;

  if v_existing_role='admin' and (v_role<>'admin' or not p_active) then
    select count(*) into v_other_admins
    from public.app_user_roles
    where active=true and role='admin' and lower(email)<>v_email;
    if v_other_admins<1 then
      raise exception 'Cannot remove the last active Administrator.';
    end if;
  end if;

  if v_role='admin' then v_scope:='all'; end if;
  if p_active and v_role<>'admin' and v_scope='selected'
     and coalesce(array_length(p_company_ids,1),0)=0 then
    raise exception 'Selected PT scope requires at least one PT.';
  end if;

  update public.app_user_roles
  set role=v_role, active=p_active, company_scope=v_scope, updated_at=now()
  where lower(email)=v_email;

  delete from public.app_user_company_access where lower(email)=v_email;
  if v_scope='selected' and p_active then
    insert into public.app_user_company_access(email,company_id,created_by)
    select v_email,x,auth.uid()
    from (select distinct unnest(p_company_ids) x) q
    join public.companies c on c.id=q.x
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'email',v_email,'role',v_role,'active',p_active,'company_scope',v_scope,
    'company_count',case when v_scope='all' then null else coalesce(array_length(p_company_ids,1),0) end
  );
end;
$$;

grant execute on function public.smd_set_user_access(text,text,text,uuid[],boolean) to authenticated;

-- Pull newly created Supabase Auth users into the access registry as INACTIVE viewers.
create or replace function public.smd_sync_auth_users()
returns integer
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_count integer;
begin
  if not public.smd_is_admin() then
    raise exception 'Only Administrator can sync users.';
  end if;
  insert into public.app_user_roles(email,user_id,display_name,role,active,company_scope)
  select lower(u.email),u.id,
         coalesce(nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1)),
         'viewer',false,'selected'
  from auth.users u
  where u.email is not null
  on conflict (email) do update set user_id=excluded.user_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
grant execute on function public.smd_sync_auth_users() to authenticated;

-- ---------------------------------------------------------
-- B. ACCESS REGISTRY RLS
-- ---------------------------------------------------------
alter table public.app_user_company_access enable row level security;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='app_user_company_access' loop
    execute format('drop policy if exists %I on public.app_user_company_access',p.policyname);
  end loop;
end $$;
create policy smd_access_map_select on public.app_user_company_access
for select to authenticated using (
  public.smd_is_admin() or lower(email)=public.smd_current_email()
);
create policy smd_access_map_admin_insert on public.app_user_company_access
for insert to authenticated with check (public.smd_is_admin());
create policy smd_access_map_admin_update on public.app_user_company_access
for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_access_map_admin_delete on public.app_user_company_access
for delete to authenticated using (public.smd_is_admin());
grant select,insert,update,delete on public.app_user_company_access to authenticated;

-- Refresh app_user_roles policies so admins manage all users, users can read themselves.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='app_user_roles' loop
    execute format('drop policy if exists %I on public.app_user_roles',p.policyname);
  end loop;
end $$;
create policy smd_roles_select on public.app_user_roles
for select to authenticated using (public.smd_is_admin() or lower(email)=public.smd_current_email());
create policy smd_roles_admin_insert on public.app_user_roles
for insert to authenticated with check (public.smd_is_admin());
create policy smd_roles_admin_update on public.app_user_roles
for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_roles_admin_delete on public.app_user_roles
for delete to authenticated using (public.smd_is_admin());

-- ---------------------------------------------------------
-- C. COMPANY-SCOPED CORE RLS
-- ---------------------------------------------------------
-- Helper block: remove old table policies before creating the stricter PT-aware policies.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'companies','sites','certifications','audit_events','grievances',
    'grievance_updates','grievance_actions','grievance_evidence','grievance_closures',
    'sims_assessments','sims_assessment_items','sims_evidence','sims_action_plans','sims_action_evidence',
    'spatial_suppliers','supplier_risk_assessments','executive_risk_snapshots',
    'sims_standards','sims_principles','sims_criteria','sims_indicators',
    'risk_weight_settings','quotation_projects','quotation_vendors','audit_log'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
    end if;
  end loop;
end $$;

-- Company master: non-admin users only see assigned PTs.
create policy smd_company_select on public.companies for select to authenticated
using (public.smd_can_access_company(id));
create policy smd_company_insert on public.companies for insert to authenticated with check (public.smd_is_admin());
create policy smd_company_update on public.companies for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_company_delete on public.companies for delete to authenticated using (public.smd_is_admin());

create policy smd_site_select on public.sites for select to authenticated
using (public.smd_can_access_company(company_id));
create policy smd_site_insert on public.sites for insert to authenticated with check (public.smd_is_admin());
create policy smd_site_update on public.sites for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_site_delete on public.sites for delete to authenticated using (public.smd_is_admin());

-- Direct company_id operational tables.
do $$
declare t text;
begin
  foreach t in array array['certifications','audit_events','grievances','spatial_suppliers'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create policy smd_scope_select_%I on public.%I for select to authenticated using (public.smd_can_access_company(company_id))',t,t);
      execute format('create policy smd_scope_insert_%I on public.%I for insert to authenticated with check (public.smd_can_operate_company(company_id))',t,t);
      execute format('create policy smd_scope_update_%I on public.%I for update to authenticated using (public.smd_can_operate_company(company_id)) with check (public.smd_can_operate_company(company_id))',t,t);
      execute format('create policy smd_scope_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin() and public.smd_can_access_company(company_id))',t,t);
    end if;
  end loop;
end $$;

-- Grievance child data follows the parent grievance PT.
do $$
begin
  if to_regclass('public.grievance_updates') is not null then
    create policy smd_scope_select_grievance_updates on public.grievance_updates for select to authenticated
      using (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_access_company(g.company_id)));
    create policy smd_scope_insert_grievance_updates on public.grievance_updates for insert to authenticated
      with check (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id)));
    create policy smd_scope_update_grievance_updates on public.grievance_updates for update to authenticated
      using (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id)))
      with check (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id)));
    create policy smd_scope_delete_grievance_updates on public.grievance_updates for delete to authenticated
      using (public.smd_is_admin() and exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_access_company(g.company_id)));
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['grievance_actions','grievance_evidence','grievance_closures'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create policy smd_scope_select_%I on public.%I for select to authenticated using (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_access_company(g.company_id)))',t,t);
      execute format('create policy smd_scope_insert_%I on public.%I for insert to authenticated with check (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id)))',t,t);
      execute format('create policy smd_scope_update_%I on public.%I for update to authenticated using (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id))) with check (exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_operate_company(g.company_id)))',t,t);
      execute format('create policy smd_scope_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin() and exists(select 1 from public.grievances g where g.id=grievance_id and public.smd_can_access_company(g.company_id)))',t,t);
    end if;
  end loop;
end $$;

-- SIMS assessment header: Assessor creates/edits; Verifier reviews existing content.
create policy smd_scope_select_sims_assessments on public.sims_assessments for select to authenticated
using (public.smd_can_access_company(company_id));
create policy smd_scope_insert_sims_assessments on public.sims_assessments for insert to authenticated
with check (public.smd_can_assess_company(company_id));
create policy smd_scope_update_sims_assessments on public.sims_assessments for update to authenticated
using (public.smd_can_assess_company(company_id)) with check (public.smd_can_assess_company(company_id));
create policy smd_scope_delete_sims_assessments on public.sims_assessments for delete to authenticated
using (public.smd_is_admin() and public.smd_can_access_company(company_id));

create policy smd_scope_select_sims_items on public.sims_assessment_items for select to authenticated
using (exists(select 1 from public.sims_assessments a where a.id=assessment_id and public.smd_can_access_company(a.company_id)));
create policy smd_scope_insert_sims_items on public.sims_assessment_items for insert to authenticated
with check (exists(select 1 from public.sims_assessments a where a.id=assessment_id and public.smd_can_assess_company(a.company_id)));
create policy smd_scope_update_sims_items on public.sims_assessment_items for update to authenticated
using (exists(select 1 from public.sims_assessments a where a.id=assessment_id and public.smd_can_operate_company(a.company_id)))
with check (exists(select 1 from public.sims_assessments a where a.id=assessment_id and public.smd_can_operate_company(a.company_id)));
create policy smd_scope_delete_sims_items on public.sims_assessment_items for delete to authenticated
using (public.smd_is_admin() and exists(select 1 from public.sims_assessments a where a.id=assessment_id and public.smd_can_access_company(a.company_id)));

create policy smd_scope_select_sims_evidence on public.sims_evidence for select to authenticated
using (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_access_company(a.company_id)));
create policy smd_scope_insert_sims_evidence on public.sims_evidence for insert to authenticated
with check (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)));
create policy smd_scope_update_sims_evidence on public.sims_evidence for update to authenticated
using (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)))
with check (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)));
create policy smd_scope_delete_sims_evidence on public.sims_evidence for delete to authenticated
using (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)));

create policy smd_scope_select_sims_actions on public.sims_action_plans for select to authenticated
using (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_access_company(a.company_id)));
create policy smd_scope_insert_sims_actions on public.sims_action_plans for insert to authenticated
with check (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_assess_company(a.company_id)));
create policy smd_scope_update_sims_actions on public.sims_action_plans for update to authenticated
using (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)))
with check (exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_operate_company(a.company_id)));
create policy smd_scope_delete_sims_actions on public.sims_action_plans for delete to authenticated
using (public.smd_is_admin() and exists(select 1 from public.sims_assessment_items i join public.sims_assessments a on a.id=i.assessment_id where i.id=assessment_item_id and public.smd_can_access_company(a.company_id)));

create policy smd_scope_select_sims_action_evidence on public.sims_action_evidence for select to authenticated
using (exists(select 1 from public.sims_action_plans p join public.sims_assessment_items i on i.id=p.assessment_item_id join public.sims_assessments a on a.id=i.assessment_id where p.id=action_plan_id and public.smd_can_access_company(a.company_id)));
create policy smd_scope_insert_sims_action_evidence on public.sims_action_evidence for insert to authenticated
with check (exists(select 1 from public.sims_action_plans p join public.sims_assessment_items i on i.id=p.assessment_item_id join public.sims_assessments a on a.id=i.assessment_id where p.id=action_plan_id and public.smd_can_operate_company(a.company_id)));
create policy smd_scope_delete_sims_action_evidence on public.sims_action_evidence for delete to authenticated
using (exists(select 1 from public.sims_action_plans p join public.sims_assessment_items i on i.id=p.assessment_item_id join public.sims_assessments a on a.id=i.assessment_id where p.id=action_plan_id and public.smd_can_operate_company(a.company_id)));

-- Supplier risk follows supplier PT.
create policy smd_scope_select_supplier_risk on public.supplier_risk_assessments for select to authenticated
using (exists(select 1 from public.spatial_suppliers s where s.id=supplier_id and public.smd_can_access_company(s.company_id)));
create policy smd_scope_insert_supplier_risk on public.supplier_risk_assessments for insert to authenticated
with check (exists(select 1 from public.spatial_suppliers s where s.id=supplier_id and public.smd_can_operate_company(s.company_id)));
create policy smd_scope_update_supplier_risk on public.supplier_risk_assessments for update to authenticated
using (exists(select 1 from public.spatial_suppliers s where s.id=supplier_id and public.smd_can_operate_company(s.company_id)))
with check (exists(select 1 from public.spatial_suppliers s where s.id=supplier_id and public.smd_can_operate_company(s.company_id)));
create policy smd_scope_delete_supplier_risk on public.supplier_risk_assessments for delete to authenticated
using (public.smd_is_admin() and exists(select 1 from public.spatial_suppliers s where s.id=supplier_id and public.smd_can_access_company(s.company_id)));

-- Risk snapshots are company-scoped read; automated function/admin owns writes.
create policy smd_scope_select_risk_snapshots on public.executive_risk_snapshots for select to authenticated
using (public.smd_can_access_company(company_id));
create policy smd_scope_admin_insert_risk_snapshots on public.executive_risk_snapshots for insert to authenticated with check (public.smd_is_admin());
create policy smd_scope_admin_update_risk_snapshots on public.executive_risk_snapshots for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_scope_admin_delete_risk_snapshots on public.executive_risk_snapshots for delete to authenticated using (public.smd_is_admin());

-- SIMS master definitions remain readable to approved users; only Admin changes master.
do $$
declare t text;
begin
  foreach t in array array['sims_standards','sims_principles','sims_criteria','sims_indicators'] loop
    execute format('create policy smd_master_select_%I on public.%I for select to authenticated using (public.smd_is_approved_user())',t,t);
    execute format('create policy smd_master_insert_%I on public.%I for insert to authenticated with check (public.smd_is_admin())',t,t);
    execute format('create policy smd_master_update_%I on public.%I for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin())',t,t);
    execute format('create policy smd_master_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin())',t,t);
  end loop;
end $$;

create policy smd_risk_weights_select on public.risk_weight_settings for select to authenticated using (public.smd_is_approved_user());
create policy smd_risk_weights_insert on public.risk_weight_settings for insert to authenticated with check (public.smd_is_admin());
create policy smd_risk_weights_update on public.risk_weight_settings for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin());
create policy smd_risk_weights_delete on public.risk_weight_settings for delete to authenticated using (public.smd_is_admin());

-- Vendor commercial comparison remains Admin-only because it can contain price/negotiation data.
do $$
declare t text;
begin
  foreach t in array array['quotation_projects','quotation_vendors'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create policy smd_admin_select_%I on public.%I for select to authenticated using (public.smd_is_admin())',t,t);
      execute format('create policy smd_admin_insert_%I on public.%I for insert to authenticated with check (public.smd_is_admin())',t,t);
      execute format('create policy smd_admin_update_%I on public.%I for update to authenticated using (public.smd_is_admin()) with check (public.smd_is_admin())',t,t);
      execute format('create policy smd_admin_delete_%I on public.%I for delete to authenticated using (public.smd_is_admin())',t,t);
    end if;
  end loop;
end $$;

-- Audit trail can contain cross-PT before/after payloads; keep it Admin-only.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    create policy smd_admin_audit_log_select on public.audit_log for select to authenticated using (public.smd_is_admin());
  end if;
end $$;

-- ---------------------------------------------------------
-- D. SIMS ROLE SEPARATION GUARDS
-- Assessor cannot set verifier fields; Verifier cannot change assessment/action content.
-- ---------------------------------------------------------
create or replace function public.smd_guard_sims_item_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare r text := public.smd_current_role();
begin
  if r='assessor' and (
    old.verifier_status is distinct from new.verifier_status or
    old.verifier_notes is distinct from new.verifier_notes or
    old.verified_by is distinct from new.verified_by or
    old.verified_at is distinct from new.verified_at
  ) then
    raise exception 'Assessor cannot change verifier fields.';
  end if;
  if r='verifier' and (
    old.self_status is distinct from new.self_status or
    old.explanation is distinct from new.explanation or
    old.indicator_id is distinct from new.indicator_id or
    old.assessment_id is distinct from new.assessment_id
  ) then
    raise exception 'Verifier cannot change assessment answer fields.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_smd_role_guard_sims_item on public.sims_assessment_items;
create trigger trg_smd_role_guard_sims_item
before update on public.sims_assessment_items
for each row execute function public.smd_guard_sims_item_update();

create or replace function public.smd_guard_sims_action_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare r text := public.smd_current_role();
begin
  if r='assessor' and (
    old.verifier_status is distinct from new.verifier_status or
    old.verifier_notes is distinct from new.verifier_notes or
    old.verified_by is distinct from new.verified_by or
    old.verified_at is distinct from new.verified_at
  ) then
    raise exception 'Assessor cannot change action-plan verifier fields.';
  end if;
  if r='verifier' and (
    old.action_text is distinct from new.action_text or
    old.pic is distinct from new.pic or
    old.priority is distinct from new.priority or
    old.deadline is distinct from new.deadline or
    old.status is distinct from new.status or
    old.completion_notes is distinct from new.completion_notes or
    old.assessment_item_id is distinct from new.assessment_item_id
  ) then
    raise exception 'Verifier cannot change corrective-action content.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_smd_role_guard_sims_action on public.sims_action_plans;
create trigger trg_smd_role_guard_sims_action
before update on public.sims_action_plans
for each row execute function public.smd_guard_sims_action_update();

-- ---------------------------------------------------------
-- E. PRIVATE STORAGE SCOPING
-- ---------------------------------------------------------
create or replace function public.smd_storage_company_access(p_bucket text,p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare seg1 text:=split_part(p_name,'/',1); seg2 text:=split_part(p_name,'/',2);
begin
  if p_bucket='audit-reports' then
    return exists(select 1 from public.companies c where lower(c.company_code)=lower(seg1) and public.smd_can_access_company(c.id));
  elsif p_bucket='grievance-evidence' then
    return exists(select 1 from public.grievances g where (g.id::text=seg1 or coalesce(g.case_id,'')=seg1) and public.smd_can_access_company(g.company_id));
  elsif p_bucket='sims-evidence' then
    if seg1='action' then
      return exists(
        select 1 from public.sims_action_plans p
        join public.sims_assessment_items i on i.id=p.assessment_item_id
        join public.sims_assessments a on a.id=i.assessment_id
        where p.id::text=seg2 and public.smd_can_access_company(a.company_id)
      );
    else
      return exists(select 1 from public.sims_assessments a where a.id::text=seg1 and public.smd_can_access_company(a.company_id));
    end if;
  end if;
  return false;
end;
$$;

-- Remove any old policy that grants access to these three private buckets.
do $$ declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname='storage' and tablename='objects'
      and (
        coalesce(qual,'')||' '||coalesce(with_check,'') ilike '%grievance-evidence%'
        or coalesce(qual,'')||' '||coalesce(with_check,'') ilike '%audit-reports%'
        or coalesce(qual,'')||' '||coalesce(with_check,'') ilike '%sims-evidence%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects',p.policyname);
  end loop;
end $$;

create policy smd_scoped_private_bucket_select on storage.objects
for select to authenticated
using (
  bucket_id in ('grievance-evidence','audit-reports','sims-evidence')
  and public.smd_storage_company_access(bucket_id,name)
);
create policy smd_scoped_private_bucket_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('grievance-evidence','audit-reports','sims-evidence')
  and public.smd_can_operate()
  and public.smd_storage_company_access(bucket_id,name)
);
create policy smd_scoped_private_bucket_update on storage.objects
for update to authenticated
using (
  bucket_id in ('grievance-evidence','audit-reports','sims-evidence')
  and public.smd_can_operate()
  and public.smd_storage_company_access(bucket_id,name)
)
with check (
  bucket_id in ('grievance-evidence','audit-reports','sims-evidence')
  and public.smd_can_operate()
  and public.smd_storage_company_access(bucket_id,name)
);
create policy smd_scoped_private_bucket_delete on storage.objects
for delete to authenticated
using (
  bucket_id in ('grievance-evidence','audit-reports','sims-evidence')
  and public.smd_can_operate()
  and public.smd_storage_company_access(bucket_id,name)
);

-- Audit access-registry changes when V8.20 audit function is available.
do $$
begin
  if to_regprocedure('public.smd_capture_audit_log()') is not null then
    drop trigger if exists trg_smd_audit_user_company_access on public.app_user_company_access;
    create trigger trg_smd_audit_user_company_access
      after insert or update or delete on public.app_user_company_access
      for each row execute function public.smd_capture_audit_log();
  end if;
end $$;

select email,display_name,role,active,company_scope
from public.app_user_roles
order by role,email;
select 'SMD V8.24 user access & PT scope ready' as result;

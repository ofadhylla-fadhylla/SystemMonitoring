-- =========================================================
-- SMD V8.24.1 - ACCESS CONTROL SAFETY PATCH
-- Run immediately after SUPABASE-ACCESS-CONTROL-V8-24.sql
-- =========================================================

-- Administrator can still see/fix legacy records whose company_id is NULL.
create or replace function public.smd_can_access_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.smd_is_admin()
    or (
      p_company_id is not null
      and exists(
        select 1
        from public.app_user_roles r
        where r.active=true
          and (r.user_id=auth.uid() or lower(r.email)=public.smd_current_email())
          and (
            r.company_scope='all'
            or exists(
              select 1 from public.app_user_company_access a
              where lower(a.email)=lower(r.email)
                and a.company_id=p_company_id
            )
          )
      )
    );
$$;

-- Safer atomic admin function: current administrator cannot deactivate/demote
-- their own active session. Another administrator must do that change.
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

  select role into v_existing_role
  from public.app_user_roles where lower(email)=v_email;
  if not found then raise exception 'User % is not registered in app_user_roles.',v_email; end if;

  if v_email=public.smd_current_email() and (v_role<>'admin' or not p_active) then
    raise exception 'For safety, the currently logged-in Administrator cannot demote or deactivate their own account. Use another Administrator account.';
  end if;

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
  set role=v_role,active=p_active,company_scope=v_scope,updated_at=now()
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

-- Ensure authenticated role has table privileges; RLS still determines which rows/actions are allowed.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','sites','certifications','audit_events','grievances',
    'grievance_updates','grievance_actions','grievance_evidence','grievance_closures',
    'sims_assessments','sims_assessment_items','sims_evidence','sims_action_plans','sims_action_evidence',
    'spatial_suppliers','supplier_risk_assessments','executive_risk_snapshots',
    'sims_standards','sims_principles','sims_criteria','sims_indicators',
    'risk_weight_settings','quotation_projects','quotation_vendors'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    end if;
  end loop;
end $$;

select 'SMD V8.24.1 access-control safety patch ready' as result;

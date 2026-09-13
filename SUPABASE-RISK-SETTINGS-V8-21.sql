-- =========================================================
-- SMD V8.21 - EXECUTIVE RISK WEIGHT SETTINGS
-- Shared configurable weights for Executive Risk Score.
-- Run once in Supabase SQL Editor after deploying V8.21.
-- =========================================================

create table if not exists public.risk_weight_settings (
  settings_key text primary key default 'executive',
  certification integer not null default 25 check (certification between 0 and 100),
  grievance_action integer not null default 25 check (grievance_action between 0 and 100),
  sims integer not null default 30 check (sims between 0 and 100),
  spatial integer not null default 20 check (spatial between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint risk_weight_total_100 check (certification + grievance_action + sims + spatial = 100)
);

insert into public.risk_weight_settings(settings_key, certification, grievance_action, sims, spatial)
values ('executive',25,25,30,20)
on conflict (settings_key) do nothing;

alter table public.risk_weight_settings enable row level security;

drop policy if exists risk_weights_authenticated_select on public.risk_weight_settings;
create policy risk_weights_authenticated_select on public.risk_weight_settings
for select to authenticated using (true);

drop policy if exists risk_weights_admin_insert on public.risk_weight_settings;
create policy risk_weights_admin_insert on public.risk_weight_settings
for insert to authenticated
with check (
  lower(coalesce(auth.jwt()->>'email','')) in (
    'ochtoryano.fadhylla@systemmonitoring.local',
    'winengku.pamartajati@systemmonitoring.local',
    'shafiyah.mutiara@systemmonitoring.local',
    'nicky.sudarmantoro@systemmonitoring.local'
  )
);

drop policy if exists risk_weights_admin_update on public.risk_weight_settings;
create policy risk_weights_admin_update on public.risk_weight_settings
for update to authenticated
using (
  lower(coalesce(auth.jwt()->>'email','')) in (
    'ochtoryano.fadhylla@systemmonitoring.local',
    'winengku.pamartajati@systemmonitoring.local',
    'shafiyah.mutiara@systemmonitoring.local',
    'nicky.sudarmantoro@systemmonitoring.local'
  )
)
with check (
  lower(coalesce(auth.jwt()->>'email','')) in (
    'ochtoryano.fadhylla@systemmonitoring.local',
    'winengku.pamartajati@systemmonitoring.local',
    'shafiyah.mutiara@systemmonitoring.local',
    'nicky.sudarmantoro@systemmonitoring.local'
  )
);

grant select, insert, update on public.risk_weight_settings to authenticated;

-- If Audit Trail V8.20 is already installed, record future weight changes too.
do $$
begin
  if to_regprocedure('public.smd_capture_audit_log()') is not null then
    drop trigger if exists trg_smd_audit_risk_weight_settings on public.risk_weight_settings;
    create trigger trg_smd_audit_risk_weight_settings
    after insert or update or delete on public.risk_weight_settings
    for each row execute function public.smd_capture_audit_log();
  end if;
end $$;

select 'SMD V8.21 risk weight settings ready' as result;

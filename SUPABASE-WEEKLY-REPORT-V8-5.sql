-- =========================================================
-- SYSTEM MONITORING V8.5
-- Dedicated Weekly Progress Report module
-- Separate from NDPE Implementation
-- Development mode: no login yet
-- =========================================================

create extension if not exists pgcrypto;

create sequence if not exists public.weekly_report_entry_seq start 1;
create sequence if not exists public.weekly_ispo_plan_seq start 1;

create table if not exists public.weekly_report_entries (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null unique default (
    'WR-' || lpad(nextval('public.weekly_report_entry_seq')::text, 6, '0')
  ),
  report_date date not null,
  section text not null check (section in ('ISPO','ISCC','INS','Grievance','Lain-lain')),
  unit text,
  stage text,
  progress_id text not null,
  progress_en text not null,
  sort_order integer not null default 1,
  source_module text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_ispo_plans (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null unique default (
    'WIP-' || lpad(nextval('public.weekly_ispo_plan_seq')::text, 6, '0')
  ),
  report_date date not null,
  pt text not null,
  stage_1 text,
  stage_2 text,
  explanation text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weekly_report_entries_date
on public.weekly_report_entries(report_date);

create index if not exists idx_weekly_report_entries_section
on public.weekly_report_entries(section);

create index if not exists idx_weekly_ispo_plans_date
on public.weekly_ispo_plans(report_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_weekly_report_entries_updated_at
on public.weekly_report_entries;
create trigger trg_weekly_report_entries_updated_at
before update on public.weekly_report_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_weekly_ispo_plans_updated_at
on public.weekly_ispo_plans;
create trigger trg_weekly_ispo_plans_updated_at
before update on public.weekly_ispo_plans
for each row execute function public.set_updated_at();

alter table public.weekly_report_entries enable row level security;
alter table public.weekly_ispo_plans enable row level security;

drop policy if exists "dev_weekly_report_entries_all"
on public.weekly_report_entries;
create policy "dev_weekly_report_entries_all"
on public.weekly_report_entries
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "dev_weekly_ispo_plans_all"
on public.weekly_ispo_plans;
create policy "dev_weekly_ispo_plans_all"
on public.weekly_ispo_plans
for all to anon, authenticated
using (true) with check (true);

select 'V8.5 Weekly Progress Report database created successfully' as result;

-- =========================================================
-- SYSTEM MONITORING V8.10
-- PENAWARAN HARGA / VENDOR COMPARISON
-- Development mode: follows current unlocked Supabase setup.
-- =========================================================

create extension if not exists pgcrypto;
create sequence if not exists public.quotation_selection_seq start 1;

create table if not exists public.quotation_projects (
  id uuid primary key default gen_random_uuid(),
  selection_id text not null unique default (
    'RFQ-' || lpad(nextval('public.quotation_selection_seq')::text, 5, '0')
  ),
  title text not null,
  standard text not null default 'ISCC EU',
  scope_quotation text,
  scope_units text[] not null default '{}',
  status text not null default 'Draft'
    check (status in ('Draft','Under Review','Approved','Closed')),
  decision_date date,
  selected_vendor_id uuid,
  ai_score numeric(5,2),
  ai_insight text,
  insight_generated_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_vendors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.quotation_projects(id) on delete cascade,
  vendor_name text not null,
  contact_person text,
  email text,
  unit_prices jsonb not null default '[]'::jsonb,
  quotation_initial numeric(18,2) not null default 0,
  quotation_final numeric(18,2) not null default 0,
  system_fee numeric(18,2) not null default 0,
  travel_cost numeric(18,2) not null default 0,
  payment_terms text,
  offer_validity text,
  airline_standard text,
  weekend_work text default 'Not Confirmed',
  auditor_lodging text,
  land_transport text,
  ho_companion text,
  certificate_estimate_days integer,
  certificate_estimate_text text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, vendor_name)
);

-- FK is added after quotation_vendors exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotation_projects_selected_vendor_fk'
  ) then
    alter table public.quotation_projects
      add constraint quotation_projects_selected_vendor_fk
      foreign key (selected_vendor_id)
      references public.quotation_vendors(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_quotation_projects_standard on public.quotation_projects(standard);
create index if not exists idx_quotation_projects_status on public.quotation_projects(status);
create index if not exists idx_quotation_vendors_project on public.quotation_vendors(project_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quotation_projects_updated_at on public.quotation_projects;
create trigger trg_quotation_projects_updated_at
before update on public.quotation_projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_quotation_vendors_updated_at on public.quotation_vendors;
create trigger trg_quotation_vendors_updated_at
before update on public.quotation_vendors
for each row execute function public.set_updated_at();

alter table public.quotation_projects enable row level security;
alter table public.quotation_vendors enable row level security;

drop policy if exists "dev_quotation_projects_all" on public.quotation_projects;
create policy "dev_quotation_projects_all"
on public.quotation_projects
for all to anon, authenticated
using (true) with check (true);

drop policy if exists "dev_quotation_vendors_all" on public.quotation_vendors;
create policy "dev_quotation_vendors_all"
on public.quotation_vendors
for all to anon, authenticated
using (true) with check (true);

select 'V8.10 Penawaran Harga database created successfully' as result;

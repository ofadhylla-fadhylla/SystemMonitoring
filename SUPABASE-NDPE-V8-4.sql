-- =========================================================
-- SYSTEM MONITORING V8.4
-- NDPE IMPLEMENTATION REGISTER
-- Development mode: keeps current no-login access model.
-- Existing grievance, audit and certification data are not deleted.
-- =========================================================

create extension if not exists pgcrypto;
create sequence if not exists public.ndpe_implementation_seq start 1;

create table if not exists public.ndpe_implementation (
  id uuid primary key default gen_random_uuid(),
  ndpe_id text not null unique default ('NDPE-' || lpad(nextval('public.ndpe_implementation_seq')::text, 5, '0')),
  company_id uuid references public.companies(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  component text not null,
  item_title text not null,
  stage text not null default 'Implementation',
  status text not null default 'In Progress'
    check (status in ('Not Started','In Progress','Monitoring','Verified','Closed')),
  progress integer not null default 0 check (progress between 0 and 100),
  pic text,
  target_date date,
  last_update_date date default current_date,
  related_standards text[] not null default '{}'::text[],
  progress_id text,
  progress_en text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ndpe_company on public.ndpe_implementation(company_id);
create index if not exists idx_ndpe_site on public.ndpe_implementation(site_id);
create index if not exists idx_ndpe_status on public.ndpe_implementation(status);
create index if not exists idx_ndpe_target on public.ndpe_implementation(target_date);
create index if not exists idx_ndpe_related_standards on public.ndpe_implementation using gin(related_standards);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_ndpe_updated_at on public.ndpe_implementation;
create trigger trg_ndpe_updated_at before update on public.ndpe_implementation
for each row execute function public.set_updated_at();

alter table public.ndpe_implementation enable row level security;
drop policy if exists "dev_ndpe_all" on public.ndpe_implementation;
create policy "dev_ndpe_all" on public.ndpe_implementation
for all to anon, authenticated using (true) with check (true);

select 'V8.4 NDPE Implementation database created successfully' as result;

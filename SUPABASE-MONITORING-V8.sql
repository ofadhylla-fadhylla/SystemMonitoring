-- =========================================================
-- SYSTEM MONITORING V8
-- Master Company/Site + Certification + Audit Calendar
-- Keeps the existing V7 grievance database intact.
-- Development mode: no login yet.
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 1) MASTER COMPANY
-- =========================================================
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique,
  company_name text not null,
  region text,
  province text,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2) MASTER SITE
-- =========================================================
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_code text,
  site_name text not null,
  site_type text not null default 'Estate' check (site_type in ('Estate','Mill','KCP','Bulking','Office','Other')),
  province text,
  location text,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, site_name)
);

-- =========================================================
-- 3) CERTIFICATIONS
-- =========================================================
create sequence if not exists public.certification_seq start 1;

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  certification_id text not null unique default ('CERT-' || lpad(nextval('public.certification_seq')::text, 5, '0')),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  certification_type text not null default 'Mandatory',
  standard text not null,
  certificate_number text,
  product text,
  scope text,
  status text not null default 'In Progress' check (status in ('Certified','In Progress','Expired','Suspended','Not Certified')),
  issue_date date,
  valid_from date,
  valid_until date,
  certification_body text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_certifications_company on public.certifications(company_id);
create index if not exists idx_certifications_standard on public.certifications(standard);
create index if not exists idx_certifications_valid_until on public.certifications(valid_until);

-- =========================================================
-- 4) AUDIT EVENTS
-- =========================================================
create sequence if not exists public.audit_event_seq start 1;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  audit_id text not null unique default ('AUD-' || lpad(nextval('public.audit_event_seq')::text, 5, '0')),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  certification_id uuid references public.certifications(id) on delete set null,
  audit_type text not null default 'External Audit',
  title text not null,
  start_date date not null,
  end_date date,
  status text not null default 'Planned' check (status in ('Planned','Confirmed','Done','Postponed','Cancelled')),
  auditor text,
  companion text,
  certification_body text,
  notes text,
  report_title text,
  report_file_name text,
  report_storage_path text,
  report_file_size bigint,
  report_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audit_events_company on public.audit_events(company_id);
create index if not exists idx_audit_events_certification on public.audit_events(certification_id);
create index if not exists idx_audit_events_start_date on public.audit_events(start_date);

-- =========================================================
-- 5) LINK EXISTING GRIEVANCES TO MASTER DATA (OPTIONAL)
-- Keeps existing text fields for backward compatibility.
-- =========================================================
alter table public.grievances add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.grievances add column if not exists site_id uuid references public.sites(id) on delete set null;
create index if not exists idx_grievances_company_id on public.grievances(company_id);
create index if not exists idx_grievances_site_id on public.grievances(site_id);

-- =========================================================
-- UPDATED_AT TRIGGERS
-- Reuses public.set_updated_at() from V7 when available.
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists trg_sites_updated_at on public.sites;
create trigger trg_sites_updated_at before update on public.sites
for each row execute function public.set_updated_at();

drop trigger if exists trg_certifications_updated_at on public.certifications;
create trigger trg_certifications_updated_at before update on public.certifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_events_updated_at on public.audit_events;
create trigger trg_audit_events_updated_at before update on public.audit_events
for each row execute function public.set_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY - DEVELOPMENT MODE
-- Login/security will be tightened later.
-- =========================================================
alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.certifications enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "dev_companies_all" on public.companies;
create policy "dev_companies_all" on public.companies for all to anon, authenticated using (true) with check (true);

drop policy if exists "dev_sites_all" on public.sites;
create policy "dev_sites_all" on public.sites for all to anon, authenticated using (true) with check (true);

drop policy if exists "dev_certifications_all" on public.certifications;
create policy "dev_certifications_all" on public.certifications for all to anon, authenticated using (true) with check (true);

drop policy if exists "dev_audit_events_all" on public.audit_events;
create policy "dev_audit_events_all" on public.audit_events for all to anon, authenticated using (true) with check (true);

-- =========================================================
-- PRIVATE AUDIT REPORT STORAGE
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-reports',
  'audit-reports',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dev_audit_reports_select" on storage.objects;
create policy "dev_audit_reports_select" on storage.objects
for select to anon, authenticated using (bucket_id = 'audit-reports');

drop policy if exists "dev_audit_reports_insert" on storage.objects;
create policy "dev_audit_reports_insert" on storage.objects
for insert to anon, authenticated with check (bucket_id = 'audit-reports');

drop policy if exists "dev_audit_reports_update" on storage.objects;
create policy "dev_audit_reports_update" on storage.objects
for update to anon, authenticated using (bucket_id = 'audit-reports') with check (bucket_id = 'audit-reports');

drop policy if exists "dev_audit_reports_delete" on storage.objects;
create policy "dev_audit_reports_delete" on storage.objects
for delete to anon, authenticated using (bucket_id = 'audit-reports');

select 'V8 monitoring database created successfully' as result;

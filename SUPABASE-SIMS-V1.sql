-- ============================================================
-- KPN SYSTEM MONITORING - SIMS V1
-- Sustainability Assessment / Action Plan / Compliance Level
-- Run once in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.sims_standards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  version text,
  description text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sims_principles (
  id uuid primary key default gen_random_uuid(),
  standard_id uuid not null references public.sims_standards(id) on delete cascade,
  code text not null,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(standard_id, code)
);

create table if not exists public.sims_criteria (
  id uuid primary key default gen_random_uuid(),
  principle_id uuid not null references public.sims_principles(id) on delete cascade,
  code text not null,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(principle_id, code)
);

create table if not exists public.sims_indicators (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.sims_criteria(id) on delete cascade,
  code text not null,
  description text not null,
  object_evidence text,
  guidance text,
  weight numeric not null default 1,
  sort_order int not null default 0,
  active boolean not null default true,
  source_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(criterion_id, code)
);

create table if not exists public.sims_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  standard_id uuid not null references public.sims_standards(id) on delete cascade,
  assessment_year int not null,
  status text not null default 'In Progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, standard_id, assessment_year)
);

create table if not exists public.sims_assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.sims_assessments(id) on delete cascade,
  indicator_id uuid not null references public.sims_indicators(id) on delete cascade,
  self_status text not null default 'Not Started',
  explanation text,
  verifier_status text not null default 'Pending',
  verifier_notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, indicator_id)
);

create table if not exists public.sims_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_item_id uuid not null references public.sims_assessment_items(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.sims_action_plans (
  id uuid primary key default gen_random_uuid(),
  assessment_item_id uuid not null references public.sims_assessment_items(id) on delete cascade,
  action_text text,
  pic text,
  priority text not null default 'Medium',
  deadline date,
  status text not null default 'Open',
  completion_notes text,
  verifier_status text not null default 'Pending',
  verifier_notes text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_item_id)
);

create table if not exists public.sims_action_evidence (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid not null references public.sims_action_plans(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_sims_principles_standard on public.sims_principles(standard_id);
create index if not exists idx_sims_criteria_principle on public.sims_criteria(principle_id);
create index if not exists idx_sims_indicators_criterion on public.sims_indicators(criterion_id);
create index if not exists idx_sims_assessments_company on public.sims_assessments(company_id, standard_id, assessment_year);
create index if not exists idx_sims_items_assessment on public.sims_assessment_items(assessment_id);
create index if not exists idx_sims_actions_item on public.sims_action_plans(assessment_item_id);

-- Evidence bucket
insert into storage.buckets (id, name, public)
values ('sims-evidence', 'sims-evidence', false)
on conflict (id) do update set public = false;

-- RLS: current SIMS phase = all authenticated System Monitoring users can work on SIMS.
alter table public.sims_standards enable row level security;
alter table public.sims_principles enable row level security;
alter table public.sims_criteria enable row level security;
alter table public.sims_indicators enable row level security;
alter table public.sims_assessments enable row level security;
alter table public.sims_assessment_items enable row level security;
alter table public.sims_evidence enable row level security;
alter table public.sims_action_plans enable row level security;
alter table public.sims_action_evidence enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sims_standards','sims_principles','sims_criteria','sims_indicators','sims_assessments','sims_assessment_items','sims_evidence','sims_action_plans','sims_action_evidence']
  loop
    execute format('drop policy if exists sims_authenticated_all on public.%I', t);
    execute format('create policy sims_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists sims_storage_select on storage.objects;
drop policy if exists sims_storage_insert on storage.objects;
drop policy if exists sims_storage_update on storage.objects;
drop policy if exists sims_storage_delete on storage.objects;

create policy sims_storage_select on storage.objects for select to authenticated
using (bucket_id = 'sims-evidence');
create policy sims_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'sims-evidence');
create policy sims_storage_update on storage.objects for update to authenticated
using (bucket_id = 'sims-evidence') with check (bucket_id = 'sims-evidence');
create policy sims_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'sims-evidence');

-- Default standard. Master indicators are imported from the Excel through the SIMS page.
insert into public.sims_standards(code,name,version,description)
values ('ISPO-P33-2025','ISPO Permentan 33/2025','2025','Master assessment based on the KPN SIMS source workbook.')
on conflict (code) do update set name=excluded.name, version=excluded.version, description=excluded.description, updated_at=now();

select 'SIMS V1 database ready' as result;

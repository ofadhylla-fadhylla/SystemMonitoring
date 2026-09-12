-- =========================================================
-- SYSTEM MONITORING V8.16 - SPATIAL MONITORING + SUPPLIER RISK
-- GeoJSON storage + supplier coordinates + HGU/SHM screening
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.spatial_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text,
  supplier_name text not null,
  company_id uuid references public.companies(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  land_status text not null default 'Unknown'
    check (land_status in ('HGU','SHM','SHGB','Girik/Letter C','Customary/Adat','No Document','Unknown')),
  land_document_no text,
  document_status text not null default 'Unverified'
    check (document_status in ('Verified','Unverified','Expired','Not Available')),
  land_document_expiry date,
  area_ha numeric,
  village text,
  district text,
  regency text,
  province text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spatial_suppliers_company on public.spatial_suppliers(company_id);
create index if not exists idx_spatial_suppliers_land_status on public.spatial_suppliers(land_status);
create index if not exists idx_spatial_suppliers_coordinate on public.spatial_suppliers(latitude,longitude);

create table if not exists public.spatial_layers (
  id uuid primary key default gen_random_uuid(),
  layer_name text not null,
  layer_type text not null
    check (layer_type in ('company_boundary','supplier_boundary','hcv_hcs','peat','protected_area','deforestation_alert','hotspot','other')),
  company_id uuid references public.companies(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  supplier_id uuid references public.spatial_suppliers(id) on delete set null,
  monitoring_date date,
  source_name text,
  geojson jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spatial_layers_type on public.spatial_layers(layer_type);
create index if not exists idx_spatial_layers_company on public.spatial_layers(company_id);
create index if not exists idx_spatial_layers_date on public.spatial_layers(monitoring_date);

create table if not exists public.supplier_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.spatial_suppliers(id) on delete cascade,
  risk_score integer not null check (risk_score between 0 and 100),
  risk_level text not null check (risk_level in ('Low','Medium','High','Critical')),
  legal_risk_notes text,
  spatial_risk_notes text,
  recommendation text,
  assessment_json jsonb,
  assessed_by text,
  assessed_at timestamptz not null default now()
);

create index if not exists idx_supplier_assessment_supplier on public.supplier_risk_assessments(supplier_id);
create index if not exists idx_supplier_assessment_level on public.supplier_risk_assessments(risk_level);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_spatial_suppliers_updated_at on public.spatial_suppliers;
create trigger trg_spatial_suppliers_updated_at before update on public.spatial_suppliers
for each row execute function public.set_updated_at();

drop trigger if exists trg_spatial_layers_updated_at on public.spatial_layers;
create trigger trg_spatial_layers_updated_at before update on public.spatial_layers
for each row execute function public.set_updated_at();

-- Authenticated-user policies. No anonymous spatial data access.
alter table public.spatial_suppliers enable row level security;
alter table public.spatial_layers enable row level security;
alter table public.supplier_risk_assessments enable row level security;

drop policy if exists "authenticated_spatial_suppliers_all" on public.spatial_suppliers;
create policy "authenticated_spatial_suppliers_all" on public.spatial_suppliers
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_spatial_layers_all" on public.spatial_layers;
create policy "authenticated_spatial_layers_all" on public.spatial_layers
for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_supplier_risk_all" on public.supplier_risk_assessments;
create policy "authenticated_supplier_risk_all" on public.supplier_risk_assessments
for all to authenticated using (true) with check (true);

select 'V8.16 Spatial Monitoring database created successfully' as result;

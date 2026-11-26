-- SMD 2.0 additive development proposal. NOT applied to any database.
-- Requires verified V8.24 access control, a backup and an isolated staging project.
-- Initial modules are admin-only. Never run on production before testing policies.
begin;
do $$ begin
 if to_regprocedure('public.smd_is_admin()') is null then raise exception 'V8.24 admin policy helper required'; end if;
end $$;
create table public.smd2_no_buy_decisions (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid not null references public.spatial_suppliers(id) on delete restrict,
 decision text not null check (decision in ('Review','Blocked','Released')),
 reason text not null check (length(trim(reason))>0),
 decided_by uuid not null default auth.uid(),
 decided_at timestamptz not null default now()
);
create index smd2_no_buy_latest_idx on public.smd2_no_buy_decisions(supplier_id,decided_at desc,id desc);
alter table public.smd2_no_buy_decisions enable row level security;
revoke all on public.smd2_no_buy_decisions from anon,authenticated;
grant select on public.smd2_no_buy_decisions to authenticated;
grant insert(supplier_id,decision,reason) on public.smd2_no_buy_decisions to authenticated;
create policy smd2_no_buy_read on public.smd2_no_buy_decisions for select to authenticated using (public.smd_is_admin());
create policy smd2_no_buy_record on public.smd2_no_buy_decisions for insert to authenticated with check (public.smd_is_admin() and decided_by=auth.uid() and exists (select 1 from public.spatial_suppliers s where s.id=supplier_id));
-- Append-only via authenticated client: no update or delete privileges/policies.
create table public.smd2_knowledge_documents (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(trim(title))>0),
 category text not null check(category in ('SOP','Policy','Guideline','Work Instruction','Other')),
 document_code text not null default '',
 version text not null default '',
 keywords text not null default '',
 body text not null check(length(trim(body))>0 and length(body)<=1000000),
 storage_path text unique,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid(),
 search_vector tsvector generated always as (
  setweight(to_tsvector('simple'::regconfig,coalesce(title,'')||' '||coalesce(document_code,'')||' '||coalesce(keywords,'')),'A') ||
  setweight(to_tsvector('simple'::regconfig,coalesce(body,'')),'B')
 ) stored
);
create index smd2_knowledge_fts_idx on public.smd2_knowledge_documents using gin(search_vector);
alter table public.smd2_knowledge_documents enable row level security;
revoke all on public.smd2_knowledge_documents from anon,authenticated;
grant select on public.smd2_knowledge_documents to authenticated;
grant insert(title,category,document_code,version,keywords,body,storage_path) on public.smd2_knowledge_documents to authenticated;
create policy smd2_knowledge_read on public.smd2_knowledge_documents for select to authenticated using (public.smd_is_admin());
create policy smd2_knowledge_create on public.smd2_knowledge_documents for insert to authenticated with check (public.smd_is_admin() and created_by=auth.uid());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('smd2-knowledge','smd2-knowledge',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']);
create policy smd2_knowledge_files_read on storage.objects for select to authenticated using (bucket_id='smd2-knowledge' and public.smd_is_admin());
create policy smd2_knowledge_files_insert on storage.objects for insert to authenticated with check (bucket_id='smd2-knowledge' and public.smd_is_admin());
create policy smd2_knowledge_files_delete_orphan on storage.objects for delete to authenticated using (bucket_id='smd2-knowledge' and public.smd_is_admin() and not exists (select 1 from public.smd2_knowledge_documents d where d.storage_path=name));
-- Administrative master registers, initial Admin-only access.
create table public.smd2_audit_findings (
 id uuid primary key default gen_random_uuid(),
 audit_id uuid not null references public.audit_events(id) on delete restrict,
 category text not null check(category in ('NC','Observation','OFI','Legal Note','Other')),
 reference text not null default '',
 description text not null check(length(trim(description))>0),
 pic text not null default '',
 due_date date,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid()
);
create table public.smd2_finding_updates (
 id uuid primary key default gen_random_uuid(),
 finding_id uuid not null references public.smd2_audit_findings(id) on delete restrict,
 status text not null check(status in ('Open','In Progress','Verification','Closed')),
 note text not null check(length(trim(note))>0),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid()
);
create table public.smd2_company_legal_register (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete restrict,
 document_type text not null check(document_type in ('HGU','IUP','Environmental Permit','Other')),
 document_number text not null check(length(trim(document_number))>0),
 area_ha numeric check(area_ha>=0),
 issued_on date,
 valid_until date check(valid_until is null or issued_on is null or valid_until>=issued_on),
 notes text not null default '',
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid()
);
create index smd2_findings_audit_idx on public.smd2_audit_findings(audit_id);
create index smd2_finding_updates_idx on public.smd2_finding_updates(finding_id,created_at desc);
create index smd2_company_legal_idx on public.smd2_company_legal_register(company_id);
do $ declare t text; begin
 foreach t in array array['smd2_audit_findings','smd2_finding_updates','smd2_company_legal_register'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy smd2_admin_read on public.%I for select to authenticated using (public.smd_is_admin())',t);
  execute format('create policy smd2_admin_insert on public.%I for insert to authenticated with check (public.smd_is_admin() and created_by=auth.uid())',t);
 end loop;
end $;
grant insert(audit_id,category,reference,description,pic,due_date) on public.smd2_audit_findings to authenticated;
grant insert(finding_id,status,note) on public.smd2_finding_updates to authenticated;
grant insert(company_id,document_type,document_number,area_ha,issued_on,valid_until,notes) on public.smd2_company_legal_register to authenticated;
commit;

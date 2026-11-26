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
commit;

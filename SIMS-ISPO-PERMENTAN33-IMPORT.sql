-- ============================================================
-- SIMS MASTER IMPORT HELPER
-- ISPO Permentan 33/2025
-- ============================================================
-- This file complements SUPABASE-SIMS-V1.sql.
-- The application page Sustainability Assessment contains an
-- "Import Master Excel" function that reads the original KPN workbook
-- in the browser, lets the user select the source sheet, and upserts
-- Principle -> Criterion -> Indicator -> Object Evidence into Supabase.
--
-- This SQL creates a reusable RPC for JSON imports / future migrations.
-- It does NOT invent indicator text that is not present in the source workbook.
-- ============================================================

create or replace function public.sims_import_master_rows(
  p_standard_code text,
  p_rows jsonb,
  p_source_name text default 'SIMS - KPN - NDPE - ISPO Permentan 33 2025.xlsx'
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_standard_id uuid;
  v_row jsonb;
  v_principle_id uuid;
  v_criterion_id uuid;
  v_principle_count int := 0;
  v_criterion_count int := 0;
  v_indicator_count int := 0;
begin
  select id into v_standard_id
  from public.sims_standards
  where code = p_standard_code;

  if v_standard_id is null then
    raise exception 'SIMS standard % not found', p_standard_code;
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.sims_principles(standard_id,code,title,sort_order)
    values (
      v_standard_id,
      nullif(trim(v_row->>'principle_code'),'')::text,
      coalesce(nullif(trim(v_row->>'principle_title'),''), nullif(trim(v_row->>'principle_code'),'')),
      coalesce((v_row->>'principle_sort_order')::int,0)
    )
    on conflict (standard_id,code)
    do update set title = excluded.title
    returning id into v_principle_id;

    v_principle_count := v_principle_count + 1;

    insert into public.sims_criteria(principle_id,code,title,sort_order)
    values (
      v_principle_id,
      nullif(trim(v_row->>'criterion_code'),'')::text,
      coalesce(nullif(trim(v_row->>'criterion_title'),''), nullif(trim(v_row->>'criterion_code'),'')),
      coalesce((v_row->>'criterion_sort_order')::int,0)
    )
    on conflict (principle_id,code)
    do update set title = excluded.title
    returning id into v_criterion_id;

    v_criterion_count := v_criterion_count + 1;

    insert into public.sims_indicators(
      criterion_id,code,description,object_evidence,guidance,weight,sort_order,active,source_name
    )
    values (
      v_criterion_id,
      nullif(trim(v_row->>'indicator_code'),'')::text,
      coalesce(nullif(trim(v_row->>'indicator_description'),''), nullif(trim(v_row->>'indicator_code'),'')),
      nullif(trim(v_row->>'object_evidence'),''),
      nullif(trim(v_row->>'guidance'),''),
      coalesce((v_row->>'weight')::numeric,1),
      coalesce((v_row->>'indicator_sort_order')::int,0),
      true,
      p_source_name
    )
    on conflict (criterion_id,code)
    do update set
      description = excluded.description,
      object_evidence = excluded.object_evidence,
      guidance = excluded.guidance,
      weight = excluded.weight,
      sort_order = excluded.sort_order,
      active = true,
      source_name = excluded.source_name,
      updated_at = now();

    v_indicator_count := v_indicator_count + 1;
  end loop;

  return jsonb_build_object(
    'standard_code',p_standard_code,
    'rows_processed',v_indicator_count,
    'source_name',p_source_name
  );
end;
$$;

grant execute on function public.sims_import_master_rows(text,jsonb,text) to authenticated;

-- Verification queries after importing the workbook from the SIMS UI:
-- select code,name,version from public.sims_standards order by code;
-- select count(*) principles from public.sims_principles p join public.sims_standards s on s.id=p.standard_id where s.code='ISPO-P33-2025';
-- select count(*) criteria from public.sims_criteria c join public.sims_principles p on p.id=c.principle_id join public.sims_standards s on s.id=p.standard_id where s.code='ISPO-P33-2025';
-- select count(*) indicators from public.sims_indicators i join public.sims_criteria c on c.id=i.criterion_id join public.sims_principles p on p.id=c.principle_id join public.sims_standards s on s.id=p.standard_id where s.code='ISPO-P33-2025';

select 'SIMS ISPO import helper ready. Upload the original Excel through Sustainability Assessment > Import Master Excel.' as result;

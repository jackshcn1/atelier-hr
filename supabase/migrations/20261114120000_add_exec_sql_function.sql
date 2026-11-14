-- =====================================================================
-- Migration: Add exec_sql RPC for running SQL against the live database
-- =====================================================================
-- Purpose: allow the service_role key to run DDL/DML and SELECT statements
-- without opening the Supabase Dashboard SQL Editor by hand.
--
-- SECURITY: these functions run as their owner (postgres) and are revoked
-- from anon, authenticated and PUBLIC. Only the service_role key may call
-- them. Without the REVOKE statements below, the public anon key would be
-- able to execute arbitrary SQL against production.
-- =====================================================================

-- Run DDL/DML. Returns {ok, row_count} or {ok:false, error, code}.
create or replace function public.exec_sql(q text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows bigint;
begin
  execute q;
  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'row_count', v_rows);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'code', sqlstate);
end;
$$;

-- Run a SELECT and return the rows as JSON.
create or replace function public.exec_sql_select(q text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into v;
  return jsonb_build_object('ok', true, 'rows', v);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm, 'code', sqlstate);
end;
$$;

revoke all on function public.exec_sql(text) from public, anon, authenticated;
revoke all on function public.exec_sql_select(text) from public, anon, authenticated;

grant execute on function public.exec_sql(text) to service_role;
grant execute on function public.exec_sql_select(text) to service_role;

notify pgrst, 'reload schema';

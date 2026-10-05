-- Nach 001–006 einmal ausführen. Historische Geschäftszahlen bleiben privat.
begin;
-- Keep the existing scoped workday query private. No second public data endpoint.
alter function public.employee_snapshot() set schema heimfriseur_private;
alter function heimfriseur_private.employee_snapshot() rename to employee_workday_snapshot;
revoke all on function heimfriseur_private.employee_workday_snapshot() from public,anon,authenticated;
create function public.employee_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; closed_ids uuid[];
begin
 result:=heimfriseur_private.employee_workday_snapshot();
 select coalesce(array_agg((x->>'id')::uuid),'{}') into closed_ids
 from jsonb_array_elements(result->'treatments') x where x->>'end_time' is not null;
 result:=jsonb_set(result,'{treatments}',coalesce((select jsonb_agg(
  case when (x->>'id')::uuid=any(closed_ids) then
   x||jsonb_build_object('total_price',null,'material_cost',null,'price_override',null)
  else x end) from jsonb_array_elements(result->'treatments') x),'[]'::jsonb));
 result:=jsonb_set(result,'{treatment_services}',coalesce((select jsonb_agg(
  case when (x->>'treatment_id')::uuid=any(closed_ids) then
   x||jsonb_build_object('price_snapshot',null) else x end)
  from jsonb_array_elements(result->'treatment_services') x),'[]'::jsonb));
 -- A payment status may be recorded without exposing the historical amount.
 result:=jsonb_set(result,'{treatment_payments}',coalesce((select jsonb_agg(
  x||jsonb_build_object('amount',null))
  from jsonb_array_elements(result->'treatment_payments') x),'[]'::jsonb));
 return result;
end $$;
revoke all on function public.employee_snapshot() from public,anon;
grant execute on function public.employee_snapshot() to authenticated;
commit;

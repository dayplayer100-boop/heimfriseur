-- Nach 001–007 einmal ausführen. Keine Änderung bestehender Rollen oder Kundendaten.
begin;
do $$ begin
 if to_regprocedure('heimfriseur_private.employee_workday_snapshot()') is null then raise exception 'Bitte zuerst die Migrationen 001–007 installieren.'; end if;
end $$;
create function heimfriseur_private.session_actor() returns uuid language sql stable set search_path=public,pg_temp as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',auth.uid()::text)::uuid
$$;
revoke all on function heimfriseur_private.session_actor() from public,anon,authenticated;
create function heimfriseur_private.session_allowed() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from auth.users where id=heimfriseur_private.session_actor() and email_confirmed_at is not null)
 and (coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors where user_id=heimfriseur_private.session_actor() and status='verified'))
$$;
revoke all on function heimfriseur_private.session_allowed() from public,anon,authenticated;
create or replace function public.require_user() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=heimfriseur_private.session_actor() and email_confirmed_at is not null) then
  raise exception 'Bitte zuerst die E-Mail-Adresse bestätigen.' using errcode='42501'; end if;
 if not heimfriseur_private.session_allowed() then raise exception 'Bitte zuerst die Zwei-Faktor-Anmeldung abschließen.' using errcode='42501'; end if;
 return auth.uid();
end $$;
create or replace function heimfriseur_private.is_app_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select heimfriseur_private.session_allowed() and exists(select 1 from public.app_admins where user_id=auth.uid() and is_active)
$$;
create or replace function heimfriseur_private.is_owner(p_business uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select heimfriseur_private.session_allowed() and case when heimfriseur_private.is_app_admin() then p_business=heimfriseur_private.admin_business()
 else exists(select 1 from public.business_memberships where user_id=auth.uid() and business_id=p_business and role='owner' and is_active) end $$;
create or replace function heimfriseur_private.membership() returns public.business_memberships language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships; b uuid; adm public.app_admins; begin
 perform public.require_user();
 select * into adm from public.app_admins where user_id=auth.uid() and is_active for share;
 if found then
 b:=heimfriseur_private.admin_business();
 if b is null then raise exception 'Bitte zuerst ein Unternehmen im App-Admin-Bereich auswählen.' using errcode='42501'; end if;
 select * into m from public.business_memberships where business_id=b and role='owner' order by created_at limit 1;
 if m.id is null then raise exception 'Für dieses Unternehmen fehlt der Geschäftsführer.' using errcode='42501'; end if;
 -- A synthetic owner context leaves actual memberships and the proprietor unchanged.
 m.user_id:=auth.uid();m.display_name:='App-Admin';m.is_active:=true;m.onboarding_completed:=adm.onboarding_completed;
 return m;
 end if;
 select * into m from public.business_memberships where user_id=auth.uid() and is_active for share;
 if not found then raise exception 'Kein aktiver Unternehmenszugang. Bitte Geschäftsführer kontaktieren.' using errcode='42501'; end if;
 return m; end $$;

-- Prevent accidental callable internal helpers; keep the policy predicate available.
revoke all on function public.require_user() from public,anon;
grant execute on function public.require_user() to authenticated;
revoke all on function heimfriseur_private.membership() from public,anon,authenticated;
revoke all on function heimfriseur_private.is_app_admin() from public,anon,authenticated;
revoke all on function heimfriseur_private.is_owner(uuid) from public,anon;
grant execute on function heimfriseur_private.is_owner(uuid) to authenticated;
-- Put pg_temp last in every application SECURITY DEFINER entry point,
-- including preserved legacy implementations. Only named application functions.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join (values
('heimfriseur_private','admin_business'),
('heimfriseur_private','admin_visible_business'),
('heimfriseur_private','allowed'),
('heimfriseur_private','audit_admin_change'),
('heimfriseur_private','check_performer'),
('heimfriseur_private','customer_access'),
('heimfriseur_private','due'),
('heimfriseur_private','general_group'),
('heimfriseur_private','is_app_admin'),
('heimfriseur_private','is_owner'),
('heimfriseur_private','membership'),
('heimfriseur_private','next_customer_date'),
('heimfriseur_private','owner'),
('heimfriseur_private','provisional_facility'),
('heimfriseur_private','seed_facility_prices'),
('heimfriseur_private','seed_new_service_prices'),
('heimfriseur_private','seed_payment_methods'),
('heimfriseur_private','session_actor'),
('heimfriseur_private','session_allowed'),
('heimfriseur_private','snapshot_facility_price'),
('heimfriseur_private','stamp'),
('heimfriseur_private','sync_business_name'),
('heimfriseur_private','sync_future'),
('heimfriseur_private','sync_visit'),
('heimfriseur_private','visit'),
('public','accept_team_invite'),
('public','add_customer_to_visit'),
('public','add_visit_customer'),
('public','assign_visit'),
('public','audit_admin_business_access'),
('public','bootstrap_app_admin'),
('public','cancel_visit'),
('public','close_visit'),
('public','complete_onboarding'),
('public','complete_setup'),
('public','correct_treatment'),
('public','create_team_invite'),
('public','employee_snapshot'),
('public','get_app_admin_context'),
('public','get_team_context'),
('public','guard_formula'),
('public','initialize_account'),
('public','move_visit'),
('public','plan_customer_visit'),
('public','plan_visit'),
('public','plan_visit_flexible'),
('public','record_payment'),
('public','require_user'),
('public','reschedule_customer_once'),
('public','resolve_feedback'),
('public','revoke_team_invite'),
('public','save_billing'),
('public','save_cohort'),
('public','save_customer'),
('public','save_facility_price_list'),
('public','save_group_flexible'),
('public','save_payment_method'),
('public','save_treatment'),
('public','set_app_admin'),
('public','set_facility_price'),
('public','set_member_active'),
('public','set_member_permissions'),
('public','skip_customer'),
('public','skip_customer_choice'),
('public','skip_customer_followup'),
('public','start_treatment'),
('public','submit_feedback'),
('public','take_over_treatment'),
('public','touch_updated')
,
('heimfriseur_private','accept_team_invite'),
('heimfriseur_private','add_customer_to_visit'),
('heimfriseur_private','add_visit_customer'),
('heimfriseur_private','assign_visit'),
('heimfriseur_private','audit_admin_business_access'),
('heimfriseur_private','bootstrap_app_admin'),
('heimfriseur_private','cancel_visit'),
('heimfriseur_private','close_visit'),
('heimfriseur_private','complete_onboarding'),
('heimfriseur_private','complete_setup'),
('heimfriseur_private','correct_treatment'),
('heimfriseur_private','create_team_invite'),
('heimfriseur_private','employee_snapshot'),
('heimfriseur_private','get_app_admin_context'),
('heimfriseur_private','get_team_context'),
('heimfriseur_private','guard_formula'),
('heimfriseur_private','initialize_account'),
('heimfriseur_private','move_visit'),
('heimfriseur_private','plan_customer_visit'),
('heimfriseur_private','plan_visit'),
('heimfriseur_private','plan_visit_flexible'),
('heimfriseur_private','record_payment'),
('heimfriseur_private','require_user'),
('heimfriseur_private','reschedule_customer_once'),
('heimfriseur_private','resolve_feedback'),
('heimfriseur_private','revoke_team_invite'),
('heimfriseur_private','save_billing'),
('heimfriseur_private','save_cohort'),
('heimfriseur_private','save_customer'),
('heimfriseur_private','save_facility_price_list'),
('heimfriseur_private','save_group_flexible'),
('heimfriseur_private','save_payment_method'),
('heimfriseur_private','save_treatment'),
('heimfriseur_private','set_app_admin'),
('heimfriseur_private','set_facility_price'),
('heimfriseur_private','set_member_active'),
('heimfriseur_private','set_member_permissions'),
('heimfriseur_private','skip_customer'),
('heimfriseur_private','skip_customer_choice'),
('heimfriseur_private','skip_customer_followup'),
('heimfriseur_private','start_treatment'),
('heimfriseur_private','submit_feedback'),
('heimfriseur_private','take_over_treatment'),
('heimfriseur_private','touch_updated'),
('heimfriseur_private','employee_workday_snapshot')
) allowed(schema_name,function_name) on allowed.schema_name=n.nspname and allowed.function_name=p.proname
 where p.prosecdef loop
 execute format('alter function %s set search_path=pg_catalog,public,pg_temp',f.signature);
 end loop;
end $$;
commit;

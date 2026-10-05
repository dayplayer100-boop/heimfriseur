-- HeimFriseur 5: verständliche Einrichtung, Heimpreislisten und Einzeltermine.
-- Nach 001–004 einmal ausführen. Bestehende Daten bleiben erhalten.
begin;
alter table public.business_memberships add column setup_completed boolean not null default false;
alter table public.facilities add column price_list_customized boolean not null default false;
-- Bereits bewusst hinterlegte Heimpreise behalten immer Vorrang.
update public.facilities f set price_list_customized=true where exists(select 1 from public.facility_service_prices p where p.facility_id=f.id);
create function heimfriseur_private.admin_visible_business(p_business uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.businesses b where b.id=p_business and (
 not exists(select 1 from public.app_admins a where a.user_id=b.owner_user_id and a.is_active)
 or exists(select 1 from public.facilities f where f.business_id=b.id)
 or exists(select 1 from public.customers c where c.business_id=b.id)
 or exists(select 1 from public.appointments a where a.business_id=b.id))) $$;
create or replace function heimfriseur_private.admin_business() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
 declare requested text; b uuid; n integer;begin
 if not heimfriseur_private.is_app_admin() then return null;end if;
 begin requested:=nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-heimfriseur-business-id','');b:=requested::uuid;
 exception when invalid_text_representation then raise exception 'Bitte ein gültiges Unternehmen auswählen.' using errcode='42501';end;
 if b is not null then
 if not exists(select 1 from public.businesses where id=b) then raise exception 'Dieses Unternehmen ist nicht verfügbar.' using errcode='42501';end if;
 if heimfriseur_private.admin_visible_business(b) then return b;end if;
 end if;
 select count(*) into n from public.businesses x where heimfriseur_private.admin_visible_business(x.id);
 if n=1 then select id into b from public.businesses x where heimfriseur_private.admin_visible_business(x.id);return b;end if;
 return null;end $$;
create or replace function public.get_app_admin_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not heimfriseur_private.is_app_admin() then return jsonb_build_object('is_admin',false);end if;
 return jsonb_build_object('is_admin',true,'selected_business_id',heimfriseur_private.admin_business(),
 'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'owner_user_id',b.owner_user_id,'owner_email',u.email) order by b.name) from public.businesses b join auth.users u on u.id=b.owner_user_id where heimfriseur_private.admin_visible_business(b.id)),'[]'::jsonb),
 'admins',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'is_active',a.is_active) order by a.created_at) from public.app_admins a join auth.users u on u.id=a.user_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.app_admin_audit order by created_at desc limit 50) x),'[]'::jsonb));end $$;
create or replace function public.get_team_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); result jsonb; begin
 select jsonb_build_object('business',to_jsonb(b),'membership',to_jsonb(m),
 'members',coalesce((select jsonb_agg(to_jsonb(x)) from public.business_memberships x where x.business_id=m.business_id),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(x)) from public.appointment_assignments x where x.business_id=m.business_id and (m.role='owner' or x.appointment_id in (select appointment_id from public.appointment_assignments where user_id=m.user_id))),'[]'::jsonb),
 'invitations',case when m.role='owner' then coalesce((select jsonb_agg(to_jsonb(x)-'token_hash') from public.team_invitations x where x.business_id=m.business_id),'[]'::jsonb) else '[]'::jsonb end,
 'audit',case when m.role='owner' and heimfriseur_private.is_app_admin() then coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_events where business_id=m.business_id and (heimfriseur_private.is_app_admin() or not exists(select 1 from public.app_admins adm where adm.user_id=audit_events.actor_id)) order by created_at desc limit 100) x),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.businesses b where b.id=m.business_id; return result; end $$;

create function public.complete_setup() returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership();begin
 if m.role<>'owner' then raise exception 'Nur der Geschäftsführer richtet das Unternehmen ein.' using errcode='42501';end if;
 if not heimfriseur_private.is_app_admin() then update public.business_memberships set setup_completed=true,onboarding_completed=true where id=m.id;end if;end $$;
-- Every facility gets a complete initial price list. The earliest facility is
-- the default for future facilities; explicitly edited lists are independent.
create function heimfriseur_private.seed_facility_prices() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare first_facility uuid;begin
 select id into first_facility from public.facilities where user_id=new.user_id and id<>new.id and not is_provisional order by created_at,id limit 1;
 insert into public.facility_service_prices(user_id,facility_id,service_id,price)
 select new.user_id,new.id,s.id,coalesce((select p.price from public.facility_service_prices p where p.facility_id=first_facility and p.service_id=s.id),s.price) from public.services s where s.user_id=new.user_id on conflict(facility_id,service_id) do nothing;
 return new;end $$;
create trigger initial_facility_prices after insert on public.facilities for each row execute function heimfriseur_private.seed_facility_prices();
insert into public.facility_service_prices(user_id,facility_id,service_id,price) select f.user_id,f.id,s.id,coalesce((select p.price from public.facility_service_prices p where p.service_id=s.id and p.facility_id=(select first.id from public.facilities first where first.user_id=f.user_id and not first.is_provisional order by first.created_at,first.id limit 1)),s.price) from public.facilities f join public.services s on s.user_id=f.user_id on conflict(facility_id,service_id) do nothing;
create function heimfriseur_private.seed_new_service_prices() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into public.facility_service_prices(user_id,facility_id,service_id,price) select new.user_id,f.id,new.id,new.price from public.facilities f where f.user_id=new.user_id on conflict(facility_id,service_id) do nothing;return new;end $$;
create trigger initial_new_service_prices after insert on public.services for each row execute function heimfriseur_private.seed_new_service_prices();
create function public.save_facility_price_list(p_facility uuid,p_prices jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); item record; first_facility uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(u::text||'-prices',0));
 if not exists(select 1 from public.facilities where id=p_facility and user_id=u) then raise exception 'Heim nicht gefunden.';end if;
 if p_prices is null or jsonb_typeof(p_prices)<>'object' then raise exception 'Bitte eine gültige Preisliste eingeben.';end if;
 select id into first_facility from public.facilities where user_id=u and not is_provisional order by created_at,id limit 1;
 for item in select * from jsonb_each_text(p_prices) loop
 if not exists(select 1 from public.services where id=item.key::uuid and user_id=u) or item.value is null or item.value::numeric<0 or item.value::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Bitte gültige Leistungen und nicht negative Preise eingeben.';end if;
 insert into public.facility_service_prices(user_id,facility_id,service_id,price) values(u,p_facility,item.key::uuid,item.value::numeric) on conflict(facility_id,service_id) do update set price=excluded.price;
 if p_facility=first_facility then
 update public.services set price=item.value::numeric where id=item.key::uuid and user_id=u;
 update public.facility_service_prices p set price=item.value::numeric from public.facilities f where f.id=p.facility_id and f.user_id=u and not f.price_list_customized and f.id<>p_facility and p.service_id=item.key::uuid;
 end if;end loop;
 update public.facilities set price_list_customized=true where id=p_facility;end $$;
alter table public.appointments add column selected_customer_id uuid;
alter table public.appointments add constraint appointments_selected_customer_fk foreign key(selected_customer_id,user_id) references public.customers(id,user_id) on delete restrict;
create function public.plan_customer_visit(p_facility uuid,p_group uuid,p_customer uuid,p_date date,p_time time,p_weeks integer default null,p_all boolean default true,p_cohort uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership();actor uuid:=auth.uid();u uuid; a uuid;begin
 select owner_user_id into u from public.businesses where id=m.business_id;
 if m.role<>'owner' then
 if not heimfriseur_private.allowed('edit_schedule') then raise exception 'Neue Termine darfst du nicht planen.' using errcode='42501';end if;
 if not exists(select 1 from public.appointments v join public.appointment_assignments x on x.appointment_id=v.id where x.user_id=actor and v.facility_id=p_facility and (v.all_groups or v.group_id=p_group)) then raise exception 'Bitte eine zugewiesene Gruppe wählen.' using errcode='42501';end if;
 if p_customer is not null then perform heimfriseur_private.customer_access(p_customer);end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 end if;
 a:=public.plan_visit_flexible(p_facility,p_group,p_date,p_time,p_weeks,p_all and p_customer is null,jsonb_build_object('cohort_id',p_cohort));
 if m.role='employee' then
 update public.appointments set created_by=actor where id=a;
 delete from public.appointment_assignments where appointment_id=a;
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) values(m.business_id,a,actor,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 end if;
 if p_customer is not null then perform public.add_visit_customer(a,p_customer);update public.appointments set selected_customer_id=p_customer where id=a;end if;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(m.business_id,actor,'visit_planned',a,jsonb_build_object('customer_id',p_customer));return a;end $$;
create or replace function public.close_visit(p_appointment uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=public.require_user(); u uuid:=heimfriseur_private.visit(p_appointment,true); a public.appointments; nxt uuid; begin
 if not heimfriseur_private.allowed('close_visits') then raise exception 'Besuche darfst du nicht abschließen.' using errcode='42501'; end if;
 select * into a from public.appointments where id=p_appointment for update;
 if a.status='Abgesagt' then raise exception 'Ein abgesagter Besuch kann nicht abgeschlossen werden.'; end if;
 if a.status<>'Abgeschlossen' then
 if exists(select 1 from public.appointment_customers where appointment_id=a.id and status in ('Offen','In Behandlung')) then raise exception 'Bitte alle Kunden erledigen oder als nicht durchgeführt markieren.'; end if;
 update public.appointments set status='Abgeschlossen',actual_end_time=case when actual_start_time is not null then now() end where id=a.id;
 insert into public.audit_events(business_id,actor_id,action,record_id) values(a.business_id,actor,'visit_closed',a.id);
 end if;
 if a.recurrence_weeks is not null then
 select id into nxt from public.appointments where user_id=u and recurrence_series_id=a.recurrence_series_id and appointment_date=a.appointment_date+a.recurrence_weeks*7;
 if nxt is null then
 perform set_config('request.jwt.claim.sub',u::text,true);
 nxt:=public.plan_visit_flexible(a.facility_id,case when a.all_groups then null else a.group_id end,a.appointment_date+a.recurrence_weeks*7,a.start_time,a.recurrence_weeks,a.auto_include_due,jsonb_build_object('series_id',a.recurrence_series_id,'cohort_id',a.cohort_id));
 if a.selected_customer_id is not null then
 update public.appointments set selected_customer_id=a.selected_customer_id where id=nxt;
 if exists(select 1 from public.customers where id=a.selected_customer_id and status='Aktiv' and hair_request<>'Nein') then perform public.add_visit_customer(nxt,a.selected_customer_id);end if;
 end if;
 delete from public.appointment_assignments where appointment_id=nxt;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.appointments set created_by=actor where id=nxt;
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible)
 select a.business_id,nxt,x.user_id,x.is_responsible from public.appointment_assignments x join public.business_memberships m on m.user_id=x.user_id and m.is_active where x.appointment_id=a.id;
 if not exists(select 1 from public.appointment_assignments where appointment_id=nxt) then insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) values(a.business_id,nxt,u,true); end if;
 end if; end if; return nxt; end $$;

-- Technical change log belongs exclusively to the platform administrator.
create or replace function heimfriseur_private.audit_admin_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid; row_data jsonb; begin
 actor:=nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid;
 if actor is null then actor:=auth.uid();end if;
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if actor is not null and exists(select 1 from auth.users where id=actor) then
 insert into public.app_admin_audit(actor_id,action,business_id,details) values(actor,'data_changed',(row_data->>'business_id')::uuid,jsonb_build_object('table',tg_table_name,'operation',tg_op,'record_id',row_data->>'id'));
 end if;return null;end $$;
do $$ declare r record;begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='heimfriseur_private' and p.proname in ('admin_visible_business','seed_facility_prices','seed_new_service_prices') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('complete_setup','save_facility_price_list','plan_customer_visit') loop execute format('revoke all on function %s from public,anon',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;end $$;
commit;

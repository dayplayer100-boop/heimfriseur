-- HeimFriseur 4: expliziter App-Admin. Nach 001, 002 und 003 einmal ausführen.
-- Kein Benutzer wird durch diese Migration automatisch zum App-Admin.
begin;
do $$ begin
 if to_regclass('public.cohorts') is null or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_memberships' and column_name='onboarding_completed') then raise exception 'Bitte zuerst die Migrationen 002 und 003 ausführen.';end if;
end $$;
create table public.app_admins (
 user_id uuid primary key references auth.users(id) on delete restrict,
 is_active boolean not null default true,
 onboarding_completed boolean not null default false,
 granted_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.app_admin_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id),
 action text not null,
 business_id uuid references public.businesses(id),
 target_user_id uuid references auth.users(id),
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
alter table public.app_admin_audit enable row level security;
revoke all on public.app_admins,public.app_admin_audit from anon,authenticated;
create index app_admin_audit_created on public.app_admin_audit(created_at desc);
create function heimfriseur_private.is_app_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.app_admins where user_id=auth.uid() and is_active) $$;
-- A request header identifies the selected company, never the privilege itself.
-- Authenticated identity and the protected registry are checked for every request.
create function heimfriseur_private.admin_business() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
 declare headers jsonb; requested text; b uuid; begin
 if not heimfriseur_private.is_app_admin() then return null; end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 requested:=nullif(headers->>'x-heimfriseur-business-id','');
 if requested is null then return null; end if;
 b:=requested::uuid;
 exception when invalid_text_representation then raise exception 'Bitte ein gültiges Unternehmen auswählen.' using errcode='42501'; end;
 if not exists(select 1 from public.businesses where id=b) then raise exception 'Dieses Unternehmen ist nicht verfügbar.' using errcode='42501'; end if;
 return b; end $$;
create or replace function heimfriseur_private.is_owner(p_business uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when heimfriseur_private.is_app_admin() then p_business=heimfriseur_private.admin_business()
 else exists(select 1 from public.business_memberships where user_id=auth.uid() and business_id=p_business and role='owner' and is_active) end $$;
create or replace function heimfriseur_private.membership() returns public.business_memberships language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships; b uuid; adm public.app_admins; begin
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
create or replace function public.complete_onboarding() returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships; begin
 if heimfriseur_private.is_app_admin() then update public.app_admins set onboarding_completed=true where user_id=auth.uid();
 else m:=heimfriseur_private.membership();update public.business_memberships set onboarding_completed=true where id=m.id;end if;end $$;
-- Existing auth.users foreign key remains. A checked trigger admits an App-Admin
-- as performer without moving that account into another company's team.
alter table public.treatments drop constraint treatment_performer_member;
create function heimfriseur_private.check_performer() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if tg_op='UPDATE' and new.performed_by=old.performed_by and new.business_id=old.business_id then return new; end if;
 if exists(select 1 from public.business_memberships where business_id=new.business_id and user_id=new.performed_by and is_active) then return new; end if;
 if new.performed_by=auth.uid() and heimfriseur_private.is_app_admin() and new.business_id=heimfriseur_private.admin_business() then return new; end if;
 raise exception 'Die ausführende Person hat keinen Zugang zu diesem Unternehmen.' using errcode='42501';end $$;
create trigger checked_treatment_performer before insert or update of performed_by,business_id on public.treatments for each row execute function heimfriseur_private.check_performer();
create function public.get_app_admin_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not heimfriseur_private.is_app_admin() then return jsonb_build_object('is_admin',false);end if;
 return jsonb_build_object('is_admin',true,'selected_business_id',heimfriseur_private.admin_business(),
 'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'owner_user_id',b.owner_user_id,'owner_email',u.email) order by b.name) from public.businesses b join auth.users u on u.id=b.owner_user_id),'[]'::jsonb),
 'admins',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'is_active',a.is_active) order by a.created_at) from public.app_admins a join auth.users u on u.id=a.user_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.app_admin_audit order by created_at desc limit 50) x),'[]'::jsonb));end $$;
create function public.set_app_admin(p_email text,p_active boolean default true) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare target uuid; confirmed timestamptz; actor uuid:=auth.uid(); begin
 -- Serialise grants/revocations to prevent concurrent removal of the last admin.
 perform pg_advisory_xact_lock(hashtextextended('heimfriseur-app-admin-registry',0));
 if not heimfriseur_private.is_app_admin() then raise exception 'Nur ein App-Admin darf App-Admin-Rechte vergeben.' using errcode='42501';end if;
 select id,email_confirmed_at into target,confirmed from auth.users where lower(email)=lower(trim(p_email));
 if target is null or confirmed is null then raise exception 'Bitte ein bereits registriertes und bestätigtes Konto auswählen.';end if;
 if not p_active and exists(select 1 from public.app_admins where user_id=target and is_active) and (select count(*) from public.app_admins where is_active)<=1 then raise exception 'Der letzte aktive App-Admin kann nicht deaktiviert werden.';end if;
 insert into public.app_admins(user_id,is_active,granted_by) values(target,p_active,actor) on conflict(user_id) do update set is_active=excluded.is_active,granted_by=excluded.granted_by;
 insert into public.app_admin_audit(actor_id,action,target_user_id,details) values(actor,'admin_access_changed',target,jsonb_build_object('is_active',p_active));end $$;
create function public.audit_admin_business_access(p_business uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not heimfriseur_private.is_app_admin() then raise exception 'Kein App-Admin-Zugang.' using errcode='42501';end if;
 if not exists(select 1 from public.businesses where id=p_business) then raise exception 'Unternehmen nicht gefunden.';end if;
 insert into public.app_admin_audit(actor_id,action,business_id) values(auth.uid(),'business_opened',p_business);end $$;
-- Deliberately inaccessible from the browser, including authenticated owners.
-- The database operator can bootstrap exactly one verified first admin in SQL.
create function public.bootstrap_app_admin(p_email text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare target uuid; confirmed timestamptz;begin
 perform pg_advisory_xact_lock(hashtextextended('heimfriseur-app-admin-registry',0));
 if exists(select 1 from public.app_admins where is_active) then raise exception 'Ein App-Admin ist bereits eingerichtet. Weitere Zugänge dort vergeben.';end if;
 select id,email_confirmed_at into target,confirmed from auth.users where lower(email)=lower(trim(p_email));
 if target is null or confirmed is null then raise exception 'Die Admin-Adresse muss zuerst registriert und per E-Mail bestätigt werden.';end if;
 insert into public.app_admins(user_id) values(target) on conflict(user_id) do update set is_active=true;
 insert into public.app_admin_audit(action,target_user_id) values('admin_bootstrapped_in_sql',target);end $$;
-- Log administrative data changes without duplicating customer notes or photos.
create function heimfriseur_private.audit_admin_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid; row_data jsonb;begin
 actor:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',auth.uid()::text)::uuid;
 if exists(select 1 from public.app_admins where user_id=actor and is_active) then
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.app_admin_audit(actor_id,action,business_id,details) values(actor,'data_changed',(row_data->>'business_id')::uuid,jsonb_build_object('table',tg_table_name,'operation',tg_op,'record_id',row_data->>'id'));
 end if;return null;end $$;
do $$ declare t text;r record;begin
 foreach t in array array['profiles','facilities','groups','customers','services','customer_default_services','appointments','appointment_customers','treatments','treatment_services','color_formulas','cohorts','facility_service_prices','payment_methods','customer_billing','treatment_payments','feedback','business_memberships','appointment_assignments'] loop
 execute format('create trigger app_admin_changes after insert or update or delete on public.%I for each row execute function heimfriseur_private.audit_admin_change()',t);end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='heimfriseur_private' and p.proname in ('is_app_admin','admin_business','check_performer','audit_admin_change') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_app_admin_context','set_app_admin','audit_admin_business_access') loop execute format('revoke all on function %s from public,anon',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;
 end $$;
revoke all on function public.bootstrap_app_admin(text) from public,anon,authenticated;
commit;

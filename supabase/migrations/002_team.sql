-- HeimFriseur: sichere Teams. Nach 001 ausführen; bestehende Daten bleiben erhalten.
begin;
revoke create on schema public from public,anon,authenticated;
create schema heimfriseur_private;
revoke all on schema heimfriseur_private from public, anon, authenticated;
create table public.businesses (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null unique references auth.users(id),
 name text not null default 'Mein Unternehmen', created_at timestamptz not null default now()
);
create table public.business_memberships (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 user_id uuid not null unique references auth.users(id), role text not null check(role in ('owner','employee')),
 display_name text not null default '', is_active boolean not null default true,
 created_at timestamptz not null default now(), unique(business_id,user_id)
);
create table public.team_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 email text not null check(email=lower(trim(email))), token_hash text not null unique,
 expires_at timestamptz not null default now()+interval '7 days', revoked_at timestamptz,
 accepted_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.appointment_assignments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 user_id uuid not null, is_responsible boolean not null default false,
 foreign key(business_id,user_id) references public.business_memberships(business_id,user_id),
 unique(appointment_id,user_id)
);
create unique index one_responsible on public.appointment_assignments(appointment_id) where is_responsible;
create index assignment_employee on public.appointment_assignments(user_id,appointment_id);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 actor_id uuid not null references auth.users(id), action text not null, record_id uuid,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_business_time on public.audit_events(business_id,created_at desc);
insert into public.businesses(owner_user_id,name) select user_id,coalesce(nullif(business_name,''),'Mein Unternehmen') from public.profiles;
insert into public.business_memberships(business_id,user_id,role,display_name)
 select b.id,p.user_id,'owner',trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) from public.profiles p join public.businesses b on b.owner_user_id=p.user_id;
-- Keep user_id as the original business proprietor: all existing composite FKs and old clients remain valid.
do $$ declare t text; begin
 foreach t in array array['profiles','facilities','groups','customers','services','customer_default_services','appointments','appointment_customers','treatments','treatment_services','color_formulas'] loop
 execute format('alter table public.%I add column business_id uuid references public.businesses(id)',t);
 execute format('update public.%I r set business_id=b.id from public.businesses b where b.owner_user_id=r.user_id',t);
 execute format('alter table public.%I alter column business_id set not null',t);
 execute format('create index %I on public.%I(business_id)',t||'_business',t);
 end loop; end $$;
alter table public.appointments add constraint appointments_business_identity unique(id,business_id);
alter table public.appointment_assignments add constraint assignment_same_business foreign key(appointment_id,business_id) references public.appointments(id,business_id) on delete cascade;
alter table public.appointments add column created_by uuid references auth.users(id) default auth.uid();
update public.appointments set created_by=user_id;
alter table public.appointments alter column created_by set not null;
alter table public.treatments add column created_by uuid references auth.users(id) default auth.uid();
update public.treatments set created_by=user_id;
alter table public.treatments alter column created_by set not null;
alter table public.treatments add column performed_by uuid references auth.users(id);
update public.treatments set performed_by=user_id;
alter table public.treatments alter column performed_by set not null;
alter table public.treatments add constraint treatment_performer_member foreign key(business_id,performed_by) references public.business_memberships(business_id,user_id);
drop index public.treatments_one_running;
create unique index treatments_one_running on public.treatments(performed_by) where end_time is null;
create unique index treatments_customer_running on public.treatments(business_id,customer_id) where end_time is null;
insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) select business_id,id,user_id,true from public.appointments;

create function heimfriseur_private.membership() returns public.business_memberships language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships; begin
 select * into m from public.business_memberships where user_id=auth.uid() and is_active for share;
 if not found then raise exception 'Kein aktiver Unternehmenszugang. Bitte Geschäftsführer kontaktieren.' using errcode='42501'; end if;
 return m; end $$;
create function heimfriseur_private.owner() returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); u uuid; begin
 if m.role<>'owner' then raise exception 'Diese Aktion ist nur für den Geschäftsführer erlaubt.' using errcode='42501'; end if;
 select owner_user_id into u from public.businesses where id=m.business_id; return u; end $$;
create function heimfriseur_private.is_owner(p_business uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.business_memberships where user_id=auth.uid() and business_id=p_business and role='owner' and is_active) $$;
create function heimfriseur_private.visit(p_appointment uuid,p_close boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); a public.appointments; x public.appointment_assignments; begin
 select * into a from public.appointments where id=p_appointment and business_id=m.business_id for update;
 if not found then raise exception 'Kein Zugriff auf diesen Besuch.' using errcode='42501'; end if;
 if m.role<>'owner' then
 select * into x from public.appointment_assignments where appointment_id=a.id and user_id=m.user_id for share;
 if not found or (p_close and not x.is_responsible) then raise exception 'Dieser Besuch ist dir nicht zur Bearbeitung oder zum Abschluss zugewiesen.' using errcode='42501'; end if;
 end if; return a.user_id; end $$;
create function heimfriseur_private.stamp() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare b uuid; begin
 select id into b from public.businesses where owner_user_id=new.user_id;
 if b is null or (new.business_id is not null and new.business_id<>b) then raise exception 'Ungültige Unternehmenszuordnung.' using errcode='42501'; end if;
 new.business_id:=b; return new; end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','facilities','groups','customers','services','customer_default_services','appointments','appointment_customers','treatments','treatment_services','color_formulas'] loop
 execute format('create trigger business_stamp before insert or update on public.%I for each row execute function heimfriseur_private.stamp()',t);
 execute format('drop policy owner_read on public.%I',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (heimfriseur_private.is_owner(business_id))',t);
 if t in ('profiles','facilities','groups','customers','services','color_formulas') then
 execute format('drop policy owner_write on public.%I',t);
 execute format('create policy owner_write on public.%I for all to authenticated using (heimfriseur_private.is_owner(business_id)) with check (heimfriseur_private.is_owner(business_id))',t);
 end if;
 end loop;
 foreach t in array array['businesses','business_memberships','team_invitations','appointment_assignments','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop; end $$;
-- Policy evaluation only; private mutations and legacy entry points remain inaccessible.
grant usage on schema heimfriseur_private to authenticated;
grant execute on function heimfriseur_private.is_owner(uuid) to authenticated;

create function heimfriseur_private.sync_business_name() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 begin update public.businesses set name=coalesce(nullif(trim(new.business_name),''),'Mein Unternehmen') where id=new.business_id;
 update public.business_memberships set display_name=trim(coalesce(new.first_name,'')||' '||coalesce(new.last_name,'')) where user_id=new.user_id and role='owner'; return new; end $$;
create trigger sync_business_name after insert or update of business_name on public.profiles for each row execute function heimfriseur_private.sync_business_name();

-- Preserve proven workflow implementations privately; public wrappers always authorize the real actor first.
do $$ declare r record; begin
 for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('initialize_account','save_customer','plan_visit','add_visit_customer','save_treatment','skip_customer','move_visit','cancel_visit') loop
 execute format('alter function %s set schema heimfriseur_private',r.sig);
 end loop; end $$;
create function public.initialize_account() returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=public.require_user(); b uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.business_memberships where user_id=u) then
 perform heimfriseur_private.membership(); return; end if;
 insert into public.businesses(owner_user_id) values(u) returning id into b;
 insert into public.business_memberships(business_id,user_id,role) values(b,u,'owner');
 perform heimfriseur_private.initialize_account(); end $$;
create function public.save_customer(p_data jsonb,p_services uuid[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); begin return heimfriseur_private.save_customer(p_data,p_services); end $$;
create function public.plan_visit(p_group uuid,p_date date,p_time time,p_weeks integer default null,p_all boolean default true,p_series uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); a uuid; begin
 a:=heimfriseur_private.plan_visit(p_group,p_date,p_time,p_weeks,p_all,p_series);
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) select business_id,id,u,true from public.appointments where id=a;
 return a; end $$;
create function public.add_visit_customer(p_appointment uuid,p_customer uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=auth.uid(); u uuid:=heimfriseur_private.visit(p_appointment); begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform heimfriseur_private.add_visit_customer(p_appointment,p_customer);
 perform set_config('request.jwt.claim.sub',actor::text,true); end $$;
create or replace function public.start_treatment(p_member uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=public.require_user(); u uuid; m public.appointment_customers; a public.appointments; t public.treatments; tid uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into m from public.appointment_customers where id=p_member;
 u:=heimfriseur_private.visit(m.appointment_id);
 select * into a from public.appointments where id=m.appointment_id for update;
 select * into m from public.appointment_customers where id=p_member for update;
 select * into t from public.treatments where appointment_customer_id=m.id;
 if found and t.end_time is null and t.performed_by=actor then return t.id; end if;
 if t.id is not null then raise exception 'Dieser Kunde wird bereits behandelt oder ist abgeschlossen.'; end if;
 if exists(select 1 from public.treatments where performed_by=actor and end_time is null) then raise exception 'Bitte zuerst deine laufende Behandlung beenden.'; end if;
 if m.status<>'Offen' or a.status not in ('Geplant','Verschoben','In Bearbeitung') then raise exception 'Diese Behandlung kann nicht gestartet werden.'; end if;
 insert into public.treatments(user_id,appointment_id,appointment_customer_id,customer_id,performed_by) values(u,a.id,m.id,m.customer_id,actor) returning id into tid;
 insert into public.treatment_services(user_id,treatment_id,service_id,service_name_snapshot,price_snapshot,duration_minutes_snapshot)
 select u,tid,s.id,s.name,s.price,s.duration_minutes from public.customer_default_services d join public.services s on s.id=d.service_id where d.customer_id=m.customer_id and s.is_active;
 update public.treatments set total_price=(select coalesce(sum(price_snapshot),0) from public.treatment_services where treatment_id=tid) where id=tid;
 update public.appointment_customers set status='In Behandlung' where id=m.id;
 update public.appointments set status='In Bearbeitung',actual_start_time=coalesce(actual_start_time,now()) where id=a.id;
 return tid; end $$;
create function public.save_treatment(p_treatment uuid,p_services uuid[],p_price numeric,p_material numeric,p_notes text,p_formula jsonb default null,p_finish boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=public.require_user(); u uuid; t public.treatments; m public.business_memberships:=heimfriseur_private.membership(); begin
 select * into t from public.treatments where id=p_treatment for update;
 u:=heimfriseur_private.visit(t.appointment_id);
 if t.performed_by<>actor then raise exception 'Nur die ausführende Person kann diese Behandlung bearbeiten.' using errcode='42501'; end if;
 if exists(select 1 from public.services s where s.id=any(p_services) and not s.is_active and not exists(select 1 from public.treatment_services where treatment_id=t.id and service_id=s.id)) then raise exception 'Diese Leistung ist nicht mehr aktiv.'; end if;
 if m.role='employee' and p_price is not null then raise exception 'Mitarbeiter dürfen den Preis nicht überschreiben.' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform heimfriseur_private.save_treatment(p_treatment,p_services,p_price,p_material,p_notes,p_formula,p_finish);
 perform set_config('request.jwt.claim.sub',actor::text,true); return t.id; end $$;
create function public.skip_customer(p_member uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=auth.uid(); u uuid; a uuid; begin
 select appointment_id into a from public.appointment_customers where id=p_member;
 u:=heimfriseur_private.visit(a);
 perform set_config('request.jwt.claim.sub',u::text,true); perform heimfriseur_private.skip_customer(p_member,p_reason); perform set_config('request.jwt.claim.sub',actor::text,true); end $$;
create or replace function public.close_visit(p_appointment uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=public.require_user(); u uuid:=heimfriseur_private.visit(p_appointment,true); a public.appointments; nxt uuid; begin
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
 nxt:=heimfriseur_private.plan_visit(a.group_id,a.appointment_date+a.recurrence_weeks*7,a.start_time,a.recurrence_weeks,true,a.recurrence_series_id);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.appointments set created_by=actor where id=nxt;
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible)
 select a.business_id,nxt,x.user_id,x.is_responsible from public.appointment_assignments x join public.business_memberships m on m.user_id=x.user_id and m.is_active where x.appointment_id=a.id;
 end if; end if; return nxt; end $$;
create function public.move_visit(p_appointment uuid,p_date date,p_time time,p_future boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); begin
 perform heimfriseur_private.move_visit(p_appointment,p_date,p_time,p_future);
 insert into public.audit_events(business_id,actor_id,action,record_id,details) select business_id,auth.uid(),'visit_moved',id,jsonb_build_object('date',p_date,'future',p_future) from public.appointments where id=p_appointment; end $$;
create function public.cancel_visit(p_appointment uuid,p_delete boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); b uuid; begin
 select business_id into b from public.appointments where id=p_appointment and user_id=u;
 perform heimfriseur_private.cancel_visit(p_appointment,p_delete);
 insert into public.audit_events(business_id,actor_id,action,record_id) values(b,auth.uid(),case when p_delete then 'visit_deleted' else 'visit_cancelled' end,p_appointment); end $$;

create function public.assign_visit(p_appointment uuid,p_users uuid[],p_responsible uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); a public.appointments; begin
 p_users:=coalesce(p_users,'{}'::uuid[]);
 select * into a from public.appointments where id=p_appointment and user_id=u for update;
 if not found or a.status in ('Abgeschlossen','Abgesagt') then raise exception 'Dieser Besuch kann nicht mehr zugewiesen werden.'; end if;
 if p_responsible is not null and not(p_responsible=any(p_users)) then raise exception 'Verantwortliche Person muss zugewiesen sein.'; end if;
 if exists(select 1 from unnest(p_users) x where not exists(select 1 from public.business_memberships where user_id=x and business_id=a.business_id and is_active)) then raise exception 'Bitte aktive Teammitglieder auswählen.'; end if;
 if exists(select 1 from public.treatments where appointment_id=a.id and end_time is null and not(performed_by=any(p_users))) then raise exception 'Eine Person mit laufender Behandlung kann nicht entfernt werden.'; end if;
 delete from public.appointment_assignments where appointment_id=a.id;
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) select a.business_id,a.id,x,coalesce(x=p_responsible,false) from (select distinct unnest(p_users) x) q;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(a.business_id,auth.uid(),'visit_assigned',a.id,jsonb_build_object('users',p_users,'responsible',p_responsible)); end $$;
create function public.set_member_active(p_member uuid,p_active boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); m public.business_memberships; begin
 select * into m from public.business_memberships where id=p_member and business_id=(select id from public.businesses where owner_user_id=u) for update;
 if not found then raise exception 'Teammitglied nicht gefunden.'; end if;
 if m.role='owner' then raise exception 'Der Geschäftsführerzugang muss aktiv bleiben.'; end if;
 update public.business_memberships set is_active=p_active where id=m.id;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(m.business_id,auth.uid(),'member_active',m.id,jsonb_build_object('active',p_active)); end $$;
create function public.take_over_treatment(p_treatment uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); t public.treatments; begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into t from public.treatments where id=p_treatment and user_id=u and end_time is null for update;
 if not found then raise exception 'Offene Behandlung nicht gefunden.'; end if;
 update public.treatments set performed_by=auth.uid() where id=t.id;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(t.business_id,auth.uid(),'treatment_taken_over',t.id,jsonb_build_object('previous_performer',t.performed_by)); end $$;
create function public.create_team_invite(p_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); b uuid; token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); i uuid; begin
 p_email:=lower(trim(p_email));
 if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Bitte eine gültige E-Mail-Adresse eingeben.'; end if;
 select id into b from public.businesses where owner_user_id=u;
 insert into public.team_invitations(business_id,email,token_hash,created_by) values(b,p_email,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid()) returning id into i;
 insert into public.audit_events(business_id,actor_id,action,record_id) values(b,auth.uid(),'invite_created',i);
 return jsonb_build_object('id',i,'token',token); end $$;
create function public.revoke_team_invite(p_invite uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); i public.team_invitations; begin
 update public.team_invitations set revoked_at=now() where id=p_invite and business_id=(select id from public.businesses where owner_user_id=u) and accepted_at is null returning * into i;
 if not found then raise exception 'Offene Einladung nicht gefunden.'; end if;
 insert into public.audit_events(business_id,actor_id,action,record_id) values(i.business_id,auth.uid(),'invite_revoked',i.id); end $$;
create function public.accept_team_invite(p_token text,p_name text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=public.require_user(); i public.team_invitations; em text; confirmed timestamptz; begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into i from public.team_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or i.revoked_at is not null or i.expires_at<=now() then raise exception 'Die Einladung ist ungültig, abgelaufen oder widerrufen.'; end if;
 select lower(email),email_confirmed_at into em,confirmed from auth.users where id=u;
 if em is distinct from i.email or confirmed is null then raise exception 'Bitte mit der eingeladenen E-Mail-Adresse anmelden und diese zuerst bestätigen.'; end if;
 if i.accepted_at is not null then
 if exists(select 1 from public.business_memberships where user_id=u and business_id=i.business_id and is_active) then return; end if;
 raise exception 'Diese Einladung wurde bereits verwendet.'; end if;
 if exists(select 1 from public.business_memberships where user_id=u) then raise exception 'Dieses Konto gehört bereits zu einem Unternehmen. Bitte einen separaten Mitarbeiterzugang verwenden.'; end if;
 if length(trim(p_name))<2 then raise exception 'Bitte deinen Namen angeben.'; end if;
 insert into public.business_memberships(business_id,user_id,role,display_name) values(i.business_id,u,'employee',trim(p_name));
 update public.team_invitations set accepted_at=now() where id=i.id;
 insert into public.audit_events(business_id,actor_id,action,record_id) values(i.business_id,u,'invite_accepted',i.id); end $$;

create function public.correct_treatment(p_treatment uuid,p_price numeric,p_material numeric,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); t public.treatments; begin
 select * into t from public.treatments where id=p_treatment and user_id=u and end_time is not null for update;
 if not found then raise exception 'Abgeschlossene Behandlung nicht gefunden.'; end if;
 if p_price is null or p_material is null or p_price<0 or p_material<0 or length(trim(p_reason))<5 then raise exception 'Gültige Beträge und eine Begründung mit mindestens fünf Zeichen angeben.'; end if;
 update public.treatments set total_price=p_price,price_override=p_price,material_cost=p_material where id=t.id;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(t.business_id,auth.uid(),'treatment_corrected',t.id,jsonb_build_object('before',jsonb_build_object('price',t.total_price,'material',t.material_cost),'after',jsonb_build_object('price',p_price,'material',p_material),'reason',trim(p_reason))); end $$;

create function public.get_team_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); result jsonb; begin
 select jsonb_build_object('business',to_jsonb(b),'membership',to_jsonb(m),
 'members',coalesce((select jsonb_agg(to_jsonb(x)) from public.business_memberships x where x.business_id=m.business_id),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(x)) from public.appointment_assignments x where x.business_id=m.business_id and (m.role='owner' or x.appointment_id in (select appointment_id from public.appointment_assignments where user_id=m.user_id))),'[]'::jsonb),
 'invitations',case when m.role='owner' then coalesce((select jsonb_agg(to_jsonb(x)-'token_hash') from public.team_invitations x where x.business_id=m.business_id),'[]'::jsonb) else '[]'::jsonb end,
 'audit',case when m.role='owner' then coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_events where business_id=m.business_id order by created_at desc limit 100) x),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.businesses b where b.id=m.business_id; return result; end $$;
create function public.employee_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); apps uuid[]; cs uuid[]; gs uuid[]; ts uuid[]; result jsonb; begin
 if m.role<>'employee' then raise exception 'Dieser Datenabruf ist für Mitarbeiter vorgesehen.'; end if;
 select coalesce(array_agg(a.id),'{}') into apps from public.appointments a join public.appointment_assignments x on x.appointment_id=a.id where x.user_id=m.user_id and a.business_id=m.business_id;
 select coalesce(array_agg(distinct group_id),'{}') into gs from public.appointments where id=any(apps);
 select coalesce(array_agg(id),'{}') into cs from public.customers where business_id=m.business_id and group_id=any(gs);
 select coalesce(array_agg(id),'{}') into ts from public.treatments where appointment_id=any(apps) or (customer_id=any(cs) and end_time is not null);
 select jsonb_build_object(
 'profiles','[]'::jsonb,
 'facilities',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('notes','')) from public.facilities x where business_id=m.business_id and id in (select facility_id from public.groups where id=any(gs))),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('notes','')) from public.groups x where id=any(gs)),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('notes','')) from public.customers x where id=any(cs)),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(to_jsonb(x)) from public.services x where business_id=m.business_id and (is_active or id in (select s.service_id from public.treatment_services s join public.treatments t on t.id=s.treatment_id where t.performed_by=m.user_id and t.end_time is null))),'[]'::jsonb),
 'customer_default_services',coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_default_services x where customer_id=any(cs)),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('notes','')) from public.appointments x where id=any(apps)),'[]'::jsonb),
 'appointment_customers',coalesce((select jsonb_agg(to_jsonb(x)) from public.appointment_customers x where appointment_id=any(apps)),'[]'::jsonb),
 'treatments',coalesce((select jsonb_agg(to_jsonb(x)||case when performed_by=m.user_id then '{}'::jsonb else jsonb_build_object('total_price',0,'material_cost',0,'price_override',null) end) from public.treatments x where id=any(ts)),'[]'::jsonb),
 'treatment_services',coalesce((select jsonb_agg(to_jsonb(x)||case when t.performed_by=m.user_id then '{}'::jsonb else jsonb_build_object('price_snapshot',0) end) from public.treatment_services x join public.treatments t on t.id=x.treatment_id where t.id=any(ts)),'[]'::jsonb),
 'color_formulas',coalesce((select jsonb_agg(to_jsonb(x)) from public.color_formulas x where customer_id=any(cs)),'[]'::jsonb)) into result;
 return result; end $$;

-- Supabase public function defaults must never expose private implementations.
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='heimfriseur_private' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.sig);
 execute format('alter function %s set search_path=public,pg_temp',r.sig); end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('initialize_account','save_customer','plan_visit','add_visit_customer','start_treatment','save_treatment','skip_customer','close_visit','move_visit','cancel_visit','assign_visit','set_member_active','take_over_treatment','create_team_invite','revoke_team_invite','accept_team_invite','correct_treatment','get_team_context','employee_snapshot') loop
 execute format('revoke all on function %s from public,anon',r.sig); execute format('grant execute on function %s to authenticated',r.sig); end loop;
 end $$;
grant execute on function heimfriseur_private.is_owner(uuid) to authenticated;
commit;

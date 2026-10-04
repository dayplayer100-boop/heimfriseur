-- HeimFriseur 3: flexible Besuche, Preise, Abrechnung, Rechte und Rückmeldungen.
-- Nach 001 und 002 einmal ausführen. Keine historischen Datensätze löschen.
begin;
alter table public.appointments add column auto_include_due boolean not null default true;
alter table public.facilities add column visit_recurrence_weeks integer not null default 1 check(visit_recurrence_weeks between 1 and 52);
alter table public.facilities add column preferred_weekday integer not null default 2 check(preferred_weekday between 0 and 6);
alter table public.facilities add column preferred_start_time time not null default '09:00';
alter table public.facilities add column is_provisional boolean not null default false;
create unique index facility_provisional on public.facilities(user_id) where is_provisional;
alter table public.groups add column is_general boolean not null default false;
create unique index general_group on public.groups(facility_id) where is_general;
alter table public.customers drop constraint customers_first_name_check;
alter table public.customers drop constraint customers_last_name_check;
alter table public.customers alter column first_name set default '';
alter table public.customers alter column last_name set default '';
alter table public.customers add column recurrence_weeks integer check(recurrence_weeks between 1 and 52);
alter table public.customers add column next_due_date date;
alter table public.customers add column hair_request text not null default 'Unbekannt' check(hair_request in ('Ja','Nein','Unbekannt'));
alter table public.appointments add column all_groups boolean not null default false;
alter table public.appointment_customers add column entry_type text not null default 'Regulär' check(entry_type in ('Regulär','Spontan','Vorgezogen','Nachgeholt'));
alter table public.appointment_customers add column followup_date date;
alter table public.business_memberships add column permissions jsonb not null default '{"record_payments":true,"close_visits":true}' check(jsonb_typeof(permissions)='object');
alter table public.business_memberships add column onboarding_completed boolean not null default false;
create table public.cohorts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),facility_id uuid not null,group_id uuid not null,name text not null check(length(trim(name))>0),recurrence_weeks integer not null default 5 check(recurrence_weeks between 1 and 52),anchor_date date not null,created_at timestamptz not null default now(),unique(id,user_id),foreign key(group_id,facility_id,user_id) references public.groups(id,facility_id,user_id) on delete restrict);
alter table public.customers add column cohort_id uuid;
alter table public.customers add constraint customer_cohort foreign key(cohort_id,user_id) references public.cohorts(id,user_id) on delete restrict;
alter table public.appointments add column cohort_id uuid;
alter table public.appointments add constraint appointment_cohort foreign key(cohort_id,user_id) references public.cohorts(id,user_id) on delete restrict;
create table public.facility_service_prices(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),facility_id uuid not null,service_id uuid not null,price numeric(12,2) not null check(price>=0),unique(facility_id,service_id),foreign key(facility_id,user_id) references public.facilities(id,user_id) on delete restrict,foreign key(service_id,user_id) references public.services(id,user_id) on delete restrict);
create table public.payment_methods(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),name text not null check(length(trim(name))>0),is_active boolean not null default true,unique(user_id,name),unique(id,user_id));
create table public.customer_billing(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),customer_id uuid not null unique,billing_name text not null default '',street text not null default '',postal_code text not null default '',city text not null default '',phone text not null default '',email text not null default '',payment_method_id uuid,delivery text not null default 'Keine Angabe' check(delivery in ('Keine Angabe','Post','E-Mail')),foreign key(customer_id,user_id) references public.customers(id,user_id) on delete restrict,foreign key(payment_method_id,user_id) references public.payment_methods(id,user_id) on delete restrict);
create table public.treatment_payments(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),treatment_id uuid not null unique,payment_method_id uuid,method_name_snapshot text not null default 'Noch offen',status text not null default 'Offen' check(status in ('Offen','Bezahlt','Nicht erforderlich')),delivery text not null default 'Keine Angabe' check(delivery in ('Keine Angabe','Post','E-Mail')),billing_name_snapshot text not null default '',billing_address_snapshot text not null default '',amount numeric(12,2) not null check(amount>=0),recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),foreign key(treatment_id,user_id) references public.treatments(id,user_id) on delete restrict,foreign key(payment_method_id,user_id) references public.payment_methods(id,user_id) on delete restrict);
create table public.feedback(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),business_id uuid not null references public.businesses(id),created_by uuid not null references auth.users(id),category text not null check(category in ('Fehler','Verbesserung')),message text not null check(length(trim(message)) between 5 and 4000),route text not null default '',app_version text not null default '3.0',status text not null default 'Offen' check(status in ('Offen','Erledigt')),created_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['cohorts','facility_service_prices','payment_methods','customer_billing','treatment_payments','feedback'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (heimfriseur_private.is_owner(business_id))',t);
 execute format('create trigger business_stamp before insert or update on public.%I for each row execute function heimfriseur_private.stamp()',t);
 execute format('create index %I on public.%I(business_id)',t||'_business',t);
 end loop; end $$;
create index customer_due on public.customers(business_id,next_due_date,cohort_id);
insert into public.payment_methods(user_id,business_id,name) select owner_user_id,id,unnest(array['Barzahlung','Überweisung','Heimkonto']) from public.businesses;
create function heimfriseur_private.allowed(p_key text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare m public.business_memberships:=heimfriseur_private.membership(); begin return m.role='owner' or coalesce((m.permissions->>p_key)::boolean,false); end $$;
create function public.set_member_permissions(p_member uuid,p_permissions jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); m public.business_memberships; begin
 if p_permissions is null or jsonb_typeof(p_permissions)<>'object' or exists(select 1 from jsonb_each(p_permissions) x where x.key not in ('edit_customers','add_customers','edit_schedule','override_prices','record_payments','view_billing','close_visits') or jsonb_typeof(x.value)<>'boolean') then raise exception 'Ungültige Berechtigungen.'; end if;
 select * into m from public.business_memberships where id=p_member and role='employee' and business_id=(select id from public.businesses where owner_user_id=u) for update;
 if not found then raise exception 'Mitarbeiter nicht gefunden.'; end if;
 update public.business_memberships set permissions=p_permissions where id=m.id;
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(m.business_id,auth.uid(),'permissions_changed',m.id,jsonb_build_object('before',m.permissions,'after',p_permissions)); end $$;
create function public.complete_onboarding() returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare m public.business_memberships:=heimfriseur_private.membership(); begin update public.business_memberships set onboarding_completed=true where id=m.id; end $$;
create function heimfriseur_private.customer_access(p_customer uuid) returns public.customers language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); c public.customers; begin
 select * into c from public.customers where id=p_customer and business_id=m.business_id;
 if not found or (m.role='employee' and not exists(select 1 from public.appointments a join public.appointment_assignments x on x.appointment_id=a.id where x.user_id=m.user_id and a.facility_id=c.facility_id and (a.all_groups or a.group_id=c.group_id))) then raise exception 'Kein Zugriff auf diesen Kunden.' using errcode='42501'; end if; return c; end $$;
create function heimfriseur_private.general_group(p_facility uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare f public.facilities; g uuid; begin select * into f from public.facilities where id=p_facility for update; if not found then raise exception 'Einrichtung nicht gefunden.'; end if;
 select id into g from public.groups where facility_id=f.id and is_general;
 if g is null then insert into public.groups(user_id,facility_id,name,recurrence_weeks,is_general) values(f.user_id,f.id,'Allgemein / später zuordnen',5,true) returning id into g; end if; return g; end $$;
create function heimfriseur_private.provisional_facility(p_owner uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare f uuid; begin perform pg_advisory_xact_lock(hashtextextended(p_owner::text,42)); select id into f from public.facilities where user_id=p_owner and is_provisional; if f is null then insert into public.facilities(user_id,name,is_provisional) values(p_owner,'Einrichtung noch offen',true) returning id into f; end if; return f; end $$;
create function heimfriseur_private.due(p_customer uuid,p_date date) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
 declare c public.customers; co public.cohorts; begin select * into c from public.customers where id=p_customer;
 if c.status<>'Aktiv' or c.hair_request='Nein' then return false; end if;
 if c.next_due_date is not null then return c.next_due_date<=p_date; end if;
 if c.cohort_id is not null then select * into co from public.cohorts where id=c.cohort_id; return p_date>=co.anchor_date and mod((p_date-co.anchor_date)/7,coalesce(c.recurrence_weeks,co.recurrence_weeks))=0; end if; return true; end $$;
create function heimfriseur_private.sync_visit(p_appointment uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare a public.appointments; begin select * into a from public.appointments where id=p_appointment for update;
 if a.status not in ('Geplant','Verschoben') or not a.auto_include_due then return; end if;
 delete from public.appointment_customers m where m.appointment_id=a.id and m.status='Offen' and m.entry_type='Regulär' and not exists(select 1 from public.treatments t where t.appointment_customer_id=m.id) and not exists(select 1 from public.customers c where c.id=m.customer_id and c.facility_id=a.facility_id and (a.all_groups or c.group_id=a.group_id) and (a.cohort_id is null or c.cohort_id=a.cohort_id) and heimfriseur_private.due(c.id,a.appointment_date));
 insert into public.appointment_customers(user_id,appointment_id,customer_id,sort_order) select a.user_id,a.id,c.id,coalesce((select max(sort_order) from public.appointment_customers where appointment_id=a.id),0)+row_number() over(order by c.last_name,c.first_name) from public.customers c where c.user_id=a.user_id and c.facility_id=a.facility_id and (a.all_groups or c.group_id=a.group_id) and (a.cohort_id is null or c.cohort_id=a.cohort_id) and heimfriseur_private.due(c.id,a.appointment_date) on conflict(appointment_id,customer_id) do nothing; end $$;
create function heimfriseur_private.sync_future(p_customer uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare a record; c public.customers; begin select * into c from public.customers where id=p_customer; for a in select id from public.appointments where user_id=c.user_id and appointment_date>=(now() at time zone 'Europe/Berlin')::date and status in ('Geplant','Verschoben') order by id loop perform heimfriseur_private.sync_visit(a.id); end loop; end $$;
create or replace function public.save_customer(p_data jsonb,p_services uuid[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); u uuid; c uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); f uuid:=nullif(p_data->>'facility_id','')::uuid; g uuid:=nullif(p_data->>'group_id','')::uuid; co uuid:=nullif(p_data->>'cohort_id','')::uuid; old public.customers; begin
 select owner_user_id into u from public.businesses where id=m.business_id;
 select * into old from public.customers where id=c and user_id=u;
 if old.id is not null then
 if not (p_data ? 'facility_id') then f:=old.facility_id; end if;
 if not (p_data ? 'group_id') then g:=old.group_id; end if;
 if not (p_data ? 'cohort_id') then co:=old.cohort_id; end if;
 end if;
 if m.role='employee' then
 if nullif(p_data->>'id','') is null then if not heimfriseur_private.allowed('add_customers') then raise exception 'Neue Kunden darfst du nicht anlegen.' using errcode='42501'; end if;
 else old:=heimfriseur_private.customer_access(c); if not heimfriseur_private.allowed('edit_customers') then raise exception 'Kundendaten darfst du nicht ändern.' using errcode='42501'; end if; end if;
 if not exists(select 1 from public.appointments a join public.appointment_assignments x on x.appointment_id=a.id where x.user_id=m.user_id and a.facility_id=f and (a.all_groups or a.group_id=g)) then raise exception 'Bitte einen zugewiesenen Wohnbereich wählen.' using errcode='42501'; end if;
 end if;
 if f is null then f:=heimfriseur_private.provisional_facility(u); end if;
 if not exists(select 1 from public.facilities where id=f and user_id=u) then raise exception 'Einrichtung nicht gefunden.'; end if;
 if g is null then g:=heimfriseur_private.general_group(f); end if;
 if not exists(select 1 from public.groups where id=g and facility_id=f and user_id=u) then raise exception 'Wohnbereich gehört nicht zu dieser Einrichtung.'; end if;
 if co is not null and not exists(select 1 from public.cohorts where id=co and facility_id=f and group_id=g and user_id=u) then raise exception 'Untergruppe gehört nicht zu diesem Wohnbereich.'; end if;
 if exists(select 1 from public.customers where id=c and user_id<>u) then raise exception 'Kein Zugriff auf diesen Kunden.' using errcode='42501'; end if;
 if exists(select 1 from unnest(coalesce(p_services,'{}')) sid where not exists(select 1 from public.services where id=sid and user_id=u)) then raise exception 'Ungültige Standardleistung.'; end if;
 insert into public.customers(id,user_id,facility_id,group_id,first_name,last_name,room_number,status,notes,recurrence_weeks,next_due_date,hair_request,cohort_id)
 values(c,u,f,g,coalesce(trim(p_data->>'first_name'),''),coalesce(trim(p_data->>'last_name'),''),coalesce(p_data->>'room_number',''),coalesce(p_data->>'status','Aktiv'),case when m.role='owner' then coalesce(p_data->>'notes','') else coalesce(old.notes,'') end,nullif(p_data->>'recurrence_weeks','')::integer,nullif(p_data->>'next_due_date','')::date,coalesce(p_data->>'hair_request','Unbekannt'),co)
 on conflict(id) do update set facility_id=excluded.facility_id,group_id=excluded.group_id,first_name=excluded.first_name,last_name=excluded.last_name,room_number=excluded.room_number,status=excluded.status,notes=excluded.notes,recurrence_weeks=case when p_data ? 'recurrence_weeks' then excluded.recurrence_weeks else customers.recurrence_weeks end,next_due_date=case when p_data ? 'next_due_date' then excluded.next_due_date else customers.next_due_date end,hair_request=case when p_data ? 'hair_request' then excluded.hair_request else customers.hair_request end,cohort_id=case when p_data ? 'cohort_id' then excluded.cohort_id else customers.cohort_id end;
 delete from public.customer_default_services where customer_id=c;
 insert into public.customer_default_services(user_id,customer_id,service_id) select u,c,s.id from public.services s where s.id=any(p_services) and s.user_id=u and s.is_active;
 perform heimfriseur_private.sync_future(c); return c; end $$;
create function public.plan_visit_flexible(p_facility uuid,p_group uuid,p_date date,p_time time,p_weeks integer default 1,p_all boolean default true,p_options jsonb default '{}') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.owner(); f uuid:=p_facility; g uuid:=p_group; a uuid; co uuid:=nullif(p_options->>'cohort_id','')::uuid; begin
 if f is null then f:=heimfriseur_private.provisional_facility(u); end if;
 if not exists(select 1 from public.facilities where id=f and user_id=u) then raise exception 'Einrichtung nicht gefunden.'; end if;
 if g is null then g:=heimfriseur_private.general_group(f); end if;
 if not exists(select 1 from public.groups where id=g and facility_id=f and user_id=u) then raise exception 'Wohnbereich gehört nicht zum Heim.'; end if;
 if co is not null and not exists(select 1 from public.cohorts where id=co and user_id=u and facility_id=f and (p_group is null or group_id=g)) then raise exception 'Untergruppe nicht gefunden.'; end if;
 a:=public.plan_visit(g,p_date,coalesce(p_time,'09:00'),p_weeks,false,nullif(p_options->>'series_id','')::uuid);
 update public.appointments set auto_include_due=p_all,all_groups=(p_group is null or coalesce((p_options->>'all_groups')::boolean,false)),cohort_id=co where id=a;
 if p_all then perform heimfriseur_private.sync_visit(a); end if; return a; end $$;
create or replace function public.add_visit_customer(p_appointment uuid,p_customer uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare u uuid:=heimfriseur_private.visit(p_appointment); a public.appointments; c public.customers; begin
 select * into a from public.appointments where id=p_appointment for update;
 select * into c from public.customers where id=p_customer and user_id=u and facility_id=a.facility_id and (a.all_groups or group_id=a.group_id);
 if not found or c.hair_request='Nein' then raise exception 'Bitte einen Kunden dieses Besuchs mit Friseurwunsch auswählen.'; end if;
 if a.status not in ('Geplant','Verschoben','In Bearbeitung') then raise exception 'Besuch ist nicht bearbeitbar.'; end if;
 insert into public.appointment_customers(user_id,appointment_id,customer_id,sort_order) values(u,a.id,c.id,coalesce((select max(sort_order) from public.appointment_customers where appointment_id=a.id),0)+1) on conflict(appointment_id,customer_id) do nothing; end $$;
create function public.add_customer_to_visit(p_appointment uuid,p_customer uuid,p_entry_type text default 'Spontan') returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if p_entry_type not in ('Spontan','Vorgezogen','Nachgeholt') then raise exception 'Bitte Anlass auswählen.'; end if;
 perform public.add_visit_customer(p_appointment,p_customer);
 update public.appointment_customers set entry_type=p_entry_type where appointment_id=p_appointment and customer_id=p_customer and status='Offen'; end $$;
create function public.skip_customer_followup(p_member uuid,p_reason text,p_next_date date default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.appointment_customers; a public.appointments; begin
 select * into m from public.appointment_customers where id=p_member; perform heimfriseur_private.visit(m.appointment_id);
 select * into a from public.appointments where id=m.appointment_id;
 if p_next_date is not null and p_next_date<=a.appointment_date then raise exception 'Der Nachholtermin muss nach diesem Besuch liegen.'; end if;
 perform public.skip_customer(p_member,case when p_reason='Krank' then 'Krankenhaus' when p_reason='Nicht vor Ort' then 'Nicht anwesend' else p_reason end);
 update public.appointment_customers set non_completion_reason=p_reason,followup_date=p_next_date where id=p_member;
 update public.customers set next_due_date=p_next_date where id=m.customer_id; perform heimfriseur_private.sync_future(m.customer_id); end $$;
create function heimfriseur_private.snapshot_facility_price() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ declare p numeric; begin
 select fp.price into p from public.facility_service_prices fp join public.treatments t on t.id=new.treatment_id join public.appointments a on a.id=t.appointment_id where fp.facility_id=a.facility_id and fp.service_id=new.service_id and fp.user_id=new.user_id;
 if found then new.price_snapshot:=p; end if; return new; end $$;
create trigger facility_price_snapshot before insert on public.treatment_services for each row execute function heimfriseur_private.snapshot_facility_price();
create function heimfriseur_private.next_customer_date() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ declare c public.customers; a public.appointments; w integer; begin
 if old.end_time is null and new.end_time is not null then select * into c from public.customers where id=new.customer_id; select * into a from public.appointments where id=new.appointment_id;
 select coalesce(c.recurrence_weeks,(select recurrence_weeks from public.cohorts where id=c.cohort_id),(select recurrence_weeks from public.groups where id=c.group_id),5) into w;
 update public.customers set next_due_date=a.appointment_date+w*7 where id=c.id; perform heimfriseur_private.sync_future(c.id); end if; return new; end $$;
create trigger customer_next_date after update of end_time on public.treatments for each row execute function heimfriseur_private.next_customer_date();
update public.customers c set next_due_date=(select max(a.appointment_date) from public.treatments t join public.appointments a on a.id=t.appointment_id where t.customer_id=c.id and t.end_time is not null)+coalesce(c.recurrence_weeks,(select recurrence_weeks from public.groups where id=c.group_id),5)*7 where exists(select 1 from public.treatments t where t.customer_id=c.id and t.end_time is not null);
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
 if exists(select 1 from public.customers where id=m.customer_id and hair_request='Nein') then raise exception 'Für diesen Kunden ist kein Friseur gewünscht. Bitte Stammdaten zuerst prüfen.'; end if;
 if m.status<>'Offen' or a.status not in ('Geplant','Verschoben','In Bearbeitung') then raise exception 'Diese Behandlung kann nicht gestartet werden.'; end if;
 insert into public.treatments(user_id,appointment_id,appointment_customer_id,customer_id,performed_by) values(u,a.id,m.id,m.customer_id,actor) returning id into tid;
 insert into public.treatment_services(user_id,treatment_id,service_id,service_name_snapshot,price_snapshot,duration_minutes_snapshot)
 select u,tid,s.id,s.name,s.price,s.duration_minutes from public.customer_default_services d join public.services s on s.id=d.service_id where d.customer_id=m.customer_id and s.is_active;
 update public.treatments set total_price=(select coalesce(sum(price_snapshot),0) from public.treatment_services where treatment_id=tid) where id=tid;
 update public.appointment_customers set status='In Behandlung' where id=m.id;
 update public.appointments set status='In Bearbeitung',actual_start_time=coalesce(actual_start_time,now()) where id=a.id;
 return tid; end $$;
create or replace function public.save_treatment(p_treatment uuid,p_services uuid[],p_price numeric,p_material numeric,p_notes text,p_formula jsonb default null,p_finish boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=public.require_user(); u uuid; t public.treatments; m public.business_memberships:=heimfriseur_private.membership(); begin
 select * into t from public.treatments where id=p_treatment for update;
 u:=heimfriseur_private.visit(t.appointment_id);
 if t.performed_by<>actor then raise exception 'Nur die ausführende Person kann diese Behandlung bearbeiten.' using errcode='42501'; end if;
 if exists(select 1 from public.services s where s.id=any(p_services) and not s.is_active and not exists(select 1 from public.treatment_services where treatment_id=t.id and service_id=s.id)) then raise exception 'Diese Leistung ist nicht mehr aktiv.'; end if;
 if not heimfriseur_private.allowed('override_prices') and p_price is not null then raise exception 'Mitarbeiter dürfen den Preis nicht überschreiben.' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform heimfriseur_private.save_treatment(p_treatment,p_services,p_price,p_material,p_notes,p_formula,p_finish);
 perform set_config('request.jwt.claim.sub',actor::text,true); return t.id; end $$;
create or replace function public.move_visit(p_appointment uuid,p_date date,p_time time,p_future boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare actor uuid:=auth.uid(); u uuid; future_visit record; series uuid; begin
 if not heimfriseur_private.allowed('edit_schedule') then raise exception 'Termine darfst du nicht verschieben.' using errcode='42501'; end if;
 u:=heimfriseur_private.visit(p_appointment);
 if p_future and not heimfriseur_private.is_owner((select business_id from public.appointments where id=p_appointment)) then raise exception 'Mitarbeiter dürfen nur diesen Termin verschieben.' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform heimfriseur_private.move_visit(p_appointment,p_date,p_time,p_future);
 perform heimfriseur_private.sync_visit(p_appointment);
 if p_future then
 select recurrence_series_id into series from public.appointments where id=p_appointment;
 for future_visit in select id from public.appointments where user_id=u and recurrence_series_id=series and appointment_date>=p_date and id<>p_appointment order by id loop perform heimfriseur_private.sync_visit(future_visit.id); end loop;
 end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.audit_events(business_id,actor_id,action,record_id,details) select business_id,auth.uid(),'visit_moved',id,jsonb_build_object('date',p_date,'future',p_future) from public.appointments where id=p_appointment; end $$;
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
 delete from public.appointment_assignments where appointment_id=nxt;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.appointments set created_by=actor where id=nxt;
 insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible)
 select a.business_id,nxt,x.user_id,x.is_responsible from public.appointment_assignments x join public.business_memberships m on m.user_id=x.user_id and m.is_active where x.appointment_id=a.id;
 if not exists(select 1 from public.appointment_assignments where appointment_id=nxt) then insert into public.appointment_assignments(business_id,appointment_id,user_id,is_responsible) values(a.business_id,nxt,u,true); end if;
 end if; end if; return nxt; end $$;
create function public.save_group_flexible(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare u uuid:=heimfriseur_private.owner(); f uuid:=nullif(p_data->>'facility_id','')::uuid; g uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); begin
 if f is null then f:=heimfriseur_private.provisional_facility(u); end if;
 if not exists(select 1 from public.facilities where id=f and user_id=u) or exists(select 1 from public.groups where id=g and user_id<>u) then raise exception 'Kein Zugriff auf diesen Wohnbereich.' using errcode='42501'; end if;
 insert into public.groups(id,user_id,facility_id,name,recurrence_weeks,preferred_weekday,preferred_start_time,notes) values(g,u,f,coalesce(nullif(trim(p_data->>'name'),''),'Wohnbereich (Name noch offen)'),coalesce(nullif(p_data->>'recurrence_weeks','')::integer,5),coalesce(nullif(p_data->>'preferred_weekday','')::integer,2),coalesce(nullif(p_data->>'preferred_start_time','')::time,'09:00'),coalesce(p_data->>'notes','')) on conflict(id) do update set facility_id=excluded.facility_id,name=excluded.name,recurrence_weeks=excluded.recurrence_weeks,preferred_weekday=excluded.preferred_weekday,preferred_start_time=excluded.preferred_start_time,notes=excluded.notes; return g; end $$;
create function public.save_cohort(p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare u uuid:=heimfriseur_private.owner(); cid uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); f uuid:=(p_data->>'facility_id')::uuid; g uuid:=nullif(p_data->>'group_id','')::uuid; begin
 if not exists(select 1 from public.facilities where id=f and user_id=u) then raise exception 'Einrichtung nicht gefunden.'; end if;
 if g is null then g:=heimfriseur_private.general_group(f); end if;
 if exists(select 1 from public.cohorts where id=cid and user_id<>u) then raise exception 'Kein Zugriff.' using errcode='42501'; end if;
 if exists(select 1 from public.customers where cohort_id=cid and (facility_id<>f or group_id<>g)) then raise exception 'Diese Untergruppe hat bereits Kunden. Bitte deren Zuordnung zuerst ändern.'; end if;
 insert into public.cohorts(id,user_id,facility_id,group_id,name,recurrence_weeks,anchor_date) values(cid,u,f,g,trim(p_data->>'name'),coalesce(nullif(p_data->>'recurrence_weeks','')::integer,5),coalesce(nullif(p_data->>'anchor_date','')::date,(now() at time zone 'Europe/Berlin')::date)) on conflict(id) do update set name=excluded.name,recurrence_weeks=excluded.recurrence_weeks,anchor_date=excluded.anchor_date,facility_id=excluded.facility_id,group_id=excluded.group_id;
 perform heimfriseur_private.sync_future(c.id) from public.customers c where c.cohort_id=cid; return cid; end $$;
create function public.set_facility_price(p_facility uuid,p_service uuid,p_price numeric) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare u uuid:=heimfriseur_private.owner(); begin
 if not exists(select 1 from public.facilities where id=p_facility and user_id=u) or not exists(select 1 from public.services where id=p_service and user_id=u) then raise exception 'Einrichtung oder Leistung nicht gefunden.'; end if;
 if p_price is null then delete from public.facility_service_prices where facility_id=p_facility and service_id=p_service and user_id=u; else
 insert into public.facility_service_prices(user_id,facility_id,service_id,price) values(u,p_facility,p_service,p_price) on conflict(facility_id,service_id) do update set price=excluded.price; end if; end $$;
create function public.save_payment_method(p_name text,p_id uuid default null,p_active boolean default true) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare u uuid:=heimfriseur_private.owner(); i uuid:=coalesce(p_id,gen_random_uuid()); begin
 if exists(select 1 from public.payment_methods where id=i and user_id<>u) then raise exception 'Kein Zugriff.' using errcode='42501'; end if;
 insert into public.payment_methods(id,user_id,name,is_active) values(i,u,trim(p_name),p_active) on conflict(id) do update set name=excluded.name,is_active=excluded.is_active; return i; end $$;
create function public.save_billing(p_customer uuid,p_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare c public.customers:=heimfriseur_private.customer_access(p_customer); begin
 if not heimfriseur_private.allowed('view_billing') then raise exception 'Abrechnungskontakte darfst du nicht ändern.' using errcode='42501'; end if;
 insert into public.customer_billing(user_id,customer_id,billing_name,street,postal_code,city,phone,email,payment_method_id,delivery)
 values(c.user_id,c.id,coalesce(p_data->>'billing_name',''),coalesce(p_data->>'street',''),coalesce(p_data->>'postal_code',''),coalesce(p_data->>'city',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'email',''),nullif(p_data->>'payment_method_id','')::uuid,coalesce(p_data->>'delivery','Keine Angabe'))
 on conflict(customer_id) do update set billing_name=excluded.billing_name,street=excluded.street,postal_code=excluded.postal_code,city=excluded.city,phone=excluded.phone,email=excluded.email,payment_method_id=excluded.payment_method_id,delivery=excluded.delivery; end $$;
create function public.record_payment(p_treatment uuid,p_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare t public.treatments; actor uuid:=auth.uid(); b public.customer_billing; method public.payment_methods; m public.business_memberships:=heimfriseur_private.membership(); prev public.treatment_payments; begin
 select * into t from public.treatments where id=p_treatment for update; perform heimfriseur_private.visit(t.appointment_id);
 if not heimfriseur_private.allowed('record_payments') or (m.role='employee' and t.performed_by<>actor) then raise exception 'Diese Zahlung darfst du nicht erfassen.' using errcode='42501'; end if;
 if t.end_time is null then raise exception 'Bitte Behandlung zuerst abschließen.'; end if;
 if nullif(p_data->>'payment_method_id','') is not null then select * into method from public.payment_methods where id=(p_data->>'payment_method_id')::uuid and user_id=t.user_id and is_active; if not found then raise exception 'Zahlungsart nicht gefunden.'; end if; end if;
 if heimfriseur_private.allowed('view_billing') then select * into b from public.customer_billing where customer_id=t.customer_id; end if;
 select * into prev from public.treatment_payments where treatment_id=t.id;
 insert into public.treatment_payments(user_id,treatment_id,payment_method_id,method_name_snapshot,status,delivery,billing_name_snapshot,billing_address_snapshot,amount,recorded_by)
 values(t.user_id,t.id,method.id,coalesce(method.name,'Noch offen'),coalesce(p_data->>'status','Offen'),coalesce(p_data->>'delivery','Keine Angabe'),coalesce(b.billing_name,prev.billing_name_snapshot,''),coalesce(nullif(trim(coalesce(b.street,'')||' '||coalesce(b.postal_code,'')||' '||coalesce(b.city,'')),''),prev.billing_address_snapshot,''),t.total_price,actor)
 on conflict(treatment_id) do update set payment_method_id=excluded.payment_method_id,method_name_snapshot=excluded.method_name_snapshot,status=excluded.status,delivery=excluded.delivery,billing_name_snapshot=excluded.billing_name_snapshot,billing_address_snapshot=excluded.billing_address_snapshot,amount=excluded.amount,recorded_by=actor,recorded_at=now();
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(t.business_id,actor,'payment_recorded',t.id,jsonb_build_object('before',to_jsonb(prev),'after',p_data)); end $$;
create function public.submit_feedback(p_category text,p_message text,p_route text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare m public.business_memberships:=heimfriseur_private.membership(); u uuid; i uuid; begin select owner_user_id into u from public.businesses where id=m.business_id;
 insert into public.feedback(user_id,business_id,created_by,category,message,route) values(u,m.business_id,m.user_id,p_category,trim(p_message),left(p_route,200)) returning id into i; return i; end $$;
create function public.resolve_feedback(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare u uuid:=heimfriseur_private.owner(); begin update public.feedback set status='Erledigt' where id=p_id and user_id=u; end $$;
create or replace function public.employee_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare m public.business_memberships:=heimfriseur_private.membership(); apps uuid[]; cs uuid[]; gs uuid[]; ts uuid[]; result jsonb; begin
 if m.role<>'employee' then raise exception 'Dieser Datenabruf ist für Mitarbeiter vorgesehen.'; end if;
 select coalesce(array_agg(a.id),'{}') into apps from public.appointments a join public.appointment_assignments x on x.appointment_id=a.id where x.user_id=m.user_id and a.business_id=m.business_id;
 select coalesce(array_agg(distinct g.id),'{}') into gs from public.groups g join public.appointments a on a.facility_id=g.facility_id and (a.all_groups or a.group_id=g.id) where a.id=any(apps);
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
 return result || jsonb_build_object(
 'cohorts',coalesce((select jsonb_agg(to_jsonb(x)) from public.cohorts x where group_id=any(gs)),'[]'::jsonb),
 'facility_service_prices',coalesce((select jsonb_agg(to_jsonb(x)) from public.facility_service_prices x where business_id=m.business_id and facility_id in (select facility_id from public.groups where id=any(gs))),'[]'::jsonb),
 'payment_methods',coalesce((select jsonb_agg(to_jsonb(x)) from public.payment_methods x where business_id=m.business_id and is_active),'[]'::jsonb),
 'customer_billing',case when heimfriseur_private.allowed('view_billing') then coalesce((select jsonb_agg(to_jsonb(x)) from public.customer_billing x where customer_id=any(cs)),'[]'::jsonb) else '[]'::jsonb end,
 'treatment_payments',coalesce((select jsonb_agg(to_jsonb(x)||case when heimfriseur_private.allowed('view_billing') then '{}'::jsonb else jsonb_build_object('billing_name_snapshot','','billing_address_snapshot','') end) from public.treatment_payments x join public.treatments t on t.id=x.treatment_id where t.id=any(ts) and t.performed_by=m.user_id),'[]'::jsonb),
 'feedback',coalesce((select jsonb_agg(to_jsonb(x)) from public.feedback x where business_id=m.business_id and created_by=m.user_id),'[]'::jsonb)); end $$;
create function heimfriseur_private.seed_payment_methods() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin insert into public.payment_methods(user_id,business_id,name) select new.owner_user_id,new.id,unnest(array['Barzahlung','Überweisung','Heimkonto']); return new; end $$;
create trigger seed_payment_methods after insert on public.businesses for each row execute function heimfriseur_private.seed_payment_methods();
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='heimfriseur_private' and p.proname in ('allowed','customer_access','general_group','provisional_facility','due','sync_visit','sync_future','snapshot_facility_price','next_customer_date','seed_payment_methods') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig); end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_group_flexible','set_member_permissions','complete_onboarding','save_customer','plan_visit_flexible','add_visit_customer','add_customer_to_visit','skip_customer_followup','start_treatment','save_treatment','move_visit','close_visit','save_cohort','set_facility_price','save_payment_method','save_billing','record_payment','submit_feedback','resolve_feedback','employee_snapshot') loop execute format('revoke all on function %s from public,anon',r.sig); execute format('grant execute on function %s to authenticated',r.sig); end loop;
 end $$;
commit;

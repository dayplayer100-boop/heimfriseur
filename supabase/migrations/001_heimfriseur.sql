begin;
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade, business_name text not null default '', first_name text default '', last_name text default '', street text default '', house_number text default '', postal_code text default '', city text default '', phone text default '', email text default '', logo_url text default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.facilities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text not null check(length(trim(name))>0), street text default '', house_number text default '', postal_code text default '', city text default '', phone text default '', email text default '', contact_name text default '', contact_phone text default '', notes text default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.groups (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), facility_id uuid not null, name text not null check(length(trim(name))>0), recurrence_weeks integer not null default 5 check(recurrence_weeks between 1 and 52), preferred_weekday integer default 2 check(preferred_weekday between 0 and 6), preferred_start_time time not null default '09:00', notes text default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(id,facility_id,user_id), foreign key(facility_id,user_id) references public.facilities(id,user_id) on delete restrict);
create table public.customers (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), facility_id uuid not null, group_id uuid not null, first_name text not null check(length(trim(first_name))>0), last_name text not null check(length(trim(last_name))>0), room_number text default '', status text not null default 'Aktiv' check(status in ('Aktiv','Pausiert','Krankenhaus','Ausgezogen','Inaktiv')), notes text default '', default_duration_minutes integer check(default_duration_minutes >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), foreign key(group_id,facility_id,user_id) references public.groups(id,facility_id,user_id) on delete restrict);
create table public.services (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text not null check(length(trim(name))>0), price numeric(12,2) not null check(price>=0), duration_minutes integer not null check(duration_minutes>=0), is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.customer_default_services (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), customer_id uuid not null, service_id uuid not null, unique(customer_id,service_id), foreign key(customer_id,user_id) references public.customers(id,user_id) on delete cascade, foreign key(service_id,user_id) references public.services(id,user_id) on delete restrict);
create table public.appointments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), facility_id uuid not null, group_id uuid not null, appointment_date date not null, start_time time not null, status text not null default 'Geplant' check(status in ('Geplant','In Bearbeitung','Abgeschlossen','Verschoben','Abgesagt')), recurrence_weeks integer check(recurrence_weeks between 1 and 52), recurrence_series_id uuid, notes text default '', actual_start_time timestamptz, actual_end_time timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), foreign key(group_id,facility_id,user_id) references public.groups(id,facility_id,user_id) on delete restrict, check(actual_end_time is null or actual_end_time>=actual_start_time));
alter table public.appointments add constraint appointments_series_date unique(user_id,recurrence_series_id,appointment_date) deferrable initially deferred;
create table public.appointment_customers (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), appointment_id uuid not null, customer_id uuid not null, status text not null default 'Offen' check(status in ('Offen','In Behandlung','Erledigt','Nicht durchgeführt')), non_completion_reason text, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(appointment_id,customer_id), unique(id,appointment_id,customer_id,user_id), foreign key(appointment_id,user_id) references public.appointments(id,user_id) on delete cascade, foreign key(customer_id,user_id) references public.customers(id,user_id) on delete restrict);
create table public.treatments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), appointment_id uuid not null, appointment_customer_id uuid not null unique, customer_id uuid not null, start_time timestamptz not null default now(), end_time timestamptz, duration_minutes numeric(12,2) check(duration_minutes>=0), total_price numeric(12,2) not null default 0 check(total_price>=0), material_cost numeric(12,2) not null default 0 check(material_cost>=0), notes text default '', price_override numeric(12,2) check(price_override>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), foreign key(appointment_customer_id,appointment_id,customer_id,user_id) references public.appointment_customers(id,appointment_id,customer_id,user_id) on delete restrict, check(end_time is null or end_time>=start_time));
create unique index treatments_one_running on public.treatments(user_id) where end_time is null;
create table public.treatment_services (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), treatment_id uuid not null, service_id uuid, service_name_snapshot text not null, price_snapshot numeric(12,2) not null check(price_snapshot>=0), duration_minutes_snapshot integer not null default 0, created_at timestamptz not null default now(), unique(treatment_id,service_id), foreign key(treatment_id,user_id) references public.treatments(id,user_id) on delete restrict, foreign key(service_id,user_id) references public.services(id,user_id) on delete restrict);
create table public.color_formulas (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), customer_id uuid not null, treatment_id uuid, product text default '', color_1 text default '', color_1_amount numeric check(color_1_amount>=0), color_2 text default '', color_2_amount numeric check(color_2_amount>=0), color_3 text default '', color_3_amount numeric check(color_3_amount>=0), developer_strength text default '', developer_amount numeric check(developer_amount>=0), processing_time_minutes integer check(processing_time_minutes>=0), notes text default '', formula_date date not null default current_date, created_at timestamptz not null default now(), foreign key(customer_id,user_id) references public.customers(id,user_id) on delete restrict, foreign key(treatment_id,user_id) references public.treatments(id,user_id) on delete restrict);
create index facilities_owner on public.facilities(user_id);
create index groups_owner_facility on public.groups(user_id,facility_id);
create index customers_owner_group on public.customers(user_id,group_id,status);
create index customers_search on public.customers(user_id,last_name,first_name,room_number);
create index appointments_owner_date on public.appointments(user_id,appointment_date);
create index appointment_customers_visit on public.appointment_customers(user_id,appointment_id);
create index treatments_owner_end on public.treatments(user_id,end_time);
create index treatments_customer on public.treatments(user_id,customer_id,start_time);
create index formulas_customer on public.color_formulas(user_id,customer_id,formula_date desc);
create index defaults_owner on public.customer_default_services(user_id,customer_id);
create index services_owner on public.services(user_id);
create index treatment_services_owner on public.treatment_services(user_id,treatment_id);
create function public.touch_updated() returns trigger language plpgsql set search_path=public as
$$
  begin new.updated_at=now();
  return new;
  end
$$;
do
$$
  declare t text;
  begin foreach t in array array['profiles','facilities','groups','customers','services','customer_default_services','appointments','appointment_customers','treatments','treatment_services','color_formulas'] loop execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (user_id=auth.uid())',t);
  if t in ('profiles','facilities','groups','customers','services','color_formulas') then execute format('create policy owner_write on public.%I for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
  end if;
  execute format('grant select on public.%I to authenticated',t);
  if t in ('profiles','facilities','groups','customers','services','color_formulas') then execute format('grant insert,update,delete on public.%I to authenticated',t);
  end if;
  if t not in ('color_formulas','treatment_services','customer_default_services') then execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated()',t);
  end if;
  end loop;
  end
$$;
-- All operational mutations use authenticated, atomic RPCs. Tables are read-only to clients.
create function public.require_user() returns uuid language plpgsql stable set search_path=public as
$$
  begin if auth.uid() is null then raise exception 'Bitte zuerst anmelden.';
  end if;
  return auth.uid();
  end
$$;
create function public.initialize_account() returns void language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  begin perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  insert into profiles(user_id) values(u) on conflict(user_id) do nothing;
  if not exists(select 1 from services where user_id=u) then insert into services(user_id,name,price,duration_minutes) values (u,'Damenhaarschnitt',28,30),(u,'Herrenhaarschnitt',22,20),(u,'Waschen',5,5),(u,'Föhnen',12,15),(u,'Farbe',35,45),(u,'Dauerwelle',55,70),(u,'Bart',10,10);
  end if;
  end
$$;
create function public.save_customer(p_data jsonb,p_services uuid[]) returns uuid language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  c uuid;
  begin c:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
  if exists(select 1 from customers where id=c and user_id<>u) then raise exception 'Kein Zugriff auf diesen Kunden.';
  end if;
  insert into customers(id,user_id,facility_id,group_id,first_name,last_name,room_number,status,notes) values(c,u,(p_data->>'facility_id')::uuid,(p_data->>'group_id')::uuid,trim(p_data->>'first_name'),trim(p_data->>'last_name'),coalesce(p_data->>'room_number',''),coalesce(p_data->>'status','Aktiv'),coalesce(p_data->>'notes','')) on conflict(id) do update set facility_id=excluded.facility_id,group_id=excluded.group_id,first_name=excluded.first_name,last_name=excluded.last_name,room_number=excluded.room_number,status=excluded.status,notes=excluded.notes;
  delete from customer_default_services where customer_id=c and user_id=u;
  insert into customer_default_services(user_id,customer_id,service_id) select u,c,s.id from services s where s.id=any(p_services) and s.user_id=u and s.is_active;
  return c;
  end
$$;
create function public.plan_visit(p_group uuid,p_date date,p_time time,p_weeks integer default null,p_all boolean default true,p_series uuid default null) returns uuid language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  g groups;
  a uuid;
  begin select * into g from groups where id=p_group and user_id=u;
  if not found then raise exception 'Wohnbereich nicht gefunden.';
  end if;
  if p_date is null or p_time is null then raise exception 'Bitte Datum und Startzeit angeben.';
  end if;
  insert into appointments(user_id,facility_id,group_id,appointment_date,start_time,recurrence_weeks,recurrence_series_id) values(u,g.facility_id,g.id,p_date,p_time,p_weeks,case when p_weeks is not null then coalesce(p_series,gen_random_uuid()) end) returning id into a;
  if p_all then insert into appointment_customers(user_id,appointment_id,customer_id,sort_order) select u,a,id,row_number() over(order by last_name,first_name) from customers where user_id=u and group_id=g.id and status='Aktiv';
  end if;
  return a;
  end
$$;
create function public.add_visit_customer(p_appointment uuid,p_customer uuid) returns void language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  a appointments;
  begin select * into a from appointments where id=p_appointment and user_id=u for update;
  if not found or a.status not in ('Geplant','Verschoben','In Bearbeitung') then raise exception 'Dieser Besuch ist nicht bearbeitbar.';
  end if;
  if not exists(select 1 from customers where id=p_customer and user_id=u and facility_id=a.facility_id and group_id=a.group_id) then raise exception 'Bitte einen Kunden dieses Wohnbereichs auswählen.';
  end if;
  insert into appointment_customers(user_id,appointment_id,customer_id,sort_order) values(u,a.id,p_customer,(select coalesce(max(sort_order),0)+1 from appointment_customers where appointment_id=a.id)) on conflict(appointment_id,customer_id) do nothing;
  end
$$;
create function public.start_treatment(p_member uuid) returns uuid language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  m appointment_customers;
  a appointments;
  t uuid;
  begin perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into m from appointment_customers where id=p_member and user_id=u for update;
  if not found then raise exception 'Kunde in diesem Besuch nicht gefunden.';
  end if;
  select id into t from treatments where appointment_customer_id=m.id and user_id=u and end_time is null;
  if t is not null then return t;
  end if;
  if exists(select 1 from treatments where user_id=u and end_time is null) then raise exception 'Bitte zuerst die laufende Behandlung beenden.';
  end if;
  select * into a from appointments where id=m.appointment_id and user_id=u for update;
  if m.status<>'Offen' or a.status not in ('Geplant','Verschoben','In Bearbeitung') then raise exception 'Diese Behandlung kann nicht gestartet werden.';
  end if;
  insert into treatments(user_id,appointment_id,appointment_customer_id,customer_id) values(u,a.id,m.id,m.customer_id) returning id into t;
  insert into treatment_services(user_id,treatment_id,service_id,service_name_snapshot,price_snapshot,duration_minutes_snapshot) select u,t,s.id,s.name,s.price,s.duration_minutes from customer_default_services d join services s on s.id=d.service_id and s.user_id=u where d.customer_id=m.customer_id and s.is_active;
  update treatments set total_price=(select coalesce(sum(price_snapshot),0) from treatment_services where treatment_id=t) where id=t;
  update appointment_customers set status='In Behandlung' where id=m.id;
  update appointments set status='In Bearbeitung',actual_start_time=coalesce(actual_start_time,now()) where id=a.id;
  return t;
  end
$$;
create function public.save_treatment(p_treatment uuid,p_services uuid[],p_price numeric,p_material numeric,p_notes text,p_formula jsonb default null,p_finish boolean default false) returns uuid language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  t treatments;
  s services;
  f uuid;
  begin select * into t from treatments where id=p_treatment and user_id=u for update;
  if not found then raise exception 'Behandlung nicht gefunden.';
  end if;
  if t.end_time is not null then return t.id;
  end if;
  if p_material<0 or p_price<0 then raise exception 'Preis und Materialkosten dürfen nicht negativ sein.';
  end if;
  if exists(select 1 from unnest(p_services) sid where not exists(select 1 from services where id=sid and user_id=u)) then raise exception 'Ungültige Leistung.';
  end if;
  delete from treatment_services where treatment_id=t.id and not(service_id=any(p_services));
  for s in select * from services where id=any(p_services) and user_id=u loop insert into treatment_services(user_id,treatment_id,service_id,service_name_snapshot,price_snapshot,duration_minutes_snapshot) values(u,t.id,s.id,s.name,s.price,s.duration_minutes) on conflict(treatment_id,service_id) do nothing;
  end loop;
  update treatments set total_price=coalesce(p_price,(select coalesce(sum(price_snapshot),0) from treatment_services where treatment_id=t.id)),price_override=p_price,material_cost=coalesce(p_material,0),notes=coalesce(p_notes,''),end_time=case when p_finish then now() end,duration_minutes=case when p_finish then extract(epoch from(now()-t.start_time))/60 end where id=t.id;
  if p_formula is not null then delete from color_formulas where treatment_id=t.id;
  insert into color_formulas(user_id,customer_id,treatment_id,product,color_1,color_1_amount,color_2,color_2_amount,color_3,color_3_amount,developer_strength,developer_amount,processing_time_minutes,notes,formula_date) values(u,t.customer_id,t.id,p_formula->>'product',p_formula->>'color_1',nullif(p_formula->>'color_1_amount','')::numeric,p_formula->>'color_2',nullif(p_formula->>'color_2_amount','')::numeric,p_formula->>'color_3',nullif(p_formula->>'color_3_amount','')::numeric,p_formula->>'developer_strength',nullif(p_formula->>'developer_amount','')::numeric,nullif(p_formula->>'processing_time_minutes','')::integer,p_formula->>'notes',(now() at time zone 'Europe/Berlin')::date);
  end if;
  if p_finish then update appointment_customers set status='Erledigt' where id=t.appointment_customer_id;
  end if;
  return t.id;
  end
$$;
create function public.skip_customer(p_member uuid,p_reason text) returns void language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  m appointment_customers;
  begin select m1.* into m from appointment_customers m1 join appointments a on a.id=m1.appointment_id where m1.id=p_member and m1.user_id=u and a.status not in ('Abgeschlossen','Abgesagt') for update of m1;
  if not found or m.status<>'Offen' then raise exception 'Nur offene Kunden können als nicht durchgeführt markiert werden.';
  end if;
  if p_reason not in ('Möchte heute nicht','Nicht anwesend','Krankenhaus','Verschoben','Nächstes Mal','Sonstiges') then raise exception 'Bitte einen gültigen Grund auswählen.';
  end if;
  update appointment_customers set status='Nicht durchgeführt',non_completion_reason=p_reason where id=m.id;
  end
$$;
create function public.close_visit(p_appointment uuid) returns uuid language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  a appointments;
  next_date date;
  nxt uuid;
  begin select * into a from appointments where id=p_appointment and user_id=u for update;
  if not found then raise exception 'Besuch nicht gefunden.';
  end if;
  if a.status='Abgeschlossen' then select id into nxt from appointments where user_id=u and recurrence_series_id=a.recurrence_series_id and appointment_date>a.appointment_date order by appointment_date limit 1;
  return nxt;
  end if;
  if a.status='Abgesagt' then raise exception 'Ein abgesagter Besuch kann nicht abgeschlossen werden.';
  end if;
  if exists(select 1 from appointment_customers where appointment_id=a.id and status in ('Offen','In Behandlung')) then raise exception 'Bitte alle Kunden erledigen oder als nicht durchgeführt markieren.';
  end if;
  update appointments set status='Abgeschlossen',actual_end_time=case when actual_start_time is not null then now() end where id=a.id;
  if a.recurrence_weeks is not null then next_date:=a.appointment_date+a.recurrence_weeks*7;
  select id into nxt from appointments where user_id=u and recurrence_series_id=a.recurrence_series_id and appointment_date=next_date;
  if nxt is null then nxt:=public.plan_visit(a.group_id,next_date,a.start_time,a.recurrence_weeks,true,a.recurrence_series_id);
  end if;
  end if;
  return nxt;
  end
$$;
create function public.move_visit(p_appointment uuid,p_date date,p_time time,p_future boolean default false) returns void language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  a appointments;
  delta integer;
  begin select * into a from appointments where id=p_appointment and user_id=u for update;
  if not found or a.status not in ('Geplant','Verschoben') or a.appointment_date<(now() at time zone 'Europe/Berlin')::date then raise exception 'Vergangene oder begonnene Besuche können nicht verschoben werden.';
  end if;
  if p_date<(now() at time zone 'Europe/Berlin')::date then raise exception 'Bitte ein zukünftiges Datum wählen.';
  end if;
  delta:=p_date-a.appointment_date;
  if p_future and a.recurrence_series_id is not null then update appointments set appointment_date=appointment_date+delta,start_time=p_time,status='Verschoben' where user_id=u and recurrence_series_id=a.recurrence_series_id and appointment_date>=a.appointment_date and status in ('Geplant','Verschoben');
  else update appointments set appointment_date=p_date,start_time=p_time,status='Verschoben' where id=a.id;
  end if;
  end
$$;
create function public.cancel_visit(p_appointment uuid,p_delete boolean default false) returns void language plpgsql security definer set search_path=public as
$$
  declare u uuid:=public.require_user();
  a appointments;
  begin select * into a from appointments where id=p_appointment and user_id=u for update;
  if not found or a.status not in ('Geplant','Verschoben','Abgesagt') or exists(select 1 from treatments where appointment_id=a.id) then raise exception 'Besuche mit Behandlungen bleiben erhalten.';
  end if;
  if p_delete then delete from appointments where id=a.id;
  else update appointments set status='Abgesagt' where id=a.id;
  end if;
  end
$$;
-- Formulas belonging to a treatment must belong to its customer and remain immutable after completion.
create function public.guard_formula() returns trigger language plpgsql set search_path=public as
$$
  begin if new.treatment_id is not null and not exists(select 1 from treatments where id=new.treatment_id and customer_id=new.customer_id and user_id=new.user_id and (end_time is null or current_user='postgres')) then raise exception 'Die Farbrezeptur gehört nicht zu einer offenen Behandlung dieses Kunden.';
  end if;
  return new;
  end
$$;
create trigger formula_valid before insert or update on public.color_formulas for each row execute function public.guard_formula();
-- Keep historical formulas: clients add a new version instead of replacing one.
revoke update,delete on public.color_formulas from authenticated;
-- Functions are callable only by signed-in users, never anonymously.
do
$$
  declare r record;
  begin for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('require_user','initialize_account','save_customer','plan_visit','add_visit_customer','start_treatment','save_treatment','skip_customer','close_visit','move_visit','cancel_visit') loop execute format('revoke all on function %s from public,anon',r.sig);
  execute format('grant execute on function %s to authenticated',r.sig);
  end loop;
  end
$$;
commit;

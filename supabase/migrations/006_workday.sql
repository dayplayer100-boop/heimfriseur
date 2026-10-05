-- Nach 001–005 einmal ausführen. Einmalige Termine ändern den normalen Rhythmus nicht.
begin;
alter table public.feedback alter column app_version set default '6.0';
alter table public.customers add column temporary_due_date date;
alter table public.customers add column rhythm_anchor_date date;
alter table public.appointment_customers drop constraint appointment_customers_entry_type_check;
alter table public.appointment_customers add constraint appointment_customers_entry_type_check check(entry_type in ('Regulär','Spontan','Vorgezogen','Verschoben'));
alter table public.treatment_payments drop constraint treatment_payments_status_check;
alter table public.treatment_payments add constraint treatment_payments_status_check check(status in ('Offen','Bezahlt','Unbekannt','Nicht erforderlich'));
create or replace function heimfriseur_private.due(p_customer uuid,p_date date) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
 declare c public.customers;co public.cohorts;begin select * into c from public.customers where id=p_customer;
 if c.status<>'Aktiv' or c.hair_request='Nein' then return false;end if;
 if c.temporary_due_date is not null then return c.temporary_due_date<=p_date;end if;
 if c.next_due_date is not null then return c.next_due_date<=p_date;end if;
 if c.cohort_id is not null then select * into co from public.cohorts where id=c.cohort_id;return p_date>=co.anchor_date and mod((p_date-co.anchor_date)/7,coalesce(c.recurrence_weeks,co.recurrence_weeks))=0;end if;return true;end $$;
create or replace function heimfriseur_private.next_customer_date() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare c public.customers;a public.appointments;w integer;n date;begin
 if old.end_time is null and new.end_time is not null then
 select * into c from public.customers where id=new.customer_id for update;select * into a from public.appointments where id=new.appointment_id;
 w:=coalesce(c.recurrence_weeks,(select recurrence_weeks from public.cohorts where id=c.cohort_id),(select recurrence_weeks from public.groups where id=c.group_id),5);
 n:=coalesce(c.rhythm_anchor_date,a.appointment_date)+w*7;
 while n<=a.appointment_date loop n:=n+w*7;end loop;
 update public.customers set next_due_date=n,temporary_due_date=null,rhythm_anchor_date=null where id=c.id;perform heimfriseur_private.sync_future(c.id);end if;return new;end $$;
create function public.reschedule_customer_once(p_customer uuid,p_date date,p_time time default '09:00') returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare c public.customers;m public.business_memberships:=heimfriseur_private.membership();a uuid;anchor date;source uuid;begin
 if not heimfriseur_private.allowed('edit_schedule') then raise exception 'Termine darfst du nicht ändern.' using errcode='42501';end if;
 c:=heimfriseur_private.customer_access(p_customer);perform pg_advisory_xact_lock(hashtextextended(c.id::text,61));
 select * into c from public.customers where id=p_customer for update;
 if p_date is null or p_date<(now() at time zone 'Europe/Berlin')::date then raise exception 'Bitte einen heutigen oder zukünftigen Termin wählen.';end if;
 if c.status<>'Aktiv' or c.hair_request='Nein' then raise exception 'Bitte einen aktiven Kunden mit Friseurwunsch wählen.';end if;
 if exists(select 1 from public.treatments where customer_id=c.id and end_time is null) then raise exception 'Bitte zuerst die laufende Behandlung beenden.';end if;
 if c.temporary_due_date=p_date then select v.id into a from public.appointments v join public.appointment_customers x on x.appointment_id=v.id where x.customer_id=c.id and v.appointment_date=p_date and v.start_time=p_time and v.status in ('Geplant','Verschoben') and x.status='Offen' order by v.start_time,v.id limit 1;if a is not null then return a;end if;end if;
 anchor:=coalesce(c.rhythm_anchor_date,c.next_due_date,(select min(v.appointment_date) from public.appointments v join public.appointment_customers x on x.appointment_id=v.id where x.customer_id=c.id and x.status='Offen' and v.status in ('Geplant','Verschoben') and v.appointment_date>=(now() at time zone 'Europe/Berlin')::date),p_date);
 select x.id into source from public.appointment_customers x join public.appointments v on v.id=x.appointment_id where x.customer_id=c.id and x.status='Offen' and v.status in ('Geplant','Verschoben','In Bearbeitung') and v.appointment_date>=(now() at time zone 'Europe/Berlin')::date order by case when v.appointment_date=coalesce(c.temporary_due_date,anchor) then 0 else 1 end,v.appointment_date,v.id limit 1 for update of x;
 if m.role='employee' and source is not null and not exists(select 1 from public.appointment_assignments ass join public.appointment_customers x on x.appointment_id=ass.appointment_id where x.id=source and ass.user_id=auth.uid()) then raise exception 'Dieser bestehende Termin muss dir zuerst zugewiesen werden.' using errcode='42501';end if;
 if exists(select 1 from public.treatments where customer_id=c.id and end_time is null) then raise exception 'Bitte zuerst die laufende Behandlung beenden.';end if;
 -- User changed the date for this occurrence: unfinished future occurrences remain in history as skipped.
 update public.appointment_customers x set status='Nicht durchgeführt',non_completion_reason=case when p_date<anchor then 'Vorgezogen' else 'Einmalig verschoben' end,followup_date=p_date from public.appointments v where v.id=x.appointment_id and x.id=source and x.customer_id=c.id and x.status='Offen' and v.status in ('Geplant','Verschoben','In Bearbeitung') and v.appointment_date>=(now() at time zone 'Europe/Berlin')::date and not exists(select 1 from public.treatments t where t.appointment_customer_id=x.id);
 update public.customers set temporary_due_date=p_date,rhythm_anchor_date=anchor where id=c.id;
 a:=public.plan_customer_visit(c.facility_id,c.group_id,c.id,p_date,p_time,null,false,null);
 update public.appointment_customers set entry_type=case when p_date<anchor then 'Vorgezogen' else 'Verschoben' end where appointment_id=a and customer_id=c.id;
 perform heimfriseur_private.sync_future(c.id);
 insert into public.audit_events(business_id,actor_id,action,record_id,details) values(m.business_id,auth.uid(),'customer_rescheduled_once',c.id,jsonb_build_object('date',p_date,'regular_due',anchor));return a;end $$;
create function public.skip_customer_choice(p_member uuid,p_reason text,p_choice text,p_date date default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare x public.appointment_customers;a public.appointments;c public.customers;n date;w integer;anchor date;begin
 select * into x from public.appointment_customers where id=p_member;perform heimfriseur_private.visit(x.appointment_id);
 select * into a from public.appointments where id=x.appointment_id;select * into c from public.customers where id=x.customer_id for update;
 anchor:=coalesce(c.rhythm_anchor_date,c.next_due_date,a.appointment_date);
 if p_choice='next_visit' then
 select min(v.appointment_date) into n from public.appointments v where v.facility_id=a.facility_id and (v.all_groups or v.group_id=c.group_id) and v.appointment_date>a.appointment_date and v.status in ('Geplant','Verschoben');
 n:=coalesce(n,a.appointment_date+coalesce((select visit_recurrence_weeks from public.facilities where id=a.facility_id),1)*7);
 elsif p_choice='regular' then
 w:=coalesce(c.recurrence_weeks,(select recurrence_weeks from public.cohorts where id=c.cohort_id),(select recurrence_weeks from public.groups where id=c.group_id),5);n:=anchor;while n<=a.appointment_date loop n:=n+w*7;end loop;
 elsif p_choice='custom' then n:=p_date;
 elsif p_choice='unknown' then n:=null;
 else raise exception 'Bitte auswählen, wann der Kunde wieder dran ist.';end if;
 if p_choice<>'unknown' and (n is null or n<=a.appointment_date) then raise exception 'Der nächste Termin muss nach diesem Besuch liegen.';end if;
 perform public.skip_customer(p_member,case when p_reason='Krank' then 'Krankenhaus' when p_reason='Nicht vor Ort' then 'Nicht anwesend' else p_reason end);
 update public.appointment_customers set non_completion_reason=p_reason,followup_date=n where id=x.id;
 update public.customers set temporary_due_date=n,rhythm_anchor_date=anchor where id=c.id;perform heimfriseur_private.sync_future(c.id);end $$;
revoke all on function public.reschedule_customer_once(uuid,date,time),public.skip_customer_choice(uuid,text,text,date) from public,anon;
grant execute on function public.reschedule_customer_once(uuid,date,time),public.skip_customer_choice(uuid,text,text,date) to authenticated;
commit;

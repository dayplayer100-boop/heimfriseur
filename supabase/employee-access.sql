-- Nur als Betreiber im Supabase SQL Editor ausführen, nach Migration 007.
-- Korrigiert genau dieses Mitarbeiterkonto, keine anderen Mitarbeiter.
begin;
do $$
declare employee_id uuid; owner_id uuid; company_id uuid; previous_company uuid;
begin
 select id into employee_id from auth.users where lower(email)='MITARBEITER_EMAIL';
 select id into owner_id from auth.users where lower(email)='GESCHAEFTSFUEHRER_EMAIL';
 if employee_id is null then raise exception 'Mitarbeiterkonto MITARBEITER_EMAIL nicht gefunden. Bitte die genaue Schreibweise und Registrierung prüfen.'; end if;
 if owner_id is null or employee_id=owner_id then raise exception 'Geschäftsführerkonto nicht gefunden.'; end if;
 select b.id into company_id from public.businesses b join public.business_memberships m on m.business_id=b.id
 where b.owner_user_id=owner_id and m.user_id=owner_id and m.role='owner' and m.is_active;
 if company_id is null then raise exception 'GESCHAEFTSFUEHRER_EMAIL muss bereits aktiver Geschäftsführer sein.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(employee_id::text,0));
 select business_id into previous_company from public.business_memberships where user_id=employee_id for update;
 if previous_company is not null and previous_company<>company_id then
  -- Never orphan real data or silently move an existing operating company.
  if exists(select 1 from public.facilities where business_id=previous_company)
   or exists(select 1 from public.customers where business_id=previous_company)
   or exists(select 1 from public.appointments where business_id=previous_company)
   or exists(select 1 from public.treatments where business_id=previous_company)
   or exists(select 1 from public.business_memberships where business_id=previous_company and user_id<>employee_id)
   or exists(select 1 from public.appointment_assignments where user_id=employee_id)
  then raise exception 'Dieses Konto gehört bereits zu einem Unternehmen mit Daten. Zuordnung zuerst prüfen; es wurde nichts geändert.'; end if;
  delete from public.business_memberships where user_id=employee_id;
 end if;
 insert into public.business_memberships(business_id,user_id,role,display_name,is_active,permissions,onboarding_completed,setup_completed)
 values(company_id,employee_id,'employee','Mitarbeiter',true,
  '{"edit_customers":false,"add_customers":false,"edit_schedule":false,"override_prices":false,"record_payments":true,"view_billing":false,"close_visits":false}',true,true)
 on conflict(user_id) do update set role='employee',is_active=true,permissions=excluded.permissions;
 update public.app_admins set is_active=false where user_id=employee_id;
 insert into public.app_admin_audit(action,business_id,target_user_id,details)
 values('employee_access_corrected',company_id,employee_id,jsonb_build_object('role','employee','previous_business_id',previous_company));
end $$;
select u.email,m.role,m.is_active,b.name as unternehmen
from auth.users u join public.business_memberships m on m.user_id=u.id
join public.businesses b on b.id=m.business_id
where lower(u.email) in ('MITARBEITER_EMAIL','GESCHAEFTSFUEHRER_EMAIL');
commit;

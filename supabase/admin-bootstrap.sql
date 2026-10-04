-- Einmal im Supabase SQL-Editor, erst nach Migration 004.
-- Das Konto muss bereits registriert und per E-Mail bestätigt sein.
select public.bootstrap_app_admin('DEINE_ADMIN_EMAIL');
-- Kontrolle: Diese Adresse soll bereits Geschäftsführer sein.
select u.email, m.role, b.name as unternehmen
from auth.users u join public.business_memberships m on m.user_id=u.id
join public.businesses b on b.id=m.business_id
where lower(u.email)=lower('GESCHAEFTSFUEHRER_EMAIL');

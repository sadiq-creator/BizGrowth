-- Run this after you create an admin user in Supabase Authentication.
-- Replace the email below with your real admin email.

insert into public.admin_users (user_id, email)
select id, email
from auth.users
where email = 'your-admin-email@example.com'
on conflict (user_id) do update
set email = excluded.email;

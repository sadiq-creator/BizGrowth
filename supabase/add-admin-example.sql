-- Legacy helper kept for older notes.
-- New cafe owner setup should use supabase/add-cafe-admin-example.sql.

insert into public.cafe_admins (user_id, cafe_id, email)
select au.id, c.id, au.email
from auth.users au
cross join public.cafes c
where au.email = 'your-admin-email@example.com'
  and c.slug = 'demo-cafe'
on conflict (user_id) do update
set
  cafe_id = excluded.cafe_id,
  email = excluded.email;

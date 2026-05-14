-- Run this after you create the cafe owner in Supabase Authentication.
-- Change these three values for each cafe owner.

do $$
declare
  v_admin_email text := 'owner1@example.com';
  v_cafe_slug text := 'cafe-owner-1';
  v_cafe_name text := 'Cafe Owner 1';
  v_user_id uuid;
  v_cafe_id uuid;
begin
  select id
  into v_user_id
  from auth.users
  where email = v_admin_email;

  if v_user_id is null then
    raise exception 'Create the Supabase Auth user first: %', v_admin_email;
  end if;

  if v_cafe_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Cafe slug must use lowercase letters, numbers, and hyphens.';
  end if;

  insert into public.cafes (
    slug,
    cafe_name,
    staff_access_code
  )
  values (
    v_cafe_slug,
    v_cafe_name,
    'STAFF-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16))
  )
  on conflict (slug) do update
  set cafe_name = excluded.cafe_name
  returning id
  into v_cafe_id;

  insert into public.cafe_admins (user_id, cafe_id, email)
  values (v_user_id, v_cafe_id, v_admin_email)
  on conflict (user_id) do update
  set
    cafe_id = excluded.cafe_id,
    email = excluded.email;

  if not exists (
    select 1
    from public.menu_items
    where cafe_id = v_cafe_id
  ) then
    insert into public.menu_items (cafe_id, name, description, category, price, image_url, is_available)
    values
      (v_cafe_id, 'Velvet Latte', 'Espresso with steamed milk, vanilla cream, and a soft caramel finish.', 'Coffee', 145, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80', true),
      (v_cafe_id, 'Cold Brew Cloud', 'Slow-steeped coffee with milk foam and brown sugar syrup.', 'Coffee', 160, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80', true),
      (v_cafe_id, 'Truffle Chicken Pasta', 'Cream pasta with chicken, parmesan, and truffle oil.', 'Meals', 265, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80', true),
      (v_cafe_id, 'Chocolate Dream Cake', 'Layered chocolate cake with ganache and cocoa crumble.', 'Dessert', 175, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80', true);
  end if;
end $$;

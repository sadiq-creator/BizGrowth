create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'customer' check (role in ('customer', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.cafe_settings (
  id integer primary key default 1 check (id = 1),
  cafe_name text not null default 'BizGrowth Cafe',
  tagline text not null default 'Order ahead. Skip the line.',
  welcome_text text not null default 'Browse the menu, build your order, and choose your payment path before reaching the counter.',
  logo_url text,
  hero_image_url text,
  primary_color text not null default '#5b74d6',
  accent_color text not null default '#6f55c8',
  warm_color text not null default '#f08ba8',
  enable_card boolean not null default true,
  enable_gcash boolean not null default true,
  enable_counter boolean not null default true,
  gcash_number text not null default '0917 000 0000',
  order_prefix text not null default 'BG',
  require_customer_name boolean not null default true,
  counter_instructions text not null default 'Show your order code to the counter staff before food prep starts.',
  staff_access_code text not null default ('STAFF-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cafe_settings drop column if exists admin_pin_hash;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.cafes (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  cafe_name text not null default 'BizGrowth Cafe',
  tagline text not null default 'Order ahead. Skip the line.',
  welcome_text text not null default 'Browse the menu, build your order, and choose your payment path before reaching the counter.',
  logo_url text,
  hero_image_url text,
  primary_color text not null default '#5b74d6',
  accent_color text not null default '#6f55c8',
  warm_color text not null default '#f08ba8',
  enable_card boolean not null default true,
  enable_gcash boolean not null default true,
  enable_counter boolean not null default true,
  gcash_number text not null default '0917 000 0000',
  order_prefix text not null default 'BG',
  require_customer_name boolean not null default true,
  counter_instructions text not null default 'Show your order code to the counter staff before food prep starts.',
  staff_access_code text not null unique default ('STAFF-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cafe_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists cafe_admins_cafe_id_idx
on public.cafe_admins (cafe_id);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  actor_key text not null,
  action text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists security_events_lookup_idx
on public.security_events (actor_key, action, created_at desc);

insert into public.cafes (
  slug,
  cafe_name,
  tagline,
  welcome_text,
  logo_url,
  hero_image_url,
  primary_color,
  accent_color,
  warm_color,
  enable_card,
  enable_gcash,
  enable_counter,
  gcash_number,
  order_prefix,
  require_customer_name,
  counter_instructions,
  staff_access_code,
  created_at,
  updated_at
)
select
  'demo-cafe',
  cafe_name,
  tagline,
  welcome_text,
  logo_url,
  hero_image_url,
  primary_color,
  accent_color,
  warm_color,
  enable_card,
  enable_gcash,
  enable_counter,
  gcash_number,
  order_prefix,
  require_customer_name,
  counter_instructions,
  staff_access_code,
  created_at,
  updated_at
from public.cafe_settings
where id = 1
on conflict (slug) do nothing;

insert into public.cafes (slug, cafe_name, staff_access_code)
values (
  'demo-cafe',
  'BizGrowth Cafe',
  'STAFF-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16))
)
on conflict (slug) do nothing;

create table if not exists public.menu_items (
  id uuid primary key default extensions.gen_random_uuid(),
  cafe_id uuid references public.cafes(id) on delete cascade,
  name text not null,
  description text not null,
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_items add column if not exists cafe_id uuid references public.cafes(id) on delete cascade;
alter table public.menu_items alter column id set default extensions.gen_random_uuid();

update public.menu_items
set cafe_id = (select id from public.cafes where slug = 'demo-cafe')
where cafe_id is null;

alter table public.menu_items alter column cafe_id set not null;

create index if not exists menu_items_cafe_id_idx
on public.menu_items (cafe_id, category, name);

create table if not exists public.orders (
  id uuid primary key default extensions.gen_random_uuid(),
  cafe_id uuid references public.cafes(id) on delete cascade,
  order_code text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  table_number text,
  receipt_token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  payment_method text not null check (payment_method in ('card', 'gcash', 'counter')),
  payment_status text not null check (payment_status in ('paid', 'pay_at_counter')),
  order_status text not null default 'pending' check (order_status in ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists cafe_id uuid references public.cafes(id) on delete cascade;
alter table public.orders alter column id set default extensions.gen_random_uuid();
alter table public.orders alter column customer_id drop not null;
alter table public.orders add column if not exists table_number text;
alter table public.orders add column if not exists receipt_token text;

update public.orders
set cafe_id = (select id from public.cafes where slug = 'demo-cafe')
where cafe_id is null;

update public.orders
set receipt_token = encode(extensions.gen_random_bytes(16), 'hex')
where receipt_token is null;

alter table public.orders alter column cafe_id set not null;
alter table public.orders alter column receipt_token set default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.orders alter column receipt_token set not null;

create index if not exists orders_cafe_status_idx
on public.orders (cafe_id, order_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(10, 2) not null check (line_total >= 0)
);

alter table public.order_items alter column id set default extensions.gen_random_uuid();

create index if not exists order_items_order_id_idx
on public.order_items (order_id);

insert into public.cafe_admins (user_id, cafe_id, email)
select au.user_id, c.id, au.email
from public.admin_users au
cross join public.cafes c
where c.slug = 'demo-cafe'
on conflict (user_id) do update
set
  cafe_id = excluded.cafe_id,
  email = excluded.email;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_menu_items_updated_at on public.menu_items;
create trigger touch_menu_items_updated_at
before update on public.menu_items
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_cafes_updated_at on public.cafes;
create trigger touch_cafes_updated_at
before update on public.cafes
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_cafe_settings_updated_at on public.cafe_settings;

drop policy if exists "Profiles are visible to owner and staff" on public.profiles;
drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Menu is visible to customers and staff" on public.menu_items;
drop policy if exists "Staff manage menu" on public.menu_items;
drop policy if exists "Customers and staff read orders" on public.orders;
drop policy if exists "Customers create own orders" on public.orders;
drop policy if exists "Staff update orders" on public.orders;
drop policy if exists "Customers and staff read order items" on public.order_items;
drop policy if exists "Customers create own order items" on public.order_items;
drop policy if exists "Public read available menu" on public.menu_items;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.is_staff();
drop function if exists public.is_customer();
drop function if exists public.admin_pin_is_valid(text);
drop function if exists public.admin_get_settings(text);
drop function if exists public.admin_update_settings(text, jsonb);
drop function if exists public.admin_save_menu_item(text, jsonb);
drop function if exists public.admin_toggle_menu_item(text, uuid, boolean);
drop function if exists public.admin_rotate_staff_code(text);
drop function if exists public.get_public_cafe_settings();
drop function if exists public.get_public_cafe_settings(text);
drop function if exists public.get_public_menu_items(text);
drop function if exists public.create_customer_order(jsonb);
drop function if exists public.create_customer_order(text, jsonb);
drop function if exists public.get_order_receipt(uuid, text);
drop function if exists public.get_order_receipt(text, uuid, text);
drop function if exists public.staff_code_is_valid(text);
drop function if exists public.staff_code_is_valid(text, text);
drop function if exists public.staff_list_orders(text);
drop function if exists public.staff_list_orders(text, text);
drop function if exists public.staff_update_order_status(text, uuid, text);
drop function if exists public.staff_update_order_status(text, text, uuid, text);
drop function if exists public.is_admin();
drop function if exists public.require_admin(text);

alter table public.profiles enable row level security;
alter table public.cafe_settings enable row level security;
alter table public.cafes enable row level security;
alter table public.admin_users enable row level security;
alter table public.cafe_admins enable row level security;
alter table public.security_events enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.request_actor_key(p_extra text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := '';
  v_user text := '';
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', ''), ',', 1);
  v_user := coalesce(auth.uid()::text, 'anon');

  return encode(extensions.digest(v_user || ':' || coalesce(nullif(v_ip, ''), 'unknown'), 'sha256'), 'hex');
end;
$$;

create or replace function public.assert_rate_limit(
  p_action text,
  p_extra text default '',
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_key text := public.request_actor_key(p_extra);
  v_count integer;
begin
  delete from public.security_events
  where created_at < now() - interval '1 day';

  select count(*)
  into v_count
  from public.security_events
  where actor_key = v_actor_key
    and action = p_action
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    raise exception 'Too many attempts. Please wait and try again.';
  end if;

  insert into public.security_events (actor_key, action, success)
  values (v_actor_key, p_action, false);
end;
$$;

create or replace function public.cafe_id_from_slug(p_cafe_slug text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.cafes
  where slug = lower(trim(coalesce(p_cafe_slug, '')))
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.cafe_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.require_admin(p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
begin
  perform public.assert_rate_limit(p_action, coalesce(auth.uid()::text, 'anon'), 60, 60);

  if auth.uid() is null then
    raise exception 'Admin login is required.';
  end if;

  select cafe_id
  into v_cafe_id
  from public.cafe_admins
  where user_id = auth.uid();

  if v_cafe_id is null then
    raise exception 'This account is not assigned to a cafe.';
  end if;

  return v_cafe_id;
end;
$$;

create or replace function public.staff_code_is_valid(p_cafe_slug text, p_staff_access_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.cafes
    where slug = lower(trim(coalesce(p_cafe_slug, '')))
      and length(coalesce(p_staff_access_code, '')) between 8 and 80
      and staff_access_code = coalesce(p_staff_access_code, '')
  );
$$;

create or replace function public.cafe_settings_json(p_cafe public.cafes, p_include_private boolean default false)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'cafe_id', p_cafe.id,
      'cafe_slug', p_cafe.slug,
      'cafe_name', p_cafe.cafe_name,
      'tagline', p_cafe.tagline,
      'welcome_text', p_cafe.welcome_text,
      'logo_url', p_cafe.logo_url,
      'hero_image_url', p_cafe.hero_image_url,
      'primary_color', p_cafe.primary_color,
      'accent_color', p_cafe.accent_color,
      'warm_color', p_cafe.warm_color,
      'enable_card', p_cafe.enable_card,
      'enable_gcash', p_cafe.enable_gcash,
      'enable_counter', p_cafe.enable_counter,
      'gcash_number', p_cafe.gcash_number,
      'order_prefix', p_cafe.order_prefix,
      'require_customer_name', p_cafe.require_customer_name,
      'counter_instructions', p_cafe.counter_instructions,
      'staff_access_code', case when p_include_private then p_cafe.staff_access_code else null end
    )
  );
$$;

create or replace function public.get_public_cafe_settings(p_cafe_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_cafe public.cafes%rowtype;
begin
  select *
  into v_cafe
  from public.cafes
  where slug = lower(trim(coalesce(p_cafe_slug, '')));

  if not found then
    raise exception 'Cafe was not found.';
  end if;

  return public.cafe_settings_json(v_cafe, false);
end;
$$;

create or replace function public.get_public_menu_items(p_cafe_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_cafe_id uuid := public.cafe_id_from_slug(p_cafe_slug);
  v_menu jsonb;
begin
  if v_cafe_id is null then
    raise exception 'Cafe was not found.';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(mi) - 'cafe_id' order by mi.category, mi.name),
    '[]'::jsonb
  )
  into v_menu
  from public.menu_items mi
  where mi.cafe_id = v_cafe_id
    and mi.is_available = true;

  return v_menu;
end;
$$;

create or replace function public.order_items_json(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'menu_item_id', oi.menu_item_id,
        'item_name', oi.item_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'line_total', oi.line_total
      )
      order by oi.id
    ),
    '[]'::jsonb
  )
  from public.order_items oi
  where oi.order_id = p_order_id;
$$;

create or replace function public.order_json(p_order public.orders)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', p_order.id,
    'cafe_id', p_order.cafe_id,
    'order_code', p_order.order_code,
    'customer_name', p_order.customer_name,
    'table_number', p_order.table_number,
    'payment_method', p_order.payment_method,
    'payment_status', p_order.payment_status,
    'order_status', p_order.order_status,
    'total_amount', p_order.total_amount,
    'created_at', p_order.created_at,
    'items', public.order_items_json(p_order.id)
  );
$$;

create or replace function public.create_customer_order(p_cafe_slug text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe public.cafes%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
  v_line_total numeric(10, 2);
  v_total numeric(10, 2) := 0;
  v_items jsonb := '[]'::jsonb;
  v_payment_method text := lower(coalesce(payload ->> 'payment_method', ''));
  v_customer_name text := trim(coalesce(payload ->> 'customer_name', ''));
  v_table_number text := nullif(trim(coalesce(payload ->> 'table_number', '')), '');
  v_payment_status text;
  v_order_code text;
  v_attempt integer := 0;
begin
  select *
  into v_cafe
  from public.cafes
  where slug = lower(trim(coalesce(p_cafe_slug, '')));

  if not found then
    raise exception 'Cafe was not found.';
  end if;

  if v_cafe.require_customer_name and v_customer_name = '' then
    raise exception 'Customer name is required.';
  end if;

  v_customer_name := coalesce(nullif(v_customer_name, ''), 'Guest');

  if length(v_customer_name) > 80 then
    raise exception 'Customer name is too long.';
  end if;

  if v_table_number is not null and length(v_table_number) > 20 then
    raise exception 'Table number is too long.';
  end if;

  if v_payment_method not in ('card', 'gcash', 'counter') then
    raise exception 'Choose a valid payment method.';
  end if;

  if v_payment_method = 'card' and not v_cafe.enable_card then
    raise exception 'Card payment is disabled.';
  end if;

  if v_payment_method = 'gcash' and not v_cafe.enable_gcash then
    raise exception 'GCash payment is disabled.';
  end if;

  if v_payment_method = 'counter' and not v_cafe.enable_counter then
    raise exception 'Counter payment is disabled.';
  end if;

  if jsonb_typeof(coalesce(payload -> 'items', '[]'::jsonb)) <> 'array' then
    raise exception 'Order items must be an array.';
  end if;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) > 30 then
    raise exception 'Too many order items.';
  end if;

  for v_item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if coalesce(v_item ->> 'menu_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid menu item.';
    end if;

    if coalesce(v_item ->> 'quantity', '1') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid item quantity.';
    end if;

    v_quantity := (coalesce(v_item ->> 'quantity', '1'))::integer;

    if v_quantity < 1 or v_quantity > 50 then
      raise exception 'Item quantity must be between 1 and 50.';
    end if;

    select *
    into v_menu
    from public.menu_items
    where cafe_id = v_cafe.id
      and id = (v_item ->> 'menu_item_id')::uuid
      and is_available = true;

    if not found then
      raise exception 'One menu item is unavailable.';
    end if;

    v_line_total := v_menu.price * v_quantity;
    v_total := v_total + v_line_total;
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu.id,
        'item_name', v_menu.name,
        'quantity', v_quantity,
        'unit_price', v_menu.price,
        'line_total', v_line_total
      )
    );
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Add at least one item before checkout.';
  end if;

  v_payment_status := case
    when v_payment_method = 'counter' then 'pay_at_counter'
    else 'paid'
  end;

  loop
    v_attempt := v_attempt + 1;
    v_order_code := upper(v_cafe.order_prefix)
      || '-'
      || to_char(now(), 'YYYYMMDD')
      || '-'
      || upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6));

    begin
      insert into public.orders (
        cafe_id,
        order_code,
        customer_id,
        customer_name,
        table_number,
        payment_method,
        payment_status,
        order_status,
        total_amount
      )
      values (
        v_cafe.id,
        v_order_code,
        null,
        v_customer_name,
        v_table_number,
        v_payment_method,
        v_payment_status,
        'pending',
        v_total
      )
      returning *
      into v_order;

      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    insert into public.order_items (
      order_id,
      menu_item_id,
      item_name,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_order.id,
      (v_item ->> 'menu_item_id')::uuid,
      v_item ->> 'item_name',
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'line_total')::numeric
    );
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'receipt_token', v_order.receipt_token
  );
end;
$$;

create or replace function public.get_order_receipt(
  p_cafe_slug text,
  p_order_id uuid,
  p_receipt_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid := public.cafe_id_from_slug(p_cafe_slug);
  v_order public.orders%rowtype;
begin
  if v_cafe_id is null then
    raise exception 'Cafe was not found.';
  end if;

  select *
  into v_order
  from public.orders
  where cafe_id = v_cafe_id
    and id = p_order_id
    and receipt_token = p_receipt_token;

  if not found then
    raise exception 'Receipt was not found.';
  end if;

  return public.order_json(v_order);
end;
$$;

create or replace function public.staff_list_orders(p_cafe_slug text, p_staff_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid := public.cafe_id_from_slug(p_cafe_slug);
  v_result jsonb;
begin
  perform public.assert_rate_limit('staff_list_orders', coalesce(p_cafe_slug, '') || ':' || coalesce(p_staff_access_code, ''), 30, 60);

  if v_cafe_id is null or not public.staff_code_is_valid(p_cafe_slug, p_staff_access_code) then
    raise exception 'Invalid staff QR link.';
  end if;

  select coalesce(
    jsonb_agg(public.order_json(o) order by o.created_at desc),
    '[]'::jsonb
  )
  into v_result
  from public.orders o
  where o.cafe_id = v_cafe_id;

  return v_result;
end;
$$;

create or replace function public.staff_update_order_status(
  p_cafe_slug text,
  p_staff_access_code text,
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid := public.cafe_id_from_slug(p_cafe_slug);
begin
  perform public.assert_rate_limit('staff_update_order_status', coalesce(p_cafe_slug, '') || ':' || coalesce(p_staff_access_code, ''), 30, 60);

  if v_cafe_id is null or not public.staff_code_is_valid(p_cafe_slug, p_staff_access_code) then
    raise exception 'Invalid staff QR link.';
  end if;

  if p_status not in ('pending', 'preparing', 'ready', 'completed', 'cancelled') then
    raise exception 'Invalid order status.';
  end if;

  update public.orders
  set order_status = p_status
  where cafe_id = v_cafe_id
    and id = p_order_id;

  if not found then
    raise exception 'Order was not found.';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_cafe public.cafes%rowtype;
  v_menu jsonb;
begin
  v_cafe_id := public.require_admin('admin_get_settings');

  select *
  into v_cafe
  from public.cafes
  where id = v_cafe_id;

  select coalesce(
    jsonb_agg(to_jsonb(mi) - 'cafe_id' order by mi.category, mi.name),
    '[]'::jsonb
  )
  into v_menu
  from public.menu_items mi
  where mi.cafe_id = v_cafe_id;

  return jsonb_build_object(
    'settings', public.cafe_settings_json(v_cafe, true),
    'menu_items', v_menu
  );
end;
$$;

create or replace function public.admin_update_settings(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_logo_url text := nullif(trim(coalesce(payload ->> 'logo_url', '')), '');
  v_hero_image_url text := nullif(trim(coalesce(payload ->> 'hero_image_url', '')), '');
  v_order_prefix text := upper(coalesce(nullif(trim(coalesce(payload ->> 'order_prefix', '')), ''), 'BG'));
begin
  v_cafe_id := public.require_admin('admin_update_settings');

  if length(coalesce(payload ->> 'cafe_name', '')) > 80 then
    raise exception 'Cafe name is too long.';
  end if;

  if length(coalesce(payload ->> 'tagline', '')) > 140 then
    raise exception 'Tagline is too long.';
  end if;

  if length(coalesce(payload ->> 'welcome_text', '')) > 260 then
    raise exception 'Welcome text is too long.';
  end if;

  if v_logo_url is not null and length(v_logo_url) > 200000 then
    raise exception 'Logo image is too large.';
  end if;

  if v_logo_url is not null and v_logo_url !~* '^(data:image/(png|jpeg|jpg|webp);base64,|https://)' then
    raise exception 'Logo must be an HTTPS image or an uploaded image.';
  end if;

  if v_hero_image_url is not null and (length(v_hero_image_url) > 2000 or v_hero_image_url !~* '^https://') then
    raise exception 'Hero image must use an HTTPS URL.';
  end if;

  if coalesce(payload ->> 'primary_color', '#000000') !~* '^#[0-9a-f]{6}$'
    or coalesce(payload ->> 'accent_color', '#000000') !~* '^#[0-9a-f]{6}$'
    or coalesce(payload ->> 'warm_color', '#000000') !~* '^#[0-9a-f]{6}$' then
    raise exception 'Theme colors must be hex values.';
  end if;

  if v_order_prefix !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'Order prefix must use 1 to 8 letters or numbers.';
  end if;

  if length(coalesce(payload ->> 'gcash_number', '')) > 40 then
    raise exception 'GCash number is too long.';
  end if;

  if length(coalesce(payload ->> 'counter_instructions', '')) > 260 then
    raise exception 'Counter instructions is too long.';
  end if;

  update public.cafes
  set
    cafe_name = coalesce(nullif(trim(coalesce(payload ->> 'cafe_name', '')), ''), cafe_name),
    tagline = coalesce(payload ->> 'tagline', tagline),
    welcome_text = coalesce(payload ->> 'welcome_text', welcome_text),
    logo_url = v_logo_url,
    hero_image_url = v_hero_image_url,
    primary_color = coalesce(payload ->> 'primary_color', primary_color),
    accent_color = coalesce(payload ->> 'accent_color', accent_color),
    warm_color = coalesce(payload ->> 'warm_color', warm_color),
    enable_card = coalesce((payload ->> 'enable_card')::boolean, enable_card),
    enable_gcash = coalesce((payload ->> 'enable_gcash')::boolean, enable_gcash),
    enable_counter = coalesce((payload ->> 'enable_counter')::boolean, enable_counter),
    gcash_number = coalesce(payload ->> 'gcash_number', gcash_number),
    order_prefix = v_order_prefix,
    require_customer_name = coalesce((payload ->> 'require_customer_name')::boolean, require_customer_name),
    counter_instructions = coalesce(payload ->> 'counter_instructions', counter_instructions)
  where id = v_cafe_id;

  return public.admin_get_settings();
end;
$$;

create or replace function public.admin_save_menu_item(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_item public.menu_items%rowtype;
  v_item_id uuid;
  v_item_id_text text := nullif(payload ->> 'id', '');
  v_name text := trim(coalesce(payload ->> 'name', ''));
  v_description text := trim(coalesce(payload ->> 'description', ''));
  v_category text := trim(coalesce(payload ->> 'category', ''));
  v_price_text text := trim(coalesce(payload ->> 'price', ''));
  v_price numeric(10, 2);
  v_image_url text := nullif(trim(coalesce(payload ->> 'image_url', '')), '');
begin
  v_cafe_id := public.require_admin('admin_save_menu_item');

  if v_item_id_text is not null and v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid menu item.';
  end if;

  v_item_id := v_item_id_text::uuid;

  if v_name = '' or length(v_name) > 80 then
    raise exception 'Menu item name must be 1 to 80 characters.';
  end if;

  if v_description = '' or length(v_description) > 240 then
    raise exception 'Menu item description must be 1 to 240 characters.';
  end if;

  if v_category = '' or length(v_category) > 40 then
    raise exception 'Menu category must be 1 to 40 characters.';
  end if;

  if v_price_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception 'Menu price must be a valid amount.';
  end if;

  v_price := v_price_text::numeric;

  if v_price is null or v_price < 0 or v_price > 99999 then
    raise exception 'Menu price is outside the allowed range.';
  end if;

  if v_image_url is not null and (length(v_image_url) > 2000 or v_image_url !~* '^https://') then
    raise exception 'Menu image must use an HTTPS URL.';
  end if;

  if v_item_id is null then
    insert into public.menu_items (
      cafe_id,
      name,
      description,
      category,
      price,
      image_url,
      is_available
    )
    values (
      v_cafe_id,
      v_name,
      v_description,
      v_category,
      v_price,
      v_image_url,
      coalesce((payload ->> 'is_available')::boolean, true)
    )
    returning *
    into v_item;
  else
    update public.menu_items
    set
      name = v_name,
      description = v_description,
      category = v_category,
      price = v_price,
      image_url = v_image_url,
      is_available = coalesce((payload ->> 'is_available')::boolean, is_available)
    where cafe_id = v_cafe_id
      and id = v_item_id
    returning *
    into v_item;

    if not found then
      raise exception 'Menu item was not found.';
    end if;
  end if;

  return to_jsonb(v_item) - 'cafe_id';
end;
$$;

create or replace function public.admin_toggle_menu_item(
  p_item_id uuid,
  p_is_available boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_item public.menu_items%rowtype;
begin
  v_cafe_id := public.require_admin('admin_toggle_menu_item');

  update public.menu_items
  set is_available = p_is_available
  where cafe_id = v_cafe_id
    and id = p_item_id
  returning *
  into v_item;

  if not found then
    raise exception 'Menu item was not found.';
  end if;

  return to_jsonb(v_item) - 'cafe_id';
end;
$$;

create or replace function public.admin_rotate_staff_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cafe_id uuid;
  v_code text;
begin
  v_cafe_id := public.require_admin('admin_rotate_staff_code');
  v_code := 'STAFF-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 16));

  update public.cafes
  set staff_access_code = v_code
  where id = v_cafe_id;

  return jsonb_build_object('staff_access_code', v_code);
end;
$$;

with demo as (
  select id as cafe_id
  from public.cafes
  where slug = 'demo-cafe'
)
insert into public.menu_items (id, cafe_id, name, description, category, price, image_url, is_available)
select *
from (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, (select cafe_id from demo), 'Velvet Latte', 'Espresso with steamed milk, vanilla cream, and a soft caramel finish.', 'Coffee', 145::numeric, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80', true),
    ('22222222-2222-4222-8222-222222222222'::uuid, (select cafe_id from demo), 'Cold Brew Cloud', 'Slow-steeped coffee with milk foam and brown sugar syrup.', 'Coffee', 160::numeric, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80', true),
    ('33333333-3333-4333-8333-333333333333'::uuid, (select cafe_id from demo), 'Matcha Cream', 'Ceremonial matcha with fresh milk and a light vanilla top.', 'Tea', 155::numeric, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=900&q=80', true),
    ('44444444-4444-4444-8444-444444444444'::uuid, (select cafe_id from demo), 'Berry Iced Tea', 'Black tea with strawberry, lemon, and mint over ice.', 'Tea', 125::numeric, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80', true),
    ('55555555-5555-4555-8555-555555555555'::uuid, (select cafe_id from demo), 'Truffle Chicken Pasta', 'Cream pasta with chicken, parmesan, and truffle oil.', 'Meals', 265::numeric, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80', true),
    ('66666666-6666-4666-8666-666666666666'::uuid, (select cafe_id from demo), 'Cafe Burger Plate', 'Beef burger with cheese, fries, and house sauce.', 'Meals', 245::numeric, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', true),
    ('77777777-7777-4777-8777-777777777777'::uuid, (select cafe_id from demo), 'Honey Butter Waffle', 'Crisp waffle with honey butter, cream, and berries.', 'Dessert', 185::numeric, 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=900&q=80', true),
    ('88888888-8888-4888-8888-888888888888'::uuid, (select cafe_id from demo), 'Chocolate Dream Cake', 'Layered chocolate cake with ganache and cocoa crumble.', 'Dessert', 175::numeric, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80', true)
) as seed(id, cafe_id, name, description, category, price, image_url, is_available)
where cafe_id is not null
on conflict (id) do nothing;

revoke create on schema public from public;
revoke all on public.profiles from anon, authenticated;
revoke all on public.cafe_settings from anon, authenticated;
revoke all on public.cafes from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.cafe_admins from anon, authenticated;
revoke all on public.security_events from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.menu_items from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant execute on function public.get_public_cafe_settings(text) to anon, authenticated;
grant execute on function public.get_public_menu_items(text) to anon, authenticated;
grant execute on function public.create_customer_order(text, jsonb) to anon, authenticated;
grant execute on function public.get_order_receipt(text, uuid, text) to anon, authenticated;
grant execute on function public.staff_list_orders(text, text) to anon, authenticated;
grant execute on function public.staff_update_order_status(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_get_settings() to authenticated;
grant execute on function public.admin_update_settings(jsonb) to authenticated;
grant execute on function public.admin_save_menu_item(jsonb) to authenticated;
grant execute on function public.admin_toggle_menu_item(uuid, boolean) to authenticated;
grant execute on function public.admin_rotate_staff_code() to authenticated;

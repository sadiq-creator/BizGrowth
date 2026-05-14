# BizGrowth Cafe

BizGrowth Cafe is a QR ordering app for cafes and restaurants.

Customers scan a QR code, browse the menu, add items to the cart, and place an order. Staff scan a private QR code to open the counter queue. Admins sign in with Supabase Auth to edit cafe details, menu items, payments, order rules, and QR links.

## Routes

- Customer QR: `/#/customer`
- Order Queue: `/#/queue`
- Staff QR: `/#/staff?access=STAFF_CODE`
- Admin QR: `/#/admin`

## Supabase Setup

Create `.env` in this folder:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Open Supabase SQL Editor, then run:

```bash
supabase/schema.sql
```

Create your admin account in Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication.
3. Create a user with your admin email and password.
4. Copy your admin email.
5. Run this SQL after `supabase/schema.sql`.
6. You can also edit and run `supabase/add-admin-example.sql`.

```sql
insert into public.admin_users (user_id, email)
select id, email
from auth.users
where email = 'your-admin-email@example.com'
on conflict (user_id) do update
set email = excluded.email;
```

Use Admin Mode, open the QR Codes tab, then copy or print the customer, staff, and admin QR links.

## Security Before GitHub

- Keep `.env` private.
- Commit `.env.example`, not `.env`.
- Never use a Supabase `service_role` key in the frontend.
- Run `supabase/schema.sql` before deployment.
- Add your Supabase Auth admin user to `public.admin_users`.
- Rotate the Staff QR code before sharing the app.
- Read `SECURITY.md` before publishing the repository.

## Run Locally

Install packages:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

The dev server opens:

```bash
/#/customer
```

## Checks

```bash
npm run lint
npm run build
```

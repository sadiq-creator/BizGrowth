# BizGrowth Cafe

BizGrowth Cafe is a multi-cafe QR ordering app.

Customers scan a cafe-specific QR code, browse that cafe menu, add items to the cart, and place an order. Staff scan that cafe staff QR code to open only that cafe counter queue. Cafe owners sign in with their assigned Supabase Auth account to edit only their cafe.

## Routes

- Customer QR: `/#/c/demo-cafe/customer`
- Order Queue: `/#/c/demo-cafe/queue`
- Staff QR: `/#/c/demo-cafe/staff?access=STAFF_CODE`
- Admin QR: `/#/c/demo-cafe/admin`
- Legacy customer route: `/#/customer`
- Legacy admin route: `/#/admin`

Legacy routes redirect to `demo-cafe`.

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

The schema creates `demo-cafe` and migrates existing single-cafe data into that cafe.

## Add A Cafe Owner

1. Open Supabase Dashboard.
2. Go to Authentication.
3. Create a user with the cafe owner email and password.
4. Open `supabase/add-cafe-admin-example.sql`.
5. Change:
   - `v_admin_email`
   - `v_cafe_slug`
   - `v_cafe_name`
6. Run the helper SQL in Supabase SQL Editor.
7. Open `/#/c/your-cafe-slug/admin`.
8. Sign in with the cafe owner email and password.
9. Open QR Codes, then print or copy the cafe-specific QR links.

Each cafe owner account manages one cafe only.

## Security Before GitHub

- Keep `.env` private.
- Commit `.env.example`, not `.env`.
- Never use a Supabase `service_role` key in the frontend.
- Run `supabase/schema.sql` before deployment.
- Add cafe owners through `public.cafe_admins`.
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

Open:

```bash
/#/c/demo-cafe/customer
```

## Checks

```bash
npm run lint
npm run build
```

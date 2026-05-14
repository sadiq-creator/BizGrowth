# Security Checklist

Use this checklist before you push or deploy BizGrowth.

- Keep `.env` private.
- Commit `.env.example`, not `.env`.
- Never add a Supabase `service_role` key to this project.
- The app blocks Supabase JWT keys with the `service_role` role.
- Treat `VITE_SUPABASE_ANON_KEY` as public.
- Use Supabase Row Level Security from `supabase/schema.sql`.
- Run the latest `supabase/schema.sql` after security changes.
- Create a Supabase Auth admin user before public deployment.
- Add the admin user ID to `public.admin_users`.
- Rotate the Staff QR code before sharing the app.
- Rotate the Staff QR code again when staff access should change.
- Review the Supabase SQL grants before launch.
- Keep admin and staff QR links private.
- Use HTTPS deployment.
- Use the security headers from `public/_headers` or `vercel.json`.

What protects the app:

- Tables use Row Level Security.
- Public users only read available menu items.
- Orders are created through locked RPC functions.
- Receipts require both order ID and receipt token.
- Staff access requires the staff access code.
- Admin changes require a Supabase Auth user listed in `public.admin_users`.
- Admin, staff, order, and settings RPC inputs have length and format checks.
- Admin and staff RPC calls have database rate limits.

What stays public:

- Frontend code.
- QR URLs.
- Supabase project URL.
- Supabase anon key.

The anon key does not grant admin access by itself. RLS policies and RPC checks protect the database.

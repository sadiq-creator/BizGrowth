# Security Checklist

Use this checklist before you push or deploy BizGrowth.

- Keep `.env` private.
- Commit `.env.example`, not `.env`.
- Never add a Supabase `service_role` key to this project.
- The app blocks Supabase JWT keys with the `service_role` role.
- Treat `VITE_SUPABASE_ANON_KEY` as public.
- Run the latest `supabase/schema.sql` after security changes.
- Create cafe owner accounts in Supabase Authentication.
- Assign cafe owners through `public.cafe_admins`.
- Keep each cafe slug private until the owner is ready to share QR links.
- Rotate the Staff QR code before sharing the app.
- Rotate the Staff QR code again when staff access should change.
- Review the Supabase SQL grants before launch.
- Keep admin and staff QR links private.
- Use HTTPS deployment.
- Use the security headers from `public/_headers` or `vercel.json`.

What protects the app:

- Cafe data is isolated by `cafe_id`.
- Public users load one cafe by slug.
- Customer orders use menu items from the same cafe only.
- Receipts require cafe slug, order ID, and receipt token.
- Staff queues require cafe slug and that cafe staff code.
- Staff status updates affect orders from the same cafe only.
- Admin changes require a Supabase Auth user listed in `public.cafe_admins`.
- Admin users manage only their assigned cafe.
- Admin, staff, order, and settings RPC inputs have length and format checks.
- Admin and staff RPC calls have database rate limits.

What stays public:

- Frontend code.
- Customer QR URLs.
- Supabase project URL.
- Supabase anon key.

The anon key does not grant admin access by itself. RLS settings and RPC checks protect the database.

# Supply Operations Admin

Administrator sign-in for the Supply Operations application, built with React, Vite, and Supabase Auth.

## Local setup

1. Install dependencies with `npm install`.
2. Create a `.env.local` file in this directory:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
   ```

3. In the Supabase Dashboard, open SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). This creates the inventory, department, profile, flexible-attribute, and request workflow tables/RPCs with access controls. The script is safe to rerun when applying later schema additions.
4. In **Authentication > Users**, create the admin account. Then run [`supabase/grant-admin-role.sql`](supabase/grant-admin-role.sql) in SQL Editor. It uses `admin.test.20260929@example.com`; update that email in the script if you created a different account. The result should show `ADMIN`. Rerun this script after the profiles table exists if you had already assigned the role earlier.
5. In **Authentication > URL Configuration**, allow `http://localhost:5174/**` for local invite and password-reset redirects (also allow `http://localhost:5173/**` if you use Vite's default port). Add the deployed app URL there before using invitations in production.
6. Install and link the Supabase CLI, then deploy the trusted user-management function:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set APP_URL=http://localhost:5174
   supabase functions deploy admin-users
   ```

   `supabase/config.toml` disables gateway JWT verification only for this function so browser `OPTIONS` preflight can reach its handler. The handler still validates the bearer token and active ADMIN profile itself. For production, set `APP_URL` to the deployed app's origin and add it to the Auth redirect allowlist. The function uses Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets, plus `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` for reset-email delivery. Never expose the service-role key in the app. Configure Supabase Auth email delivery/SMTP so invitations and reset messages can reach users.
7. Start the app with `npm run dev` and sign in with the admin email and the password you set in Supabase Auth. If you assigned the role while already signed in, sign out and sign in again to refresh the role claim.

Only the Supabase URL and publishable key belong in frontend environment variables. Never put a service-role key or administrator password in the app.

## Administrator access

Users authenticate through Supabase Auth with email and password. To enter the admin workspace, the authenticated user's server-managed `app_metadata.role` must equal `ADMIN`. Approver and receiver accounts must not receive this role. Assign roles only through a trusted server or Supabase administrative tooling; do not use editable `user_metadata` for authorization. The SQL Editor runs with trusted project permissions; never expose a service-role key in the browser or frontend environment.

The client validates active sessions with Supabase Auth and signs out accounts that do not have the required role. Passwords are handled by Supabase Auth and are not stored in an application table.

## Inventory

The admin workspace can add and edit supply names, categories, descriptions, units, stock quantities, and request availability. It reads and writes `public.supply_items` through the Supabase publishable key; the SQL policy permits those operations only for authenticated `ADMIN` users. If the admin role was just changed, sign out and back in so the refreshed session includes the updated role claim.

## Flexible attributes and search

The **Attributes** admin module defines reusable fields such as Brand, Color, Size, Material, Model, or custom fields like Adhesive Type. In an item's form, select only the fields that apply. Each field is optional by default; an Admin can explicitly require it on the request form. Enter comma- or newline-separated values to make them searchable, such as `Pilot, BIC` for Ballpen brand or `Blue, Black` for color. Inventory search matches item name, category, description, attribute names, and configured values.

The public-safe RPC `search_requestable_supply_items(search_text)` is ready for the QR request form. Call it with `supabase.rpc('search_requestable_supply_items', { search_text: 'blue pen' })`. It returns available items and their configured attribute names/values, but does not expose stock quantities. Run the latest `supabase/schema.sql` in Supabase SQL Editor before using these fields or the RPC.

## Departments

The Admin **Departments** module manages the choices shown on the public request form. Marketing, Finance, HR, and Legal are seeded by `schema.sql`; admins can add, rename, activate, or deactivate choices. Existing requests keep the department name recorded when they were submitted.

## Requestor form

Requestors do not sign in. Share the app's `/request` URL in the QR code or company portal. The form collects name and department, supports searching available supplies, accepts multiple item lines and configured attributes, and creates a `PENDING` request. The database returns an ID in `MM-NNN` format such as `09-001`; the numeric counter is global and does not reset each month. Requestors can use **Track a request** or `supabase.rpc('track_supply_request', { p_reference_code: '09-001' })` to see only the request status and submission time. `supabase.rpc('submit_supply_request', ...)` performs server-side validation and stores the request atomically. Run the latest `supabase/schema.sql` before testing this module.

## Approval workflow

Approvers see request totals, today's volume, requested units, unique requestors, department/requestor/item rankings, and a pending review queue. Pending requests open in a full-detail modal. The **Review history** module can be searched and filtered by status and department. Approve moves a pending request to `APPROVED` for the Receiver; reject requires a reason. Database RPCs enforce roles and only allow decisions while a request is `PENDING`.

Receivers see approved handoffs and confirm after physically releasing the supplies. The `mark_supply_request_received` RPC atomically deducts each requested quantity from inventory, marks an item unavailable if its stock reaches zero, and moves the request from `APPROVED` to `RECEIVED`. If stock has become insufficient, the operation fails without changing inventory or request status; resolve the discrepancy before confirming release. Review/receipt users and timestamps are recorded. Direct request-table access is revoked; role-checked RPCs perform these actions. Run the updated `supabase/schema.sql` in Supabase SQL Editor to apply this behavior to the live database.

## User management

The Users tab lists profile records and can create confirmed Approver or Receiver accounts without sending email, edit their name/email/role, deactivate/reactivate access, send password-reset emails, and permanently delete non-admin accounts. Deactivation blocks access but preserves the profile; deletion removes the Auth account and cascades to its profile. The Admin enters an initial password and can reveal it in the form before creation; it is never returned by the function, stored in `profiles`, or viewable after the form clears. Supabase Auth stores its own password hash. Auth account operations run in `supabase/functions/admin-users`; they are not performed with a service-role key in the browser.

Approver and Receiver accounts use their role-specific dashboards for request review and supply handoff. Requestors remain unauthenticated and cannot access those dashboards.

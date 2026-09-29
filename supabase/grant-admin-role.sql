-- First create this account in Supabase Dashboard > Authentication > Users.
-- Use this exact email there, choose its password in the Dashboard, then run this SQL.
with updated_user as (
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'ADMIN')
  where lower(email) = lower('bacolodcarljanus.primetech@gmail.com')
  returning id, email, raw_user_meta_data
)
insert into public.profiles (id, email, full_name, role, is_active)
select
  id,
  email,
  coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1)),
  'ADMIN',
  true
from updated_user
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = true,
    updated_at = now()
returning email, role as assigned_role;

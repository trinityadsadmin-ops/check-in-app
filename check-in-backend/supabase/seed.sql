-- Bootstrap and repair the first backoffice admin.
--
-- Usage:
-- 1. Apply all migrations first.
-- 2. Create the first user in Supabase Auth.
-- 3. Replace admin@example.com below with that user's email.
-- 4. Run this seed whenever default role permissions or the first admin must be repaired.

insert into public.roles (key, name, description)
values
  ('ADMIN', 'Admin', 'Default administrator role'),
  ('USER', 'User', 'Default employee role')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.permissions (key, name, description)
values
  ('users:read', 'Read users', 'View employee and user records'),
  ('users:create', 'Create users', 'Create employee and user records'),
  ('users:update', 'Update users', 'Update employee and user records'),
  ('users:delete', 'Delete users', 'Archive a user and revoke their access'),
  ('users:reset_device', 'Reset user device', 'Reset an employee device binding'),
  ('roles:read', 'Read roles', 'View roles'),
  ('roles:assign', 'Assign roles', 'Assign roles to users'),
  ('permissions:read', 'Read permissions', 'View permissions'),
  ('permissions:update', 'Update permissions', 'Update user permission overrides'),
  ('work_areas:read', 'Read work areas', 'View work locations and assigned areas'),
  ('work_areas:manage', 'Manage work areas', 'Create and update work locations and assigned areas'),
  ('attendance:read', 'Read attendance', 'View attendance records'),
  ('attendance:review', 'Review attendance', 'Review attendance records'),
  ('area_inspections:read', 'Read area inspections', 'View area inspection reports'),
  ('area_inspections:review', 'Review area inspections', 'Approve or reject area inspection reports'),
  ('area_inspections:delete', 'Delete area inspections', 'Delete area inspection reports'),
  ('salary:read', 'Read salary', 'View salary upload batches and records'),
  ('salary:upload', 'Upload salary', 'Upload and import salary spreadsheets'),
  ('salary:delete', 'Delete salary uploads', 'Delete salary upload batches and imported salary records'),
  ('logs:read', 'Read logs', 'View audit, event, and emergency logs'),
  ('emergency:read', 'Read emergency logs', 'View emergency logs'),
  ('emergency:update', 'Update emergency logs', 'Acknowledge or resolve emergency logs'),
  ('mobile:attendance', 'Mobile attendance', 'Create mobile check-in and check-out records'),
  ('mobile:emergency', 'Mobile emergency', 'Create mobile emergency records')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
cross join public.permissions
where roles.key = 'ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.key in ('mobile:attendance', 'mobile:emergency')
where roles.key = 'USER'
on conflict do nothing;

with seed_input as (
  select
    'admin@example.com'::text as admin_email,
    'Admin'::text as admin_full_name
),
target_auth_user as (
  select auth.users.id, auth.users.email
  from auth.users
  join seed_input on lower(auth.users.email) = lower(seed_input.admin_email)
  limit 1
),
admin_role as (
  select roles.id
  from public.roles
  where roles.key = 'ADMIN'
  limit 1
)
update public.profiles
set
  email = target_auth_user.email,
  role_id = admin_role.id,
  full_name = coalesce(nullif(public.profiles.full_name, ''), seed_input.admin_full_name),
  is_active = true
from target_auth_user
cross join admin_role
cross join seed_input
where public.profiles.id = target_auth_user.id;

with seed_input as (
  select
    'admin@example.com'::text as admin_email,
    'Admin'::text as admin_full_name
),
target_auth_user as (
  select auth.users.id, auth.users.email
  from auth.users
  join seed_input on lower(auth.users.email) = lower(seed_input.admin_email)
  limit 1
),
admin_role as (
  select roles.id
  from public.roles
  where roles.key = 'ADMIN'
  limit 1
)
insert into public.profiles (id, email, full_name, role_id, is_active)
select
  target_auth_user.id,
  target_auth_user.email,
  seed_input.admin_full_name,
  admin_role.id,
  true
from target_auth_user
cross join admin_role
cross join seed_input
where not exists (
  select 1
  from public.profiles
  where public.profiles.id = target_auth_user.id
);

with seed_input as (
  select 'admin@example.com'::text as admin_email
),
target_auth_user as (
  select auth.users.id
  from auth.users
  join seed_input on lower(auth.users.email) = lower(seed_input.admin_email)
  limit 1
),
admin_role as (
  select roles.id
  from public.roles
  where roles.key = 'ADMIN'
  limit 1
),
admin_profile as (
  select profiles.id, profiles.is_active
  from public.profiles
  join target_auth_user on target_auth_user.id = profiles.id
  join admin_role on admin_role.id = profiles.role_id
)
select
  case
    when exists (select 1 from admin_profile where is_active = true)
      then 'Admin profile bootstrapped and active'
    else 'No matching auth user found. Create the user in Supabase Auth or update admin_email in seed.sql.'
  end as result,
  (
    select count(*)
    from public.permissions
  ) as total_permissions,
  (
    select count(*)
    from public.role_permissions
    join public.roles on roles.id = role_permissions.role_id
    where roles.key = 'ADMIN'
  ) as admin_role_permissions,
  (
    select count(*)
    from public.role_permissions
    join public.roles on roles.id = role_permissions.role_id
    where roles.key = 'USER'
  ) as user_role_permissions,
  (
    select coalesce(jsonb_agg(permissions.key order by permissions.key), '[]'::jsonb)
    from public.permissions
    where not exists (
      select 1
      from public.role_permissions
      join public.roles on roles.id = role_permissions.role_id
      where roles.key = 'ADMIN'
        and role_permissions.permission_id = permissions.id
    )
  ) as missing_admin_permissions;

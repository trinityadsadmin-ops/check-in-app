-- `profiles.id` is the immutable UUID primary key used by every relation.
-- `employee_code` remains a customer-managed, unique business identifier.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_active_not_deleted_idx
  on public.profiles (created_at desc)
  where deleted_at is null;

create or replace function public.archive_user_profile(
  p_user_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set is_active = false,
      deleted_at = now()
  where id = p_user_id
    and deleted_at is null;

  if not found then
    return false;
  end if;

  update public.device_bindings
  set is_active = false,
      reset_at = now(),
      reset_by = p_actor_user_id
  where user_id = p_user_id
    and is_active = true;

  update public.employee_work_areas
  set is_active = false
  where user_id = p_user_id
    and is_active = true;

  return true;
end;
$$;

revoke all on function public.archive_user_profile(uuid, uuid) from public;
grant execute on function public.archive_user_profile(uuid, uuid) to service_role;

insert into public.permissions (key, name, description)
values ('users:delete', 'Delete users', 'Archive a user and revoke their access')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles as roles
join public.permissions as permissions on permissions.key = 'users:delete'
where roles.key = 'ADMIN'
on conflict do nothing;

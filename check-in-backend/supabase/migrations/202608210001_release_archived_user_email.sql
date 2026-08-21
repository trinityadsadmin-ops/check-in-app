-- An archived user must not reserve the email address in Supabase Auth. Keep
-- profile data consistent with the Auth tombstone address used by the API.
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
      deleted_at = now(),
      email = format('archived-%s@archived.invalid', p_user_id),
      employee_code = null
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

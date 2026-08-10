-- Work locations are retained for reporting/audit history, while removal from
-- operational use deactivates existing employee assignments in one transaction.
alter table public.work_locations
  add column if not exists deleted_at timestamptz;

create index if not exists work_locations_active_not_deleted_idx
  on public.work_locations (name)
  where deleted_at is null;

create or replace function public.archive_work_location(p_work_location_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.work_locations
  set is_active = false,
      deleted_at = now()
  where id = p_work_location_id
    and deleted_at is null;

  if not found then
    return false;
  end if;

  update public.employee_work_areas
  set is_active = false
  where work_location_id = p_work_location_id
    and is_active = true;

  return true;
end;
$$;

revoke all on function public.archive_work_location(uuid) from public;
grant execute on function public.archive_work_location(uuid) to service_role;

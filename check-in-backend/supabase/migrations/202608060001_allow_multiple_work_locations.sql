drop index if exists public.employee_work_areas_one_active_per_user;

create unique index if not exists employee_work_areas_one_active_per_user_location
  on public.employee_work_areas(user_id, work_location_id)
  where is_active;

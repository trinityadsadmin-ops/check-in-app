-- Keep backoffice attendance filtering, sorting, and pagination in PostgreSQL.
-- `workLocationId` is retained in the event snapshot so historical reports keep
-- the location that was valid when the employee checked in or out.
create index if not exists attendance_events_work_location_snapshot_idx
  on public.attendance_events ((work_area_snapshot ->> 'workLocationId'));

create or replace function public.list_attendance_day_page(
  p_page integer,
  p_per_page integer,
  p_user_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_review_status text default null,
  p_work_location_id uuid default null,
  p_sort_by text default 'workDate',
  p_sort_direction text default 'desc'
)
returns table (attendance_day_id uuid, total_count bigint)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      attendance_day.id,
      attendance_day.work_date,
      attendance_day.review_status,
      attendance_day.created_at,
      coalesce(profile.full_name, profile.email, profile.employee_code, '') as employee_name,
      min(attendance_event.captured_at) filter (where attendance_event.event_type = 'CHECK_IN') as check_in_at,
      max(attendance_event.captured_at) filter (where attendance_event.event_type = 'CHECK_OUT') as check_out_at,
      coalesce(string_agg(distinct work_location.name, ', ' order by work_location.name), '') as work_location_name
    from public.attendance_days as attendance_day
    join public.profiles as profile on profile.id = attendance_day.user_id
    left join public.attendance_events as attendance_event
      on attendance_event.attendance_day_id = attendance_day.id
    left join public.work_locations as work_location
      on work_location.id = case
        when attendance_event.work_area_snapshot ->> 'workLocationId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (attendance_event.work_area_snapshot ->> 'workLocationId')::uuid
      end
    where (p_user_id is null or attendance_day.user_id = p_user_id)
      and (p_date_from is null or attendance_day.work_date >= p_date_from)
      and (p_date_to is null or attendance_day.work_date <= p_date_to)
      and (p_review_status is null or attendance_day.review_status = p_review_status)
      and (
        p_work_location_id is null
        or exists (
          select 1
          from public.attendance_events as location_event
          where location_event.attendance_day_id = attendance_day.id
            and location_event.work_area_snapshot ->> 'workLocationId' = p_work_location_id::text
        )
      )
    group by attendance_day.id, profile.id
  )
  select filtered.id, count(*) over ()
  from filtered
  order by
    case when p_sort_by = 'workDate' and p_sort_direction = 'asc' then filtered.work_date end asc nulls last,
    case when p_sort_by = 'workDate' and p_sort_direction = 'desc' then filtered.work_date end desc nulls last,
    case when p_sort_by = 'employee' and p_sort_direction = 'asc' then filtered.employee_name end asc nulls last,
    case when p_sort_by = 'employee' and p_sort_direction = 'desc' then filtered.employee_name end desc nulls last,
    case when p_sort_by = 'checkIn' and p_sort_direction = 'asc' then filtered.check_in_at end asc nulls last,
    case when p_sort_by = 'checkIn' and p_sort_direction = 'desc' then filtered.check_in_at end desc nulls last,
    case when p_sort_by = 'checkOut' and p_sort_direction = 'asc' then filtered.check_out_at end asc nulls last,
    case when p_sort_by = 'checkOut' and p_sort_direction = 'desc' then filtered.check_out_at end desc nulls last,
    case when p_sort_by = 'workLocation' and p_sort_direction = 'asc' then filtered.work_location_name end asc nulls last,
    case when p_sort_by = 'workLocation' and p_sort_direction = 'desc' then filtered.work_location_name end desc nulls last,
    case when p_sort_by = 'reviewStatus' and p_sort_direction = 'asc' then filtered.review_status end asc nulls last,
    case when p_sort_by = 'reviewStatus' and p_sort_direction = 'desc' then filtered.review_status end desc nulls last,
    filtered.created_at desc,
    filtered.id asc
  limit p_per_page
  offset (p_page - 1) * p_per_page;
$$;

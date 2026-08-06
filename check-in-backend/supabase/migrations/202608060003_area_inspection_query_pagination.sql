-- Backoffice area-inspection filters and sorting are executed in PostgreSQL so
-- counts, pagination, and spreadsheet exports always use the same result set.
create or replace function public.list_area_inspection_page(
  p_page integer,
  p_per_page integer,
  p_work_location_id uuid default null,
  p_work_location_ids uuid[] default null,
  p_user_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_sort_by text default 'capturedAt',
  p_sort_direction text default 'desc'
)
returns table (area_inspection_id uuid, total_count bigint)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      inspection.id,
      inspection.captured_at,
      inspection.review_status,
      inspection.notes,
      inspection.lat,
      inspection.lng,
      inspection.created_at,
      coalesce(profile.full_name, profile.email, profile.employee_code, '') as employee_name,
      coalesce(location.name, '') as work_location_name
    from public.area_inspections as inspection
    join public.profiles as profile on profile.id = inspection.user_id
    left join public.work_locations as location on location.id = inspection.work_location_id
    where (p_user_id is null or inspection.user_id = p_user_id)
      and (p_date_from is null or inspection.captured_at >= p_date_from::timestamptz)
      and (p_date_to is null or inspection.captured_at < (p_date_to + 1)::timestamptz)
      and (p_work_location_id is null or inspection.work_location_id = p_work_location_id)
      and (
        coalesce(cardinality(p_work_location_ids), 0) = 0
        or inspection.work_location_id = any(p_work_location_ids)
      )
  )
  select filtered.id, count(*) over ()
  from filtered
  order by
    case when p_sort_by = 'employee' and p_sort_direction = 'asc' then filtered.employee_name end asc nulls last,
    case when p_sort_by = 'employee' and p_sort_direction = 'desc' then filtered.employee_name end desc nulls last,
    case when p_sort_by = 'workLocation' and p_sort_direction = 'asc' then filtered.work_location_name end asc nulls last,
    case when p_sort_by = 'workLocation' and p_sort_direction = 'desc' then filtered.work_location_name end desc nulls last,
    case when p_sort_by = 'location' and p_sort_direction = 'asc' then filtered.lat end asc nulls last,
    case when p_sort_by = 'location' and p_sort_direction = 'desc' then filtered.lat end desc nulls last,
    case when p_sort_by = 'capturedAt' and p_sort_direction = 'asc' then filtered.captured_at end asc nulls last,
    case when p_sort_by = 'capturedAt' and p_sort_direction = 'desc' then filtered.captured_at end desc nulls last,
    case when p_sort_by = 'notes' and p_sort_direction = 'asc' then coalesce(filtered.notes, '') end asc nulls last,
    case when p_sort_by = 'notes' and p_sort_direction = 'desc' then coalesce(filtered.notes, '') end desc nulls last,
    case when p_sort_by = 'reviewStatus' and p_sort_direction = 'asc' then filtered.review_status end asc nulls last,
    case when p_sort_by = 'reviewStatus' and p_sort_direction = 'desc' then filtered.review_status end desc nulls last,
    filtered.created_at desc,
    filtered.id asc
  limit p_per_page
  offset (p_page - 1) * p_per_page;
$$;

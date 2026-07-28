alter table public.work_locations
  add column if not exists area_nodes jsonb;

with latest_location_area as (
  select distinct on (work_location_id)
    work_location_id,
    area_nodes
  from public.employee_work_areas
  where is_active = true
  order by work_location_id, updated_at desc
)
update public.work_locations as location
set area_nodes = latest_location_area.area_nodes
from latest_location_area
where location.id = latest_location_area.work_location_id
  and location.area_nodes is null;

update public.work_locations
set area_nodes = '[
  {"lat": 13.758, "lng": 100.527},
  {"lat": 13.758, "lng": 100.532},
  {"lat": 13.754, "lng": 100.532},
  {"lat": 13.754, "lng": 100.527}
]'::jsonb
where area_nodes is null;

alter table public.work_locations
  alter column area_nodes set not null;

alter table public.work_locations
  drop constraint if exists work_locations_four_area_nodes;

alter table public.work_locations
  add constraint work_locations_four_area_nodes
  check (jsonb_typeof(area_nodes) = 'array' and jsonb_array_length(area_nodes) = 4);

update public.employee_work_areas as assignment
set area_nodes = location.area_nodes
from public.work_locations as location
where assignment.work_location_id = location.id
  and assignment.is_active = true
  and assignment.area_nodes is distinct from location.area_nodes;

create or replace function public.sync_work_location_area_nodes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.area_nodes is distinct from old.area_nodes then
    update public.employee_work_areas
    set area_nodes = new.area_nodes
    where work_location_id = new.id
      and is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists work_locations_sync_area_nodes on public.work_locations;

create trigger work_locations_sync_area_nodes
after update of area_nodes on public.work_locations
for each row
execute function public.sync_work_location_area_nodes();

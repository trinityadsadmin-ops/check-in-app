-- Supervisor role: a mobile employee who, on check-in, records which staff
-- positions (PC / BA / ROADSHOW) they inspected and at which shift moments
-- (start of shift, before break, after break, end of shift).
--
-- Non-destructive: only inserts a new role, a new permission and their links,
-- and adds a nullable column. Existing roles, role permissions, per-user
-- overrides and attendance rows are untouched; existing events keep
-- supervisor_inspection = null.
--
-- The pop-up is gated by the `mobile:supervisor_inspection` permission, not by
-- the role key. ADMIN intentionally does NOT get it: admins who check in on a
-- phone would otherwise be forced through the inspection pop-up.

insert into public.roles (key, name, description)
values ('SUPERVISOR', 'Supervisor', 'Field supervisor who records staff inspections at check-in')
on conflict (key) do nothing;

insert into public.permissions (key, name, description)
values (
  'mobile:supervisor_inspection',
  'Mobile supervisor inspection',
  'Record inspected staff positions and inspection times when checking in'
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.key in ('mobile:attendance', 'mobile:emergency', 'mobile:supervisor_inspection')
where roles.key = 'SUPERVISOR'
on conflict do nothing;

-- Shape: [{"position":"PC","slots":["START_SHIFT","BEFORE_BREAK"]}, ...]
-- Only set on CHECK_IN events written by a supervisor. Detailed validation
-- lives in the API; the constraint only guards the top-level shape.
alter table public.attendance_events
  add column if not exists supervisor_inspection jsonb;

-- NOT VALID + VALIDATE keeps the table from being locked while existing rows
-- are scanned (they are all null, so validation always passes).
alter table public.attendance_events
  add constraint attendance_events_supervisor_inspection_shape
  check (supervisor_inspection is null or jsonb_typeof(supervisor_inspection) = 'array')
  not valid;

alter table public.attendance_events
  validate constraint attendance_events_supervisor_inspection_shape;

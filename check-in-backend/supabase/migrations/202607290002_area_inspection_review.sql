alter table public.area_inspections
  add column if not exists review_status text not null default 'PENDING',
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.area_inspections
  drop constraint if exists area_inspections_review_status_check;

alter table public.area_inspections
  add constraint area_inspections_review_status_check
  check (review_status in ('PENDING', 'APPROVED', 'REJECTED'));

create index if not exists area_inspections_review_status_captured_idx
  on public.area_inspections(review_status, captured_at desc);

insert into public.permissions (key, name, description)
values
  ('area_inspections:read', 'Read area inspections', 'View area inspection reports'),
  ('area_inspections:review', 'Review area inspections', 'Approve or reject area inspection reports'),
  ('area_inspections:delete', 'Delete area inspections', 'Delete area inspection reports')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles as roles
join public.permissions as permissions
  on permissions.key in (
    'area_inspections:read',
    'area_inspections:review',
    'area_inspections:delete'
  )
where roles.key = 'ADMIN'
on conflict do nothing;

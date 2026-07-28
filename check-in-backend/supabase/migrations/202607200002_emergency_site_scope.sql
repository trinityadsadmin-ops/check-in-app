-- SOS alerts are meant to be broadcast to everyone on the same site, but
-- emergency_logs had no site column, so staff devices had no scope to read
-- alerts by. Snapshot the reporter's active work location (site) at trigger
-- time — the same pattern area_inspections uses for site-wide visibility.

alter table public.emergency_logs
  add column if not exists work_location_id uuid references public.work_locations(id) on delete set null;

-- Staff devices poll for OPEN alerts on their own site.
create index if not exists emergency_logs_location_status_idx
  on public.emergency_logs(work_location_id, status, triggered_at desc);

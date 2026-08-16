-- Manual check-in/check-out: a flagged punch that skips geofence enforcement
-- and carries a required reason. lat/lng/work_area_snapshot become nullable
-- because a manual punch may have no GPS fix and no matching work area.
-- Non-destructive: only relaxes NOT NULL constraints and adds new
-- nullable/defaulted columns; existing rows and values are untouched.

alter table public.attendance_events
  alter column lat drop not null,
  alter column lng drop not null,
  alter column work_area_snapshot drop not null,
  add column is_manual boolean not null default false,
  add column manual_reason text;

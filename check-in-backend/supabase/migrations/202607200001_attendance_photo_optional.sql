-- Attendance photos are now optional: check-in/check-out can be confirmed
-- without a photo, so attendance_events.photo_path may be null.
-- (photo_bucket keeps its NOT NULL default and is simply omitted on
-- photo-less inserts.)

alter table public.attendance_events
  alter column photo_path drop not null;

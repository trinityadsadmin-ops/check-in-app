-- Records how long a check-in/check-out cycle lasted. Computed server-side at
-- check-out time from the paired check-in's captured_at, stored on the
-- CHECK_OUT event so it survives even if the pairing logic changes later.
-- Nullable and only ever set on CHECK_OUT rows; CHECK_IN rows keep it null.

alter table public.attendance_events
  add column duration_seconds integer;

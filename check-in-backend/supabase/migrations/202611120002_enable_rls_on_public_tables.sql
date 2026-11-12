-- The backend reaches tables only through the service-role client, which
-- bypasses RLS. Without RLS, anyone holding the publishable key could read or
-- modify any table through the REST API (audit logs, device bindings, ...).
-- Enabling RLS with no policies closes that path. No data is changed.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

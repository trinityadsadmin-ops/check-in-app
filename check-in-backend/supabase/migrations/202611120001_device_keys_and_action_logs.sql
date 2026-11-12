-- Additive only: no existing row is updated or deleted.
--
-- 1. Device binding hardening. A bound device now also holds a non-extractable
--    ECDSA key (public half stored here) and signs every request with a
--    monotonically increasing counter. A copied/cloned install reuses counters
--    the original already spent, which is detected and locks the binding.
--    Existing bindings have no key yet; it is enrolled on their next request.
alter table public.device_bindings
  add column if not exists public_key_jwk jsonb,
  add column if not exists key_enrolled_at timestamptz,
  add column if not exists fingerprint jsonb,
  add column if not exists last_counter bigint not null default 0,
  add column if not exists recent_counters bigint[] not null default '{}',
  add column if not exists last_seen_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_reason text;

-- Atomically consume a request counter for a binding. Returns:
--   'OK'        counter accepted and recorded
--   'REPLAY'    counter already used (or far older than the window) → clone suspected
--   'LOCKED'    binding is locked
--   'NOT_FOUND' binding missing/inactive
create or replace function public.device_binding_use_counter(p_binding_id uuid, p_counter bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last bigint;
  v_recent bigint[];
  v_locked timestamptz;
begin
  select last_counter, recent_counters, locked_at
    into v_last, v_recent, v_locked
    from public.device_bindings
   where id = p_binding_id and is_active
   for update;

  if not found then
    return 'NOT_FOUND';
  end if;

  if v_locked is not null then
    return 'LOCKED';
  end if;

  -- Parallel requests may arrive out of order, so accept any unseen counter
  -- within a window behind the highest one seen. A clone shares the counter
  -- base with the original, so it keeps hitting values already in v_recent
  -- (or falls behind the window) and is reported as a replay.
  if p_counter = any(v_recent) or p_counter <= v_last - 200 then
    return 'REPLAY';
  end if;

  v_recent := array_append(v_recent, p_counter);
  if cardinality(v_recent) > 250 then
    v_recent := v_recent[cardinality(v_recent) - 249:];
  end if;

  update public.device_bindings
     set last_counter = greatest(v_last, p_counter),
         recent_counters = v_recent,
         last_seen_at = now(),
         updated_at = now()
   where id = p_binding_id;

  return 'OK';
end;
$$;

revoke all on function public.device_binding_use_counter(uuid, bigint) from public, anon, authenticated;

-- 2. Two-phase action log. Every key action gets a client-generated action id:
--    the app records INTENT when the button is pressed and its own RESULT, and
--    the server records the RESULT it actually produced under the same id.
create table if not exists public.action_logs (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  phase text not null,
  source text not null,
  outcome text,
  http_status integer,
  error_code text,
  error_message text,
  client_at timestamptz,
  created_at timestamptz not null default now(),
  device_uuid uuid,
  ip_address text,
  user_agent text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  constraint action_logs_phase_check check (phase in ('INTENT', 'RESULT')),
  constraint action_logs_source_check check (source in ('CLIENT', 'SERVER')),
  constraint action_logs_outcome_check check (outcome is null or outcome in ('SUCCESS', 'FAILURE'))
);

-- Client retries of the same log entry are idempotent.
create unique index if not exists action_logs_one_per_phase_source
  on public.action_logs(action_id, action, phase, source);

create index if not exists action_logs_user_created_idx
  on public.action_logs(user_id, created_at desc);

create index if not exists action_logs_created_idx
  on public.action_logs(created_at desc);

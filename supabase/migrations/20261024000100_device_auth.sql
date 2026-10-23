-- Device-verified sessions. A password or bare-OTP session alone cannot touch private data:
-- only sessions recorded in verified_sessions (written by the sign-in / verify-device
-- Edge Functions with the service role) pass session_verified().

create table public.verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table public.device_challenges (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  primary key (user_id, device_id)
);

-- Service role only: RLS on, no policies, no grants.
alter table public.verified_sessions enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.device_challenges enable row level security;
revoke all on public.verified_sessions, public.trusted_devices, public.device_challenges from anon, authenticated;

create function public.session_verified() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.verified_sessions
  where session_id = ((select auth.jwt()) ->> 'session_id')::uuid and user_id = (select auth.uid())
) $$;
grant execute on function public.session_verified() to anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) and public.session_verified() $$;

drop policy "own rows" on public.watchlist;
create policy "own rows" on public.watchlist for all to authenticated
  using (user_id = (select auth.uid()) and public.session_verified())
  with check (user_id = (select auth.uid()) and public.session_verified());

-- Used by verify-device to resolve an email to a user id without paging auth.admin.listUsers.
-- Callable only by the service role.
create function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $$ select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

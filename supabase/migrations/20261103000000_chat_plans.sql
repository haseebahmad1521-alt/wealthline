-- Batch K2 (owner, Nov 2, 2026): chat plans, spend budgets, tapback reactions and moderation. Additive only:
-- take_chat_message and chat_usage stay (unused once the chat function moves to budgets).
--
-- entitlements     a user's paid plan (pro | premium). Written by the service role (payment webhooks, later) or an admin.
-- chat_spend       per-user daily spend in micro-dollars at list API prices; the plan sets the daily allowance.
-- chat_spend_total all users' daily spend: a global circuit breaker so a bug or abuse can't run up the bill.
-- chat_moderation  strikes and their outcome (owner's rule, see _shared/persona.ts addStrike): 3 strikes in 30 days →
--                  24 h cooldown; any strike after a cooldown → on hold until an admin reviews it. Never an automatic ban.

alter table public.chat_messages add column reaction text
  check (reaction in ('👍', '❤️', '😂', '😮', '🤔', '😕'));

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('pro', 'premium')),
  source text not null default 'admin' check (source in ('admin', 'stripe', 'app_store', 'play')),
  expires_at timestamptz,     -- null: until changed by an admin
  updated_at timestamptz not null default now()
);

create table public.chat_spend (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  micros bigint not null default 0,
  primary key (user_id, day)
);

create table public.chat_spend_total (
  day date primary key,
  micros bigint not null default 0
);

create table public.chat_moderation (
  user_id uuid primary key references auth.users (id) on delete cascade,
  strikes timestamptz[] not null default '{}',
  paused_before boolean not null default false,
  paused_until timestamptz,
  on_hold boolean not null default false,
  held_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 2000)
);

alter table public.entitlements enable row level security;
alter table public.chat_spend enable row level security;
alter table public.chat_spend_total enable row level security;
alter table public.chat_moderation enable row level security;

-- Users see their own plan, spend and standing; admins see everyone's, set plans and decide holds.
create policy "own plan" on public.entitlements for select to authenticated
  using ((user_id = (select auth.uid()) and public.session_verified()) or public.is_admin());
create policy "admin plans" on public.entitlements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own spend" on public.chat_spend for select to authenticated
  using (user_id = (select auth.uid()) and public.session_verified());
create policy "own standing" on public.chat_moderation for select to authenticated
  using ((user_id = (select auth.uid()) and public.session_verified()) or public.is_admin());
create policy "admin review" on public.chat_moderation for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.entitlements to authenticated;
grant select on public.chat_spend to authenticated;
grant select, update on public.chat_moderation to authenticated;
-- chat_spend_total: no client access at all.

-- The user's current plan, or null (Free: no chat).
create function public.chat_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select e.plan from public.entitlements e
  where e.user_id = p_user and (e.expires_at is null or e.expires_at > now())
$$;
revoke execute on function public.chat_plan(uuid) from public, anon, authenticated;

-- Reserves p_estimate micro-dollars of today's (UTC) allowance before a reply: false when the user's allowance or the
-- global ceiling would be passed. Atomic per row, so parallel sends can't both slip under the cap. Service role only.
create function public.take_chat_budget(p_user uuid, p_limit bigint, p_global bigint, p_estimate bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  n bigint;
begin
  insert into public.chat_spend_total (day, micros) values (today, p_estimate)
  on conflict (day) do update set micros = public.chat_spend_total.micros + p_estimate
    where public.chat_spend_total.micros + p_estimate <= p_global
  returning micros into n;
  if n is null then return false; end if;
  n := null;
  insert into public.chat_spend (user_id, day, micros) values (p_user, today, p_estimate)
  on conflict (user_id, day) do update set micros = public.chat_spend.micros + p_estimate
    where public.chat_spend.micros + p_estimate <= p_limit
  returning micros into n;
  if n is null then
    update public.chat_spend_total set micros = micros - p_estimate where day = today;
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.take_chat_budget(uuid, bigint, bigint, bigint) from public, anon, authenticated;

-- After the reply: corrects the reservation by the actual cost (p_delta = actual − estimate, either sign).
create function public.settle_chat_spend(p_user uuid, p_delta bigint) returns void
language sql security definer set search_path = '' as $$
  update public.chat_spend set micros = greatest(0, micros + p_delta)
    where user_id = p_user and day = (now() at time zone 'utc')::date;
  update public.chat_spend_total set micros = greatest(0, micros + p_delta)
    where day = (now() at time zone 'utc')::date;
$$;
revoke execute on function public.settle_chat_spend(uuid, bigint) from public, anon, authenticated;

-- Admin: accounts on hold or paused, with their email (auth.users isn't readable from the client).
create function public.admin_chat_standing() returns table (
  user_id uuid, email text, strikes int, paused_until timestamptz, on_hold boolean, held_at timestamptz, plan text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return query
    select m.user_id, u.email::text, coalesce(array_length(m.strikes, 1), 0), m.paused_until, m.on_hold, m.held_at, public.chat_plan(m.user_id)
    from public.chat_moderation m join auth.users u on u.id = m.user_id
    where m.on_hold or m.paused_until > now()
    order by m.on_hold desc, m.held_at desc nulls last;
end $$;
revoke execute on function public.admin_chat_standing() from public, anon;
grant execute on function public.admin_chat_standing() to authenticated;

-- Admin decides a hold: lift it (strikes and cooldown history cleared, a fresh start) or keep it, with a note.
create function public.admin_review_hold(p_user uuid, p_lift boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.chat_moderation set
    on_hold = case when p_lift then false else on_hold end,
    strikes = case when p_lift then '{}' else strikes end,
    paused_before = case when p_lift then false else paused_before end,
    paused_until = case when p_lift then null else paused_until end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 2000)
  where user_id = p_user;
end $$;
revoke execute on function public.admin_review_hold(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_hold(uuid, boolean, text) to authenticated;

-- Admin sets a plan by email (null removes it: back to Free). Payments will write entitlements themselves later.
create function public.admin_set_plan(p_email text, p_plan text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return false; end if;
  if p_plan is null then
    delete from public.entitlements where user_id = uid;
  else
    insert into public.entitlements (user_id, plan, source) values (uid, p_plan, 'admin')
    on conflict (user_id) do update set plan = excluded.plan, source = 'admin', expires_at = null, updated_at = now();
  end if;
  return true;
end $$;
revoke execute on function public.admin_set_plan(text, text) from public, anon;
grant execute on function public.admin_set_plan(text, text) to authenticated;

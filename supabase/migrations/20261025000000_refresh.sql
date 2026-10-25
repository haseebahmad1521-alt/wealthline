-- On-demand + scheduled refresh of each person's public data (finance, news, social), cached here.
-- The refresh / refresh-due Edge Functions (service role) are the only writers. Clients only read, and watch
-- refresh_state and the data tables over Realtime to show progress live.

alter table public.people
  add column forbes_uri text unique,
  add column forbes_rank int check (forbes_rank > 0),
  -- {platform, handle, url}: where this person posts most (one-time research, supabase/import/social-accounts.json).
  add column social jsonb;

create table public.person_news (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  title text not null,
  source_name text not null,
  source_url text not null check (source_url ~ '^https?://'),
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (person_id, source_url)
);
create index person_news_person on public.person_news (person_id, published_at desc);

-- Latest post only; text and link are copied from the platform, never written by us.
create table public.social_posts (
  person_id uuid primary key references public.people (id) on delete cascade,
  platform text not null,
  handle text not null,
  post_url text check (post_url ~ '^https?://'),
  text text not null,
  posted_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table public.refresh_state (
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('finance', 'news', 'social')),
  status text not null default 'idle' check (status in ('idle', 'running', 'error')),
  started_at timestamptz,
  refreshed_at timestamptz,
  next_auto_at timestamptz,
  error text,
  primary key (person_id, kind)
);
create index refresh_state_due on public.refresh_state (next_auto_at) where status <> 'running';

alter table public.person_news enable row level security;
alter table public.social_posts enable row level security;
alter table public.refresh_state enable row level security;
create policy "public read" on public.person_news for select using (true);
create policy "public read" on public.social_posts for select using (true);
create policy "public read" on public.refresh_state for select using (true);
grant select on public.person_news, public.social_posts, public.refresh_state to anon, authenticated;

alter publication supabase_realtime add table public.net_worth_values, public.person_news, public.social_posts, public.refresh_state;

-- Owner's timeframes for ranks 1–10; ranks 11–100 stretch linearly to 2x at rank 100 (fewer refreshes further down).
-- stale = refresh on a visit once data is older than this; auto = scheduled refresh with no visits.
create function public.refresh_window(p_kind text, p_rank int, out stale interval, out auto interval)
language sql immutable as $$
  select base_stale * f, base_auto * f
  from (select 1 + greatest(least(coalesce(p_rank, 100), 100) - 10, 0) / 90.0 as f) x,
  lateral (select case p_kind when 'finance' then interval '6 hours' when 'news' then interval '2 hours' else interval '10 minutes' end as base_stale,
                  case p_kind when 'finance' then interval '12 hours' when 'news' then interval '8 hours' else interval '2 hours' end as base_auto) b
$$;

-- Atomically takes a refresh: false if one is running (a stuck run frees after 10 minutes) or data is still fresh.
-- p_auto: scheduled run (due by next_auto_at) instead of a visit (due by staleness).
create function public.claim_refresh(p_person uuid, p_kind text, p_auto boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w record;
  ok boolean;
begin
  select * into w from public.refresh_window(p_kind, (select forbes_rank from public.people where id = p_person));
  insert into public.refresh_state (person_id, kind) values (p_person, p_kind) on conflict do nothing;
  update public.refresh_state s set status = 'running', started_at = now(), error = null
  where s.person_id = p_person and s.kind = p_kind
    and (s.status <> 'running' or s.started_at < now() - interval '10 minutes')
    and case when p_auto then coalesce(s.next_auto_at, now()) <= now()
             else s.refreshed_at is null or s.refreshed_at < now() - w.stale end
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- Ends a run and schedules the next automatic one with a random -30..+30 minute offset.
create function public.finish_refresh(p_person uuid, p_kind text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  select * into w from public.refresh_window(p_kind, (select forbes_rank from public.people where id = p_person));
  update public.refresh_state set
    status = case when p_error is null then 'idle' else 'error' end,
    error = left(p_error, 300),
    refreshed_at = now(),
    next_auto_at = now() + w.auto + (random() * 60 - 30) * interval '1 minute'
  where person_id = p_person and kind = p_kind;
end $$;

revoke all on function public.claim_refresh(uuid, text, boolean), public.finish_refresh(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_refresh(uuid, text, boolean), public.finish_refresh(uuid, text, text) to service_role;

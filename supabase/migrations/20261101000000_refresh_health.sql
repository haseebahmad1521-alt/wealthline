-- Failure alerts for the live refresh: each outside source records its last success and failure, and
-- refresh_health() turns that plus refresh_state into a short list of problems. The admin screen shows it and an
-- hourly GitHub Action fails (GitHub emails the owner) while it reports a problem. Read-only, no secrets.

create table public.source_health (
  source text primary key,
  -- false: a best-effort source whose failure is shown but never alerts (e.g. Google News, blocked since Oct 25).
  required boolean not null default true,
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  last_error text,
  fails int not null default 0 -- consecutive failures; reset by a success
);
alter table public.source_health enable row level security;
create policy "public read" on public.source_health for select using (true);
grant select on public.source_health to anon, authenticated;

insert into public.source_health (source, required) values ('Google News', false);

create function public.record_source(p_source text, p_error text) returns void
language sql security definer set search_path = '' as $$
  insert into public.source_health as h (source, last_ok_at, last_fail_at, last_error, fails)
  values (p_source,
          case when p_error is null then now() end,
          case when p_error is not null then now() end,
          left(p_error, 300),
          case when p_error is null then 0 else 1 end)
  on conflict (source) do update set
    last_ok_at = coalesce(excluded.last_ok_at, h.last_ok_at),
    last_fail_at = coalesce(excluded.last_fail_at, h.last_fail_at),
    last_error = coalesce(excluded.last_error, h.last_error),
    fails = case when p_error is null then 0 else h.fails + 1 end
$$;
revoke all on function public.record_source(text, text) from public, anon, authenticated;
grant execute on function public.record_source(text, text) to service_role;

-- { ok, checked_at, problems: [text] }. Thresholds: scheduler silent 30 min; a refresh due over 1 hour ago and not
-- picked up; any refresh ending in an error; a required source failing 3+ times in a row with no success in 6 hours.
create function public.refresh_health() returns jsonb
language sql stable security definer set search_path = '' as $$
  with problems as (
    select format('The scheduler has not started a refresh since %s.', to_char(max(started_at), 'YYYY-MM-DD HH24:MI "UTC"')) as p
    from public.refresh_state
    having coalesce(max(started_at), '-infinity') < now() - interval '30 minutes'
    union all
    select format('%s %s refresh(es) are over an hour late.', count(*), kind)
    from public.refresh_state
    where status <> 'running' and next_auto_at < now() - interval '1 hour'
    group by kind
    union all
    select format('%s %s refresh(es) failed. Latest: %s', count(*), kind, (array_agg(error order by refreshed_at desc))[1])
    from public.refresh_state
    where status = 'error'
    group by kind
    union all
    select format('%s has failed %s times in a row: %s', source, fails, last_error)
    from public.source_health
    where required and fails >= 3 and coalesce(last_ok_at, '-infinity') < now() - interval '6 hours'
  )
  select jsonb_build_object(
    'ok', not exists (select 1 from problems),
    'checked_at', now(),
    'problems', coalesce((select jsonb_agg(p) from problems), '[]'::jsonb)
  )
$$;
grant execute on function public.refresh_health() to anon, authenticated;

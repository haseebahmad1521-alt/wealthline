-- Batch K3 (owner, Nov 3, 2026): Grok (xAI) fills each person's recent posts and news, since the last fetch only.
-- Additive only. The `recent` function runs every 30 minutes and handles the few people who are due.
--
-- person_recent  per-person schedule: when it last fetched, when it's next due, and how many runs found nothing
--                (quiet people back off ×2 per empty run, up to 7 days).
-- xai_spend      spend per calendar month in micro-dollars: a hard ceiling (XAI_MONTHLY_USD, default $20). Once
--                reached, fetching stops until the next month.

create table public.person_recent (
  person_id uuid primary key references public.people (id) on delete cascade,
  last_fetched timestamptz,
  next_due timestamptz not null default now(),
  quiet_runs int not null default 0
);

create table public.xai_spend (
  month date primary key,
  micros bigint not null default 0,
  calls int not null default 0
);

alter table public.person_recent enable row level security;
alter table public.xai_spend enable row level security;
-- No policies: service role only (admins can read spend through the dashboard / SQL).

-- Reserves `p_estimate` under the monthly ceiling; false when it would go over.
create function public.take_xai_budget(p_limit bigint, p_estimate bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', now() at time zone 'utc')::date;
  ok boolean;
begin
  insert into public.xai_spend (month) values (m) on conflict do nothing;
  update public.xai_spend set micros = micros + p_estimate, calls = calls + 1
    where month = m and micros + p_estimate <= p_limit
    returning true into ok;
  return coalesce(ok, false);
end $$;

-- Corrects the reservation to the real cost (delta may be negative).
create function public.settle_xai_spend(p_delta bigint) returns void
language sql security definer set search_path = '' as $$
  update public.xai_spend set micros = greatest(0, micros + p_delta)
  where month = date_trunc('month', now() at time zone 'utc')::date;
$$;

revoke execute on function public.take_xai_budget(bigint, bigint) from public, anon, authenticated;
revoke execute on function public.settle_xai_spend(bigint) from public, anon, authenticated;

-- Every 30 minutes; same Vault 'cron_secret' as the other jobs. Without XAI_API_KEY the function does nothing.
select cron.schedule(
  'recent',
  '7,37 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/recent',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

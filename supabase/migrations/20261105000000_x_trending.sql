-- Trending on X (batch K3; owner, Nov 3, 2026): once a day, one Grok x_search call finds what X is talking about
-- around the people we track. Shared by everyone. Additive only.
--
-- x_trending  up to 5 topics a day. `topic` is Grok's short label (AI-written, shown as such); everything else is
--             X's own: a topic is kept only if Grok cited the post and X's embed endpoint returns it, and
--             `post_text`/`handle`/`posted_at` are copied from that endpoint word for word.

create table public.x_trending (
  id uuid primary key default gen_random_uuid(),
  trend_date date not null,
  position int not null check (position between 0 and 9),
  topic text not null check (length(topic) between 1 and 90),
  person_id uuid references public.people (id) on delete set null,
  post_url text not null,
  handle text not null,
  post_text text not null,
  posted_at timestamptz,
  model text not null,
  unique (trend_date, position),
  unique (trend_date, post_url)
);

alter table public.x_trending enable row level security;
create policy "public read" on public.x_trending for select using (true);
grant select on public.x_trending to anon, authenticated;

-- Daily at 06:50 UTC, after project-scout; same Vault 'cron_secret' as the other jobs. Without XAI_API_KEY the
-- function does nothing.
select cron.schedule(
  'trending',
  '50 6 * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/trending',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

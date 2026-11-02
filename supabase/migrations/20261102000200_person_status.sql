-- Batch K: the "lately" line on profiles (owner, Nov 2). A one- or two-sentence AI paraphrase, in the person's voice, of
-- what they have done lately, written by a small model from their latest archived posts and headlines. Shown as an AI
-- simulation (stylised avatar + sparkle), never as a quote, and without the platform it came from. Additive only.
--
-- based_on keeps the provenance (titles/links the line was written from) for admins and audits; the app doesn't show it.
-- inputs_hash lets the status function skip people whose material hasn't changed, so the model runs only on news.

create table public.person_status (
  person_id uuid primary key references public.people (id) on delete cascade,
  text text check (length(text) between 1 and 400), -- null: the model found nothing they did themselves (SKIP)
  based_on jsonb not null default '[]'::jsonb, -- [{ title, url, at }]
  inputs_hash text not null,
  model text not null,
  generated_at timestamptz not null default now()
);

alter table public.person_status enable row level security;
create policy "public read" on public.person_status for select using (true);
grant select on public.person_status to anon, authenticated;

alter publication supabase_realtime add table public.person_status;

-- Hourly at :47 (after refresh-due and sources have fetched), same Vault 'cron_secret' as the other jobs.
select cron.schedule(
  'status',
  '47 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/status',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- World simulations (Nov 16, 2026): what-if scenarios played out on the globe. Additive only.
--
-- countries.region   World Bank region code (EAS, ECS, LCN, MEA, NAC, SAS, SSF), copied by the `world` facts job.
--                    The app splits a company's regional revenue line ("EMEA", "Asia Pacific") between the countries
--                    in it by recorded GDP, so a shock to one country reaches the companies that report that region.
-- companies.sector   One of a fixed list, mapped from the company's Wikidata industry (P452) by the facts job;
--                    `sector_source` keeps the industry label it came from. Null when no mapping fits.
-- world_scenarios    Scenarios written by Grok (`scenarios` function): a daily ranked set and answers to typed
--                    questions. Grok writes only the story and the changes (which country, company, sector or stake;
--                    how much; which months). Every dollar figure is calculated in the app from recorded values.
--                    Versus rows (origin 'versus') name the two rivals in `versus`; `beats` are story lines without
--                    figures, shown as notifications on the globe.

-- company_factors  each listed company's measured sensitivities (betas) and their standard errors to global stocks,
--                  oil, Chinese stocks, the dollar and its sector, from three years of weekly prices; refitted weekly
--                  by the `world` function (?job=factors). factor_model keeps each run's factor links and window.

alter table public.countries add column region text;

create table public.company_factors (
  company_id uuid primary key references public.companies (id) on delete cascade,
  symbol text not null,
  beta jsonb not null,
  se jsonb not null,
  sd double precision, -- weekly moves the factors don't explain, for ranges
  r2 double precision not null,
  weeks int not null,
  fitted_at timestamptz not null default now()
);
alter table public.company_factors enable row level security;
create policy "public read" on public.company_factors for select using (true);
grant select on public.company_factors to anon, authenticated;

create table public.factor_model (
  id bigint generated always as identity primary key,
  links jsonb not null,
  window_from text not null,
  window_to text not null,
  companies int not null,
  fitted_at timestamptz not null default now()
);
alter table public.factor_model enable row level security;
create policy "public read" on public.factor_model for select using (true);
grant select on public.factor_model to anon, authenticated;

-- Weekly refit, Sundays 05:20 UTC (markets closed).
select cron.schedule(
  'factors',
  '20 5 * * 0',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=factors',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

alter table public.companies add column sector text check (sector in (
  'energy', 'materials', 'industrials', 'autos', 'consumer', 'health', 'finance', 'technology', 'media', 'real_estate', 'transport'
));
alter table public.companies add column sector_source text;

create table public.world_scenarios (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('daily', 'prompt', 'versus')),
  run_date date not null default current_date,
  position int not null default 0 check (position between 0 and 9),
  -- Typed questions: the normalised question, so a repeat is answered from here without another Grok call.
  prompt text check (length(prompt) <= 200),
  prompt_key text unique,
  -- How many times a question or match was asked (the first ask plus each answer served from here), for "Most asked".
  asks int not null default 1 check (asks >= 1),
  title text not null check (length(title) between 1 and 120),
  summary text not null check (length(summary) <= 900),
  plausibility text not null check (plausibility in ('likely', 'possible', 'unlikely')),
  reason text not null check (length(reason) <= 300),
  months int not null check (months between 1 and 36),
  shocks jsonb not null,
  assumptions jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  beats jsonb not null default '[]'::jsonb,
  versus text[] check (versus is null or cardinality(versus) = 2),
  -- Set when the question can't be modelled (unrelated, or only touches things that aren't tracked).
  declined text,
  model text not null,
  created_at timestamptz not null default now()
);
create index world_scenarios_daily on public.world_scenarios (origin, run_date desc, position);
create index world_scenarios_asked on public.world_scenarios (asks desc, created_at desc) where origin in ('prompt', 'versus');

alter table public.world_scenarios enable row level security;
create policy "public read" on public.world_scenarios for select using (true);
grant select on public.world_scenarios to anon, authenticated;

-- Daily at 07:05 UTC, after `trending`; same Vault 'cron_secret' as the other jobs. Without XAI_API_KEY the function
-- does nothing.
select cron.schedule(
  'scenarios',
  '5 7 * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/scenarios',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

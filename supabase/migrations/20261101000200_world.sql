-- World sandbox, backend part 1: the facts behind the globe, plus live stock quotes.
-- Every fact row keeps its source and link; collectors (supabase/functions/world) fill them, admins can correct them.
-- City-level places only: no homes, no live tracking of people, jets or yachts.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  ticker text unique, -- primary listing as written in holdings (e.g. BRK.B); null for private companies
  is_private boolean not null default false,
  wikidata_id text unique,
  cik text unique, -- SEC id, for the EDGAR collector
  country text, -- ISO 3166-1 alpha-2 of the headquarters
  hq_city text,
  hq_lat double precision,
  hq_lng double precision,
  source_label text,
  source_url text,
  updated_at timestamptz not null default now()
);

alter table public.holdings add column company_id uuid references public.companies (id) on delete set null;
create index holdings_company on public.holdings (company_id);

-- Seed one company per distinct holding and link the holdings to it.
insert into public.companies (name, ticker, is_private)
select distinct on (company) company, ticker, is_private from public.holdings order by company, ticker nulls last
on conflict do nothing;
update public.holdings h set company_id = c.id from public.companies c where c.name = h.company;

-- Wikidata items the ticker lookup can't decide on its own (GOOGL and DELL each match two items; SpaceX has no ticker).
update public.companies c set wikidata_id = v.q
from (values ('Alphabet', 'Q20800404'), ('Dell Technologies', 'Q27500963'), ('SpaceX', 'Q193701')) v (name, q)
where c.name = v.name;

-- Observed share prices. One row per price point the source reports (5-minute bars during trading).
create table public.quotes (
  ticker text not null,
  as_of timestamptz not null,
  price numeric not null check (price > 0),
  prev_close numeric, -- previous session close, for the day's change
  currency text not null default 'USD',
  source_label text not null,
  source_url text,
  primary key (ticker, as_of)
);

-- Latest price per ticker with the day's change; what tickers and the globe's live pulse read.
create view public.quote_latest with (security_invoker = true) as
select distinct on (ticker) ticker, as_of, price, prev_close, currency, source_label, source_url,
       case when prev_close > 0 then (price - prev_close) / prev_close * 100 end as change_pct
from public.quotes
order by ticker, as_of desc;

create table public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('hq', 'office', 'factory', 'data_center', 'launch_site', 'store', 'research', 'other')),
  name text not null,
  city text,
  country text, -- ISO alpha-2
  lat double precision,
  lng double precision,
  source_label text not null,
  source_url text,
  unique (company_id, kind, name)
);

create table public.company_regions (
  company_id uuid not null references public.companies (id) on delete cascade,
  fiscal_year int not null,
  period_end date,
  region text not null, -- as the company reports it ("United States", "Greater China", "International", ...)
  revenue_usd numeric not null check (revenue_usd >= 0),
  source_label text not null,
  source_url text,
  primary key (company_id, fiscal_year, region)
);

create table public.subsidiaries (
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  jurisdiction text not null,
  fiscal_year int,
  source_label text not null,
  source_url text,
  primary key (company_id, name, jurisdiction)
);

create table public.countries (
  iso2 text primary key,
  iso3 text unique,
  name text not null,
  gdp_usd numeric,
  gdp_year int,
  population numeric,
  population_year int,
  source_url text,
  updated_at timestamptz not null default now()
);

-- Same access as the rest of the public data: everyone reads, administrators write (collectors use the service role).
do $$
declare t text;
begin
  foreach t in array array['companies', 'quotes', 'company_sites', 'company_regions', 'subsidiaries', 'countries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format(
      'create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant select on public.quote_latest to anon, authenticated;

-- Saved "what if" scenarios: inputs only (shocks, date); results are recomputed so they never go stale.
-- Private to their owner (device-verified, like watchlists); a public one is readable by anyone with its id.
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  inputs jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.scenarios enable row level security;
create policy "own rows" on public.scenarios for all to authenticated
  using (user_id = (select auth.uid()) and public.session_verified())
  with check (user_id = (select auth.uid()) and public.session_verified());
create policy "public scenarios" on public.scenarios for select using (is_public);
grant select on public.scenarios to anon;
grant select, insert, update, delete on public.scenarios to authenticated;

alter publication supabase_realtime add table public.quotes;

-- Stock quotes every 10 minutes alongside refresh-due (same Vault secret).
select cron.schedule(
  'world-quotes',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=quotes',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Slow-changing facts (company places via Wikidata, country GDP via the World Bank) once a day.
select cron.schedule(
  'world-facts',
  '40 3 * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=facts',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

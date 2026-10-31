-- World sandbox, backend part 2: revenue by country/region and subsidiaries from each company's latest SEC 10-K
-- (function `world?job=edgar`). Only the breakdown the company itself reports is stored: one set of lines that adds
-- up to its total revenue (within 1%). Companies that don't tag revenue by geography (e.g. Berkshire) get no rows.

alter table public.companies add column edgar_10k text; -- accession number of the last 10-K processed
alter table public.company_regions
  add column country text, -- ISO alpha-2 when the line is one country (or a named market like "Greater China" → CN)
  add column period_start date;

-- Share of each company's revenue per reported line, latest fiscal year. Per-person exposure needs stake values
-- (holdings.shares_owned), which are not recorded yet, so this stays at company level for now.
create view public.company_exposure with (security_invoker = true) as
with latest as (
  select company_id, max(fiscal_year) as fiscal_year from public.company_regions group by company_id
)
select r.company_id, c.name as company, r.fiscal_year, r.period_end, r.region, r.country, r.revenue_usd,
       r.revenue_usd / nullif(sum(r.revenue_usd) over (partition by r.company_id), 0) as share,
       r.source_label, r.source_url
from public.company_regions r
join latest l using (company_id, fiscal_year)
join public.companies c on c.id = r.company_id;
grant select on public.company_exposure to anon, authenticated;

-- Hourly: cheap check for new 10-K filings; at most two companies are parsed per run.
select cron.schedule(
  'world-edgar',
  '25 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=edgar',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

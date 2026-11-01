-- Projects from the news (function project-scout, daily). Claude reads the headlines already stored in person_news
-- and picks announced projects (factories, data centres, launches, products, deals); the title, outlet and link are
-- copied from the stored headline, Claude adds only a short note, the kind, the place and any date the headline
-- states. Places are geocoded city-level (Open-Meteo) so the globe can draw planned projects as dashed rings.

alter table public.projects
  add column origin text not null default 'admin' check (origin in ('admin', 'news')),
  add column kind text check (kind in ('factory', 'data_center', 'launch', 'product', 'partnership', 'acquisition', 'investment', 'other')),
  add column company_id uuid references public.companies (id) on delete set null,
  add column counterparty text, -- the other company a headline names (partner, target, investor)
  add column expected text check (expected ~ '^\d{4}(-\d{2})?$'), -- year or year-month the headline states
  add column city text,
  add column country text, -- ISO alpha-2
  add column lat double precision,
  add column lng double precision,
  add column model text; -- the Claude model that picked it (news only)

-- One project per person and article, so a rerun or a second outlet run can't duplicate it.
create unique index projects_person_source on public.projects (person_id, source_url);

select cron.schedule(
  'project-scout',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/project-scout',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

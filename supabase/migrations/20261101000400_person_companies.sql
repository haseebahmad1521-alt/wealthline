-- Links between tracked people and their companies for the World globe, from Wikidata ("founded by", "owned by",
-- "owner of"), kept only when the company matches the person's Forbes source of wealth or is listed on an exchange
-- (supabase/import/companies.mjs). Separate from holdings, which are verified stakes with share counts.

alter table public.people add column wikidata_id text unique;

-- Price-feed symbol (Yahoo Finance style, e.g. MC.PA, RELIANCE.NS, 0700.HK). Null: derived from the US ticker.
alter table public.companies add column quote_symbol text unique;

create table public.person_companies (
  person_id uuid not null references public.people (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  -- founder / owner: Wikidata says so; holding: a verified holdings row; source: Forbes names the company as the
  -- person's source of wealth (e.g. Walmart for the Walton heirs) without Wikidata recording a direct link.
  relation text not null check (relation in ('founder', 'owner', 'holding', 'source')),
  source_label text not null,
  source_url text,
  primary key (person_id, company_id)
);
create index person_companies_company on public.person_companies (company_id);
alter table public.person_companies enable row level security;
create policy "public read" on public.person_companies for select using (true);
create policy "admin write" on public.person_companies for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.person_companies to anon, authenticated;
grant insert, update, delete on public.person_companies to authenticated;

-- The existing verified holdings count as links too.
insert into public.person_companies (person_id, company_id, relation, source_label)
select distinct person_id, company_id, 'holding', 'Holdings record'
from public.holdings where company_id is not null
on conflict do nothing;

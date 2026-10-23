-- Wealthline initial schema.
-- Public data is world-readable; writes need an admin; watchlists are private per user.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  age int check (age > 0 and age < 130),
  residence text,
  citizenship text,
  main_source text,
  bio text,
  -- Non-market assets (cash, property, private stakes) in USD, added to computed values.
  other_assets_usd numeric not null default 0 check (other_assets_usd >= 0),
  portrait_url text,
  portrait_page_url text,
  portrait_author text,
  portrait_license text,
  portrait_license_url text,
  updated_at timestamptz not null default now()
);

-- Every value says where it came from. 'estimate' = dated editorial/owner estimate;
-- 'computed' = holdings x quotes + other assets, written by the market updater.
create table public.net_worth_values (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  as_of timestamptz not null,
  net_worth_usd numeric not null check (net_worth_usd >= 0),
  kind text not null check (kind in ('estimate', 'computed')),
  source_label text,
  source_url text,
  created_at timestamptz not null default now(),
  unique (person_id, as_of, kind)
);
create index net_worth_values_person_as_of on public.net_worth_values (person_id, as_of desc);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  company text not null,
  ticker text,
  shares_owned numeric not null default 0 check (shares_owned >= 0),
  stake_percent numeric not null default 0 check (stake_percent between 0 and 100),
  role text,
  is_private boolean not null default false,
  private_valuation_usd numeric not null default 0 check (private_valuation_usd >= 0)
);
create index holdings_person on public.holdings (person_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  title text not null,
  description text,
  status text not null check (status in ('new', 'upcoming')),
  announced_date date not null,
  source_name text not null,
  source_url text not null
);
create index projects_announced on public.projects (announced_date desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  date date not null,
  text text not null
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id)
);

-- security definer so policies can consult admins without exposing the table.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- Latest value per person plus the previous one, for rank order and change.
create view public.person_summary with (security_invoker = on) as
select
  p.id as person_id,
  latest.net_worth_usd,
  latest.as_of,
  latest.kind,
  prev.net_worth_usd as prev_net_worth_usd,
  prev.as_of as prev_as_of
from public.people p
left join lateral (
  select v.net_worth_usd, v.as_of, v.kind from public.net_worth_values v
  where v.person_id = p.id order by v.as_of desc limit 1
) latest on true
left join lateral (
  select v.net_worth_usd, v.as_of from public.net_worth_values v
  where v.person_id = p.id and v.as_of < latest.as_of order by v.as_of desc limit 1
) prev on true;

-- Row level security ---------------------------------------------------------
alter table public.people enable row level security;
alter table public.net_worth_values enable row level security;
alter table public.holdings enable row level security;
alter table public.projects enable row level security;
alter table public.events enable row level security;
alter table public.admins enable row level security;
alter table public.watchlist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['people', 'net_worth_values', 'holdings', 'projects', 'events'] loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format(
      'create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t
    );
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- admins: no policies → unreadable via the API; managed in the dashboard / SQL editor.

create policy "own rows" on public.watchlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.watchlist to authenticated;

grant select on public.person_summary to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

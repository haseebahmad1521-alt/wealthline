-- Daily briefs: Claude selects and annotates public news headlines about tracked people.
-- Titles, links, outlets and dates are copied from the fetched feed, never written by the model.
-- Written only by the daily-brief Edge Function (service role); world-readable.

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  headline text not null check (char_length(headline) <= 140),
  model text not null,
  created_at timestamptz not null default now()
);

create table public.brief_items (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  position int not null,
  title text not null,
  note text not null check (char_length(note) <= 300),
  source_name text not null,
  source_url text not null check (source_url ~ '^https?://'),
  published_at timestamptz,
  unique (brief_id, position)
);
create index brief_items_person on public.brief_items (person_id, published_at desc);

alter table public.briefs enable row level security;
alter table public.brief_items enable row level security;
create policy "public read" on public.briefs for select using (true);
create policy "public read" on public.brief_items for select using (true);
grant select on public.briefs, public.brief_items to anon, authenticated;

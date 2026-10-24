-- Saved list views (filter + sort), private to the account like the watchlist.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  target text not null check (target in ('people', 'projects')),
  params jsonb not null default '{}',
  created_at timestamptz default now()
);

create index saved_views_user_id_idx on public.saved_views (user_id);

alter table public.saved_views enable row level security;

create policy "own rows" on public.saved_views for all to authenticated
  using (user_id = (select auth.uid()) and public.session_verified())
  with check (user_id = (select auth.uid()) and public.session_verified());

grant select, insert, update, delete on public.saved_views to authenticated;

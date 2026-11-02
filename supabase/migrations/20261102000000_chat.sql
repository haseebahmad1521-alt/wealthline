-- Batch K: chat with a billionaire. Additive only.
--
-- person_posts    every post we have fetched (social_posts keeps only the latest); text and link copied, never written by us.
-- person_sources  passages in the person's own words (interviews, letters, speeches, articles, books), with URL and date,
--                 searchable by full text so the chat can pull older material.
-- person_personas the persona card the chat speaks from: drafted by Claude from the sources, every line cited, admin-reviewable.
-- chat_threads / chat_messages  private to their owner.
-- chat_usage      per-user daily message count; the chat function enforces the cap (20/day) through take_chat_message().

create table public.person_posts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  platform text not null,
  handle text not null,
  post_url text not null unique check (post_url ~ '^https?://'),
  text text not null,
  posted_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index person_posts_person on public.person_posts (person_id, posted_at desc);

create table public.person_sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('interview', 'letter', 'speech', 'article', 'book')),
  title text not null,
  url text not null check (url ~ '^https?://'),
  published_at timestamptz,
  excerpt text not null, -- their own words, quoted from the source
  fetched_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', title || ' ' || excerpt)) stored,
  unique (person_id, url, excerpt)
);
create index person_sources_person on public.person_sources (person_id, published_at desc);
create index person_sources_search on public.person_sources using gin (search);

create table public.person_personas (
  person_id uuid primary key references public.people (id) on delete cascade,
  card jsonb not null,        -- { voice, topics, catchphrases, stances: [{ text, source_url }] ... }
  model text not null,
  drafted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, person_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null check (length(text) between 1 and 4000),
  sources jsonb,              -- assistant only: [{ title, url }] the reply was based on
  created_at timestamptz not null default now(),
  seen_at timestamptz         -- user messages: when the reply started (drives the simulated ✓✓)
);
create index chat_messages_thread on public.chat_messages (thread_id, created_at);

create table public.chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.person_posts enable row level security;
alter table public.person_sources enable row level security;
alter table public.person_personas enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_usage enable row level security;

-- Public archive; written by the service role (Edge Functions) only.
create policy "public read" on public.person_posts for select using (true);
create policy "public read" on public.person_sources for select using (true);
grant select on public.person_posts, public.person_sources to anon, authenticated;

-- Personas: admins read and review; the chat function reads them with the service role.
create policy "admin read" on public.person_personas for select to authenticated using (public.is_admin());
create policy "admin review" on public.person_personas for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.person_personas to authenticated;

-- Chats: the owner reads (from a verified session, like the watchlist) their threads and messages and may delete a thread. Messages are written only by the
-- chat function (service role), so the cap and the assistant role can't be bypassed from the client.
create policy "own threads" on public.chat_threads for select to authenticated using (owner = (select auth.uid()) and public.session_verified());
create policy "own threads delete" on public.chat_threads for delete to authenticated using (owner = (select auth.uid()) and public.session_verified());
create policy "own messages" on public.chat_messages for select to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.owner = (select auth.uid())) and public.session_verified());
create policy "own usage" on public.chat_usage for select to authenticated using (user_id = (select auth.uid()) and public.session_verified());
grant select, delete on public.chat_threads to authenticated;
grant select on public.chat_messages, public.chat_usage to authenticated;

-- Counts one message against today's (UTC) cap; false once the cap is reached. Service role only.
create function public.take_chat_message(p_user uuid, p_cap int default 20) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  insert into public.chat_usage (user_id, day, count) values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = public.chat_usage.count + 1
    where public.chat_usage.count < p_cap
  returning count into n;
  return n is not null;
end $$;
revoke execute on function public.take_chat_message(uuid, int) from public, anon, authenticated;

-- Full-text search over a person's sources for the chat's "look it up" tool.
create function public.search_person_sources(p_person uuid, p_query text, p_limit int default 5)
returns setof public.person_sources
language sql stable security invoker set search_path = public as $$
  select s.* from public.person_sources s
  where s.person_id = p_person and s.search @@ websearch_to_tsquery('english', p_query)
  order by ts_rank(s.search, websearch_to_tsquery('english', p_query)) desc, s.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;
grant execute on function public.search_person_sources(uuid, text, int) to anon, authenticated;

alter publication supabase_realtime add table public.chat_messages;

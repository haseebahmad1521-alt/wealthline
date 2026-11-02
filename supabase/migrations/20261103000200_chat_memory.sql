-- Premium "longer memory" (owner, Nov 3, 2026). Additive only: each thread keeps a few short facts the user shared
-- about themselves (written by the chat function; Pro keeps 8, Premium 24), so each contact remembers the user.
-- The owner reads them with their thread (existing RLS) and they go when the thread is deleted.
alter table public.chat_threads add column memory text[] not null default '{}'
  check (cardinality(memory) <= 40);

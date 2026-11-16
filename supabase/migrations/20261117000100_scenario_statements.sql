-- Tracked people's own words about a storyline, each checked word for word against its source page by the scenarios
-- function (supabase/functions/_shared/statements.ts). Additive only.
alter table public.world_scenarios add column if not exists statements jsonb not null default '[]'::jsonb;

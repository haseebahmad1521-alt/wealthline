-- The residual ledger (Nov 16, 2026). Additive only.
--
-- factor_residuals  every week, for each listed company: what the factor model expected its share price to do given
--                   how the factors actually moved (predicted), what it did (actual), and the gap (residual), all weekly
--                   log returns. The prediction uses only weeks before it (sensitivities fitted on earlier weeks). Written
--                   by the weekly `world` factors job (supabase/functions/_shared/ledger.ts); append-only: a recorded
--                   week is never rewritten. kind 'live' = recorded the weekend it happened; 'backfill' = filled in later
--                   (the year before the ledger began, or a missed week), still out of sample. sd is the company's
--                   typical weekly gap at fit time, so a gap can be read in "typical gaps". Public read, like
--                   company_factors; only the service role writes.

create table public.factor_residuals (
  company_id uuid not null references public.companies (id) on delete cascade,
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  actual double precision not null,
  predicted double precision not null,
  residual double precision not null,
  sd double precision not null,
  moves jsonb not null,
  beta jsonb not null,
  fit_through text not null,
  kind text not null check (kind in ('live', 'backfill')),
  recorded_at timestamptz not null default now(),
  primary key (company_id, week)
);
create index factor_residuals_week on public.factor_residuals (week);
alter table public.factor_residuals enable row level security;
create policy "public read" on public.factor_residuals for select using (true);
grant select on public.factor_residuals to anon, authenticated;

-- Append-only, even for the service role: a recorded week can't be edited.
create function public.factor_residuals_frozen() returns trigger language plpgsql as $$
begin
  raise exception 'factor_residuals is append-only';
end;
$$;
create trigger factor_residuals_frozen before update on public.factor_residuals
  for each row execute function public.factor_residuals_frozen();

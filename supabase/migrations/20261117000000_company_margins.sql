-- Operating margins for the World simulations' profit step (src/lib/simulate.ts, operatingLeverage): operating income
-- over total revenue from each company's latest 10-K (supabase/functions/world/edgar.ts). Additive only.
alter table public.companies
  add column if not exists operating_margin numeric,
  add column if not exists margin_fiscal_year integer,
  add column if not exists margin_source_url text,
  add column if not exists margin_10k text;

-- Share counts behind the wealth-level What if: where each holdings.shares_owned figure comes from and as of when.
-- Filled by supabase/import/ownership.mjs from SEC Form 4 (insiders, merged across filings so every share class
-- counts) or Schedule 13G/13D (holders above 5%), whichever is newer. 0 shares still means "not recorded".
alter table public.holdings
  add column shares_source_label text,
  add column shares_source_url text,
  add column shares_as_of date,
  add column shares_note text; -- e.g. "Classes A, B and C; B converts 1:1 into A" or "Class A counted as 1,500 Class B"

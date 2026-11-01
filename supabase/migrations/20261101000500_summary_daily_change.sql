-- Headline change compares with the latest value at least 20 hours older, not the record just before. Market values
-- now arrive every few minutes and repeat over weekends, so "the previous record" read as "$0 · 0.00% since today".
-- People with only monthly estimates keep comparing month to month (their gaps are longer than 20 hours anyway).
create or replace view public.person_summary with (security_invoker = on) as
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
  where v.person_id = p.id and v.as_of <= latest.as_of - interval '20 hours' order by v.as_of desc limit 1
) prev on true;

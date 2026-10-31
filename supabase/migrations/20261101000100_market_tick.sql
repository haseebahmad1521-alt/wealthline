-- Intraday market values. refresh-due fetches the Forbes real-time list once per run (every 10 minutes) and passes it
-- here: for each tracked person whose value changed since their last market value, store it as a 'computed' value
-- (what the app's live view, 3-hour chart and labeled projection read), and keep forbes_rank current. Forbes re-stamps
-- unchanged values while markets are closed; those are skipped so a quiet weekend never reads as live movement.

create function public.record_market_values(p_rows jsonb, p_source_url text) returns int
language plpgsql security definer set search_path = '' as $$
declare inserted int;
begin
  with incoming as (
    select p.id as person_id, (r ->> 'as_of')::timestamptz as as_of, round((r ->> 'usd')::numeric) as usd, (r ->> 'rank')::int as rank
    from jsonb_array_elements(p_rows) r
    join public.people p on p.forbes_uri = r ->> 'uri'
    where (r ->> 'usd')::numeric > 0
  ),
  ranked as (
    update public.people p set forbes_rank = i.rank from incoming i where p.id = i.person_id and i.rank is not null
    returning p.id
  ),
  latest as (
    select distinct on (person_id) person_id, as_of, net_worth_usd
    from public.net_worth_values
    where kind = 'computed' and person_id in (select person_id from incoming)
    order by person_id, as_of desc
  ),
  ins as (
    insert into public.net_worth_values (person_id, as_of, net_worth_usd, kind, source_label, source_url)
    select i.person_id, i.as_of, i.usd, 'computed', 'Forbes Real-Time Billionaires',
           replace(p_source_url, '{uri}', pp.forbes_uri)
    from incoming i
    join public.people pp on pp.id = i.person_id
    left join latest l on l.person_id = i.person_id
    where l.person_id is null or (i.as_of > l.as_of and i.usd <> l.net_worth_usd)
    on conflict (person_id, as_of, kind) do nothing
    returning 1
  )
  select count(*) into inserted from ins;
  return inserted;
end $$;
revoke all on function public.record_market_values(jsonb, text) from public, anon, authenticated;
grant execute on function public.record_market_values(jsonb, text) to service_role;

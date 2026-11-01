-- Live ticker: first and last observation of every company price and every person's net worth inside a window.
-- Read-only and security invoker, so it sees exactly what the caller's RLS allows (all of it is public read).
-- Nothing is derived beyond the two observations and their difference.
--
-- p_hours    window length, clamped to 1..168.
-- p_at_close false: the window ends now. true: it ends at the newest quote (the last market session), and a
--            company's start is that bar's prev_close, so the move is the session's change as the source reports it.
--
-- People use computed values (holdings x quotes) when the window has two or more; otherwise two or more dated
-- estimates, returned with value_kind 'estimate' so the client never presents them as market movement.
create or replace function public.ticker_moves(p_hours int, p_at_close boolean default false)
returns table (
  kind text,          -- 'company' | 'person'
  key text,           -- ticker for companies, slug for people
  label text,
  currency text,
  start_value numeric,
  end_value numeric,
  change numeric,
  change_pct numeric,
  start_as_of timestamptz, -- null when the start is the source's previous close
  as_of timestamptz,       -- the last observation
  value_kind text     -- 'quote' | 'computed' | 'estimate'
)
language sql
stable
security invoker
set search_path = public
as $$
  with win as (
    select t_end - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 168))) as t_start, t_end
    from (select coalesce(case when p_at_close then (select max(as_of) from public.quotes) end, now()) as t_end) b
  ),
  q as (
    select q.ticker, q.as_of, q.price, q.prev_close, q.currency,
           row_number() over (partition by q.ticker order by q.as_of) as first_n,
           row_number() over (partition by q.ticker order by q.as_of desc) as last_n
    from public.quotes q, win
    where q.as_of >= win.t_start and q.as_of <= win.t_end
  ),
  co as (
    select 'company'::text as kind, c.ticker as key, c.name as label, l.currency,
           case when p_at_close and l.prev_close > 0 then l.prev_close else f.price end as start_value,
           l.price as end_value,
           case when p_at_close and l.prev_close > 0 then null else f.as_of end as start_as_of,
           l.as_of, 'quote'::text as value_kind
    from q f
    join q l on l.ticker = f.ticker and l.last_n = 1
    join public.companies c on c.ticker = f.ticker
    where f.first_n = 1 and (f.as_of < l.as_of or (p_at_close and l.prev_close > 0))
  ),
  v as (
    select v.person_id, v.kind, v.as_of, v.net_worth_usd,
           row_number() over (partition by v.person_id, v.kind order by v.as_of) as first_n,
           row_number() over (partition by v.person_id, v.kind order by v.as_of desc) as last_n
    from public.net_worth_values v, win
    where v.as_of >= win.t_start and v.as_of <= win.t_end
  ),
  pe as (
    select distinct on (p.id)
           'person'::text as kind, p.slug as key, p.name as label, 'USD'::text as currency,
           f.net_worth_usd as start_value, l.net_worth_usd as end_value,
           f.as_of as start_as_of, l.as_of, f.kind as value_kind
    from v f
    join v l on l.person_id = f.person_id and l.kind = f.kind and l.last_n = 1
    join public.people p on p.id = f.person_id
    where f.first_n = 1 and f.as_of < l.as_of
    order by p.id, (f.kind = 'computed') desc
  )
  select kind, key, label, currency, start_value, end_value,
         end_value - start_value as change,
         case when start_value > 0 then (end_value - start_value) / start_value * 100 end as change_pct,
         start_as_of, as_of, value_kind
  from (select * from co union all select * from pe) m;
$$;

revoke execute on function public.ticker_moves(int, boolean) from public;
grant execute on function public.ticker_moves(int, boolean) to anon, authenticated;

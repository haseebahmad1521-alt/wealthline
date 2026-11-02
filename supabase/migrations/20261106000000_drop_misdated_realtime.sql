-- refresh.ts `finance` stored each Forbes profile's real-time list entry (year 0) as an estimate dated 1993-01-01:
-- today's value placed 33 years back, which drew a false all-time chart start and a false "since" baseline.
-- The writer now skips those entries; this removes the 300 rows it wrote (Nov 2, 2026 count). Today's values stay,
-- recorded by marketTick as 'computed' with their real timestamps.
delete from public.net_worth_values
where kind = 'estimate'
  and as_of = '1993-01-01 00:00:00+00'
  and source_label in ('Forbes Real-Time Billionaires 0', 'Forbes RTRL 0');

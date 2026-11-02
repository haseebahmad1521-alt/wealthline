-- "Lately" line interest queue (owner, Nov 4, 2026). When a Pro or Premium member opens a profile, the `status`
-- function records the interest here: the hourly run writes those people's lines first, they count as popular (the
-- longer, last-24-hours line), and their X fetch (`person_recent.next_due`) is moved to now. Premium may also get a
-- line written on the spot when the shared budget allows. Written only by the service role. Additive only.

create table public.status_requests (
  person_id uuid primary key references public.people (id) on delete cascade,
  requested_at timestamptz not null default now(),
  requests int not null default 1 -- running count, a rough popularity signal
);

alter table public.status_requests enable row level security;
-- No client policies: only the service role (the `status` function) reads and writes it.

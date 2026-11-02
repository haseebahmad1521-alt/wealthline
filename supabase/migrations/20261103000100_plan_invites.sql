-- Owner, Nov 3, 2026: give a plan to an email that hasn't signed up yet. Additive only.
-- admin_set_plan stores an invite when no account has that email (returns null instead of false); the invite
-- becomes an entitlement the moment that email signs up, then is removed.

create table public.plan_invites (
  email text primary key check (email = lower(trim(email))),
  plan text not null check (plan in ('pro', 'premium')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.plan_invites enable row level security;
create policy "admin invites" on public.plan_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.plan_invites to authenticated;

create function public.claim_plan_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.plan_invites;
begin
  delete from public.plan_invites where email = lower(trim(new.email)) returning * into inv;
  if inv.email is not null then
    insert into public.entitlements (user_id, plan, source) values (new.id, inv.plan, 'admin')
    on conflict (user_id) do update set plan = excluded.plan, source = 'admin', expires_at = null, updated_at = now();
  end if;
  return new;
end $$;
revoke execute on function public.claim_plan_invite() from public, anon, authenticated;

create trigger claim_plan_invite after insert on auth.users
  for each row when (new.email is not null) execute function public.claim_plan_invite();

-- Same signature as before; null now means "no account yet, invite saved" (removing a plan clears any invite).
create or replace function public.admin_set_plan(p_email text, p_plan text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  addr text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = addr;
  if uid is null then
    if p_plan is null then
      delete from public.plan_invites where email = addr;
      return false;
    end if;
    insert into public.plan_invites (email, plan, created_by) values (addr, p_plan, auth.uid())
    on conflict (email) do update set plan = excluded.plan, created_by = excluded.created_by, created_at = now();
    return null;
  end if;
  if p_plan is null then
    delete from public.entitlements where user_id = uid;
  else
    insert into public.entitlements (user_id, plan, source) values (uid, p_plan, 'admin')
    on conflict (user_id) do update set plan = excluded.plan, source = 'admin', expires_at = null, updated_at = now();
  end if;
  return true;
end $$;

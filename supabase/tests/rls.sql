-- Private-data isolation check. Runs as one DO block that always ends in an exception, so every fixture row is
-- rolled back. Needs at least one real user and person. Run:
--   npx supabase db query --linked --project-ref <ref> -f supabase/tests/rls.sql
-- Expect: A sees own rows only, B sees none of A's, unverified sessions and anon see 0, every cross-user write 42501.
do $$
declare
  a uuid := (select id from auth.users limit 1);
  b uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid(); sx uuid := gen_random_uuid();
  p uuid := (select id from public.people limit 1);
  r text[] := '{}'; n int;
begin
  -- Fixture (rolled back at the end): second user B, verified sessions for A and B, one watchlist row and view each.
  insert into auth.users (id, aud, role, email) values (b, 'authenticated', 'authenticated', 'rls-test-b@example.invalid');
  insert into public.verified_sessions values (sa, a, now()), (sb, b, now());
  insert into public.watchlist (user_id, person_id) values (a, p), (b, p) on conflict do nothing;
  insert into public.saved_views (user_id, name, target) values (a, 'A view', 'people'), (b, 'B view', 'people');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'session_id', sa, 'role', 'authenticated')::text, true);
  select count(*) into n from public.watchlist; r := r || ('A verified sees watchlist rows: ' || n);
  select count(*) into n from public.saved_views; r := r || ('A verified sees saved views: ' || n);
  select count(*) into n from public.watchlist where user_id = b; r := r || ('A sees B watchlist rows: ' || n);
  begin insert into public.watchlist (user_id, person_id) values (b, p); r := r || 'A wrote B row: YES (BAD)'::text;
  exception when others then r := r || ('A write as B blocked: ' || sqlstate); end;
  begin update public.people set bio = bio where id = p; get diagnostics n = row_count; r := r || ('A (non-admin) updated people rows: ' || n);
  exception when others then r := r || ('A people write blocked: ' || sqlstate); end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'session_id', sx, 'role', 'authenticated')::text, true);
  select count(*) into n from public.watchlist; r := r || ('A unverified session sees watchlist rows: ' || n);
  begin insert into public.saved_views (user_id, name, target) values (a, 'x', 'people'); r := r || 'A unverified wrote: YES (BAD)'::text;
  exception when others then r := r || ('A unverified write blocked: ' || sqlstate); end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'session_id', sb, 'role', 'authenticated')::text, true);
  select count(*) into n from public.watchlist; r := r || ('B verified sees watchlist rows: ' || n);
  select count(*) into n from public.saved_views where user_id = a; r := r || ('B sees A saved views: ' || n);
  begin select count(*) into n from public.verified_sessions; r := r || ('B reads verified_sessions: ' || n);
  exception when others then r := r || ('B verified_sessions read blocked: ' || sqlstate); end;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from public.watchlist; r := r || ('anon sees watchlist rows: ' || n);
  exception when others then r := r || ('anon watchlist blocked: ' || sqlstate); end;
  select count(*) into n from public.people; r := r || ('anon sees people: ' || n);

  raise exception 'RESULTS (rolled back): %', array_to_string(r, ' | ');
end $$;

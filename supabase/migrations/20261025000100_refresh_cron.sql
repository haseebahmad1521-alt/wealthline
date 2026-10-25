-- Every 10 minutes, ask refresh-due to run whatever is due. The secret lives in Vault (name 'cron_secret') and in
-- the function's CRON_SECRET; set both once with the same value (see supabase/README.md), never in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-due',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/refresh-due',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

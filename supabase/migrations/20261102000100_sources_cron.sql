-- Hourly, ask sources to gather own-words passages for the next person (it picks one by the hour). Same Vault
-- 'cron_secret' as refresh-due (see 20261025000100_refresh_cron.sql); the secret never lives in this file.
select cron.schedule(
  'sources',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/sources',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

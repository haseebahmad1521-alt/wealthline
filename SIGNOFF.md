# Owner sign-off: World simulations

Branch `world-simulations`, [PR #5](https://github.com/haseebahmad1521-alt/wealthline/pull/5). Written Nov 16, 2026.

The app side is finished and works on its own with three built-in examples. The backend parts are written but **not
deployed**, because the Supabase account used during development has no access to the Wealthline project. Only the
owner (or an account the owner invites) can do the steps below.

## What you're approving

What if on the World tab becomes a simulation that plays on the globe like a short film. You can type a question or
pick a scenario. The camera follows each event, and countries shade red or green. Small notifications describe what is
happening, and an end card shows the result. Grok writes the stories; every dollar figure is calculated from recorded
data (revenue by place, GDP, recorded share counts) and is shown dashed with "≈" as a projection.

- **Grok's role:** each day it writes 5 scenarios from the news, ranked likely → unlikely. Anyone can also type a
  question, without signing in.
- **Typed questions:** each new question is answered once and then cached. New questions stop after 40 an hour, or
  once 45% of the monthly xAI ceiling (`XAI_MONTHLY_USD`, default $20) is spent overall.
- **Estimated cost:** about $0.15 a day for the daily set, plus a few cents per new question or Grok-written match.
- **Also in this PR (work without the backend):**
  - **Versus:** two rivals fight it out (price war, market grab, talent war), with a scoreboard and a winner card.
  - **Dials:** a sandbox with sliders for oil, AI, China trade, the US economy and luxury, plus a plain-language
    summary.
  - **Guessing:** a question before each scenario, with points, a streak and a daily challenge (kept on the device).
  - **Share links** that reopen a result.
  - **"…and then?":** follow-ups that carry a scenario on for another year.
  - **"You":** what a scenario does to what you own (kept on the device).
  - **Metallic gold, silver and bronze** for ranks 1–3 on every page.
- **Needs the backend:** Grok-written scenarios and matches, typed questions, and "Most asked this week" (from how
  often each stored question is asked).

## Steps, in order

Run these from the repository, logged in to the Supabase CLI with an account that can manage the Wealthline project.

1. **Apply the migration.** It is additive only. It adds:
   - `countries.region`, `companies.sector` and `companies.sector_source`;
   - the public-read `world_scenarios` table (with story `beats`, the `versus` pair and an `asks` count);
   - a daily `scenarios` cron at 07:05 UTC.
   - `company_factors` and `factor_model` (public read) for the measured sensitivities, and a weekly `factors` cron
     (Sundays 05:20 UTC) that refits them from Yahoo Finance prices.

   ```bash
   npx supabase@latest db query --remote=qucpeyrbzyfqtmxhmezr --yes --file supabase/migrations/20261116000000_world_scenarios.sql
   ```

2. **Deploy the two functions.** `world` now also saves regions and sectors and refits the factor model weekly
   (`?job=factors`); `scenarios` is new.

   ```bash
   npx supabase@latest functions deploy world scenarios --project-ref qucpeyrbzyfqtmxhmezr --use-api --yes
   ```

3. **Check the secrets.** `scenarios` uses the existing `XAI_API_KEY` and `CRON_SECRET`, so nothing new is needed if the
   other Grok features already work. Without `XAI_API_KEY` the function does nothing, and the app keeps the built-in
   examples.

4. **Optional: run the first time now** instead of waiting for the daily jobs. Run this in the SQL editor:

   ```sql
   -- Regions and sectors (the facts job), then today's scenarios.
   select net.http_post(
     url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=facts',
     headers := jsonb_build_object('content-type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
     body := '{}'::jsonb, timeout_milliseconds := 150000);
   select net.http_post(
     url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/scenarios',
     headers := jsonb_build_object('content-type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
     body := '{}'::jsonb, timeout_milliseconds := 150000);
   ```

   Optionally refit the factor model now too (otherwise it runs on Sunday; the app ships a recent copy meanwhile):

   ```sql
   select net.http_post(
     url := 'https://qucpeyrbzyfqtmxhmezr.supabase.co/functions/v1/world?job=factors',
     headers := jsonb_build_object('content-type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
     body := '{}'::jsonb, timeout_milliseconds := 150000);
   ```

5. **Check that it worked:**
   - `select origin, title, plausibility, months from world_scenarios order by created_at desc limit 5;` shows today's
     scenarios.
   - `select count(*) from companies where sector is not null;` is around 80.

6. **Merge PR #5.** GitHub Pages deploys about 2 minutes later.

## If you'd rather not run it yourself

Invite the developer's Supabase account to the Wealthline organisation (Dashboard → Organization → Team) with a role
that can run SQL and deploy functions. They can then do steps 1–5.

## Recorded share counts (recommended)

`supabase/import/ownership.sql` (generated Nov 1 from SEC Form 4 and Schedule 13G/13D filings) has 23 share counts,
but the database holds only 6 of them. The app already uses the substantial ones from a copy
(`src/data/stakes.json`); applying the file puts them in the database properly:

```bash
npx supabase@latest db query --remote=qucpeyrbzyfqtmxhmezr --yes --file supabase/import/ownership.sql
```

Three look partial (one share class or one trust only): the Atlassian founders (275,940 shares each), a Palantir
holder (53,487) and Workday's founder (105,049). Worth a look before applying; the app leaves them out.

## Operating margins (recommended)

The simulations now pass revenue changes through profit (operating leverage, damped). Margins come from Wikidata for
30 companies today; the `world` function's SEC job reads them from each company's latest 10-K once this additive
migration is applied and the function redeployed:

```bash
npx supabase@latest db query --remote=qucpeyrbzyfqtmxhmezr --yes --file supabase/migrations/20261117000000_company_margins.sql
```

## People's own words (with the next function deploy)

The daily briefing can now show what tracked people said publicly about a storyline. Grok proposes quotes from its own
search; the `scenarios` function keeps one only if those exact words are on the cited page (X posts via X's embed),
near the person's name. Apply the additive column, then redeploy `scenarios`:

```bash
npx supabase@latest db query --remote=qucpeyrbzyfqtmxhmezr --yes --file supabase/migrations/20261117000100_scenario_statements.sql
```

## For the lobbying ties (optional)

The briefing's "Documented ties" use public US government contracts today. To add lobbying filings (who lobbied on
sanctions, defence or trade), register for a free API key with the Senate's Lobbying Disclosure Act system
(lda.senate.gov). Their API refuses automated requests without one. Then store it as a backend secret:
`npx supabase secrets set LDA_API_KEY=<key> --project-ref qucpeyrbzyfqtmxhmezr`.

## Two data records to look at (separate from this PR)

- **Andreas von Bechtolsheim** is linked to "Google" (Google LLC, from his Forbes source of wealth), so the World tab
  shows Google as a second company next to Alphabet. A one-row fix points him at Alphabet:

  ```sql
  update person_companies set company_id = 'a9622606-a68d-46ef-8a5b-ca9846583bd3'
  where company_id = '7d718d1d-228f-4f78-84c8-c6c960ad1e10' and relation = 'source';
  ```

- **Larry Ellison → Tesla** comes from Tesla's Wikidata entry ("owned by"). He bought Tesla shares in 2018 and sat on
  its board, so the link stays unless you know otherwise.

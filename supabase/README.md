# Wealthline backend setup

## Database

Apply `migrations/` in order (`npx supabase db push`). `20261024000100_device_auth.sql` makes private data
(watchlists, admin writes) require a *device-verified* session: the session id must exist in
`public.verified_sessions`, which only the Edge Functions (service role) can write. A bare password or
email-OTP session from the public API therefore cannot read or write private data.

## Auth settings as code

`supabase/config.toml` holds the auth settings (site URL, redirect allowlist, email confirmation, 12-char password
with all character classes, 6-digit codes valid 10 minutes). Push with
`npx supabase config push --project-ref <ref>` (preview with `config diff`). Branded templates are commented out:
the free tier rejects template changes until a custom SMTP sender is configured.

## Dashboard settings (Authentication)

- **Providers > Email**: Confirm email ON. Minimum password length 12; required characters: lowercase, uppercase,
  digits, symbols. (The app checks the same rules client-side in `src/lib/password-rules.ts`: 12+ chars, upper,
  lower, digit, symbol. Keep the two in sync.)
- **Email OTP**: length 6, expiry 600 seconds or less.
- **URL Configuration**: Site URL `https://haseebahmad1521-alt.github.io/wealthline/`. Redirect allowlist:
  - `https://haseebahmad1521-alt.github.io/wealthline/**`
  - `wealthline://**`
  - `exp://**` (Expo Go development)
- **SMTP**: the built-in sender is for testing only and heavily rate limited. Configure a custom SMTP sender
  (Authentication > SMTP Settings) before real users sign up.

## Email templates (Authentication > Email Templates)

Paste the HTML from `supabase/templates/`:

| Dashboard template | File | Notes |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Uses `{{ .ConfirmationURL }}` |
| Magic Link | `magic-link.html` | Used for the sign-in code (`signInWithOtp`); shows `{{ .Token }}` |
| Reset Password | `reset-password.html` | Uses `{{ .ConfirmationURL }}` |

## Edge Functions

```
npx supabase functions deploy sign-in
npx supabase functions deploy verify-device
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.
The service-role key never goes in the app. Both functions must be reachable without a user JWT (the caller is
not signed in yet); the default JWT check accepts the publishable/anon key the client sends.

Flow: `sign-in` checks the password; on a trusted device (token hash match, 90 days) it records the session
as verified, otherwise it revokes the password session and emails a 6-digit code. `verify-device` allows 5
attempts per 10-minute challenge, verifies the code, records the new session, and issues a device token. The same email's link also works
(the only option with the built-in sender, which can't show the code): opened on the device holding the live
challenge, `activate` accepts the link session (amr `otp`/`magiclink`, ≤15 min), removes the challenge and trusts the device.
Sign-in and sign-up are one form with one "Confirm" button: when the password doesn't match, `sign-in` calls `signUp`
server side and answers `{check_email: true}` either way (Auth sends a confirmed email nothing and a new one its
activation link), so the form never reveals whether an account exists. Only `weak_password` (checked before the
email lookup) and rate limits get their own messages.

## Designating an admin

```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

## AI features (Grok / xAI)

All model calls go to xAI's Responses API through `functions/_shared/xai.ts` (owner decision, Nov 2026: Grok replaces
Anthropic everywhere). One monthly ceiling covers them all (`XAI_MONTHLY_USD`, default $20, tracked in `xai_spend`):
chat may use all of it, background jobs stop at 70%. Callers: `chat` (Pro `grok-4.3`, Premium `grok-4.7`), `status`,
`recent` (X search), `sources` (every 6 hours, 2 articles), `daily-brief` and `project-scout` (daily); the background
jobs use `XAI_MODEL` (default `grok-4.3`). Without `XAI_API_KEY` each one does nothing.

Daily brief: once a day `daily-brief` reads public Google News RSS headlines about each tracked person, asks Grok to
pick at most 8 that may affect their wealth and add a short note, and stores the result in `briefs` / `brief_items`.
Grok only returns indexes into the fetched list plus notes; titles, links, outlets and dates are copied from the feed.

1. Run `migrations/20261024000200_briefs.sql` in the SQL Editor.
2. Create an xAI key at console.x.ai (Responses endpoint, the two models above only) and set a spending limit there.
3. Generate a scheduler secret (`openssl rand -hex 32`) and set both secrets yourself:
   `npx supabase secrets set XAI_API_KEY=<key> CRON_SECRET=<secret> --project-ref <ref>`
4. Dashboard → Integrations → Cron → new job, daily (e.g. `0 7 * * *`), type Supabase Edge Function `daily-brief`,
   method POST, header `x-cron-secret: <secret>`.

Never put either secret in `.env` or the app; they live only in Supabase.

## Live refresh (finance, news, social)

`migrations/20261025000000_refresh.sql` + `20261025000100_refresh_cron.sql`, functions `refresh` and `refresh-due`
(shared code in `functions/_shared/refresh.ts`). All sources are keyless and were checked to answer from Supabase's
network on Oct 25, 2026:

| Kind | Sources | Stale on visit / automatic (ranks 1–10) |
| --- | --- | --- |
| finance | Forbes real-time list (today) + Forbes person lists (dated history, back to the 1990s) | 6 h / 12 h |
| news | Google News RSS (503 from Supabase at the moment), GDELT, Hacker News (Algolia), CNBC, MarketWatch, NYT, Guardian, BBC, FT, TechCrunch feeds filtered to items naming the person | 2 h / 8 h |
| social | Bluesky public API; X only with `X_BEARER_TOKEN` (paid X API). Instagram, Facebook, LinkedIn, Threads: profile link only | 10 min / 2 h |

Ranks 11–100 stretch both windows linearly to 2x at rank 100 (`refresh_window`). Each scheduled run gets a random
±30 min offset. `claim_refresh` allows one run per person/kind at a time; `refresh` also caps visit runs at 8 at once.

Scheduler: pg_cron calls `refresh-due` every 10 minutes with header `x-cron-secret`, read from Vault secret
`cron_secret`; the function compares it with its `CRON_SECRET`. To rotate, set both to the same new value:
`npx supabase secrets set CRON_SECRET=<v> --project-ref <ref>` and
`select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<v>');`.
`refresh-due` is deployed with `--no-verify-jwt` (it has no user token; the secret protects it).

Intraday market values (`20261101000100_market_tick.sql`): every `refresh-due` run (10 minutes) also fetches the
Forbes real-time list once and `record_market_values` stores each changed value as kind `computed`, which the live
view, 3-hour chart and labeled projection read. Unchanged re-stamps (closed markets) are skipped; `forbes_rank` is
updated in the same pass. Own share counts × prices remain a later, independent check.

Health and alerts (`20261101000000_refresh_health.sql`): every outside source records its last success and failure in
`source_health` (`required = false` for best-effort sources such as Google News, which are shown but never alert).
`refresh_health()` (public, read-only) reports a problem when the scheduler has not started a refresh for 30 minutes,
a refresh is over an hour late, a refresh ended in an error, or a required source failed 3+ times in a row with no
success for 6 hours. Admin shows it as "System health."; `.github/workflows/health.yml` checks it hourly and fails
(GitHub emails the owner) while it reports a problem. Scheduled workflows run only from the default branch.

Unofficial sources (Forbes JSON, Google News) can change or block without notice; values keep their source label
and link, and a failed run shows as an error state rather than invented data.

## World sandbox data (`20261101000200_world.sql`, function `world`)

Facts behind the planned globe, each row with its source and link; public read, admin write:
`companies` (seeded from holdings; HQ from Wikidata), `company_sites` (headquarters and facilities a company owns or
operates, city-level, Wikidata), `company_regions` (revenue by reported region, from SEC filings; collector pending),
`subsidiaries` (pending), `countries` (World Bank GDP and population), `quotes` + `quote_latest` (observed 5-minute
share prices, Yahoo Finance chart data, kept 30 days), and `scenarios` (saved "what if" inputs, private to their owner
like watchlists, optionally public).

pg_cron: `world-quotes` every 10 minutes (`world?job=quotes`), `world-facts` daily at 03:40 UTC (`world?job=facts`),
both with the Vault `cron_secret`. Deploy with `--no-verify-jwt`. Each source reports to `source_health`.
SEC EDGAR (`20261101000300_edgar.sql`, `functions/world/edgar.ts`): `world-edgar` runs hourly, checks each listed
company's latest 10-K and parses at most two new filings per run: revenue by country/region from the inline XBRL
(only a set of reported lines that adds up to total revenue, so overlapping breakdowns are never summed) and
subsidiaries from Exhibit 21. `company_exposure` gives each line's share of the company's latest-year revenue.
Berkshire doesn't tag revenue by geography, so it has no rows. SEC's fair-access rule needs a contact in the
User-Agent: set it once with `npx supabase secrets set SEC_CONTACT=<email> --project-ref <ref>` (never in the app).

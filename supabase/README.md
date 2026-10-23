# Wealthline backend setup

## Database

Apply `migrations/` in order (`npx supabase db push`). `20261024000100_device_auth.sql` makes private data
(watchlists, admin writes) require a *device-verified* session: the session id must exist in
`public.verified_sessions`, which only the Edge Functions (service role) can write. A bare password or
email-OTP session from the public API therefore cannot read or write private data.

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
attempts per 10-minute challenge, verifies the code, records the new session, and issues a device token.

## Designating an admin

```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

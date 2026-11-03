#!/usr/bin/env bash
# Turns on Google sign-in in Supabase Auth from the clipboard, so the Client ID/secret never pass through chat or the repo.
# Run on the Mac: bash scripts/google-oauth.sh  (prompts), or bash scripts/google-oauth.sh <client-id>  (secret from the clipboard; for `!`)
set -euo pipefail

REF=qucpeyrbzyfqtmxhmezr
API="https://api.supabase.com/v1/projects/$REF/config/auth"

# Reads one value: from the Mac clipboard if it matches, else a hidden paste (works over SSH/remote terminals).
take() { # $1 label, $2 regex
  local v
  read -r -p "Copy the $1 on your laptop, then press Enter here… " _
  v=$(pbpaste | tr -d '[:space:]')
  if [[ ! $v =~ $2 ]]; then
    echo "  The Mac clipboard doesn't hold a $1 (clipboard not shared?). Paste it here instead (hidden):" >&2
    read -r -s v; echo >&2
    v=$(printf %s "$v" | tr -d '[:space:]')
  fi
  [[ $v =~ $2 ]] || { echo "  That isn't a valid $1. Nothing was changed." >&2; exit 1; }
  printf %s "$v"
}

ID_RE='^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$'
SECRET_RE='^GOCSPX-[A-Za-z0-9_-]{20,}$'
if [[ $# -gt 0 ]]; then
  # Non-interactive (Claude Code `!`): the public Client ID as the argument, the secret only from the clipboard.
  id=$1; secret=$(pbpaste | tr -d '[:space:]')
  [[ $id =~ $ID_RE ]] || { echo "That isn't a valid Client ID. Nothing was changed." >&2; exit 1; }
  [[ $secret =~ $SECRET_RE ]] || { echo "The Mac clipboard doesn't hold a Client secret (GOCSPX-…). Copy it and run again. Nothing was changed." >&2; exit 1; }
else
  id=$(take "Client ID" "$ID_RE")
  secret=$(take "Client secret" "$SECRET_RE")
fi
echo "  Client ID: $id"
echo "  Client secret: GOCSPX-…${secret: -4}"
pbcopy </dev/null # clear the Mac clipboard (a shared clipboard clears on the laptop too)

# The token `npx supabase login` keeps in the Keychain.
token=$(security find-generic-password -s "Supabase CLI" -a supabase -w 2>/dev/null) ||
  { echo "No Supabase CLI login found. Run: npx supabase@latest login" >&2; exit 1; }
[[ $token == go-keyring-base64:* ]] && token=$(printf %s "${token#go-keyring-base64:}" | base64 -d)

# Token and secret go through stdin/process substitution, never the command line (visible in `ps`).
body=$(jq -n --arg id "$id" --arg s "$secret" \
  '{external_google_enabled: true, external_google_client_id: $id, external_google_secret: $s}')
code=$(printf %s "$body" | curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$API" \
  -H @<(printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$token") --data @-)
[[ $code == 200 ]] || { echo "Supabase answered HTTP $code. Nothing to undo; check the token and try again." >&2; exit 1; }

on=$(curl -sS "$API" -H @<(printf 'Authorization: Bearer %s\n' "$token") | jq -r .external_google_enabled)
echo "Google sign-in enabled: $on"

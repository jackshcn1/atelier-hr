#!/bin/bash
#
# setup-google-oauth.sh — put the Google sign-in on Vercel.
#
# The invoice upload is made as the restaurant's own Google account, because
# Google gives a service account no Drive storage of its own. That account
# connects once through Google's own sign-in, and the connection is kept as a
# refresh token in the database.
#
# For that, the site needs an OAuth client:
#
#   GOOGLE_OAUTH_CLIENT_ID       the client id
#   GOOGLE_OAUTH_CLIENT_SECRET   the client secret
#   GOOGLE_OAUTH_REDIRECT_URI    where Google sends the person back to
#
# The id and the secret are read from the OAuth client file Google lets you
# download, and handed to Vercel through stdin — so they never appear in a
# command line, in the shell history, or in a screenshot of this terminal.
#
# How to use it
# -------------
#   1. In Google Cloud, create an OAuth client of type **Web application**:
#
#        https://console.cloud.google.com/apis/credentials?project=atelier-hr-drive
#        -> Create credentials -> OAuth client ID -> Application type: Web application
#        -> Authorised redirect URIs:
#             https://atelier-hr-inky.vercel.app/api/google-drive/callback
#
#      The consent screen has to be in **Production** status, with the
#      restaurant's account added as a **test user** — a screen left in
#      *Testing* expires the refresh token after seven days.
#
#   2. Download the client's JSON file and save it as:
#
#        scripts/google-oauth-client.json
#
#      (that path is gitignored, so it will never be committed)
#
#   3. Run this script from the project folder:
#
#        ./scripts/setup-google-oauth.sh
#
set -euo pipefail

CLIENT_FILE="${1:-$(dirname "$0")/google-oauth-client.json}"
PROJECT_URL="${PROJECT_URL:-https://atelier-hr-inky.vercel.app}"
REDIRECT_URI="${GOOGLE_OAUTH_REDIRECT_URI:-$PROJECT_URL/api/google-drive/callback}"

if [ ! -f "$CLIENT_FILE" ]; then
  echo "✗ No OAuth client file at $CLIENT_FILE"
  echo ""
  echo "  Create the client and download its JSON file:"
  echo "    https://console.cloud.google.com/apis/credentials?project=atelier-hr-drive"
  echo "    -> Create credentials -> OAuth client ID -> Application type: Web application"
  echo "  Then save it as scripts/google-oauth-client.json"
  exit 1
fi

# Google writes the client's details under "web" for a web application, and
# under "installed" for a desktop one. Either will do.
read -r CLIENT_ID CLIENT_SECRET < <(python3 -c "
import json,sys
with open(sys.argv[1]) as f: d=json.load(f)
section = d.get('web') or d.get('installed') or d
cid = section.get('client_id','')
secret = section.get('client_secret','')
if not cid or not secret:
    sys.exit('✗ that file does not look like an OAuth client file')
print(cid, secret)
" "$CLIENT_FILE")

if [ -z "${CLIENT_ID:-}" ] || [ -z "${CLIENT_SECRET:-}" ]; then
  echo "✗ Could not read the client id and secret out of $CLIENT_FILE."
  exit 1
fi

echo "✓ Client id : ${CLIENT_ID:0:12}…${CLIENT_ID: -8}"
echo "✓ Redirect  : $REDIRECT_URI"

# The client id and the secret, for production and for the development
# environment. **Not for preview** — a preview build can be made from a fork,
# and the secret must not go there.
for target in production development; do
  printf '%s' "$CLIENT_ID" | vercel env add GOOGLE_OAUTH_CLIENT_ID "$target" --sensitive --force --yes
  printf '%s' "$CLIENT_SECRET" | vercel env add GOOGLE_OAUTH_CLIENT_SECRET "$target" --sensitive --force --yes
done

printf '%s' "$REDIRECT_URI" | vercel env add GOOGLE_OAUTH_REDIRECT_URI production --force --yes

echo "✓ The Google sign-in is on Vercel."
echo ""
echo "Redeploying so the running app picks them up..."
vercel redeploy "$PROJECT_URL" --no-wait

echo ""
echo "✓ Done. Open Settings -> Google Drive and press \"Connect Google Drive\"."

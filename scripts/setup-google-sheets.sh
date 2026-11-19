#!/bin/bash
#
# setup-google-sheets.sh — put the Google service account on Vercel.
#
# The nightly pull reads the accountant's sheet, and the site's expense form
# writes rows into it. Both need the service account:
#
#   variable-pay-feedback-sync@atelier-hr-drive.iam.gserviceaccount.com
#
# It lives in the Cloud project `atelier-hr-drive` — a project of its own, with
# nothing sensitive in it. The Sheets it reads are the accountant's, in the
# restaurant's Drive; the service account only needs access to those.
#
# Two things go onto the Vercel production environment:
#
#   GOOGLE_SERVICE_ACCOUNT_EMAIL  the service account's address
#   GOOGLE_PRIVATE_KEY            the private key, as the PEM content
#
# The key is read from the downloaded Google Cloud key file and handed to
# Vercel through stdin, so it never appears in a command line, in the shell
# history, or in a screenshot of this terminal.
#
# How to use it
# -------------
#   1. Download a new key from Google Cloud:
#
#        https://console.cloud.google.com/iam-admin/serviceaccounts
#        -> project "atelier-hr-drive"
#        -> service account "variable-pay-feedback-sync"
#        -> Keys tab -> Add key -> Create new key -> JSON
#
#      Save the downloaded file as:
#
#        scripts/google-service-account.json
#
#      (that path is gitignored, so it will never be committed)
#
#   2. Share the **"ERP Website Files"** folder in the restaurant's Drive with
#      the service account as an **Editor**:
#
#        (Viewer is enough to read, but the site's expense form writes a row
#         into the sheet, so it needs to be able to write. Sharing the folder
#         covers both sheets, and anything added to it later.)
#
#        the folder's web address:
#        https://drive.google.com/drive/folders/1bNDcGxKqEu5mILcHjqrwLHxnW42Eo2tL
#
#   3. Run this script from the project folder:
#
#        ./scripts/setup-google-sheets.sh
#
set -euo pipefail

KEY_FILE="${1:-$(dirname "$0")/google-service-account.json}"
PROJECT_URL="${PROJECT_URL:-https://atelier-hr-inky.vercel.app}"

if [ ! -f "$KEY_FILE" ]; then
  echo "✗ No key file at $KEY_FILE"
  echo ""
  echo "  Download one from Google Cloud and save it there:"
  echo "    https://console.cloud.google.com/iam-admin/serviceaccounts"
  echo "    -> project \"atelier-hr-drive\""
  echo "    -> \"variable-pay-feedback-sync\" -> Keys -> Add key -> JSON"
  exit 1
fi

EMAIL=$(python3 -c "
import json,sys
with open(sys.argv[1]) as f: d=json.load(f)
print(d.get('client_email',''))
" "$KEY_FILE")

if [ -z "$EMAIL" ]; then
  echo "✗ $KEY_FILE does not look like a Google Cloud key file."
  exit 1
fi

# The private key, with its newlines put back. It is printed to stdout and
# piped straight into `vercel env add`, so it never sits in a command line.
python3 -c "
import json,sys
with open(sys.argv[1]) as f: d=json.load(f)
key = d.get('private_key','')
if not key:
    sys.exit('✗ the key file has no private_key')
sys.stdout.write(key.replace('\\\\n','\n'))
" "$KEY_FILE" > /tmp/.atelier-google-key.pem

if [ ! -s /tmp/.atelier-google-key.pem ]; then
  echo "✗ Could not read the private key out of $KEY_FILE."
  rm -f /tmp/.atelier-google-key.pem
  exit 1
fi

echo "✓ Service account : $EMAIL"
echo "✓ Key file        : $KEY_FILE"

# The service account and the key, for production and for the development
# environment. **Not for preview** — a preview build can be made from a fork,
# and the key must not go there.
for target in production development; do
  printf '%s' "$EMAIL" | vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL "$target" --sensitive --force --yes
  vercel env add GOOGLE_PRIVATE_KEY "$target" --sensitive --force --yes < /tmp/.atelier-google-key.pem
done

# Which sheet to read, and which tab of it.
printf '%s' "${INVOICE_SHEET_SPREADSHEET_ID:-1_25bZSbaJHkKosX7RZ4_LPgQp_NwSvpTXJUFwBLSeig}" \
  | vercel env add INVOICE_SHEET_SPREADSHEET_ID production --force --yes
printf '%s' "${INVOICE_SHEET_NAME:-Form Responses 1}" \
  | vercel env add INVOICE_SHEET_NAME production --force --yes
printf '%s' "${INVOICE_SHEET_RANGE:-A:V}" \
  | vercel env add INVOICE_SHEET_RANGE production --force --yes

rm -f /tmp/.atelier-google-key.pem

echo "✓ The service account and the sheet's settings are on Vercel."
echo ""
echo "Redeploying so the running app picks them up..."
vercel redeploy "$PROJECT_URL" --no-wait

echo ""
echo "✓ Done. The nightly pull will read the sheet from now on."

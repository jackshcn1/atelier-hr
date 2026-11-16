#!/bin/bash
#
# setup-smtp-alerts.sh — turn on the failure emails for the hosted sync.
#
# When the 05:00 sync fails, the app sends an email to
# atelier.trivandrum@gmail.com. This needs two things on the Vercel
# production environment:
#
#   SMTP_USER  the Gmail account that sends the mail
#   SMTP_PASS  a 16-character Google *app password* for that account
#
# The app password is read from a file and handed to Vercel through stdin,
# so it never appears in a command line, in the shell history, or in a
# screenshot of this terminal.
#
# How to use it
# -------------
#   1. Put the app password in a file (one line, no quotes):
#
#        cat > ~/.atelier-smtp-pass
#        (paste the 16 characters, press Enter, then press Ctrl+D)
#        chmod 600 ~/.atelier-smtp-pass
#
#      To get the app password: sign in to
#      https://myaccount.google.com/apppasswords as
#      atelier.trivandrum@gmail.com, choose "Other devices", name it
#      "Atelier Sync" and press Create.
#
#   2. Run this script from the project folder:
#
#        ./scripts/setup-smtp-alerts.sh
#
set -euo pipefail

PASS_FILE="${1:-$HOME/.atelier-smtp-pass}"
SMTP_USER="${SMTP_USER:-atelier.trivandrum@gmail.com}"
PROJECT_URL="${PROJECT_URL:-https://atelier-hr-inky.vercel.app}"

if [ ! -f "$PASS_FILE" ]; then
  echo "✗ No password file at $PASS_FILE"
  echo ""
  echo "  Create it first:"
  echo "    cat > $PASS_FILE"
  echo "    (paste the app password, press Enter, then Ctrl+D)"
  echo "    chmod 600 $PASS_FILE"
  exit 1
fi

PASS=$(tr -d '\r\n\r' < "$PASS_FILE")
if [ -z "$PASS" ]; then
  echo "✗ $PASS_FILE is empty."
  exit 1
fi

echo "✓ Sending account : $SMTP_USER"
echo "✓ Password file   : $PASS_FILE (${#PASS} characters)"

printf '%s' "$SMTP_USER" | vercel env add SMTP_USER production --sensitive --force --yes
printf '%s' "$PASS" | vercel env add SMTP_PASS production --sensitive --force --yes

echo "✓ Both variables are now on Vercel production."
echo ""
echo "Redeploying so the running app picks them up..."
vercel redeploy "$PROJECT_URL" --no-wait

echo ""
echo "✓ Done. The next failed sync will email $SMTP_USER."
echo "  (Check the spam folder if it does not arrive.)"

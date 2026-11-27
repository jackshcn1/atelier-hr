#!/bin/bash
#
# setup-smtp-alerts.sh — turn on the emails the server sends.
#
# Two kinds of mail leave the app:
#
#   the failure mail   when the 05:00 Petpooja sync fails
#   the reminder mail  when a compliance item comes due within 90 days
#
# Both go through Gmail, and both need the same three things on the Vercel
# production environment:
#
#   SMTP_USER          the Gmail account that SENDS the mail
#   SMTP_PASS          a 16-character Google *app password* for that account
#   NOTIFICATION_EMAIL where the mail ARRIVES (optional — the owner gets it
#                      by default)
#
# The sending account and the receiving address are two different things. A
# restaurant may want the mail to come from its own address and land in the
# owner's personal inbox, so both are set separately.
#
# The app password is read from a file and handed to Vercel through stdin,
# so it never appears in a command line, in the shell history, or in a
# screenshot of this terminal.
#
# How to use it
# -------------
#   1. The sending account needs a Google *app password*:
#
#        sign in to https://myaccount.google.com/apppasswords as that account
#        choose "Other devices", name it "Atelier", press Create
#
#      A brand-new Gmail account needs **2-Step Verification switched on
#      first**, and a new app password can take a few minutes to start
#      working.
#
#   2. Put the app password in a file (one line, no quotes):
#
#        cat > ~/.atelier-smtp-pass
#        (paste the 16 characters, press Enter, then press Ctrl+D)
#        chmod 600 ~/.atelier-smtp-pass
#
#   3. Run this script from the project folder:
#
#        SMTP_USER=the-new-address@gmail.com ./scripts/setup-smtp-alerts.sh
#
#      Add NOTIFICATION_EMAIL=where-it-should-land@gmail.com if the mail is
#      to arrive somewhere other than the owner's own inbox.
#
set -euo pipefail

PASS_FILE="${1:-$HOME/.atelier-smtp-pass}"
SMTP_USER="${SMTP_USER:-atelier.trivandrum@gmail.com}"
NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-}"
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

# Google shows an app password as four groups of four — "abcd efgh ijkl mnop" —
# and the spaces are pasted along with it. They are not part of the password,
# so they are stripped with the line endings.
PASS=$(tr -d '\r\n\r \t' < "$PASS_FILE")
if [ -z "$PASS" ]; then
  echo "✗ $PASS_FILE is empty."
  exit 1
fi

echo "✓ Sending account : $SMTP_USER"
echo "✓ Arrives at      : ${NOTIFICATION_EMAIL:-atelier.trivandrum@gmail.com (the default)}"
echo "✓ Password file   : $PASS_FILE (${#PASS} characters)"

printf '%s' "$SMTP_USER" | vercel env add SMTP_USER production --sensitive --force --yes
printf '%s' "$PASS" | vercel env add SMTP_PASS production --sensitive --force --yes

if [ -n "$NOTIFICATION_EMAIL" ]; then
  printf '%s' "$NOTIFICATION_EMAIL" | vercel env add NOTIFICATION_EMAIL production --sensitive --force --yes
  echo "✓ The receiving address is set too."
fi

echo "✓ The mail settings are now on Vercel production."
echo ""
echo "Redeploying so the running app picks them up..."
vercel redeploy "$PROJECT_URL" --no-wait

echo ""
echo "✓ Done. The next failed sync — and the next compliance reminder —"
echo "  will be sent by $SMTP_USER."
echo "  (Check the spam folder if it does not arrive.)"

#!/bin/bash
#
# setup-ratings-schedule.sh — put the platform ratings pull on a schedule.
#
# ## What this schedules
#
# `scripts/sync-platform-ratings.mjs` reads the rating each of our four
# listings publishes — Zomato, Swiggy — Atelier, Swiggy — Ambrosia and
# Google — and writes it into `platform_listings`, which is what the Reviews
# page shows. Today it only runs when somebody remembers to type it.
#
# This installs a macOS **launchd** job that runs it every morning at 05:00,
# the same hour the books are pulled from Petpooja.
#
# ## Why it runs here and not in the cloud
#
# The other nightly sync runs on Vercel, because Petpooja's edge turns away
# datacenter IP addresses. This one cannot go there, for a different reason:
#
#   **Swiggy refuses a plain fetch and refuses headless Chrome.** It answers
#   a bot with "Access to www.swiggy.com was denied". The scraper needs a
#   real, *headed* Chrome, and Vercel's Chromium is a headless *shell* build
#   that cannot run headed at all.
#
# So the ratings pull needs a machine with a screen. That is this one. Zomato
# (a plain fetch) and Google (one HTTPS call with an API key) would both be
# happy in the cloud — but they are read in the same run, so that the four
# numbers on the page always come from one moment, and the run stays in one
# place.
#
# ## What it needs
#
#   - the project folder (found from this script's own location)
#   - node on the PATH
#   - `.env.local` in the project folder, which the script reads itself. It
#     holds the Supabase credentials, and it is where `GOOGLE_PLACES_API_KEY`
#     goes. Nothing secret is written into the job.
#
# ## How to use it
#
#   bash scripts/setup-ratings-schedule.sh
#
# To run it once, right now, without waiting for the morning:
#
#   launchctl kickstart -k gui/$(id -u)/com.atelier.platform-ratings
#
# To see what it wrote, and whether the last run worked:
#
#   tail -f ~/Library/Logs/Atelier/platform-ratings.log
#
# To take it off again:
#
#   launchctl bootout gui/$(id -u)/com.atelier.platform-ratings
#   rm ~/Library/LaunchAgents/com.atelier.platform-ratings.plist
#
set -euo pipefail

LABEL="com.atelier.platform-ratings"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$PROJECT_DIR/scripts/sync-platform-ratings.mjs"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/Atelier"
LOG="$LOG_DIR/platform-ratings.log"

# --- The node to run it with -------------------------------------------------
#
# launchd does not read the shell's PATH, and it does not read a login
# shell's PATH either, so node has to be found here and written into the job
# by absolute path.
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "❌ node is not on the PATH. Install Node.js and run this again."
  exit 1
fi

if [ ! -f "$SCRIPT" ]; then
  echo "❌ $SCRIPT is not there. Run this from inside the project folder."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  echo "❌ $PROJECT_DIR/.env.local is not there."
  echo "   The script reads the database credentials from it."
  exit 1
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"

# --- Write the job ----------------------------------------------------------
#
# StartCalendarInterval is what makes it a daily job. If the machine is asleep
# at 05:00, launchd runs it when it next wakes — so a closed laptop does not
# silently skip the morning.
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>$NODE</string>
        <string>$SCRIPT</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>5</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <!-- Not on login: the job is for 05:00, and a login would only run it
         at an odd hour. -->
    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>$LOG</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/platform-ratings.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLIST_EOF

# --- Load it ----------------------------------------------------------------
#
# bootout first, so that running this a second time replaces the old job
# rather than failing because one is already loaded.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo ""
echo "✓ The platform ratings are now pulled every morning at 05:00."
echo ""
echo "  Job       $LABEL"
echo "  Project   $PROJECT_DIR"
echo "  Node      $NODE"
echo "  Log       $LOG"
echo ""
echo "  Run it once now, without waiting for the morning:"
echo "    launchctl kickstart -k gui/\$(id -u)/$LABEL"
echo ""
echo "  Watch the log:"
echo "    tail -f $LOG"
echo ""
echo "  Take it off again:"
echo "    launchctl bootout gui/\$(id -u)/$LABEL"
echo "    rm $PLIST"
echo ""

# Did it really load? A job that failed to load would look fine in this
# output and then never run, so it is checked rather than assumed.
if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "✓ The job is loaded."
else
  echo "❌ The job did not load. launchctl says:"
  launchctl print "gui/$(id -u)/$LABEL" 2>&1 | head -20
  exit 1
fi

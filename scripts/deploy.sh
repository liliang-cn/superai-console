#!/usr/bin/env bash
# Build the console and put it on the apps VM.
#
#   ./scripts/deploy.sh          build, upload, reload, verify
#   ./scripts/deploy.sh --check  report what is deployed vs. what is here
#
# The console is static files and nothing else. What makes it work is the Caddy
# block beside them: it serves this bundle and proxies /api on the same origin
# to the app on loopback. Same origin is not a detail — the page authenticates
# with a session cookie, and EventSource cannot send a header, so a cross-origin
# console could neither sign in nor open the stream.
#
# Nothing here injects a credential. The dev proxy can hold a bearer token
# because it is a socket on one laptop; this hostname is on the public
# internet, and a proxy that signs every caller in is a shell-capable agent
# with no door. The password and the cookie are the door.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${CONSOLE_DEPLOY_HOST:-ops@192.168.123.65}"
REMOTE="${CONSOLE_REMOTE_DIR:-/opt/superai-console}"
# The port Caddy serves the console on, behind the entry at console.superleo.cn.
PORT="${CONSOLE_PORT:-43926}"
HEALTH="http://192.168.123.65:${PORT}/"

say() { printf '\n=== %s ===\n' "$1"; }

if [ "${1:-deploy}" = "--check" ]; then
  say "local"
  git log -1 --format='%h %ad %s' --date=iso-local
  [ -n "$(git status --porcelain)" ] && echo "(working tree has uncommitted changes)"
  say "deployed"
  ssh "$HOST" "stat -c '%y' $REMOTE/dist/index.html 2>/dev/null | cut -d. -f1 || echo 'nothing deployed'"
  curl -s -o /dev/null -w "GET $HEALTH -> %{http_code}\n" --max-time 10 "$HEALTH" || true
  exit 0
fi

say "build"
npm run build

say "upload"
# Into a staging directory and then renamed: a browser that loads index.html
# mid-copy would ask for a chunk that is not there yet, and the failure looks
# like a broken build rather than a half-finished one.
ssh "$HOST" "mkdir -p $REMOTE"
rsync -a --delete dist/ "$HOST:$REMOTE/dist.new/"
ssh "$HOST" "rm -rf $REMOTE/dist.prev && { [ -d $REMOTE/dist ] && mv $REMOTE/dist $REMOTE/dist.prev || true; } && mv $REMOTE/dist.new $REMOTE/dist"

say "verify"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH" || echo 000)
echo "GET $HEALTH -> $code"
[ "$code" = "200" ] || { echo "the console did not answer; is the Caddy block for :$PORT in place?"; exit 1; }

# The bundle is useless without the API on the same origin, and that is a Caddy
# question rather than a build one — so it is checked here rather than assumed.
api=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH}api/session" || echo 000)
echo "GET ${HEALTH}api/session -> $api"
[ "$api" = "200" ] || { echo "/api is not proxied on this origin; the console cannot sign in"; exit 1; }

echo
echo "deployed $(git log -1 --format='%h %s')"

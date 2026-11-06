#!/usr/bin/env bash
# Start local dev: applies D1 migrations to .wrangler/state, then Vite at http://localhost:5173.
# wrangler needs Node 22+; use a newer Node from Homebrew/nvm if the default one is older.
set -euo pipefail
cd "$(dirname "$0")"

major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(major)" -lt 22 ]; then
  for d in /opt/homebrew/opt/node/bin /usr/local/opt/node/bin; do
    [ -x "$d/node" ] && PATH="$d:$PATH" && break
  done
fi
[ "$(major)" -ge 22 ] || { echo "Need Node 22+ (have $(node -v)). Install it: brew install node" >&2; exit 1; }

npm install --silent --no-audit --no-fund
exec npm run local

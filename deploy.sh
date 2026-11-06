#!/usr/bin/env bash
# Manual deploy: checks, then applies remote D1 migrations, builds and deploys the Worker (npm run deploy).
# Needs `npx wrangler login` or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID. Pushes to main also deploy via CI.
set -euo pipefail
cd "$(dirname "$0")"

major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(major)" -lt 22 ]; then
  for d in /opt/homebrew/opt/node/bin /usr/local/opt/node/bin; do
    [ -x "$d/node" ] && PATH="$d:$PATH" && break
  done
fi
[ "$(major)" -ge 22 ] || { echo "Need Node 22+ (have $(node -v)). Install it: brew install node" >&2; exit 1; }

npm ci --silent --no-audit --no-fund
npx tsc --noEmit -p .
npm test
read -r -p "Deploy to PRODUCTION (applies remote D1 migrations)? [y/N] " ok
[ "$ok" = "y" ] || { echo "Cancelled."; exit 1; }
npm run deploy

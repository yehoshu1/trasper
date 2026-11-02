#!/bin/sh
# Development container entrypoint.
#
# Installs dependencies only when package-lock.json changes, then applies
# migrations, seeds an empty database and starts the hot-reload dev server.
set -eu

cd /app

lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -f node_modules/.dev-lock-hash ] ||
  [ "$(cat node_modules/.dev-lock-hash)" != "$lock_hash" ]; then
  echo "package-lock.json changed; installing dependencies..."
  npm ci
  echo "$lock_hash" >node_modules/.dev-lock-hash
fi

npx prisma generate
npx prisma migrate deploy
node scripts/seed.mjs

exec npm run dev -- --hostname 0.0.0.0

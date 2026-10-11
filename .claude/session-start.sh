#!/usr/bin/env bash
# Prepares a cloud session: Postgres + Redis, deps, migrations, test DB.
set -e
command -v pg_isready >/dev/null && service postgresql start >/dev/null 2>&1 || true
command -v redis-server >/dev/null && (redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes) || true
if command -v psql >/dev/null; then
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='cyberquest'\"" 2>/dev/null | grep -q 1 || \
    su postgres -c "psql -c \"CREATE ROLE cyberquest LOGIN PASSWORD 'cyberquest_dev' CREATEDB;\"" 2>/dev/null || true
  for d in cyberquest cyberquest_test; do
    su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$d'\"" 2>/dev/null | grep -q 1 || \
      su postgres -c "psql -c \"CREATE DATABASE $d OWNER cyberquest;\"" 2>/dev/null || true
  done
fi
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
[ -d node_modules ] || npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1 || true
npx prisma generate >/dev/null 2>&1 || true
npx prisma migrate deploy >/dev/null 2>&1 || true
echo "CyberQuest dev environment ready (db: cyberquest, test: cyberquest_test)."

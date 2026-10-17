#!/usr/bin/env bash
set -euo pipefail

LOCAL_DB="postgresql://polaris:polaris@localhost:5440/polaris"

if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
  echo "Error: DIRECT_DATABASE_URL is not set."
  echo "Usage: DIRECT_DATABASE_URL=\"postgres://...\" ./scripts/db-clone-prod.sh"
  exit 1
fi

echo "Dropping and recreating local database..."
psql "$LOCAL_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Cloning prod → local..."
pg_dump "$DIRECT_DATABASE_URL" --no-owner --no-acl | psql "$LOCAL_DB" --quiet

echo "Done. Local database is now a copy of prod."

#!/usr/bin/env bash
# Dumps the Supabase database into an encrypted archive: backup-YYYY-MM-DD.tar.gz.gpg
# Needs: SUPABASE_DB_URL (Session pooler connection string), BACKUP_PASSPHRASE. Optional: OUT_DIR (default .)
set -euo pipefail
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"

STAMP=$(date -u +%Y-%m-%d)
OUT_DIR=${OUT_DIR:-.}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
DIR="$WORK/backup-$STAMP"
mkdir -p "$DIR"

echo "Server: $(psql "$SUPABASE_DB_URL" -tAc 'show server_version')"
echo "pg_dump: $(pg_dump --version)"

# 1. Your app: tables, data, functions, policies and grants
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --format=plain --file="$DIR/1-public.sql"
# A new Supabase project already has the public schema
sed -i 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' "$DIR/1-public.sql"

# 2. Logins (users, identities, two-factor) - data only, the auth tables already exist in any Supabase project
pg_dump "$SUPABASE_DB_URL" --schema=auth --data-only --no-owner \
  --exclude-table=auth.schema_migrations --exclude-table=auth.audit_log_entries \
  --exclude-table=auth.sessions --exclude-table=auth.refresh_tokens --exclude-table=auth.flow_state \
  --file="$DIR/0-auth-data.sql"

# 3. Storage bucket settings and file list (the files themselves are not included)
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --table=storage.buckets --table=storage.objects \
  --file="$DIR/2-storage-data.sql"

# Row counts, to check a restore against
psql "$SUPABASE_DB_URL" -tA -F, -c "
  select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by relname" > "$DIR/row-counts.csv"

tar -C "$WORK" -czf "$WORK/backup-$STAMP.tar.gz" "backup-$STAMP"
gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
  --passphrase "$BACKUP_PASSPHRASE" -o "$OUT_DIR/backup-$STAMP.tar.gz.gpg" "$WORK/backup-$STAMP.tar.gz"

ls -lh "$OUT_DIR/backup-$STAMP.tar.gz.gpg"
for f in "$DIR"/*.sql; do echo "$(basename "$f"): $(wc -c < "$f") bytes"; done

#!/usr/bin/env bash
# Manual database backup (Sprint 7, decision D7). The free Supabase plan has no backups, so this is the only one.
#
#   bash scripts/backup-dump.sh            # dumps the HOSTED database named by DATABASE_URL in .env.local
#   bash scripts/backup-dump.sh --local    # dumps the LOCAL Supabase (for rehearsals; never touches hosted)
#
# Writes three files outside the repository, in ~/TGS-backups (override with BACKUP_DIR):
#   schema-<time>.sql    public schema, for checking drift against supabase/migrations
#   data-<time>.sql      data only, schemas auth and public: the part that is NOT in git
#   manifest-<time>.txt  row counts per table and SHA-256 of both files, to verify a restore
# The files hold personal data and password hashes: mode 600, never commit or email them.
# No connection string is stored anywhere, printed or logged; this script reads it from .env.local only while it runs.
set -euo pipefail
cd "$(dirname "$0")/.."

CLI=./node_modules/.bin/supabase
DIR="${BACKUP_DIR:-$HOME/TGS-backups}"
STAMP="$(date +%Y%m%d-%H%M)"
MODE="hosted"; [ "${1:-}" = "--local" ] && MODE="local"

redact() { sed -E 's#(postgres(ql)?://)[^[:space:]"]+#\1[redacted]#g; s#(password=)[^[:space:]&"]+#\1[redacted]#Ig'; }

command -v docker >/dev/null || { echo "Docker is needed (the Supabase CLI runs pg_dump inside it). Start Docker Desktop."; exit 1; }
[ -x "$CLI" ] || { echo "Run npm install first (the Supabase CLI is in node_modules)."; exit 1; }

if [ "$MODE" = "local" ]; then
  TARGET=(--local)
  echo "Backing up the LOCAL database."
else
  [ -f .env.local ] || { echo ".env.local not found."; exit 1; }
  # Read only the one line, never source the file, never echo it.
  URL="$(grep -E '^DATABASE_URL=' .env.local | head -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
  [ -n "$URL" ] || { echo "DATABASE_URL is not set in .env.local (Supabase dashboard > Connect > Session pooler). Nothing was dumped."; exit 1; }
  case "$URL" in postgres://*|postgresql://*) ;; *) echo "DATABASE_URL is not a postgres:// address. Nothing was dumped."; exit 1;; esac
  case "$URL" in *127.0.0.1*|*localhost*) echo "DATABASE_URL points at a local database; use --local for that."; exit 1;; esac
  TARGET=(--db-url "$URL")
  echo "Backing up the HOSTED database (address not shown)."
fi

umask 077
mkdir -p "$DIR"
SCHEMA="$DIR/schema-$STAMP.sql"; DATA="$DIR/data-$STAMP.sql"; MANIFEST="$DIR/manifest-$STAMP.txt"

# Short-lived or regenerable auth tables are left out: people just sign in again after a restore.
EXCLUDE="auth.sessions,auth.refresh_tokens,auth.audit_log_entries,auth.flow_state,auth.one_time_tokens,auth.mfa_challenges,auth.schema_migrations"

echo "1/3 schema..."
"$CLI" db dump "${TARGET[@]}" -f "$SCHEMA" 2>&1 | redact | grep -vE '^(Dumping|Initialising|Connecting|$)' || true
echo "2/3 data (auth and public)..."
"$CLI" db dump "${TARGET[@]}" --data-only --use-copy -s auth,public -x "$EXCLUDE" -f "$DATA" 2>&1 | redact | grep -vE '^(Dumping|Initialising|Connecting|$)' || true
[ -s "$DATA" ] || { echo "The data dump is empty. Treat this as a FAILED backup."; rm -f "$SCHEMA" "$DATA"; exit 1; }
grep -qE '^COPY "?auth"?\."?users"? ' "$DATA" || { echo "The dump has no auth.users. A dump without auth.users is NOT a backup. Removing it."; rm -f "$SCHEMA" "$DATA"; exit 1; }
grep -qE '^COPY "?public"?\."?profiles"? ' "$DATA" || { echo "The dump has no public.profiles. Removing it."; rm -f "$SCHEMA" "$DATA"; exit 1; }

echo "3/3 manifest..."
COUNTS_SQL="select table_schema || '.' || table_name as t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as rows from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('auth', 'public') order by 1"
{
  echo "TGS backup manifest, $STAMP ($MODE). Row counts at dump time (auth and public base tables)."
  "$CLI" db query "${TARGET[@]}" -o csv "$COUNTS_SQL" 2>&1 | redact | grep -E '^[a-z_]+\.[a-z_0-9]+,' || true
  echo "sha256:"
  shasum -a 256 "$SCHEMA" "$DATA" | sed "s#$DIR/##"
} > "$MANIFEST"
chmod 600 "$SCHEMA" "$DATA" "$MANIFEST"

echo "Done. Files in $DIR:"
ls -l "$SCHEMA" "$DATA" "$MANIFEST" | awk '{print "  " $1 " " $5 " bytes " $NF}' | sed "s#$DIR/##"
echo "users in this backup: $(grep -E '^auth\.users,' "$MANIFEST" | cut -d, -f2)   profiles: $(grep -E '^public\.profiles,' "$MANIFEST" | cut -d, -f2)"
echo "Next: copy the three files somewhere off this laptop, and rehearse a restore (docs/BACKUP_RESTORE.md)."

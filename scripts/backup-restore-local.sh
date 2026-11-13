#!/usr/bin/env bash
# Restores a backup made by scripts/backup-dump.sh into the LOCAL Supabase, then compares row counts with the
# backup's manifest. For rehearsals only: it refuses anything but the local database container.
#
#   ./node_modules/.bin/supabase db reset                      # rebuild an empty database from supabase/migrations
#   bash scripts/backup-restore-local.sh ~/TGS-backups/data-<time>.sql
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${1:?Give the data-<time>.sql file from a backup}"
[ -f "$DATA" ] || { echo "No such file: $DATA"; exit 1; }
MANIFEST="$(dirname "$DATA")/manifest-$(basename "$DATA" | sed -E 's/^data-//; s/\.sql$//').txt"
[ -f "$MANIFEST" ] || { echo "Manifest not found next to the data file ($MANIFEST)"; exit 1; }
CLI=./node_modules/.bin/supabase
C=supabase_db_tgs
docker ps --format '{{.Names}}' | grep -qx "$C" || { echo "The local Supabase database container ($C) is not running. This script only restores locally."; exit 1; }

psqlc() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "1/4 clearing seed rows that the migrations created (auth users and every public table)..."
psqlc -q <<'SQL'
-- audit_log refuses TRUNCATE (append-only). Replica mode skips that trigger for this clean-up only; it is a scratch database.
set session_replication_role = replica;
do $$
declare t text;
begin
  execute 'truncate table auth.users cascade';
  for t in select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public' loop
    execute 'truncate table ' || t || ' cascade';
  end loop;
end $$;
SQL

echo "2/4 loading the data (triggers off for this load only, so rows go in exactly as dumped)..."
{ echo "set session_replication_role = replica;"; cat "$DATA"; } | psqlc -q -1 >/dev/null

echo "3/4 resetting identity counters..."
psqlc -q <<'SQL'
do $$
declare r record;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as seq, format('%I.%I', n.nspname, t.relname) as tbl, a.attname as col
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           join pg_depend d on d.objid = c.oid and d.deptype in ('a','i')
           join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
           where c.relkind = 'S' and n.nspname in ('auth','public') loop
    execute format('select setval(%L, coalesce((select max(%I) from %s), 0) + 1, false)', r.seq, r.col, r.tbl);
  end loop;
end $$;
SQL

echo "4/4 comparing row counts with the manifest..."
COUNTS_SQL="select table_schema || '.' || table_name as t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text as rows from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('auth', 'public') order by 1"
NOW="$(mktemp)"; WAS="$(mktemp)"
"$CLI" db query --local -o csv "$COUNTS_SQL" 2>&1 | grep -E '^[a-z_]+\.[a-z_0-9]+,' | sort > "$NOW"
grep -E '^[a-z_]+\.[a-z_0-9]+,' "$MANIFEST" | sort > "$WAS"
# Tables the dump leaves out on purpose are expected to differ.
SKIP='^auth\.(sessions|refresh_tokens|audit_log_entries|flow_state|one_time_tokens|mfa_challenges|schema_migrations),'
if diff <(grep -vE "$SKIP" "$WAS") <(grep -vE "$SKIP" "$NOW") > /tmp/tgs-restore-diff.txt; then
  echo "ROW COUNTS MATCH for all $(grep -vcE "$SKIP" "$WAS") tables."
else
  echo "ROW COUNTS DIFFER (was < / now >):"; cat /tmp/tgs-restore-diff.txt; rm -f "$NOW" "$WAS"; exit 2
fi
rm -f "$NOW" "$WAS" /tmp/tgs-restore-diff.txt

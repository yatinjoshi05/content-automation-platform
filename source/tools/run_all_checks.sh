#!/usr/bin/env bash
# Rebuild + every OFFLINE check. Needs: python3, node 24, PostgreSQL (psql, a scratch DB), and n8n-nodes-base extracted at /tmp/nb/package (npm pack n8n-nodes-base && tar xzf).
set -e; cd "$(dirname "$0")"
python3 consolidate_sql.py --check
python3 build_all.py >/dev/null && echo "built workflows"
python3 validate.py | tail -2
DB=${CA_TEST_DB:-ca_test}
psql -q -d $DB -c 'drop schema public cascade' -c 'create schema public' >/dev/null 2>&1
psql -v ON_ERROR_STOP=1 -q -d $DB -f ../db/schema.sql 2>&1 | grep -v NOTICE || true
python3 check_sql.py
for t in tests tests_pipeline tests_publish_safety; do echo "== $t: PASS=$(psql -q -d $DB -f ../db/$t.sql | grep -c '^ PASS') FAIL=$(psql -q -d $DB -f ../db/$t.sql | grep -c '^ FAIL')"; done
node test_code_nodes.js | tail -1

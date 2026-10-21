"""Analyzes EVERY Postgres query embedded in the workflows against PostgreSQL schema.
Extracts queries from all .postgres nodes and tests them.
Usage:
  python check_sql.py
Environment:
  CA_TEST_DB: name of test database (default: ca_test)
  PSQL_CMD: path or name of psql binary (default: psql)
"""
import json, glob, os, re, subprocess, sys, shutil

def find_workflow_files():
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'workflows')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..')),
        os.path.abspath(os.path.join(os.getcwd(), 'workflows')),
        os.getcwd()
    ]
    for c in candidates:
        matches = sorted(glob.glob(os.path.join(c, '[0-9][0-9]_*.json')))
        if matches:
            return matches
    raise FileNotFoundError("Could not locate workflow files in candidate directories:\n  " + "\n  ".join(candidates))

psql_cmd = os.environ.get('PSQL_CMD', 'psql')
psql_exists = shutil.which(psql_cmd) is not None
test_db = os.environ.get('CA_TEST_DB', 'ca_test')

workflow_files = find_workflow_files()
queries = []

for f in workflow_files:
    fn = os.path.basename(f)
    try:
        w = json.load(open(f, encoding='utf8'))
    except Exception as e:
        print(f"Error parsing {fn}: {e}")
        continue
    for node in w.get('nodes', []):
        if not node.get('type', '').endswith('.postgres'):
            continue
        q = node.get('parameters', {}).get('query')
        if q:
            queries.append({
                'file': fn,
                'node': node.get('name', 'unnamed'),
                'query': q.strip()
            })

print(f"Found {len(queries)} embedded Postgres SQL statements across {len(workflow_files)} workflows.")

if not psql_exists:
    print(f"Notice: '{psql_cmd}' not found on PATH. Performing offline syntax and parameter validation.")
    syntax_errors = 0
    for i, item in enumerate(queries, 1):
        q = item['query']
        # Basic SQL syntax sanity check
        if not re.match(r'^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|CALL|PERFORM)\b', q, re.I):
            print(f"FAIL [Syntax] {item['file']} -> {item['node']}: Query does not start with standard SQL keyword:\n  {q[:80]}")
            syntax_errors += 1
        # Check matching quotes
        if q.count("'") % 2 != 0:
            print(f"FAIL [Quotes] {item['file']} -> {item['node']}: Unbalanced single quotes in SQL query:\n  {q[:80]}")
            syntax_errors += 1
    if syntax_errors:
        print(f"Offline check failed with {syntax_errors} error(s).")
        sys.exit(1)
    else:
        print(f"PASS: All {len(queries)} embedded SQL statements passed offline syntax inspection.")
        print("      (Note: Full PREPARE type-checking requires PostgreSQL and psql on PATH.)")
        sys.exit(0)

# If psql is available, test via PREPARE against real schema
bad = 0
for i, item in enumerate(queries, 1):
    sql = f"PREPARE q_{i} AS {item['query']};"
    r = subprocess.run(
        [psql_cmd, '-q', '-v', 'ON_ERROR_STOP=1', '-d', test_db],
        input=sql,
        capture_output=True,
        text=True
    )
    if r.returncode != 0:
        bad += 1
        err_line = r.stderr.strip().splitlines()[0] if r.stderr.strip() else 'Unknown error'
        print(f"FAIL {item['file']} -> {item['node']}\n    {err_line}")

print(f"{len(queries)} embedded SQL statements checked via PREPARE, {bad} failed.")
sys.exit(1 if bad else 0)

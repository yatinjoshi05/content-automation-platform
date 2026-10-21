#!/usr/bin/env python3
"""Keeps exactly ONE definition per SQL function in schema.sql (the LAST one wins).
Checks both database/schema.sql and source/db/schema.sql.
Usage:
  python consolidate_sql.py [--check] [path/to/schema.sql]
"""
import re, sys, os

def get_target_files():
    if len(sys.argv) > 1 and not sys.argv[1].startswith('--'):
        return [sys.argv[1]]
    if len(sys.argv) > 2 and not sys.argv[2].startswith('--'):
        return [sys.argv[2]]
        
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'schema.sql')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db', 'schema.sql'))
    ]
    found = [c for c in candidates if os.path.isfile(c)]
    if not found:
        raise FileNotFoundError(f"No schema.sql found in candidates:\n  " + "\n  ".join(candidates))
    return found

rx = re.compile(r"CREATE OR REPLACE FUNCTION (\w+)\((.*?)\)\s+RETURNS.*?\$\$ LANGUAGE \w+(?: STABLE)?;\n?", re.S)

check_mode = '--check' in sys.argv
total_dups = 0

for target in get_target_files():
    with open(target, 'r', encoding='utf8') as fh:
        s = fh.read()
        
    defs = [(m.group(1), m.start(), m.end()) for m in rx.finditer(s)]
    last = {}
    for n, a, b in defs:
        last[n] = a
    dups = [(n, a, b) for n, a, b in defs if last[n] != a]
    
    if check_mode:
        dup_names = sorted({n for n, _, _ in dups})
        print(f"[{os.path.relpath(target)}] duplicate function definitions: {dup_names or 'none'} ({len(last)} unique functions)")
        if dups:
            total_dups += len(dups)
    else:
        for n, a, b in sorted(dups, key=lambda x: -x[1]):
            s = s[:a] + s[b:]
        s = re.sub(r"\n{3,}", "\n\n", s)
        with open(target, 'w', encoding='utf8') as fh:
            fh.write(s)
        print(f"[{os.path.relpath(target)}] removed {len(dups)} superseded definitions; unique functions: {len(last)}")

if check_mode and total_dups > 0:
    sys.exit(1)
sys.exit(0)

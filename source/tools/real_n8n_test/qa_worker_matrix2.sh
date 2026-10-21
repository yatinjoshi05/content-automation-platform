#!/bin/bash
Q=localhost:9100; K='x-ca-key: testqa123'; M=http://localhost:9000
t() { printf "%-14s " "$1"; curl -s -m 60 -w " [HTTP %{http_code}]" $Q/qa -H "$K" -d "{\"video_url\":\"$2\",\"min_seconds\":4,\"max_seconds\":60,\"thumb_name\":\"t-$1-002\"}" | python3 -c "
import sys,json,re
raw=sys.stdin.read(); m=re.search(r' \[HTTP (\d+)\]$',raw); d=json.loads(raw[:m.start()])
print('HTTP',m.group(1),'PASS' if d.get('visual_pass') else 'FAIL/ERR', d.get('failures') or d.get('error'))"; }
t frozen $M/clips/bad_frozen.mp4; t toolong $M/clips/bad_long.mp4; t partial $M/partial; t huge_header $M/big; t huge_stream $M/bigstream; t valid $M/clips/good.mp4
echo "temp files left: $(ls /tmp/qa_work2/tmp | wc -l) | active=$(curl -s $Q/health)"

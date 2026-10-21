#!/bin/bash
Q=localhost:9100; K='x-ca-key: testqa123'
t() { printf "%-34s " "$1"; curl -s -m 60 -w " [HTTP %{http_code}]" $Q/qa -H "$K" -d "{\"video_url\":\"$2\",\"min_seconds\":4,\"max_seconds\":60,\"thumb_name\":\"t-$1-001\"}" | python3 -c "
import sys,json,re
raw=sys.stdin.read(); m=re.search(r' \[HTTP (\d+)\]$',raw); body=raw[:m.start()]; d=json.loads(body)
print('HTTP',m.group(1),'PASS' if d.get('visual_pass') else 'FAIL/ERR', d.get('failures') or d.get('error'), 'thumb='+str(d.get('thumbnail',{}).get('ok')))"; }
M=http://localhost:9000
t valid $M/clips/good.mp4; t corrupt $M/clips/bad_corrupt.mp4; t noaudio $M/clips/bad_noaudio.mp4; t silent $M/clips/bad_silent.mp4; t black $M/clips/bad_black.mp4; t frozen $M/clips/bad_frozen.mp4
t wide $M/clips/bad_wide.mp4; t tooshort $M/clips/bad_short.mp4; t toolong $M/clips/bad_long.mp4
t huge_header $M/big; t huge_stream $M/bigstream; t partial $M/partial; t redirect $M/redirect; t ssrf_metadata http://169.254.169.254/x; t file_scheme file:///etc/passwd; t unauthorized_host http://example.com/a.mp4
printf "%-34s " no_api_key; curl -s -m 10 -w " [HTTP %{http_code}]" $Q/qa -d '{"video_url":"http://localhost:9000/clips/good.mp4"}'; echo
printf "%-34s " wrong_api_key; curl -s -m 10 -w " [HTTP %{http_code}]" $Q/qa -H "x-ca-key: nope" -d '{"video_url":"http://localhost:9000/clips/good.mp4"}'; echo
printf "%-34s " bad_json; curl -s -m 10 -w " [HTTP %{http_code}]" $Q/qa -H "$K" -d 'not json'; echo
echo "--- concurrency (QA_CONCURRENCY=1, queue max 4): 7 simultaneous requests"
for i in 1 2 3 4 5 6 7; do (curl -s -m 90 -o /dev/null -w "%{http_code}\n" $Q/qa -H "$K" -d "{\"video_url\":\"$M/clips/good.mp4\",\"min_seconds\":4,\"max_seconds\":60,\"thumb_name\":\"conc-$i-0001\"}" >> /tmp/conc.out) & done; sleep 1; curl -s $Q/health; echo; wait; sort /tmp/conc.out | uniq -c | tr '\n' ' '; echo
echo "--- cleanup: temp files left in work dir: $(ls /tmp/qa_work2/tmp 2>/dev/null | wc -l)"

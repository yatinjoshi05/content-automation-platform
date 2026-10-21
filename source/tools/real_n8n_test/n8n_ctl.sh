#!/bin/bash
# usage: n8n_ctl.sh start|stop|cli <args>
. /tmp/n8nenv.sh; cd /tmp/n8nrun
case "$1" in
 stop) [ -f /tmp/n8n.pid ] && kill $(cat /tmp/n8n.pid) 2>/dev/null; rm -f /tmp/n8n.pid; sleep 3;;
 start) setsid nohup node node_modules/n8n/bin/n8n start > /tmp/n8n_server.log 2>&1 < /dev/null & echo $! > /tmp/n8n.pid
   for i in $(seq 1 40); do curl -s -m 2 localhost:5678/healthz | grep -q ok && break; sleep 3; done; curl -s -m 2 localhost:5678/healthz; echo;;
 cli) shift; node node_modules/n8n/bin/n8n "$@" 2>&1 | grep -vi "migration";;
esac

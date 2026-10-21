#!/bin/bash
# usage: run_deploy.sh <label> <args...>   -> /tmp/deploy_<label>.log
L=$1; shift
export PATH=/tmp/bin:/tmp/node24/node_modules/node/bin:$PATH
cd /home/claude/CONTENT_AUTOMATION && node deployment/deploy.js "$@" --env /tmp/deploy_test.env > /tmp/deploy_$L.log 2>&1; echo "exit=$?" >> /tmp/deploy_$L.log

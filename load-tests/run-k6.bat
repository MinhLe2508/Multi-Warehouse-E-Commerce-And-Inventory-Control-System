@echo off
echo ============================================================
echo  CHAY K6 LOAD TEST TRANH MUA DONG THOI QUA DOCKER (GRAFANA/K6)
echo ============================================================

set BASE_URL=%~1
if "%BASE_URL%"=="" set BASE_URL=http://host.docker.internal:3001

docker run --rm -v "%~dp0:/scripts" -e BASE_URL="%BASE_URL%" grafana/k6 run /scripts/k6-oversell.js


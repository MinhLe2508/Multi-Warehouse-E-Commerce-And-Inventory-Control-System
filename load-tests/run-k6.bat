@echo off
echo ============================================================
echo  CHAY K6 LOAD TEST TRANH MUA DONG THOI QUA DOCKER (GRAFANA/K6)
echo ============================================================

set BASE_URL=%~1
if "%BASE_URL%"=="" set BASE_URL=http://host.docker.internal:3001

docker run --rm -v "%~dp0:/scripts" -e BASE_URL="%BASE_URL%" -e LOAD_TEST_RUN_ID="%LOAD_TEST_RUN_ID%" grafana/k6 run /scripts/k6-oversell.js
if errorlevel 1 (
  echo [FAIL] K6 Load Test that bai voi exit code %errorlevel%
  exit /b %errorlevel%
)


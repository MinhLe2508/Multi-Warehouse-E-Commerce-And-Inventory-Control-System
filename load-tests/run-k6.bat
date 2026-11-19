@echo off
setlocal
echo ============================================================
echo  CHAY K6 LOAD TEST TRANH MUA DONG THOI QUA DOCKER (GRAFANA/K6)
echo ============================================================

if not "%~1"=="" set "BASE_URL=%~1"
if not defined BASE_URL set "BASE_URL=http://host.docker.internal:3001"

set "GIT_COMMIT="
for /f "delims=" %%I in ('git -C "%~dp0." rev-parse HEAD') do set "GIT_COMMIT=%%I"
if not defined GIT_COMMIT exit /b 1

docker run --rm --user 0:0 -v "%~dp0.:/scripts" -w /scripts -e "BASE_URL=%BASE_URL%" -e "GIT_COMMIT=%GIT_COMMIT%" -e "LOAD_TEST_RUN_ID=%LOAD_TEST_RUN_ID%" grafana/k6 run /scripts/k6-oversell.js
if errorlevel 1 (
  echo [FAIL] K6 Load Test that bai voi exit code %errorlevel%
  exit /b %errorlevel%
)


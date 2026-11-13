# Script chạy k6 load test thông qua Docker Container grafana/k6
# Tham số tùy chọn: -VUs 100 -BaseUrl "http://host.docker.internal:3001"

param (
    [string]$BaseUrl = "http://host.docker.internal:3001"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 CHẠY K6 LOAD TEST TRANH MUA ĐỒNG THỜI QUA DOCKER (GRAFANA/K6)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$CurrentDir = (Get-Item -Path $PSScriptRoot).FullName

docker run --rm `
    -v "${CurrentDir}:/scripts" `
    -e BASE_URL="$BaseUrl" `
    grafana/k6 run /scripts/k6-oversell.js


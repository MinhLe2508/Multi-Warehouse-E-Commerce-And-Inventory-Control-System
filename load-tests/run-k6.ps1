# Run k6 in Docker against the local test backend.

param (
    [string]$BaseUrl = $env:BASE_URL,
    [string]$RunId = $env:LOAD_TEST_RUN_ID
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "http://host.docker.internal:3001"
}
$GitCommit = git -C "$PSScriptRoot" rev-parse HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Cannot read the project Git commit."
}

# The fixture is readable by its creator. Match the host account on Unix.
$DockerUser = if ($env:OS -eq "Windows_NT") { "0:0" } else { "$(id -u):$(id -g)" }
$DockerArgs = @(
    "run", "--rm",
    "--user", $DockerUser,
    "-v", "${PSScriptRoot}:/scripts",
    "-w", "/scripts",
    "-e", "BASE_URL=$BaseUrl",
    "-e", "GIT_COMMIT=$GitCommit",
    "-e", "LOAD_TEST_RUN_ID=$RunId",
    "grafana/k6", "run", "/scripts/k6-oversell.js"
)

docker @DockerArgs
$Result = $LASTEXITCODE
if ($Result -ne 0) {
    Write-Warning "k6 exited with status $Result. Run the verifier to read the recorded results."
}
exit $Result


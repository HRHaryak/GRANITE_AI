$ErrorActionPreference = "Stop"

$Root = "C:\Users\hrhar\Project\granitemeasure-ai"
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Patcher = Join-Path $Root "patch-e2e-quarry-fixture.py"

Write-Host "GraniteMeasure AI - E2E quarry fixture fix"
Write-Host ("=" * 72)

if (-not (Test-Path $Python)) {
    throw "Backend venv Python not found: $Python"
}

if (-not (Test-Path $Patcher)) {
    throw "Patcher not found: $Patcher"
}

& $Python $Patcher
if ($LASTEXITCODE -ne 0) {
    throw "E2E quarry patch failed."
}

Set-Location $Backend

Write-Host ""
Write-Host "[1/3] Python syntax check"
& $Python -m py_compile "tests\test_pipeline.py"
if ($LASTEXITCODE -ne 0) {
    throw "test_pipeline.py syntax check failed."
}
Write-Host "[OK] test_pipeline.py compiles"

Write-Host ""
Write-Host "[2/3] Targeted end-to-end test"
& $Python -m pytest "tests\test_pipeline.py::test_full_e2e_workflow" -q
if ($LASTEXITCODE -ne 0) {
    throw "Targeted E2E test still fails. Stop here and use the failure output."
}
Write-Host "[OK] Targeted E2E test passed"

Write-Host ""
Write-Host "[3/3] Full backend test suite"
& $Python -m pytest "tests\" -q
if ($LASTEXITCODE -ne 0) {
    throw "Full backend suite still has a failure. Use the exact output."
}

Write-Host ""
Write-Host "SUCCESS: Full backend test suite passed."

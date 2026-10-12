$ErrorActionPreference = "Stop"

$root = "C:\Users\hrhar\Project\granitemeasure-ai"
$backend = Join-Path $root "backend"
$patcher = Join-Path $root "patch-reconstruction-preview-provenance.py"

Write-Host "GraniteMeasure AI - Fixing reconstruction preview provenance" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $patcher)) {
    throw "Patch file not found: $patcher"
}

Set-Location $backend

& ".\.venv\Scripts\python.exe" $patcher
if ($LASTEXITCODE -ne 0) {
    throw "Reconstruction patch failed."
}

Write-Host ""
Write-Host "Compiling reconstruction.py..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m py_compile "app\ai\providers\reconstruction.py"
if ($LASTEXITCODE -ne 0) {
    throw "Python compile failed."
}
Write-Host "[OK] Python compile" -ForegroundColor Green

Write-Host ""
Write-Host "Running missing-bottom integrity test..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m pytest "tests\test_reconstruction_integrity.py::test_missing_bottom_remains_unobserved" -q
if ($LASTEXITCODE -ne 0) {
    throw "Missing-bottom integrity test still fails."
}

Write-Host ""
Write-Host "[OK] Missing-bottom integrity test passed." -ForegroundColor Green
Write-Host "Next: run the full reconstruction integrity suite." -ForegroundColor Cyan
Write-Host '.\.venv\Scripts\python.exe -m pytest tests\test_reconstruction_integrity.py -q'

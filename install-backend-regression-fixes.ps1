$ErrorActionPreference = "Stop"

$root = "C:\Users\hrhar\Project\granitemeasure-ai"
$backend = Join-Path $root "backend"
$sourceTest = Join-Path $root "test_forensic_reality_cases.ISOLATED.py"
$targetTest = Join-Path $backend "tests\test_forensic_reality_cases.py"
$cutPatch = Join-Path $root "patch-cutting-buyer-target.py"

Write-Host "GraniteMeasure AI - Installing backend regression fixes" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $sourceTest)) {
    throw "Missing file: $sourceTest"
}
if (-not (Test-Path -LiteralPath $cutPatch)) {
    throw "Missing file: $cutPatch"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$testBackup = "$targetTest.backup-$stamp"
Copy-Item -LiteralPath $targetTest -Destination $testBackup -Force
Write-Host "[BACKUP] $testBackup"

Copy-Item -LiteralPath $sourceTest -Destination $targetTest -Force
Write-Host "[OK] Installed isolated forensic fixture" -ForegroundColor Green

Set-Location $backend

& ".\.venv\Scripts\python.exe" $cutPatch
if ($LASTEXITCODE -ne 0) {
    throw "Buyer-target cutting patch failed."
}

Write-Host ""
Write-Host "Compiling changed Python files..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m py_compile `
    "tests\test_forensic_reality_cases.py" `
    "app\services\cutting.py"
if ($LASTEXITCODE -ne 0) {
    throw "Python compile failed."
}
Write-Host "[OK] Python compile" -ForegroundColor Green

Write-Host ""
Write-Host "Running the two failing regression groups..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" -m pytest `
    "tests\test_forensic_reality_cases.py" `
    "tests\test_mesh_cutting.py" `
    -q

if ($LASTEXITCODE -ne 0) {
    throw "Targeted regression tests still contain failures."
}

Write-Host ""
Write-Host "[OK] Forensic API and mesh cutting groups passed." -ForegroundColor Green
Write-Host "Next: run the complete backend suite." -ForegroundColor Cyan

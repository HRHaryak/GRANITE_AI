$ErrorActionPreference = "Stop"

$root = "C:\Users\hrhar\Project\granitemeasure-ai"
$backend = Join-Path $root "backend"
$target = Join-Path $backend "app\workers\analysis.py"
$source = Join-Path $PSScriptRoot "analysis.py"
$verifier = Join-Path $root "verify-real-3d.ps1"
$python = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host "GraniteMeasure AI - Installing worker shape validation" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing source file: $source"
}
if (-not (Test-Path -LiteralPath $target)) {
    throw "Missing target worker: $target"
}
if (-not (Test-Path -LiteralPath $python)) {
    throw "Backend virtualenv Python not found: $python"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$target.backup-$stamp"
Copy-Item -LiteralPath $target -Destination $backup -Force
Write-Host "[BACKUP] $backup" -ForegroundColor Yellow

try {
    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "[OK] Worker replaced" -ForegroundColor Green

    & $python -m py_compile $target
    if ($LASTEXITCODE -ne 0) { throw "Python compile failed." }
    Write-Host "[OK] Python syntax compile" -ForegroundColor Green

    $workerText = Get-Content -LiteralPath $target -Raw
    $required = @(
        "observed_irregular_mesh.json",
        "observed_shape_validation",
        "validate_mesh_against_observed_masks",
        "mesh_path"
    )
    $missing = @($required | Where-Object { -not $workerText.Contains($_) })
    if ($missing.Count -gt 0) {
        throw "Worker still missing required markers: $($missing -join ', ')"
    }
    Write-Host "[OK] Worker 3D + shape-validation markers" -ForegroundColor Green

    if (Test-Path -LiteralPath $verifier) {
        & $verifier
        if ($LASTEXITCODE -ne 0) {
            throw "verify-real-3d.ps1 still reports a partial chain."
        }
    }

    Write-Host "" 
    Write-Host "Worker integration installed successfully." -ForegroundColor Green
    Write-Host "Next command:" -ForegroundColor Cyan
    Write-Host "cd $backend"
    Write-Host ".\.venv\Scripts\python.exe -m pytest tests\test_reconstruction_integrity.py -q"
}
catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Restoring previous worker..." -ForegroundColor Yellow
    Copy-Item -LiteralPath $backup -Destination $target -Force
    Write-Host "[RESTORED] $target" -ForegroundColor Yellow
    throw
}

$ErrorActionPreference = "Stop"

Write-Host "GraniteMeasure AI - Real 3D integration verification" -ForegroundColor Cyan
Write-Host ""

$root = "C:\Users\hrhar\Project\granitemeasure-ai"
$backend = Join-Path $root "backend"
$mobile = Join-Path $root "mobile"

$checks = @(
  @{ Name = "Open3D geometry processor"; Path = Join-Path $backend "app\geometry\open3d_processing.py"; Patterns = @("mesh_vertices", "create_from_point_cloud_ball_pivoting", "LEAVE_UNOBSERVED_REGIONS_OPEN") },
  @{ Name = "Analysis worker"; Path = Join-Path $backend "app\workers\analysis.py"; Patterns = @("observed_irregular_mesh.json", "observed_shape_validation", "mesh_path") },
  @{ Name = "Analysis API"; Path = Join-Path $backend "app\api\v1\analysis.py"; Patterns = @("/geometry/{job_id}/mesh", "mesh_3d_url", "observed_shape_validation") },
  @{ Name = "Mobile 3D viewer"; Path = Join-Path $mobile "components\GraniteMesh3DViewer.tsx"; Patterns = @("GLView", "vertices", "triangles", "90% TARGET") },
  @{ Name = "Mobile block detail"; Path = Join-Path $mobile "app\blocks\[id].tsx"; Patterns = @("GraniteMesh3DViewer", "mesh_3d_url", "observed_shape_validation") }
)

$failed = $false
foreach ($check in $checks) {
  if (-not (Test-Path -LiteralPath $check.Path)) {
    Write-Host "[MISSING] $($check.Name)" -ForegroundColor Red
    Write-Host "          $($check.Path)"
    $failed = $true
    continue
  }

  $text = Get-Content -LiteralPath $check.Path -Raw
  $missing = @()
  foreach ($pattern in $check.Patterns) {
    if (-not $text.Contains($pattern)) { $missing += $pattern }
  }

  if ($missing.Count -eq 0) {
    Write-Host "[OK]      $($check.Name)" -ForegroundColor Green
  } else {
    Write-Host "[PARTIAL] $($check.Name)" -ForegroundColor Yellow
    Write-Host "          Missing markers: $($missing -join ', ')"
    $failed = $true
  }
}

Write-Host ""
if ($failed) {
  Write-Host "Real 3D chain is not fully connected yet. Do not claim 90% validated until the missing pieces are fixed." -ForegroundColor Yellow
  exit 1
}

Write-Host "Real 3D code path markers are present." -ForegroundColor Green
Write-Host "Next: run backend tests, mobile TypeScript, then analyze a real multi-view block and inspect mesh_3d_url + observed_shape_validation." -ForegroundColor Cyan

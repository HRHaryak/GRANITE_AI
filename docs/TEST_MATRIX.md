# Test Matrix

**Existing tests were not run in Phase 0.** This matrix maps required coverage to what exists.

## How to run (when environment allows)

```text
cd backend
python -m pytest
python -m compileall app

cd ../frontend
npx tsc --noEmit
npm run lint
npm run build
```

No GitHub Actions workflows were found.

## Backend tests present

| File | What it actually asserts (from inspection) | Maps to |
| --- | --- | --- |
| `test_contracts.py` | Pydantic calibration constraints; gangsaw thresholds; volume×rate | schemas, seigniorage math |
| `test_pipeline.py` | capabilities keys; confidence helper; Open3D/trimesh/cutting smoke | pipeline honesty **except** COLMAP advertising |
| `test_reconstruction_integrity.py` | no cube on empty/uncalibrated; irregular contour → irregular cloud; EXIF; classification fallback; reprojection helper | reconstruction safety |
| `test_stable_feature_tracks.py` | track stability (feature matching) | matching |
| `test_metric_scale_solver.py` | metric scale solver | calibration |
| `test_api_reconstruction_evidence.py` | analysis payload does not invent geometry when DB empty/mocked | API honesty |
| `test_forensic_reality_cases.py` | forensic/reality cases | evidence rules |
| `tools/test_pycolmap_granite.py` | manual pycolmap experiment | not CI |

**Gap:** `test_pipeline.test_capabilities_registry_honesty` expects photogrammetry-related keys and marks several subsystems OPERATIONAL — it may **encode the overclaim** rather than catch the PyCOLMAP stub.

## Required vs missing

| Required class | Status |
| --- | --- |
| Unit (geometry, cutting, seigniorage) | PARTIAL |
| API integration (TestClient + real DB) | PARTIAL / mostly mocked |
| Database migrations | MISSING (no alembic tests) |
| Reconstruction on real images | MISSING |
| Measurement MAE vs tape | MISSING |
| Cavity observed-depth | MISSING |
| Cutting vs post-cut | MISSING |
| Recovery predicted vs actual | MISSING |
| Seigniorage rate versioning | PARTIAL (unit only) |
| Authorization / role | MISSING |
| Frontend component | MISSING |
| E2E Playwright | MISSING |
| Mobile viewport | MISSING |
| Voice STT | MISSING |
| Security (path traversal, upload bombs) | MISSING |

## Frontend / mobile

No `*.spec.ts`, `*.test.tsx`, Playwright, or Jest config in repo.

## Observability tests

Health JSON `{"status":"ok"}` only. No trace-id tests.

## Phase-gated test obligations

| Phase | Must add/run |
| --- | --- |
| 1 | TestClient: operations routes exist; capabilities pycolmap not OPERATIONAL if stub; explanation null confidence |
| 2 | Capture inaccessible + hash persistence; duplicate SHA; max photo policy |
| 3 | Pose-true IoU fixture; insufficient evidence fails closed |
| 4 | Calibration required path |
| 5 | Defect without 3D depth stays UNOBSERVED depth |
| 6 | Cut planes from fixture mesh |
| 7 | Wastage from volumes not constants |
| 8 | FLAGGED blocks dispatch 409 |
| 9 | POST_CUT job cannot read RAW images as input |
| 10 | Dispatch 409 matrix |
| 11 | Assistant refuses missing measurement |
| 12 | Voice permission error paths |
| 13 | Viewport screenshots (evidence, not accuracy) |
| 14 | Authz tests |
| 15 | Full granite test-set report |

## Honesty tests that should exist

- Capabilities: installed pycolmap + unconfigured pipeline → not OPERATIONAL  
- Assistant: `measurement_confidence is None` → no 0.75  
- IoU: missing poses → `MEASUREMENT_UNAVAILABLE`  
- Demo presentation route does not write analysis_jobs  

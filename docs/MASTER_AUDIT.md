# GraniteMeasure AI — Master Audit (Phase 0)

**Date:** 2026-09-08  
**Scope:** Existing repository only. No production accuracy claims. No runtime measurements were executed in this audit (sandbox/git shell was unavailable).  
**Method:** Source-level trace of backend, frontend, mobile, workers, geometry, tests, and config. UI presence was not treated as proof of a working pipeline.

**Status vocabulary used throughout:**

| Status | Meaning |
| --- | --- |
| VERIFIED | Code exists, is wired into runtime, and is internally consistent. Not field-validated. |
| IMPLEMENTED_BUT_UNVERIFIED | Substantial implementation exists; no measured real-granite evidence in this audit. |
| PARTIAL | Some of the required behavior exists; gaps remain. |
| MISSING | Required capability not found, or not reachable at runtime. |
| FAILED | Implementation exists but is broken, unreachable, or contradicts itself. |
| UNSAFE_OR_FABRICATED | Defaults, narrative text, capability advertising, or docs invent or overclaim results. |

This audit does **not** claim the platform is production-ready.

---

## 1. Repository architecture discovered

Three application surfaces plus supporting backend:

```
granitemeasure-ai/
  backend/          FastAPI + SQLAlchemy + RQ worker + AI/geometry providers
  frontend/         Next.js 15 App Router + Capacitor Android wrapper
  mobile/           Separate Expo / React Native app
  docker-compose.yml
  docs/             (created by this Phase 0 audit)
```

**Data flow (as coded, not as marketed):**

1. Operator is selected via `X-Selected-User-Id` against `demo_users` (not passwords/JWT).
2. Web capture (`frontend/app/capture/page.tsx`) or Expo capture (`mobile/app/(tabs)/capture.tsx`) creates a `GraniteBlock` and `CaptureSession`.
3. Images upload to `POST /api/v1/capture-sessions/{id}/images` (`backend/app/api/v1/capture.py`). SHA-256 duplicate checks run in-memory/session; `block_images` has **no hash column**.
4. Session complete → `POST /api/v1/analysis-jobs` (`backend/app/api/v1/analysis.py`).
5. Job is enqueued to Redis RQ queue `analysis` if a worker is alive; otherwise FastAPI `BackgroundTasks` may run `run_analysis_job`.
6. `backend/app/workers/analysis.py` (~8k lines) orchestrates detection, segmentation, matching, ReconstructionManager, Open3D, trimesh, defects, cutting, wastage, seigniorage, classification.
7. Frontend block detail (`frontend/app/blocks/[id]/BlockDetailClient.tsx`) reads analysis JSON and drives 3D viewers.
8. Operations UI (`frontend/app/blocks/[id]/operations/page.tsx`) calls `frontend/lib/operations-api.ts`.
9. **`backend/app/api/v1/operations.py` is not mounted in `backend/app/main.py`.** Post-cut, weighbridge, and dispatch HTTP APIs are therefore unreachable.

**Schema:** SQLAlchemy models in `backend/app/models/entities.py`. Alembic is listed in `requirements.txt`; **no `alembic/` migration tree was found**. Schema is created via `DATABASE_INIT_MODE=create`.

---

## 2. Technologies actually present

### Backend (declared in `backend/requirements.txt`)

FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2, Alembic (unused), psycopg, Redis, RQ, httpx, NumPy, OpenCV contrib headless, Open3D 0.18, Ultralytics, Torch 2.5.1, Pillow, python-jose, passlib, slowapi, pytest.

**Imported by code but not declared in requirements.txt (runtime may fail unless installed ad hoc):**

- `trimesh` (`app.geometry.trimesh_processing`)
- `ortools` (`app.services.cutting`)
- `lightglue` (`app.ai.providers.matching`)
- `pycolmap` (stub provider)
- transformers / Depth Anything weights directory exists under `backend/models/depth-anything-v2-small/`

**Declared but unused in `backend/app`:** `python-jose`, `passlib` (no JWT/password auth found).

**Accidental:** `backend/package.json` + `backend/node_modules` (framer-motion, lucide-react). Not part of the Python service.

### Frontend (`frontend/package.json`)

Next.js 15.1.6, React 19, Tailwind, Radix, TanStack Query, Framer Motion, Three.js, React Three Fiber, Drei, next-intl (dependency present; **runtime i18n is custom `frontend/lib/i18n.tsx`**), Zod, Capacitor 8 (Android, Camera, Filesystem, Geolocation, Network).

**No frontend unit/E2E test runner** (no Jest/Playwright/Vitest scripts).

### Mobile (`mobile/package.json`)

Expo ~54, Expo Router, Camera, Image Picker, Location, Network, Secure Store, Zustand. **Second stack** beside Capacitor-wrapped Next.js.

### Infra

`docker-compose.yml`: Postgres 16, Redis 7, backend, RQ worker, frontend. Default DB password `granite`. `DEMO_MODE=false`, `SEED_DEMO_USERS=true` in compose.

---

## 3. Existing working capabilities (code-level)

These are **IMPLEMENTED_BUT_UNVERIFIED** unless noted.

| Area | Evidence |
| --- | --- |
| FastAPI app, CORS, health, per-IP rate limit | `main.py`, `middleware/rate_limit.py` |
| Demo user / quarry / category / block CRUD | `api/v1/users.py`, `quarries.py`, `blocks.py` |
| Guided web capture orbit FRONT→…→TOP | `frontend/app/capture/page.tsx` `GUIDED_ORBIT` |
| Mark surface inaccessible | capture API `.../surfaces/{surface}/inaccessible` |
| Image MIME/size checks, EXIF, blur/quality heuristics | `services/image_validation.py`, `services/exif.py` |
| RQ worker process | `workers/rq_worker.py`, compose `python -m app.workers.rq_worker` |
| OpenCV SIFT/ORB matching + custom SfM/visual-hull path | `ai/providers/matching.py`, `reconstruction.py` |
| Open3D point processing / ball pivoting / optional TSDF | `geometry/open3d_processing.py` |
| Explicit reject of empty reconstruction / no synthetic cube on empty input | `tests/test_reconstruction_integrity.py` |
| Seigniorage rate version table + gangsaw class | `models/entities.py`, `services/seigniorage.py`, `core/seed.py` |
| Officer verification enum APPROVED / FLAGGED | `models/enums.py` `VerificationDecision`; `POST .../verification` |
| Block analysis UI tabs matching target set | Overview, Reconstruction, Measurements, Defects, Cutting, Recovery, Evidence, Report |
| Rule-based assistant over analysis JSON | `POST .../ai-assistant`, `services/explanation.py` `answer_block_question` |
| Dual language keys in `i18n.tsx` (partial coverage) | `frontend/lib/i18n.tsx` |

---

## 4. Broken / incomplete capabilities

| Issue | Status |
| --- | --- |
| Operations router not registered | **FAILED** — frontend calls `/api/v1/granite-blocks/{id}/operations-summary` etc.; `main.py` never `include_router(operations)` |
| Analysis router mounted twice | **PARTIAL** — `include_router(analysis_router, prefix="/api/v1")` and again without prefix |
| PyCOLMAP advertised OPERATIONAL if importable; provider always returns `ok=False` `PYCOLMAP_UNCONFIGURED` | **FAILED** capability honesty |
| `check_capabilities()` reports photogrammetry OPERATIONAL for OpenCV fallback always | **UNSAFE_OR_FABRICATED** advertising |
| No Alembic migrations | **PARTIAL** — create_all only |
| No real authentication | **PARTIAL** / **UNSAFE** for production |
| CORS default includes `*` plus credentials | **UNSAFE** |
| Image content hash not persisted on `block_images` | **PARTIAL** |
| Capture hard cap `maximum_capture_images=12` | **PARTIAL** vs “no fixed six-photo max” (12 is still a cap) |
| Mobile `SCALE_BAR` vs backend `MEASUREMENT_BOARD` / `MANUAL_REFERENCE` | **FAILED** contract risk |
| Dual mobile stacks (Capacitor + Expo) | **PARTIAL** / unjustified duplication |
| Voice STT/TTS | **MISSING** |
| LLM tool-calling assistant | **MISSING** (keyword matcher) |
| next-intl unused | **PARTIAL** |
| `walkthrough.md` claims 100% web/mobile parity and OR-Tools sawn yield | **UNSAFE_OR_FABRICATED** documentation |
| `frontend/AUDIT.md` predates analysis/operations routes | stale |

---

## 5. Fake / demo / static behaviors found

| Item | Classification |
| --- | --- |
| `RealisticGraniteStage.tsx` procedural/presentation granite for business-workflow | DEMO/PRESENTATION UI. Must never feed measurement. |
| `DEMO_MODE` / `demo_simulated` flags exist; worker refuses demo if `DEMO_MODE` false | VERIFIED gate |
| Seed users + quarries + **hard-coded seigniorage INR rates** labeled “Statutory Gazetted” (`GAZETTE-2026`, 3450/2750/2650/2150) | **UNSAFE_OR_FABRICATED** unless independently sourced; provenance is seed code, not a gazette file |
| `explanation.py` default `measurement_confidence or 0.75`, `length_uncertainty_cm or 5.0`, waste split `waste_pct * 0.35` etc. | **UNSAFE_OR_FABRICATED** defaults / narrative percentages |
| Assistant invents “2.0 cm margin”, “0.5 cm blade”, “V-notch in photo 3” style claims when keywords match | **UNSAFE_OR_FABRICATED** if those facts are not in analysis JSON |
| Cutting DB default solver `"Google OR-Tools CP-SAT"` even when CP-SAT is only optional count validation | **UNSAFE_OR_FABRICATED** labeling |
| `reprojection.py` projects with **canonical axis mapping + 0.95 scale**, not recovered camera poses | **UNSAFE_OR_FABRICATED** if shown as pose-true render-back IoU |
| Color/texture classification fallback | PARTIAL — labeled disclaimer in provider; not a geological model |
| Popular variety list hardcoded in Expo capture | static catalog, not model output |
| Capabilities: PyCOLMAP OPERATIONAL on import only | **UNSAFE_OR_FABRICATED** |

Honest behaviors also exist: reconstruction gates (`MIN_GLOBAL_SPARSE_POINTS = 30`), Open3D numpy fallback “no fake mesh”, defect provider comments forbidding fake polygons.

---

## 6. Frontend / backend contract mismatches

1. **Operations API:** frontend `operations-api.ts` vs unmounted `operations.py`.
2. **Calibration enum:** backend `CalibrationType` = ARUCO | MEASUREMENT_BOARD | MANUAL_REFERENCE; mobile uses `SCALE_BAR`.
3. **Capture sides:** backend `CaptureSide` includes PHOTO_001…012 and 8 canonical + corners; web uses named orbit; Expo uses FRONT/LEFT/RIGHT/BACK/TOP (LEFT/RIGHT order differs from web).
4. **API prefix dual-mount** for analysis (root and `/api/v1`).
5. **Stale `frontend/AUDIT.md`** lists only early capture/block routes.
6. **Verification:** backend `VerificationDecision` APPROVED/FLAGGED — frontend types grep did not show a shared enum file; UI strings exist in BlockDetail. Treat as **IMPLEMENTED_BUT_UNVERIFIED** alignment.
7. **Role nav** in `deps.py` is not enforced as JWT; header spoofing selects any demo user.

---

## 7. 3D reconstruction audit

**Priority #1. Status: PARTIAL / IMPLEMENTED_BUT_UNVERIFIED. Not a production SfM/MVS stack.**

Actual pipeline (worker + ReconstructionManager):

- Photos → validation/segmentation/matching (SIFT/ORB default; SuperPoint+LightGlue if weights exist).
- `PyCOLMAPReconstructionProvider` is a **stub** (never reconstructs).
- OpenCV reconstruction: multi-view geometry + silhouette-constrained visual hull / sparse tracks (very large `reconstruction.py`).
- Optional Depth Anything V2 if configured; Open3D TSDF/ball pivoting.
- Trimesh used as envelope validation; comments warn convex hull is outer envelope, not true cavity volume.
- Quality gates: ≥3 cameras, ≥30 sparse points, reprojection error cap.

**Not present as a working integration:** COLMAP incremental mapper, OpenMVS, hloc, global BA as a first-class production path, texture atlas from recovered cameras, true render-back using `registered_cameras`.

**Digital Twin risk:** UI tries to suppress cuboids as raw stone (`PointCloud3DViewer.tsx`). Cutting still plans a dressed cuboid. Business-workflow uses a **presentation** mesh.

**90% silhouette IoU:** UI can display `overall_silhouette_iou` if backend sends it. `compute_view_reprojection_metrics` is **not** camera-pose render-back. **Do not claim 90%.** Status: **MISSING** as specified; a weaker metric **PARTIAL**.

---

## 8. Measurement audit

**PARTIAL / IMPLEMENTED_BUT_UNVERIFIED.**

- Calibration types: ArUco, measurement board, manual reference (`ai/calibration.py`).
- Measurements stored with uncertainty fields on `measurement_results`.
- OBB/AABB JSON on `geometry_models`.
- Worker comments: do not replace missing volume with cuboid.
- Assistant/explanation may still **fill volume from L×B×H** and default confidence 0.75.

**Not verified:** metric accuracy on real blocks, camera intrinsic calibration workflow completeness, observed vs estimated volume separation in every API response.

---

## 9. Cutting / recovery / wastage audit

**PARTIAL.**

- `services/cutting.py`: geometric dressing optimizer; OR-Tools optional for integer piece-count, not the primary cut inventor.
- Labels/docs still say Google OR-Tools CP-SAT as the solver.
- Wastage from geometry vs hardcoded %: geometry path exists; explanation layer **re-splits waste with assumed percentages**.
- Cutting simulation UI: `Cutting3DViewer.tsx` — IMPLEMENTED_BUT_UNVERIFIED; must stay labeled proposed until post-cut evidence.
- Post-cut isolation: session metadata `POST_CUT` vs `RAW_INITIAL` in operations.py — **code exists, API not mounted**.

---

## 10. Mobile audit

**PARTIAL. Two stacks.**

| Stack | Role |
| --- | --- |
| Capacitor on Next.js | Documented in `frontend/MOBILE.md` as the packaged field app |
| Expo `mobile/` | Parallel capture/dashboard; `walkthrough.md` overclaims parity |

Gaps vs target: voice missing; offline queue claimed in walkthrough — Expo has a capture store (`lib/store.ts`) but full encrypted offline queue **IMPLEMENTED_BUT_UNVERIFIED**; geofence vs quarry GPS **PARTIAL**; small-Android layout **UNVERIFIED** (no viewport tests); `MAX_IMAGES = 12`; TOP optional but not the same inaccessible API as web unless wired.

**Recommendation:** do not add a third stack. Choose Capacitor-wrapped web **or** Expo as the field client, then delete/archive the other after parity is proven.

---

## 11. AI Assistant audit

**PARTIAL.**

- Grounded in `get_block_analysis` JSON (good).
- Not LLM tool-calling / RAG.
- Keyword routing in `answer_block_question` with **defaults that invent confidence and waste composition**.
- Telugu answers exist as string templates, not a translator.

---

## 12. Telugu / i18n audit

**PARTIAL.**

- Central keys: `frontend/lib/i18n.tsx` (en+te).
- Many pages still embed large `COPY` / inline `isTe ?` strings (`ai-assistant/page.tsx`, `BlockDetailClient.tsx`, `capture/page.tsx`).
- Capture guidance Telugu **PARTIAL**.
- `next-intl` unused.
- Reports/voice **MISSING** or incomplete.

---

## 13. Voice capability audit

**MISSING.** No SpeechRecognition, MediaRecorder STT, Whisper, Azure, or TTS playback loop in frontend/mobile app code (search over `frontend/**/*.ts(x)`).

---

## 14. Security audit

| Item | Status |
| --- | --- |
| Auth | Demo header identity; fallback to quarry operator if header omitted |
| Secrets in NEXT_PUBLIC | template exposes `NEXT_PUBLIC_SUPABASE_ANON_KEY` (empty). Anon key is expected public; service role must stay server-only |
| CORS `*` + credentials | **UNSAFE** |
| Upload MIME/size | VERIFIED in capture API |
| Rate limit | PARTIAL (in-process sliding window; not Redis-distributed) |
| Path traversal / storage | IMPLEMENTED_BUT_UNVERIFIED |
| SQL injection | SQLAlchemy parameterized — typical safety |
| XSS | React default escaping; 3D/HTML mixing UNVERIFIED |
| Authorization on dispatch | operations.py gates exist but **unreachable** |
| Compose default passwords | **UNSAFE** for any non-local use |

---

## 15. Testing gaps

Present (backend pytest):

- `test_contracts.py` — schemas, gangsaw math
- `test_pipeline.py` — capabilities, cutting, some geometry
- `test_reconstruction_integrity.py`, `test_stable_feature_tracks.py`, `test_metric_scale_solver.py`
- `test_api_reconstruction_evidence.py` — mocked DB serialization honesty
- `test_forensic_reality_cases.py`
- `tools/test_pycolmap_granite.py` — tool, not CI

**MISSING:** CI workflows (no `.github/`), frontend tests, E2E, mobile viewport, auth tests, seigniorage gazette provenance tests, real photogrammetry tests, cavity metric tests against physical depth, Playwright.

**Tests were not executed in this audit.**

---

## 16–21. Plan, files, tech recommendations, risks, acceptance

See:

- `docs/IMPLEMENTATION_PLAN.md` (phases + acceptance)
- `docs/ARCHITECTURE_CURRENT.md` / `ARCHITECTURE_TARGET.md`
- `docs/REQUIREMENT_MATRIX.md`
- `docs/ACCURACY_VALIDATION_PLAN.md`
- `docs/TEST_MATRIX.md`

**Stop condition:** No application code was modified. Phase 1 must not start without explicit approval.

**Highest Phase 1 candidates (after approval):** mount operations router; stop dual analysis mount or document it; honest capabilities (PyCOLMAP); CORS; persist image hashes; fix mobile calibration enum; remove or quarantine `backend/node_modules`; do not rewrite reconstruction in Phase 1.

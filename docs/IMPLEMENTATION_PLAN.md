# Implementation Plan

**Do not start Phase 1 until approved.**

## Process (every phase)

1. Tests for that phase  
2. `python -m compileall app` (backend)  
3. Relevant pytest  
4. `npx tsc --noEmit` / `npm run lint` / `npm run build` when frontend touched  
5. Runtime smoke  
6. Browser check of affected UI (desktop + small Android viewport)  
7. Update `REQUIREMENT_MATRIX.md`  
8. Stop on critical regression  

## PHASE 0 — Audit (this document set)

**Status:** PARTIAL complete at source level. Tests not executed. Git status not captured (shell sandbox unavailable).

**Acceptance:** Audit docs exist; no app code change.

---

## PHASE 1 — Contracts, build, honesty

**Goal:** Make the existing code reachable and honest. Do not rewrite reconstruction.

Likely files:

- `backend/app/main.py` — mount `operations` once; stop duplicate analysis mount or document
- `backend/app/ai/capabilities.py` — PyCOLMAP stub ≠ OPERATIONAL
- `backend/app/core/config.py` — CORS without `*` in production defaults
- `mobile` calibration enums vs `CalibrationType`
- `backend/app/services/explanation.py` — remove numeric defaults (0.75, 5.0 cm, invented waste splits)
- `backend/requirements.txt` — declare trimesh/ortools if still imported; remove unused jose/passlib or use them
- Ignore/remove accidental `backend/node_modules`

**Acceptance:**

- Operations endpoints return 200/4xx from FastAPI OpenAPI, matching `operations-api.ts`
- Capabilities never mark stub COLMAP as OPERATIONAL
- Assistant does not emit default confidence when measurement confidence is null
- Existing pytest still pass
- No reconstruction algorithm rewrite

---

## PHASE 2 — Mobile evidence capture

- Pick **one** field client (recommend Capacitor=web unless Expo is the deployed APK).
- Guided orbit, inaccessible, >6 photos (raise or remove 12-cap with storage/perf justification)
- Persist sha256 on images
- Offline queue with tests
- Telugu capture strings in i18n catalog
- Geofence if quarry boundary exists

**Acceptance:** Capture E2E on small viewport; no clipped controls; inaccessible stored as UNOBSERVED; hashes persisted.

---

## PHASE 3 — Reconstruction (priority #1)

- Configure real SfM (pycolmap/COLMAP) **or** keep OpenCV but label DEGRADED
- Wire `registered_cameras` into dense fusion and render-back
- Replace axis-proxy IoU
- Weak-view recapture messages with side + overlap hint
- Benchmark vs current path on real photos

**Acceptance:** Pose-true IoU computed or explicitly `MEASUREMENT_UNAVAILABLE`. No 90% claim unless test-set mean ≥ 0.90. Demo meshes isolated.

---

## PHASE 4 — Metric measurement

Provenance on every number: calibration method, scale solved yes/no, OBB/AABB/mesh/observed/unknown.

**Acceptance:** Null calibration → `CALIBRATION_REQUIRED`, no L×B×H invention in assistant.

---

## PHASE 5 — Defects + cavities

Evaluate YOLO/SAM on granite data before claiming. Associate cavities across views. Observed depth only.

**Acceptance:** Findings include source image, polygon, confidence, observed/unobserved. Hidden depth never inferred.

---

## PHASE 6 — Cutting + simulation

Deterministic planes from mesh; OR-Tools only if it actually solves the plan. Simulation labeled PROPOSED. Explain why/where/volume.

**Acceptance:** No LLM-invented planes. Viewer steps use backend planes.

---

## PHASE 7 — Recovery / wastage

Geometry-derived; predicted vs actual columns never mixed. Unknown volume explicit.

**Acceptance:** No hardcoded 10–12% narrative unless that number is computed.

---

## PHASE 8 — Seigniorage + verification

Gazette provenance; INDICATIVE vs WEIGHBRIDGE_VERIFIED. Canonical APPROVED/FLAGGED. FLAGGED requires reason/action.

**Acceptance:** Seed rates not labeled statutory without source document. Enums match FE/BE.

---

## PHASE 9 — Post-cut

Separate session/job/twin. RAW vs POST-CUT comparison API.

**Acceptance:** Mixing POST-CUT photos into RAW job impossible by API constraint.

---

## PHASE 10 — Weighbridge + dispatch

Mount already implemented gates; audit trail; lock dispatch.

**Acceptance:** 409 when verification/weighbridge/post-cut missing.

---

## PHASE 11 — Assistant EN/TE

Tool-calling over block APIs. No invented measurements. Telugu via keys + optional MT only for prose, not numbers.

---

## PHASE 12 — Voice EN/TE

Benchmark STT (Whisper vs cloud) on Telugu quarry speech. PTT, TTS, stop, retry. Same grounding as text.

---

## PHASE 13 — Premium UI / mobile polish

LOD, texture sizes, safe areas, contrast. Isolate presentation route.

---

## PHASE 14 — Security / performance / observability

Real auth, distributed rate limits, structured logs, trace IDs. Profile before optimizing.

---

## PHASE 15 — Full E2E + real granite

Execute ACCURACY_VALIDATION_PLAN. Browser desktop/tablet/small Android. Screenshots as evidence, not as proof of AI.

---

## Files likely to change (later phases)

`workers/analysis.py`, `ai/providers/reconstruction.py`, `matching.py`, `open3d_processing.py`, `reprojection.py`, `PointCloud3DViewer.tsx`, `Cutting3DViewer.tsx`, `capture/page.tsx`, `BlockDetailClient.tsx`, `lib/i18n.tsx`, `entities.py` + **new Alembic revisions**, `explanation.py`, `operations.py`, `main.py`, Expo **or** Capacitor (not both indefinitely).

## Technologies to add (only after benchmark)

- **pycolmap/COLMAP** if it wins SfM on granite photos  
- **Alembic revisions** (already a dependency)  
- **STT/TTS** after Telugu quality test  
- **Auth** (OIDC or session) before any non-demo deployment  

## Technologies not to add now

- Second worker bus (Celery/Arq) while RQ exists  
- OpenMVS / PyTorch3D / Detectron2 / Mask2Former without granite eval  
- New native app (Flutter/RN extra)  
- Fake LLM measurements  
- Procedural rock as measurement twin  

## Risks / blockers

- Reconstruction quality unknown without real photos  
- Dual mobile stacks  
- Unmounted operations API  
- Capability/docs overclaim (`walkthrough.md`)  
- Seed seigniorage rates  
- Monolithic 8k-line worker (change risk)  
- Missing CI  
- GPU/COLMAP ops environment  
- Legal: AI seigniorage must stay INDICATIVE  

## Phase 1 acceptance criteria (checklist)

- [ ] Operations router mounted under `/api/v1`  
- [ ] OpenAPI lists weighbridge/dispatch/post-cut  
- [ ] Capabilities honest for COLMAP/pycolmap  
- [ ] CORS default not `*` for credentialed browsers  
- [ ] Calibration enums aligned mobile↔backend  
- [ ] No new fake geometry  
- [ ] pytest subset green  
- [ ] Frontend build if FE touched  

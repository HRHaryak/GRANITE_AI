# Architecture — Target (field-ready, evidence-first)

This is the **target** architecture. It must be reached in phases. It is not a claim that the current repo already works this way.

## Principles

1. **Evidence over appearance.** Unobserved surfaces stay `UNOBSERVED`. No cuboid Digital Twin for measurement.
2. **One mobile field client.** Capacitor-wrapped Next.js *or* Expo — not both as products.
3. **Jobs never block interactive APIs.** Reconstruction always on workers with progress, retries, timeouts, idempotency.
4. **Versioned artifacts.** Original image bytes immutable; derived products versioned.
5. **Render-back validation** uses **recovered camera poses**, not axis-aligned proxy projection.
6. **LLMs explain; they do not invent geometry.** Tool/API grounding only.
7. **Seigniorage rates** have gazette provenance, effective dates, and `INDICATIVE_AI_ASSESSMENT` vs `WEIGHBRIDGE_VERIFIED_ASSESSMENT`.
8. **Dispatch** cannot proceed without coded gates (verification + weighbridge + post-cut as product requires).

## Target pipeline (reconstruction #1)

```
photos (immutable)
 → EXIF/orientation
 → quality (blur, exposure, resolution, granite visibility)
 → duplicate / overlap
 → features (SuperPoint+LightGlue if validated; SIFT fallback)
 → matching + geometric verification
 → SfM (configure real COLMAP/pycolmap; do not advertise stubs)
 → dense MVS / TSDF only from registered cameras + metric scale
 → outlier filter
 → evidence-aware mesh (do not close unseen sides)
 → texture from observations
 → metric calibration provenance
 → render-back (silhouette IoU, contour error, reprojection) on observed views
 → recapture hints for weak views
```

If COLMAP/pycolmap cannot be configured in the deployment, the API must report `NOT_CONFIGURED` / `DEGRADED`, never `OPERATIONAL` for a stub.

## Target API surface

Keep FastAPI. Mount a single versioned prefix `/api/v1`.

Required domains:

- identity (replace demo header before production)
- quarries / geofence
- capture sessions (RAW vs POST_CUT phase)
- analysis jobs + artifacts
- measurements with OBB/AABB/mesh/observed/unknown
- defects/cavities
- cutting plans (deterministic geometry; LLM explanation separate)
- recovery predicted vs actual
- seigniorage
- verification
- weighbridge / dispatch
- assistant (tool calls)
- voice (STT → tools → TTS) as a separate service boundary

## Data

- Persist `sha256` (and optional perceptual hash) on images.
- `capture_phase` as a first-class column, not only JSON metadata.
- Alembic migrations required before further schema growth.
- Separate RAW and POST-CUT geometry_model rows (already implied by separate jobs; make queries explicit).

## Frontend

- Keep Next.js + R3F.
- One Digital Twin viewer, tabbed as specified.
- Demo/presentation scenes (`RealisticGraniteStage`) labeled and isolated from APIs.
- Complete i18n via one catalog (migrate scattered COPY into keys).
- Voice UI: PTT, language selector EN/TE, errors, stop/retry.

## Workers / observability

- RQ is already the right class of tool; keep unless proven insufficient.
- Structured logs: `block_id`, `job_id`, `session_id`, `stage`, `duration_ms`, `model_version`, `error_code`, `retry_count`.
- Health: Redis, DB, storage, GPU/optional COLMAP.

## What not to add without a benchmark

OpenMVS, PyTorch3D, Detectron2, Mask2Former, a second worker framework (Celery+Arq+RQ), a second 3D engine, a third mobile stack.

Add a library only after it beats the current OpenCV+Open3D path on **real granite photos** for observed-view IoU and dimension error.

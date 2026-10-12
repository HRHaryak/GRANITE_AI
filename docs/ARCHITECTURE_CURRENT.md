# Architecture — Current (as implemented)

This describes the system **as it exists in the repository**, not the desired field platform.

## Runtime topology

```
Browser / Capacitor WebView          Expo app (parallel)
        |                                    |
        +----------- HTTP JSON --------------+
                        |
                 FastAPI (uvicorn)
                   |          |
            SQLAlchemy     RQ (optional)
                   |          |
            SQLite or      Redis queue "analysis"
            Postgres            |
                           worker: run_analysis_job
                   |
            local ./storage  or Supabase (configured, not proven in this audit)
```

Docker Compose can run Postgres, Redis, API, worker, and Next.js together.

## Backend layering

| Layer | Location | Notes |
| --- | --- | --- |
| HTTP | `app/api/v1/*.py` | users, quarries, blocks, capture, analysis; **operations unmounted** |
| AuthN/Z | `app/api/deps.py` | Demo user header; role helper exists |
| ORM | `app/models/entities.py` | UUID PKs, JSON blobs for geometry/defects |
| Enums | `app/models/enums.py` | CaptureSide, AnalysisState, VerificationDecision |
| Settings | `app/core/config.py` | pydantic-settings; SQLite default |
| AI providers | `app/ai/providers/*` | reconstruction, matching, depth, defects, classification, detection, segmentation, geometry |
| Geometry | `app/geometry/*` | Open3D, trimesh, reprojection |
| Jobs | `app/workers/analysis.py` | Monolithic pipeline |
| Seed | `app/core/seed.py` | Users, quarries, seigniorage rates |

## Request routing fact

`app/main.py` registers:

- `/api/v1` → users, quarries, blocks, capture, analysis
- analysis **again** at application root
- `/health` and `/api/v1/health`

It does **not** register `operations.py`.

## Analysis job lifecycle

1. `POST /analysis-jobs` creates `analysis_jobs` row (`CREATED`).
2. If RQ workers advertise queue `analysis`, job is enqueued (`job_timeout=30min`).
3. Else FastAPI background task may execute the same `run_analysis_job`.
4. Worker writes `measurement_results`, `geometry_models`, `defect_results`, `cutting_optimization_results`, `wastage_results`, `seigniorage_assessments`, `granite_classification_results`, transitions, progress percent.

Heavy work can still run in-process if Redis/workers are down — latency/availability risk.

## Frontend structure

| Route | Role |
| --- | --- |
| `/` | Operator select + API health |
| `/dashboard` | Block/quarry counts |
| `/capture` | Guided capture (canonical orbit) |
| `/blocks`, `/blocks/[id]` | Ledger + Digital Twin tabs |
| `/blocks/[id]/operations` | Weighbridge/dispatch/post-cut UI |
| `/quarries` | Quarry admin |
| `/ai-assistant` | Keyword assistant |
| `/business-workflow` | Presentation 3D journey (`RealisticGraniteStage`) |
| `/profile` | User/language/theme |

3D: `PointCloud3DViewer.tsx` (large), `Cutting3DViewer.tsx`.

i18n: React context + key dictionaries, not next-intl message files.

## Mobile structure

- **Capacitor:** same Next.js UI packaged for Android (`frontend/android`).
- **Expo:** separate screens under `mobile/app/(tabs)/*` with its own API client and i18n.

## Digital Twin UI (current vs required)

Required tabs are present on block detail. Reconstruction tab holds the large viewer. Report tab avoids a giant viewer (as required).

Giant viewers are still heavy components; mobile GPU performance is unverified.

## Evidence model (current)

- Original files on storage paths in `block_images`.
- SHA-256 used for duplicate detection at upload time, **not stored as a first-class column**.
- Derived geometry paths on `geometry_models`.
- No explicit geometry_version / measurement_version tables beyond job row + timestamps.
- Overwrite policy: recapture/reopen endpoints exist on capture API; immutability of prior bytes is **PARTIAL**.

## Identity model

`demo_users` + `profiles`. Comment in ORM: “Hackathon selected-user list. Not authentication.”

This is the current production-shaped identity model. It is insufficient for officer-grade authorization.

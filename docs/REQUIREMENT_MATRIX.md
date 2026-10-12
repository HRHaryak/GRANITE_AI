# Requirement Matrix

Classification is from **repository source**, not field trials.  
`VERIFIED` here never means “90% accurate on granite.”

| ID | Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| P0 | Multi-view photogrammetry SfM/MVS Digital Twin | PARTIAL | OpenCV ReconstructionManager, Open3D; PyCOLMAP stub | No configured COLMAP pipeline; no pose-true MVS as default |
| P0 | Unobserved surfaces stay unknown | PARTIAL | Gates, inaccessible API, UI copy | Visual hull / envelope can still over-close; validation weak |
| P0 | No cube as production twin | PARTIAL | Tests reject empty cube; UI suppresses cuboid | Cutting/dressed cuboid; presentation scene |
| P0 | Render-back IoU on recovered poses; target 0.90 observed | MISSING / PARTIAL | `reprojection.py` axis proxy; UI fields for IoU | Not recovered-camera render-back; 90% unmeasured |
| P0 | Recapture hints for weak views | PARTIAL | capture guidance API | Quality of hints UNVERIFIED |
| R1 | Responsive web | PARTIAL | Next.js + Tailwind | No viewport E2E |
| R2 | Mobile-first capture | PARTIAL | Web capture + Capacitor + Expo | Dual stack; Expo enum mismatch |
| R3 | FastAPI backend | VERIFIED | `app/main.py` | Dual router mount |
| R4 | CV/AI pipeline | PARTIAL | Worker + providers | Weights mostly unconfigured |
| R5 | Evidence Digital Twin UI | PARTIAL | BlockDetail tabs + R3F | Performance/LOD UNVERIFIED |
| R6 | Cutting/dressing intelligence | PARTIAL | `cutting.py` geometry | OR-Tools overclaimed; buyer/gangsaw constraints incomplete |
| R7 | Recovery/wastage from geometry | PARTIAL | `wastage_from_geometry` | Explanation fabricates % splits |
| R8 | Seigniorage workflow | PARTIAL | Rate tables + assessments | Seed rates labeled statutory; gazette not sourced |
| R9 | Officer verification APPROVED/FLAGGED | PARTIAL | Enum + POST verification | Operations dispatch gate not reachable |
| R10 | Post-cut reconstruction isolated | FAILED at HTTP | operations.py phase logic | Router not in main.py |
| R11 | AI Assistant grounded | PARTIAL | Keyword QA on analysis JSON | Defaults invent numbers; no LLM tools |
| R12 | EN+TE complete i18n | PARTIAL | i18n.tsx + inline strings | Scattered copy; capture/report incomplete |
| R13 | Voice EN+TE | MISSING | None | Full STT/TTS stack |
| R14 | Premium UI | PARTIAL | Dark/light, motion | Overlap/clip untested on small Android |
| R15 | Production tests/observability | PARTIAL | Backend pytest; print() startup | No CI, no FE tests, weak structured logs |
| C1 | Guided one-photo-at-a-time | PARTIAL | Web GUIDED_ORBIT | Expo different sequence |
| C2 | >6 photos allowed | PARTIAL | max 12 | Cap at 12; PHOTO_012 enum |
| C3 | Immediate photo validation | PARTIAL | validate endpoints | Granite visibility model often unconfigured |
| C4 | MARK AS INACCESSIBLE → UNOBSERVED | PARTIAL | Web + capture API | Expo weaker |
| C5 | GPS / geofence | PARTIAL | GPS fields | Geofence enforcement UNVERIFIED |
| C6 | Offline/resume/retry | PARTIAL | Expo store; walkthrough overclaims | Capacitor offline UNVERIFIED |
| M1 | Metric calibration | PARTIAL | ArUco/board/manual | Not field-validated |
| M2 | OBB vs AABB vs mesh vs observed volume | PARTIAL | geometry JSON fields | API/UI consistency UNVERIFIED |
| D1 | Visible defects only | PARTIAL | defect provider | YOLO weights optional; no granite-tuned eval |
| D2 | Cavities: observed depth only | PARTIAL | geometry helpers `measure_cavity_from_polygon_on_mesh` | No real-block validation |
| K1 | Classification from model | PARTIAL | provider + color fallback | Fallback is not geology; override workflow UNVERIFIED |
| X1 | Cutting simulation play/pause/step | PARTIAL | Cutting3DViewer | Must stay PROPOSED until post-cut |
| O1 | Weighbridge fields | FAILED HTTP | models + operations.py + UI | Unmounted router |
| O2 | Dispatch lock | FAILED HTTP | gates in operations.py | Unreachable |
| S1 | AuthZ roles | PARTIAL | ROLE_NAV unused as real auth | Header spoof |
| S2 | Upload validation | VERIFIED | MIME/size | Hash not stored |
| S3 | No secrets in NEXT_PUBLIC | PARTIAL | only API URL + optional anon | CORS * unsafe |
| V1 | Real granite validation dataset | MISSING | none in repo as protocol | See ACCURACY_VALIDATION_PLAN |
| V2 | Train/val/test split for ML | MISSING | no training dataset contract | — |

## Capability honesty (runtime advertising)

| Advertised | Actual | Status |
| --- | --- | --- |
| PyCOLMAP OPERATIONAL if importable | Stub returns PYCOLMAP_UNCONFIGURED | FAILED |
| OpenCV photogrammetry OPERATIONAL | Fallback visual hull/SfM code exists | IMPLEMENTED_BUT_UNVERIFIED (do not call OPERATIONAL photogrammetry without eval) |
| SuperPoint/LightGlue | Optional weights | DEGRADED unless files exist |
| YOLO detection/seg/defects | Path config | NOT_CONFIGURED unless weights |
| Depth Anything | `backend/models/depth-anything-v2-small/` present | IMPLEMENTED_BUT_UNVERIFIED if weights complete |
| OR-Tools cutting OPERATIONAL | Optional count check | PARTIAL |

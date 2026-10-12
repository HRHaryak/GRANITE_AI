# Accuracy Validation Plan

**Rule:** The 90% observed-shape target is a **measurement goal**, not a product claim.  
No UI string, PDF, or officer report may say “90% accurate” until this protocol produces that number on a **held-out** set.

## 1. What “90%” means

- Metric: **mean silhouette IoU** between (a) source or held-out photograph and (b) Digital Twin **rendered with that view’s recovered camera** (intrinsics + extrinsics).
- Domain: **observed** pixels/surfaces only. Unobserved faces are excluded from the mean (they contribute coverage metrics, not fake IoU).
- Companion metrics (all required in the report, none optional for a “pass”):
  - contour/boundary error (px and cm if calibrated)
  - feature reprojection error (median px)
  - camera registration quality (registered cameras / attempted)
  - observed surface coverage %
  - held-out view consistency
  - explicit confidence / `INSUFFICIENT_EVIDENCE`

**Fail closed:** if poses are missing, IoU is `MEASUREMENT_UNAVAILABLE`, not a proxy projection score.

## 2. Current gap

`backend/app/geometry/reprojection.py` maps 3D points with **named-side axis conventions** and a `0.95` scale fudge. That must **not** be used as the official IoU. Replace with pose-true render-back before any accuracy dashboard is trusted.

## 3. Dataset protocol (real granite)

Collect **N ≥ 8** blocks (more is better) from actual quarry conditions:

For each block:

- Mobile photos following the canonical orbit + extras
- Manual tape/laser L, B, H (and notes on irregularity)
- Calibration object (ArUco size or board) photographed in-frame
- Known visible defects/cavities with **measured opening** where safe
- If cut: dressed dimensions, predicted vs actual recovery/waste
- Weighbridge if used

**Splits**

- Reconstruction **hyperparameters** may be tuned only on a **dev** subset.
- **Test** blocks: never used for threshold fishing.
- If any neural model is fine-tuned: disjoint train / val / test **by block**, not by random images from the same block.

Store originals immutable with hashes.

## 4. Metrics

| Domain | Metric | Notes |
| --- | --- | --- |
| Shape | Observed-view silhouette IoU | Pose-true |
| Cameras | Median reprojection px | Sparse + dense if available |
| Dimensions | MAE, MAPE on L,B,H | vs manual; report uncertainty |
| Volume | % error vs mesh if watertight **and** calibrated; else `UNAVAILABLE` | Never vs invented cube |
| Defects | Precision/recall on visible classes | Human boxes/polygons |
| Cavities | Localization IoU; **observed** depth error only | Hidden depth = UNOBSERVED |
| Cutting | Predicted dressed dims vs post-cut | Separate predicted vs actual |
| Recovery/waste | Predicted vs actual % | Never mix |

## 5. Pass / fail (engineering, not legal)

Reconstruction **engineering gate** (example, to be frozen after first test-set run):

- mean observed IoU ≥ 0.90 on test set **or** pipeline returns recapture request instead of a twin
- no test block publishes a twin when `INSUFFICIENT_EVIDENCE`

This gate is **not** a government accuracy certification.

## 6. UI display rules

Show:

- measured IoU per view (or `Not measured`)
- coverage
- uncertainty
- `CALIBRATION_REQUIRED` / `RECAPTURE_REQUIRED`

Never show a default 75% confidence (`explanation.py` today).

## 7. Benchmark stack selection

On the **dev** granite set, compare:

1. Current OpenCV + Open3D path (baseline)
2. COLMAP/pycolmap SfM + Open3D/OpenMVS dense (if installable)
3. SuperPoint+LightGlue vs SIFT (same SfM backend)

Select the winner on **test IoU + dimension MAE + runtime**. Do not add PyTorch3D/OpenMVS unless they win.

## 8. What this audit did not do

No photographs were processed. No IoU was computed. Accuracy remains **UNMEASURED**.

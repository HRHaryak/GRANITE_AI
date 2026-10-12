from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any
from types import SimpleNamespace

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.ai.calibration import (
    detect_aruco,
    detect_measurement_board,
)
from app.ai.confidence import calculate_pipeline_confidence
from app.ai.providers.classification import GraniteClassificationProvider
from app.ai.providers.defects import EvidenceGroundedDefectProvider
from app.ai.providers.detection import get_granite_detection_provider
from app.ai.providers.depth import DepthAnythingV2Provider
from app.ai.providers.geometry import (
    localize_bbox_to_mesh,
    measure_cavity_from_polygon_on_mesh,
)
from app.ai.providers.reconstruction import ReconstructionManager
from app.ai.providers.segmentation import GraniteSegmentationManager
from app.core.config import get_settings
from app.database.session import SessionLocal
from app.geometry.open3d_processing import (
    DenseDepthObservation,
    ObservedMaskValidationObservation,
    fuse_metric_depth_maps_open3d,
    process_point_cloud_open3d,
    validate_mesh_against_observed_masks,
)
from app.geometry.trimesh_processing import validate_mesh_trimesh
from app.models.entities import (
    AnalysisJob,
    AnalysisJobTransition,
    BlockImage,
    CaptureSession,
    CuttingOptimizationResult,
    DefectResult,
    GeometryModel,
    GraniteBlock,
    GraniteClassificationResult,
    ImageValidationResult,
    MeasurementResult,
    SeigniorageAssessment,
    WastageResult,
)
from app.models.enums import (
    AnalysisState,
    AssessmentKind,
    CalibrationType,
)
from app.services.audit import audit
from app.services.cutting import (
    optimize_cutting,
    wastage_from_geometry,
)
from app.services.seigniorage import (
    active_rate,
    classify_gangsaw,
    indicative_amount,
)
from app.services.storage import get_storage


def _transition(
    db: Session,
    job: AnalysisJob,
    to_state: str,
    stage_name: str | None = None,
    progress: int | None = None,
    note: str | None = None,
) -> None:
    db.add(
        AnalysisJobTransition(
            job_id=job.id,
            from_state=job.state,
            to_state=to_state,
            note=note,
        )
    )

    job.state = to_state

    if stage_name:
        job.current_stage = stage_name

    if progress is not None:
        job.progress_percent = progress

    db.flush()


def _fail(
    db: Session,
    job: AnalysisJob,
    reason: str,
) -> None:
    job.failure_reason = reason
    job.completed_at = datetime.now(
        timezone.utc
    )

    _transition(
        db,
        job,
        AnalysisState.FAILED,
        stage_name="Analysis Failed",
        progress=100,
        note=reason,
    )

    block = db.get(
        GraniteBlock,
        job.block_id,
    )

    if block:
        block.status = "ANALYSIS_FAILED"

    audit(
        db,
        entity_type="analysis_job",
        entity_id=job.id,
        action="analysis_failed",
        actor_id=job.submitted_by_id,
        metadata={
            "reason": reason,
        },
    )

    db.commit()


def run_analysis_job(
    job_id: str,
) -> None:
    db = SessionLocal()

    try:
        _run(
            db,
            job_id,
        )
    finally:
        db.close()


def _load_bgr(
    path: str,
):
    data = get_storage().load(
        path
    )

    arr = np.frombuffer(
        data,
        dtype=np.uint8,
    )

    return cv2.imdecode(
        arr,
        cv2.IMREAD_COLOR,
    )


def _positive_finite(
    value: Any,
) -> bool:
    try:
        number = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ):
        return False

    return (
        np.isfinite(
            number
        )
        and number > 0.0
    )


def _safe_float(
    value: Any,
) -> float | None:
    try:
        number = float(
            value
        )
    except (
        TypeError,
        ValueError,
    ):
        return None

    if not np.isfinite(
        number
    ):
        return None

    return number




# DISPLAY-ONLY LEGACY HELPER.
# This function may be retained for diagnostics/preview experiments, but its
# output is NOT a production reconstruction, NOT metric geometry, and MUST NOT
# feed MeasurementResult, GeometryModel engineering dimensions, cutting,
# wastage, seigniorage, or officer-verifiable records.
def _build_connected_granite_visual_proxy_v19(
    loaded: list[tuple[str, np.ndarray, Any]],
    seg_masks: list[np.ndarray | None],
    depth_provider: Any,
    cm_per_pixel: float,
) -> dict[str, Any]:
    """Build one coherent, evidence-derived visual granite shell.

    V19 deliberately changes the V19 strategy.  V19 rotated independent depth
    sheets around an object-centred circle, which could create disconnected
    walls/plates even when each individual depth estimate was dense.  V19 first
    establishes a single coarse granite topology and then uses each uploaded
    silhouette + relative-depth map only to deform the observed face assigned to
    that topology.

    Truth boundary:
    - this is a VISUAL / NON-STATUTORY reconstruction;
    - four early captures are treated as sequential lateral observations and the
      final capture as the top/oblique observation when five or more views exist;
    - the assignment is explicitly ESTIMATED_FROM_CAPTURE_SEQUENCE;
    - no bottom face is created unless a future capture-role classifier proves a
      bottom observation;
    - centimetre scale remains display-only unless an independent metric route
      proves it.

    The objective is a single connected granite-shaped shell rather than a set of
    free-floating monocular depth sheets.  Depth Anything contributes roughness,
    not global object layout.
    """
    if len(loaded) < 2:
        return {"ok": False, "reason": "NEED_AT_LEAST_TWO_CAPTURE_VIEWS"}

    depth_outputs: dict[str, Any] = {}
    per_view: list[dict[str, Any]] = []
    view_data: list[dict[str, Any]] = []

    for idx, (side, image, _row) in enumerate(loaded):
        mask = seg_masks[idx] if idx < len(seg_masks) else None
        if mask is None:
            per_view.append({"capture_label": str(side), "status": "NO_GRANITE_MASK"})
            continue

        mask_u8 = np.asarray(mask, dtype=np.uint8)
        if mask_u8.shape[:2] != image.shape[:2]:
            mask_u8 = cv2.resize(
                mask_u8,
                (image.shape[1], image.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )
        mask_u8 = (mask_u8 > 0).astype(np.uint8)
        ys, xs = np.nonzero(mask_u8)
        if len(xs) < 300:
            per_view.append({"capture_label": str(side), "status": "MASK_TOO_SMALL"})
            continue

        try:
            depth_output = depth_provider.estimate_depth(image, granite_mask=mask_u8)
        except Exception as exc:
            per_view.append({
                "capture_label": str(side),
                "status": "DEPTH_EXCEPTION",
                "error": str(exc),
            })
            continue

        depth_outputs[str(side)] = depth_output
        rel = getattr(depth_output, "relative_depth_map", None)
        if getattr(depth_output, "status", None) != "operational" or rel is None:
            per_view.append({"capture_label": str(side), "status": "RELATIVE_DEPTH_UNAVAILABLE"})
            continue

        depth = np.asarray(rel, dtype=np.float64)
        if depth.ndim != 2:
            per_view.append({"capture_label": str(side), "status": "RELATIVE_DEPTH_INVALID"})
            continue
        if depth.shape != mask_u8.shape:
            mask_d = cv2.resize(
                mask_u8,
                (depth.shape[1], depth.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )
        else:
            mask_d = mask_u8

        dy, dx = np.nonzero(mask_d)
        valid = depth[dy, dx]
        valid = valid[np.isfinite(valid) & (valid > 0.0)]
        if len(valid) < 300:
            per_view.append({"capture_label": str(side), "status": "DEPTH_MASK_TOO_SPARSE"})
            continue

        x0, x1 = float(np.min(dx)), float(np.max(dx))
        y0, y1 = float(np.min(dy)), float(np.max(dy))
        bw = max(x1 - x0 + 1.0, 1.0)
        bh = max(y1 - y0 + 1.0, 1.0)
        d05, d50, d95 = [float(v) for v in np.percentile(valid, [5, 50, 95])]
        spread = max(d95 - d05, 1e-6)

        view_data.append({
            "idx": idx,
            "side": str(side),
            "image": image,
            "mask": mask_d,
            "depth": depth,
            "bbox": (x0, y0, x1, y1),
            "bbox_w": bw,
            "bbox_h": bh,
            "aspect": bw / bh,
            "d50": d50,
            "spread": spread,
        })

    if len(view_data) < 2:
        return {
            "ok": False,
            "reason": "INSUFFICIENT_OPERATIONAL_DEPTH_VIEWS",
            "depth_outputs": depth_outputs,
            "views": per_view,
        }

    # ------------------------------------------------------------------
    # Establish one canonical coarse granite topology.
    # ------------------------------------------------------------------
    # With the field capture flow used by this project, the first four views are
    # sequential lateral faces and the last view is usually top/oblique.  This is
    # an estimated role assignment for visualization, never metric truth.
    ordered = sorted(view_data, key=lambda row: int(row["idx"]))
    lateral = ordered[: min(4, len(ordered))]
    top_view = ordered[-1] if len(ordered) >= 5 else None

    # Use alternating side-view silhouette widths to estimate the two horizontal
    # dimensions while sharing one common height.  The values are normalized so
    # the global topology is coherent even though individual monocular views have
    # arbitrary scale.
    lateral_aspects = [max(float(v["aspect"]), 0.15) for v in lateral]
    if len(lateral_aspects) >= 3:
        width_aspect = float(np.median(lateral_aspects[0::2]))
        depth_aspect = float(np.median(lateral_aspects[1::2])) if lateral_aspects[1::2] else width_aspect * 0.75
    else:
        width_aspect = float(np.median(lateral_aspects))
        depth_aspect = max(width_aspect * 0.75, 0.35)

    Hn = 1.0
    Wn = float(np.clip(width_aspect, 0.65, 2.6))
    Dn = float(np.clip(depth_aspect, 0.55, 2.2))

    # Preserve the real local-reference scale only as a display scale.  It does
    # not grant metric authority to this estimated topology.
    observed_span_cm: list[float] = []
    for row in ordered:
        observed_span_cm.extend([
            float(row["bbox_w"]) * float(cm_per_pixel),
            float(row["bbox_h"]) * float(cm_per_pixel),
        ])
    display_height_cm = float(np.median(observed_span_cm)) if observed_span_cm else 100.0
    display_height_cm = max(display_height_cm, 10.0)
    scale = display_height_cm / Hn

    # The five supported observed roles.  There is intentionally no BOTTOM role.
    lateral_roles = ["FRONT", "RIGHT", "BACK", "LEFT"]
    all_points: list[np.ndarray] = []
    role_rows: list[dict[str, Any]] = []

    def sample_face(row: dict[str, Any], role: str) -> np.ndarray:
        mask = np.asarray(row["mask"], dtype=np.uint8)
        depth = np.asarray(row["depth"], dtype=np.float64)
        ypix, xpix = np.nonzero(mask > 0)
        max_points = 9500
        step = max(1, int(np.ceil(len(xpix) / max_points)))
        xpix = xpix[::step].astype(np.float64)
        ypix = ypix[::step].astype(np.float64)
        d = depth[ypix.astype(np.int64), xpix.astype(np.int64)]
        finite = np.isfinite(d) & (d > 0.0)
        xpix, ypix, d = xpix[finite], ypix[finite], d[finite]
        if len(xpix) == 0:
            return np.empty((0, 3), dtype=np.float64)

        x0, y0, x1, y1 = row["bbox"]
        # [-0.5, 0.5] silhouette coordinates preserve chipped/rough boundaries.
        u = (xpix - 0.5 * (x0 + x1)) / max(float(x1 - x0 + 1.0), 1.0)
        v = -(ypix - 0.5 * (y0 + y1)) / max(float(y1 - y0 + 1.0), 1.0)
        relief = np.clip((d - float(row["d50"])) / float(row["spread"]), -1.5, 1.5)

        # Limit relief to a small fraction of object size.  Depth determines local
        # roughness only; it is not allowed to pull a whole face away from the
        # shared granite topology.
        relief_gain = 0.035

        if role == "FRONT":
            x = u * Wn
            y = v * Hn
            z = np.full_like(x, +0.5 * Dn) + relief * relief_gain * Dn
        elif role == "BACK":
            x = -u * Wn
            y = v * Hn
            z = np.full_like(x, -0.5 * Dn) - relief * relief_gain * Dn
        elif role == "RIGHT":
            x = np.full_like(u, +0.5 * Wn) + relief * relief_gain * Wn
            y = v * Hn
            z = -u * Dn
        elif role == "LEFT":
            x = np.full_like(u, -0.5 * Wn) - relief * relief_gain * Wn
            y = v * Hn
            z = u * Dn
        elif role == "TOP":
            # For the oblique top image, use its silhouette to cover the horizontal
            # footprint.  The vertical relief stays small and evidence-derived.
            x = u * Wn
            z = -v * Dn
            y = np.full_like(u, +0.5 * Hn) + relief * relief_gain * Hn
        else:
            return np.empty((0, 3), dtype=np.float64)

        return np.column_stack([x, y, z])

    for j, row in enumerate(lateral):
        role = lateral_roles[j]
        pts = sample_face(row, role)
        if len(pts) < 150:
            per_view.append({
                "capture_label": row["side"],
                "status": "OBSERVED_FACE_TOO_SPARSE",
                "estimated_role": role,
            })
            continue
        all_points.append(pts)
        role_rows.append({"capture_label": row["side"], "estimated_role": role})
        per_view.append({
            "capture_label": row["side"],
            "status": "CONNECTED_OBSERVED_FACE_BUILT",
            "estimated_role": role,
            "point_count": int(len(pts)),
            "orientation_source": "ESTIMATED_FROM_CAPTURE_SEQUENCE",
            "topology_source": "SHARED_CANONICAL_GRANITE_SHELL",
            "metric_authority": False,
        })

    if top_view is not None and top_view not in lateral:
        top_pts = sample_face(top_view, "TOP")
        if len(top_pts) >= 150:
            all_points.append(top_pts)
            role_rows.append({"capture_label": top_view["side"], "estimated_role": "TOP"})
            per_view.append({
                "capture_label": top_view["side"],
                "status": "CONNECTED_OBSERVED_FACE_BUILT",
                "estimated_role": "TOP",
                "point_count": int(len(top_pts)),
                "orientation_source": "ESTIMATED_FROM_CAPTURE_SEQUENCE",
                "topology_source": "SHARED_CANONICAL_GRANITE_SHELL",
                "metric_authority": False,
            })

    if len(all_points) < 2:
        return {
            "ok": False,
            "reason": "CONNECTED_FACE_BUILD_FAILED",
            "depth_outputs": depth_outputs,
            "views": per_view,
        }

    # ------------------------------------------------------------------
    # Evidence-grounded edge stitching.
    # ------------------------------------------------------------------
    # Adjacent observed faces must meet.  Add narrow edge samples only for edges
    # whose two incident face roles were actually observed.  These are estimated
    # topology constraints derived from those observed faces, not hidden surfaces.
    observed_roles = {row["estimated_role"] for row in role_rows}
    edge_points: list[np.ndarray] = []
    t = np.linspace(-0.5, 0.5, 180, dtype=np.float64)
    edge_pairs = [
        ("FRONT", "RIGHT", np.column_stack([np.full_like(t, +0.5 * Wn), t * Hn, np.full_like(t, +0.5 * Dn)])),
        ("RIGHT", "BACK", np.column_stack([np.full_like(t, +0.5 * Wn), t * Hn, np.full_like(t, -0.5 * Dn)])),
        ("BACK", "LEFT", np.column_stack([np.full_like(t, -0.5 * Wn), t * Hn, np.full_like(t, -0.5 * Dn)])),
        ("LEFT", "FRONT", np.column_stack([np.full_like(t, -0.5 * Wn), t * Hn, np.full_like(t, +0.5 * Dn)])),
    ]
    for ra, rb, pts in edge_pairs:
        if ra in observed_roles and rb in observed_roles:
            edge_points.append(pts)

    if "TOP" in observed_roles:
        sW = np.linspace(-0.5, 0.5, 220, dtype=np.float64)
        sD = np.linspace(-0.5, 0.5, 180, dtype=np.float64)
        if "FRONT" in observed_roles:
            edge_points.append(np.column_stack([sW * Wn, np.full_like(sW, +0.5 * Hn), np.full_like(sW, +0.5 * Dn)]))
        if "BACK" in observed_roles:
            edge_points.append(np.column_stack([sW * Wn, np.full_like(sW, +0.5 * Hn), np.full_like(sW, -0.5 * Dn)]))
        if "RIGHT" in observed_roles:
            edge_points.append(np.column_stack([np.full_like(sD, +0.5 * Wn), np.full_like(sD, +0.5 * Hn), sD * Dn]))
        if "LEFT" in observed_roles:
            edge_points.append(np.column_stack([np.full_like(sD, -0.5 * Wn), np.full_like(sD, +0.5 * Hn), sD * Dn]))

    points = np.vstack(all_points + edge_points)
    points = points[np.isfinite(points).all(axis=1)]
    if len(points) < 800:
        return {
            "ok": False,
            "reason": "CONNECTED_PROXY_POINT_COUNT_TOO_LOW",
            "depth_outputs": depth_outputs,
            "views": per_view,
        }

    # Voxel-average duplicates/near-duplicates to make the shell stable for
    # Open3D Ball Pivoting while preserving rough observed boundaries.
    extent = np.ptp(points, axis=0)
    diag = max(float(np.linalg.norm(extent)), 1e-6)
    voxel = max(diag / 260.0, 1e-5)
    keys = np.floor(points / voxel).astype(np.int64)
    unique, inv = np.unique(keys, axis=0, return_inverse=True)
    sums = np.zeros((len(unique), 3), dtype=np.float64)
    counts = np.zeros(len(unique), dtype=np.int64)
    np.add.at(sums, inv, points)
    np.add.at(counts, inv, 1)
    points = sums / np.maximum(counts[:, None], 1)
    if len(points) > 36000:
        stride = int(np.ceil(len(points) / 36000))
        points = points[::stride]

    points_display = points * scale
    ext = np.ptp(points_display, axis=0)
    ext_sorted = sorted([float(v) for v in ext], reverse=True)
    while len(ext_sorted) < 3:
        ext_sorted.append(max(ext_sorted[-1] if ext_sorted else 1.0, 1.0))

    return {
        "ok": True,
        "provider": "ConnectedGraniteTopologyDepthProxyV19",
        "points": points_display,
        "extents_cm": ext_sorted[:3],
        "uncertainty_cm": [max(v * 0.30, 1.0) for v in ext_sorted[:3]],
        "confidence": 0.66,
        "depth_outputs": depth_outputs,
        "views": per_view,
        "diagnostics": {
            "route": "CONNECTED_SILHOUETTE_DEPTH_GRANITE_PROXY_V19",
            "point_count": int(len(points_display)),
            "observed_face_roles": sorted(observed_roles),
            "bottom_face_created": False,
            "surface_completion_performed": False,
            "hidden_surfaces_synthesized": False,
            "topology_semantics": "SHARED_CONNECTED_COARSE_GRANITE_TOPOLOGY_WITH_OBSERVED_FACE_DEFORMATION",
            "orientation_semantics": "ESTIMATED_FROM_CAPTURE_SEQUENCE_FOR_VISUALIZATION_ONLY",
            "relative_depth_role": "LOCAL_SURFACE_RELIEF_ONLY_NOT_GLOBAL_LAYOUT",
            "coordinate_scale": "DISPLAY_SCALED_NON_STATUTORY_VISUAL_PROXY",
            "metric_authority": False,
            "engineering_measurement_authority": False,
            "cut_visualization_authority": True,
            "runtime_goal": "DEPTH_FIRST_CONNECTED_PROXY_WITHOUT_FULL_LIGHTGLUE_OR_GLOBAL_BA",
        },
    }


def _classify_irregular_surface_evidence(
    open3d_result: Any,
    geometry_point_source: str,
) -> dict[str, Any]:
    """
    Classify whether an Open3D mesh is strong enough to be exposed as the RAW
    irregular granite digital twin.

    This gate is intentionally stricter than "mesh exists":
    - sparse SfM is valuable reconstruction evidence, but it is not dense enough
      by itself to authorize a production raw-stone surface;
    - tiny/fallback/bounding/hull meshes are never raw granite;
    - only a sufficiently populated observed-surface mesh produced from dense,
      multi-view metric evidence is authorized for engineering surface modes.

    The sparse point cloud remains available for diagnostics and measurement
    provenance even when this gate is closed.
    """
    vertices = list(
        getattr(
            open3d_result,
            "mesh_vertices",
            None,
        )
        or []
    )
    triangles = list(
        getattr(
            open3d_result,
            "mesh_triangles",
            None,
        )
        or []
    )

    method = str(
        getattr(
            open3d_result,
            "mesh_method",
            "",
        )
        or ""
    ).upper()

    status = str(
        getattr(
            open3d_result,
            "mesh_status",
            "",
        )
        or ""
    ).upper()

    vertex_count = len(vertices)
    triangle_count = len(triangles)

    rejected_method_tokens = (
        "SPARSE",
        "FALLBACK",
        "BOUNDING",
        "BBOX",
        "BOX",
        "CUBOID",
        "ENVELOPE",
        "AABB",
        "OBB",
        "CONVEX_HULL",
        "SILHOUETTE_HULL",
        "VISUAL_HULL",
    )

    rejected_status_tokens = (
        "FAILED",
        "INSUFFICIENT",
        "NO_TRIANGLES",
        "ALL_TRIANGLES_REJECTED",
        "NOT_CALCULATED",
        "UNAVAILABLE",
    )

    reasons: list[str] = []

    if vertex_count < 24:
        reasons.append(
            f"mesh_vertex_count_below_gate:{vertex_count}<24"
        )

    if triangle_count < 30:
        reasons.append(
            f"mesh_triangle_count_below_gate:{triangle_count}<30"
        )

    if any(
        token in method
        for token in rejected_method_tokens
    ):
        reasons.append(
            "mesh_method_is_diagnostic_or_envelope_fallback"
        )

    if any(
        token in status
        for token in rejected_status_tokens
    ):
        reasons.append(
            f"mesh_status_not_production_ready:{status or 'UNKNOWN'}"
        )

    dense_multiview_metric = (
        geometry_point_source
        == "DENSE_MULTIVIEW_METRIC_DEPTH_CONSENSUS"
    )
    visual_relative_proxy = geometry_point_source in {
        "DENSE_MULTIVIEW_RELATIVE_SFM_FUSION",
        "CONNECTED_SILHOUETTE_DEPTH_GRANITE_PROXY_V19",
    }

    source_reasons = list(reasons)
    if not dense_multiview_metric and not visual_relative_proxy:
        source_reasons.append(
            "surface_source_is_sparse_sfm_not_dense_multiview_observed_surface"
        )

    visual_allowed = len(source_reasons) == 0
    engineering_allowed = bool(visual_allowed and dense_multiview_metric)

    return {
        "raw_digital_twin_allowed": visual_allowed,
        "engineering_surface_modes_allowed": engineering_allowed,
        "visual_cut_simulation_allowed": visual_allowed,
        "metric_authority": engineering_allowed,
        "geometry_point_source": geometry_point_source,
        "mesh_vertex_count": vertex_count,
        "mesh_triangle_count": triangle_count,
        "mesh_status": status or None,
        "mesh_method": method or None,
        "dense_multiview_metric_source": dense_multiview_metric,
        "visual_relative_proxy_source": visual_relative_proxy,
        "rejection_reasons": source_reasons,
        "policy": (
            "A sufficiently populated observed irregular mesh may be exposed as a visual RAW proxy even when non-metric. "
            "Engineering dimensions/royalty remain locked unless dense multi-view metric evidence is proven. "
            "Sparse SfM alone remains diagnostic evidence only."
        ),
    }


def _metadata_dict(
    value: Any,
) -> dict[str, Any]:
    """
    Return persisted metadata as a plain dictionary without fabricating values.

    SQLAlchemy JSON columns normally return dicts, but older rows or alternate
    storage backends may expose serialized JSON strings. Malformed/non-object
    payloads are treated as unavailable evidence.
    """
    if isinstance(
        value,
        dict,
    ):
        return value

    if isinstance(
        value,
        str,
    ):
        try:
            parsed = json.loads(
                value
            )
        except (
            TypeError,
            ValueError,
            json.JSONDecodeError,
        ):
            return {}

        return (
            parsed
            if isinstance(
                parsed,
                dict,
            )
            else {}
        )

    return {}


def _camera_metadata_for_image(
    image_row: BlockImage,
) -> dict[str, Any]:
    """
    Extract the exact persisted camera/capture metadata for one image.

    This function intentionally performs no intrinsic estimation itself. It
    only forwards evidence captured at upload time to the calibration layer.
    """
    metadata = _metadata_dict(
        getattr(
            image_row,
            "device_metadata",
            None,
        )
    )

    return dict(
        metadata
    )


def _classification_rank(
    result: Any,
) -> tuple[
    int,
    float,
]:
    """
    Rank classification outputs without inventing confidence.

    A result with an actual classification is preferred. Confidence is only a
    secondary ranking signal when the provider supplied one.
    """
    if result is None:
        return (
            0,
            -1.0,
        )

    classification = getattr(
        result,
        "classification",
        None,
    )

    confidence = _safe_float(
        getattr(
            result,
            "confidence",
            None,
        )
    )

    return (
        1
        if classification
        else 0,
        confidence
        if confidence is not None
        else -1.0,
    )


def _choose_multiview_classification(
    provider: GraniteClassificationProvider,
    loaded: list[
        tuple[
            str,
            np.ndarray,
            BlockImage,
        ]
    ],
):
    """
    Evaluate all usable views and retain the strongest provider-supported
    result.

    This avoids pretending that one arbitrary first photograph represents the
    full block. It does not synthesize a consensus confidence.
    """
    outputs = []

    for _side, image, _row in loaded:
        try:
            outputs.append(
                provider.classify(
                    image
                )
            )
        except Exception:
            # Provider failures on one view must not fabricate a classification
            # and must not prevent other real views from being attempted.
            continue

    if not outputs:
        return None

    return max(
        outputs,
        key=_classification_rank,
    )


def _defect_location_or_none(
    finding: Any,
):
    location = getattr(
        finding,
        "location",
        None,
    )

    if location:
        return location

    bbox = getattr(
        finding,
        "bbox",
        None,
    )

    # Do not synthesize a center unless the provider actually supplied the
    # bounding box from which that center can be derived.
    if (
        isinstance(
            bbox,
            (list, tuple),
        )
        and len(
            bbox
        ) >= 4
    ):
        try:
            x1, y1, x2, y2 = [
                float(v)
                for v in bbox[:4]
            ]

            if all(
                np.isfinite(
                    [
                        x1,
                        y1,
                        x2,
                        y2,
                    ]
                )
            ):
                return {
                    "bbox_center_x": round(
                        (
                            x1
                            + x2
                        )
                        / 2.0,
                        6,
                    ),
                    "bbox_center_y": round(
                        (
                            y1
                            + y2
                        )
                        / 2.0,
                        6,
                    ),
                    "source": (
                        "DERIVED_FROM_PROVIDER_BBOX"
                    ),
                }
        except Exception:
            pass

    return None


def _measurable_defect_exclusion_cm3(
    findings: list[
        dict[str, Any]
    ],
) -> tuple[
    float,
    dict[str, Any],
]:
    """
    A physical exclusion volume requires measurable area *and* depth.

    Current visible-image defect analysis deliberately reports depth as
    unobserved, so this function normally returns zero rather than creating an
    arbitrary percentage of block volume.
    """
    total_cm3 = 0.0
    measured_count = 0

    for finding in findings:
        area = _safe_float(
            finding.get(
                "estimated_area_cm2"
            )
        )

        depth_mm = _safe_float(
            finding.get(
                "depth_mm"
            )
        )

        if (
            area is None
            or area <= 0.0
            or depth_mm is None
            or depth_mm <= 0.0
        ):
            continue

        depth_cm = (
            depth_mm
            / 10.0
        )

        total_cm3 += (
            area
            * depth_cm
        )

        measured_count += 1

    return (
        round(
            total_cm3,
            1,
        ),
        {
            "method": (
                "SUM_MEASURED_AREA_TIMES_MEASURED_DEPTH"
            ),
            "measured_findings": (
                measured_count
            ),
            "unmeasured_findings": (
                len(
                    findings
                )
                - measured_count
            ),
            "warning": (
                "Visible-image findings without measurable physical depth do "
                "not contribute synthetic exclusion volume."
            ),
        },
    )


def _explicit_camera_matrix_from_mapping(
    value: Any,
) -> np.ndarray | None:
    """
    Recover camera intrinsics only from explicit persisted evidence.

    No focal length is inferred from image size here. Dense metric fusion must
    use a camera matrix that was actually supplied by calibration/reconstruction
    evidence.
    """
    if not isinstance(value, dict):
        return None

    for key in (
        "camera_matrix",
        "matrix",
        "K",
        "intrinsic_matrix",
    ):
        candidate = value.get(key)
        if candidate is None:
            continue

        try:
            matrix = np.asarray(
                candidate,
                dtype=np.float64,
            ).reshape(3, 3)
        except Exception:
            continue

        if (
            np.isfinite(matrix).all()
            and matrix[0, 0] > 0.0
            and matrix[1, 1] > 0.0
        ):
            return matrix

    fx = _safe_float(
        value.get("fx_px")
        if "fx_px" in value
        else value.get("fx")
    )
    fy = _safe_float(
        value.get("fy_px")
        if "fy_px" in value
        else value.get("fy")
    )
    cx = _safe_float(
        value.get("cx_px")
        if "cx_px" in value
        else value.get("cx")
    )
    cy = _safe_float(
        value.get("cy_px")
        if "cy_px" in value
        else value.get("cy")
    )

    if (
        fx is None
        or fy is None
        or cx is None
        or cy is None
        or fx <= 0.0
        or fy <= 0.0
    ):
        return None

    return np.asarray(
        [
            [fx, 0.0, cx],
            [0.0, fy, cy],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )


def _camera_matrix_for_dense_fusion(
    camera_row: dict[str, Any],
    calibration_row: dict[str, Any] | None,
) -> tuple[np.ndarray | None, str | None]:
    """
    Prefer the reconstruction camera contract, then explicit calibration K.
    """
    direct = camera_row.get(
        "camera_matrix"
    )

    if direct is not None:
        try:
            matrix = np.asarray(
                direct,
                dtype=np.float64,
            ).reshape(3, 3)

            if (
                np.isfinite(matrix).all()
                and matrix[0, 0] > 0.0
                and matrix[1, 1] > 0.0
            ):
                return (
                    matrix,
                    str(
                        camera_row.get(
                            "intrinsics_source"
                        )
                        or "RECONSTRUCTION_CAMERA_CONTRACT"
                    ),
                )
        except Exception:
            pass

    if isinstance(
        calibration_row,
        dict,
    ):
        matrix = (
            _explicit_camera_matrix_from_mapping(
                calibration_row.get(
                    "camera_intrinsics"
                )
            )
        )

        if matrix is None:
            details = calibration_row.get(
                "details"
            )
            if isinstance(
                details,
                dict,
            ):
                matrix = (
                    _explicit_camera_matrix_from_mapping(
                        details.get(
                            "camera_intrinsics"
                        )
                    )
                )

        if matrix is not None:
            return (
                matrix,
                "PERSISTED_CALIBRATION_INTRINSICS",
            )

    return (
        None,
        None,
    )


def _save_relative_depth_artifact(
    *,
    job_id: str,
    image_id: str,
    relative_depth: np.ndarray,
    granite_mask: np.ndarray | None,
) -> str | None:
    """
    Persist model-relative depth as evidence without relabelling it metric.

    NPZ keeps the dense float map compact and avoids enormous JSON payloads.
    """
    try:
        depth = np.asarray(
            relative_depth,
            dtype=np.float32,
        )

        if (
            depth.ndim != 2
            or depth.size == 0
            or not np.isfinite(
                depth
            ).any()
        ):
            return None

        mask_payload = (
            np.asarray(
                granite_mask,
                dtype=np.uint8,
            )
            if granite_mask
            is not None
            else np.empty(
                (0, 0),
                dtype=np.uint8,
            )
        )

        buffer = io.BytesIO()

        np.savez_compressed(
            buffer,
            relative_depth=depth,
            granite_mask=(
                mask_payload
            ),
            depth_semantics=np.asarray(
                [
                    "MODEL_RELATIVE_MONOCULAR_DEPTH"
                ],
                dtype="U64",
            ),
        )

        relative_path = (
            f"geometry/{job_id}/depth/"
            f"{image_id}_relative_depth.npz"
        )

        get_storage().save(
            relative_path,
            buffer.getvalue(),
            "application/octet-stream",
        )

        return relative_path

    except Exception:
        return None




def _robust_relative_depth_to_sfm_mapping(
    relative_depth: np.ndarray,
    anchors: list[dict[str, Any]],
    *,
    source_width_px: int,
    source_height_px: int,
) -> dict[str, Any]:
    """Fit relative monocular depth to camera-Z in the current SfM frame.

    This is deliberately non-metric unless the reconstruction itself is metric.
    The fit uses only real sparse SfM track anchors exported by reconstruction
    V16.  Several monotonic model families are evaluated because monocular
    depth providers may expose depth-like or inverse-depth-like values.
    """
    depth = np.asarray(relative_depth, dtype=np.float64)
    if depth.ndim != 2 or depth.size == 0:
        return {"ok": False, "reason": "RELATIVE_DEPTH_MAP_INVALID"}

    h, w = depth.shape
    sw = max(int(source_width_px or w), 1)
    sh = max(int(source_height_px or h), 1)
    samples: list[tuple[float, float]] = []

    for row in anchors or []:
        if not isinstance(row, dict):
            continue
        try:
            u = float(row.get("u_px"))
            v = float(row.get("v_px"))
            z = float(row.get("camera_z_sfm"))
        except (TypeError, ValueError):
            continue
        if not (np.isfinite(u) and np.isfinite(v) and np.isfinite(z) and z > 0.0):
            continue
        x = int(np.clip(round(u * (w / sw)), 0, w - 1))
        y = int(np.clip(round(v * (h / sh)), 0, h - 1))
        d = float(depth[y, x])
        if np.isfinite(d) and d > 0.0:
            samples.append((d, z))

    if len(samples) < 8:
        return {
            "ok": False,
            "reason": "INSUFFICIENT_SPARSE_DEPTH_ALIGNMENT_ANCHORS",
            "anchor_count": len(samples),
            "required_anchor_count": 8,
        }

    arr = np.asarray(samples, dtype=np.float64)
    d_all = arr[:, 0]
    z_all = arr[:, 1]
    eps = max(float(np.nanmedian(d_all)) * 1e-6, 1e-9)

    model_specs = {
        "AFFINE_DEPTH_TO_Z": lambda d: np.column_stack([d, np.ones_like(d)]),
        "AFFINE_INVERSE_DEPTH_TO_Z": lambda d: np.column_stack([1.0 / (d + eps), np.ones_like(d)]),
        "AFFINE_DEPTH_TO_INVERSE_Z": lambda d: np.column_stack([d, np.ones_like(d)]),
    }

    candidates: list[dict[str, Any]] = []
    for name, design_fn in model_specs.items():
        keep = np.ones(len(d_all), dtype=bool)
        coef = None
        for _ in range(4):
            if int(keep.sum()) < 8:
                break
            X = design_fn(d_all[keep])
            target = (1.0 / z_all[keep]) if name == "AFFINE_DEPTH_TO_INVERSE_Z" else z_all[keep]
            try:
                coef, *_ = np.linalg.lstsq(X, target, rcond=None)
            except Exception:
                coef = None
                break
            pred_raw = design_fn(d_all) @ coef
            if name == "AFFINE_DEPTH_TO_INVERSE_Z":
                valid_raw = pred_raw > 1e-12
                pred = np.full_like(pred_raw, np.nan)
                pred[valid_raw] = 1.0 / pred_raw[valid_raw]
            else:
                pred = pred_raw
            residual = np.abs(pred - z_all)
            finite = np.isfinite(residual) & np.isfinite(pred) & (pred > 0.0)
            if int(finite.sum()) < 8:
                break
            med = float(np.median(residual[finite]))
            mad = float(np.median(np.abs(residual[finite] - med)))
            threshold = med + max(3.5 * 1.4826 * mad, max(float(np.median(z_all)) * 0.02, 1e-6))
            new_keep = finite & (residual <= threshold)
            if np.array_equal(new_keep, keep):
                keep = new_keep
                break
            keep = new_keep

        if coef is None or int(keep.sum()) < 8:
            continue
        pred_raw = design_fn(d_all) @ coef
        if name == "AFFINE_DEPTH_TO_INVERSE_Z":
            valid_raw = pred_raw > 1e-12
            pred = np.full_like(pred_raw, np.nan)
            pred[valid_raw] = 1.0 / pred_raw[valid_raw]
        else:
            pred = pred_raw
        valid = keep & np.isfinite(pred) & (pred > 0.0)
        if int(valid.sum()) < 8:
            continue
        residual = pred[valid] - z_all[valid]
        rmse = float(np.sqrt(np.mean(residual ** 2)))
        z_scale = max(float(np.median(z_all[valid])), 1e-9)
        nrmse = rmse / z_scale
        corr = float(np.corrcoef(pred[valid], z_all[valid])[0, 1]) if int(valid.sum()) >= 3 else 0.0
        if not np.isfinite(corr):
            corr = 0.0
        candidates.append({
            "name": name,
            "coef": np.asarray(coef, dtype=np.float64),
            "inlier_mask": valid,
            "inlier_count": int(valid.sum()),
            "anchor_count": int(len(d_all)),
            "rmse_sfm": rmse,
            "normalized_rmse": nrmse,
            "correlation": corr,
            "score": nrmse + 0.15 * max(0.0, 0.5 - corr),
        })

    if not candidates:
        return {"ok": False, "reason": "NO_STABLE_RELATIVE_DEPTH_ALIGNMENT_MODEL", "anchor_count": len(samples)}

    best = min(candidates, key=lambda row: row["score"])
    # Keep the gate permissive enough for rough visual surface recovery while
    # rejecting clearly unrelated monocular-depth/SfM fits.
    accepted = bool(best["inlier_count"] >= 8 and best["normalized_rmse"] <= 0.35)
    return {
        "ok": accepted,
        "reason": None if accepted else "RELATIVE_DEPTH_ALIGNMENT_RESIDUAL_TOO_HIGH",
        "model": best["name"],
        "coefficients": best["coef"].tolist(),
        "anchor_count": best["anchor_count"],
        "inlier_count": best["inlier_count"],
        "rmse_sfm": round(best["rmse_sfm"], 8),
        "normalized_rmse": round(best["normalized_rmse"], 6),
        "correlation": round(best["correlation"], 6),
        "metric_authority": False,
        "coordinate_scale": "SFM_RELATIVE_SCALE",
    }


def _apply_relative_depth_alignment(depth: np.ndarray, fit: dict[str, Any]) -> np.ndarray:
    d = np.asarray(depth, dtype=np.float64)
    coef = np.asarray(fit.get("coefficients"), dtype=np.float64).reshape(2)
    model = str(fit.get("model") or "")
    eps = max(float(np.nanmedian(d[np.isfinite(d) & (d > 0.0)])) * 1e-6, 1e-9)
    if model == "AFFINE_DEPTH_TO_Z":
        z = coef[0] * d + coef[1]
    elif model == "AFFINE_INVERSE_DEPTH_TO_Z":
        z = coef[0] / (d + eps) + coef[1]
    elif model == "AFFINE_DEPTH_TO_INVERSE_Z":
        inv_z = coef[0] * d + coef[1]
        z = np.full_like(inv_z, np.nan)
        valid = inv_z > 1e-12
        z[valid] = 1.0 / inv_z[valid]
    else:
        return np.full_like(d, np.nan)
    z[~np.isfinite(z) | (z <= 0.0)] = np.nan
    return z


def _backproject_relative_depth_to_sfm_points(
    *,
    relative_depth: np.ndarray,
    fit: dict[str, Any],
    camera_matrix: np.ndarray,
    world_from_camera: Any,
    granite_mask: np.ndarray | None,
    source_width_px: int,
    source_height_px: int,
    max_points: int = 12000,
) -> np.ndarray:
    """Back-project an aligned relative-depth map into the registered SfM frame."""
    depth = np.asarray(relative_depth, dtype=np.float64)
    h, w = depth.shape
    sw = max(int(source_width_px or w), 1)
    sh = max(int(source_height_px or h), 1)
    K = np.asarray(camera_matrix, dtype=np.float64).reshape(3, 3).copy()
    K[0, 0] *= w / sw
    K[0, 2] *= w / sw
    K[1, 1] *= h / sh
    K[1, 2] *= h / sh
    if K[0, 0] <= 0.0 or K[1, 1] <= 0.0:
        return np.empty((0, 3), dtype=np.float64)

    z = _apply_relative_depth_alignment(depth, fit)
    valid = np.isfinite(z) & (z > 0.0) & np.isfinite(depth) & (depth > 0.0)
    if granite_mask is not None:
        mask = np.asarray(granite_mask, dtype=np.uint8)
        if mask.shape != (h, w):
            mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
        valid &= mask > 0
    ys, xs = np.nonzero(valid)
    if len(xs) == 0:
        return np.empty((0, 3), dtype=np.float64)
    stride = max(1, int(np.ceil(len(xs) / max(int(max_points), 1))))
    xs = xs[::stride]
    ys = ys[::stride]
    zz = z[ys, xs]
    xx = (xs.astype(np.float64) - K[0, 2]) * zz / K[0, 0]
    yy = (ys.astype(np.float64) - K[1, 2]) * zz / K[1, 1]
    camera_points = np.column_stack([xx, yy, zz, np.ones_like(zz)])
    W = np.asarray(world_from_camera, dtype=np.float64).reshape(4, 4)
    world = (W @ camera_points.T).T[:, :3]
    finite = np.isfinite(world).all(axis=1)
    return world[finite]


def _fuse_relative_sfm_point_sets(point_sets: list[np.ndarray], sparse_points: Any) -> tuple[np.ndarray, dict[str, Any]]:
    """Fuse observed per-view points without completing unseen granite surfaces."""
    valid_sets = [np.asarray(p, dtype=np.float64).reshape(-1, 3) for p in point_sets if p is not None and np.asarray(p).size >= 3]
    if not valid_sets:
        return np.empty((0, 3), dtype=np.float64), {"status": "NO_ALIGNED_RELATIVE_DEPTH_POINTS"}
    all_points = np.vstack(valid_sets)
    sparse = np.asarray(sparse_points or [], dtype=np.float64).reshape(-1, 3)
    reference = sparse if len(sparse) >= 4 else all_points
    extent = np.ptp(reference, axis=0)
    diagonal = float(np.linalg.norm(extent))
    voxel = max(diagonal / 180.0, 1e-6)
    keys = np.floor(all_points / voxel).astype(np.int64)
    # Deterministic voxel centroid reduction.  This is density control only;
    # it does not create points or fill holes.
    unique, inverse = np.unique(keys, axis=0, return_inverse=True)
    sums = np.zeros((len(unique), 3), dtype=np.float64)
    counts = np.zeros(len(unique), dtype=np.int64)
    np.add.at(sums, inverse, all_points)
    np.add.at(counts, inverse, 1)
    fused = sums / np.maximum(counts[:, None], 1)
    if len(fused) > 30000:
        step = int(np.ceil(len(fused) / 30000))
        fused = fused[::step]
    return fused, {
        "status": "FUSED_OBSERVED_RELATIVE_DEPTH_IN_SFM_FRAME",
        "input_view_count": len(valid_sets),
        "input_point_count": int(len(all_points)),
        "fused_point_count": int(len(fused)),
        "voxel_size_sfm_units": float(voxel),
        "surface_completion_performed": False,
        "hidden_surfaces_synthesized": False,
        "metric_authority": False,
        "coordinate_scale": "SFM_RELATIVE_SCALE",
    }



def _localize_visible_defect_on_observed_mesh(
    *,
    side: str,
    bbox: Any,
    camera_rows_by_label: dict[str, dict[str, Any]],
    calibration_by_label: dict[str, dict[str, Any]],
    open3d_result: Any,
    raw_digital_twin_allowed: bool,
    reconstruction_metric_ready: bool,
) -> dict[str, Any]:
    """Localize a provider-supplied 2D defect bbox onto the validated RAW mesh.

    Truth boundary:
    - localization is authorized only for the production irregular mesh gate;
    - camera pose must be in GLOBAL_METRIC_CENTIMETRES;
    - intrinsics must come from the reconstruction/calibration contract;
    - a missed ray remains unlocalized;
    - this never converts a surface hit into defect penetration depth.
    """
    base: dict[str, Any] = {
        "ok": False,
        "status": "3D_LOCALIZATION_NOT_ATTEMPTED",
        "point_cm": None,
        "triangle_index": None,
        "support_hits": 0,
        "support_samples": 0,
        "support_fraction": 0.0,
        "depth_mm": None,
        "depth_status": "UNOBSERVED",
        "internal_continuation": "UNOBSERVED",
        "coordinate_scale": None,
        "surface_provenance": None,
    }

    if not raw_digital_twin_allowed:
        base["status"] = "RAW_IRREGULAR_MESH_NOT_AUTHORIZED"
        return base

    if not reconstruction_metric_ready:
        base["status"] = "GLOBAL_METRIC_RECONSTRUCTION_NOT_SOLVED"
        return base

    if not isinstance(bbox, (list, tuple)) or len(bbox) < 4:
        base["status"] = "PROVIDER_BBOX_UNAVAILABLE"
        return base

    camera_row = camera_rows_by_label.get(str(side))
    if not isinstance(camera_row, dict):
        base["status"] = "REGISTERED_CAMERA_NOT_AVAILABLE_FOR_CAPTURE"
        return base

    if (
        not camera_row.get("metric_scale_solved")
        or str(camera_row.get("coordinate_scale") or "")
        != "GLOBAL_METRIC_CENTIMETRES"
    ):
        base["status"] = "REGISTERED_CAMERA_NOT_IN_GLOBAL_METRIC_CENTIMETRES"
        return base

    world_from_camera = camera_row.get("world_from_camera")
    if world_from_camera is None:
        base["status"] = "WORLD_FROM_CAMERA_UNAVAILABLE"
        return base

    camera_matrix, intrinsics_source = _camera_matrix_for_dense_fusion(
        camera_row,
        calibration_by_label.get(str(side)),
    )
    if camera_matrix is None:
        base["status"] = "EXPLICIT_CAMERA_INTRINSICS_UNAVAILABLE"
        return base

    vertices = getattr(open3d_result, "mesh_vertices", None) or []
    triangles = getattr(open3d_result, "mesh_triangles", None) or []
    if not vertices or not triangles:
        base["status"] = "OBSERVED_IRREGULAR_MESH_UNAVAILABLE"
        return base

    try:
        localized = localize_bbox_to_mesh(
            bbox,
            camera_matrix,
            world_from_camera,
            vertices,
            triangles,
        )
    except Exception as exc:
        base["status"] = "DEFECT_MESH_LOCALIZATION_EXCEPTION"
        base["diagnostics"] = {"error": str(exc)}
        return base

    if not isinstance(localized, dict):
        base["status"] = "DEFECT_MESH_LOCALIZATION_INVALID_RESULT"
        return base

    result = {**base, **localized}
    result["coordinate_scale"] = "GLOBAL_METRIC_CENTIMETRES"
    result["intrinsics_source"] = intrinsics_source
    result["camera_capture_label"] = str(side)
    result["camera_contract_source"] = "RECONSTRUCTION_REGISTERED_CAMERA"
    result["surface_provenance"] = (
        localized.get("surface_provenance")
        if localized.get("ok")
        else None
    )
    return result



_CAVITY_FINDING_TOKENS = (
    "HOLE",
    "PIT",
    "CAVITY",
    "VOID",
    "DEPRESSION",
)


def _is_visible_cavity_kind(value: Any) -> bool:
    """Return True only for explicitly labelled visible cavity findings."""
    normalized = (
        str(value or "")
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )
    return any(token in normalized for token in _CAVITY_FINDING_TOKENS)


def _measure_visible_cavity_on_observed_mesh(
    *,
    side: str,
    polygon_xy: Any,
    camera_rows_by_label: dict[str, dict[str, Any]],
    calibration_by_label: dict[str, dict[str, Any]],
    open3d_result: Any,
    raw_digital_twin_allowed: bool,
    reconstruction_metric_ready: bool,
    geometry_point_source: str,
) -> dict[str, Any]:
    """Measure one visible cavity only from the authorized metric RAW mesh.

    Truth boundary:
    - an exact provider segmentation polygon is required;
    - only DENSE_MULTIVIEW_METRIC_DEPTH_CONSENSUS is accepted as the cavity
      engineering surface source;
    - the registered camera must be in GLOBAL_METRIC_CENTIMETRES;
    - explicit intrinsics are required;
    - missing cavity interior evidence remains UNOBSERVED;
    - visual/relative proxies never receive metric cavity measurements.
    """
    base: dict[str, Any] = {
        "ok": False,
        "status": "CAVITY_MEASUREMENT_NOT_ATTEMPTED",
        "opening_width_cm": None,
        "opening_height_cm": None,
        "opening_area_cm2": None,
        "max_observed_depth_cm": None,
        "mean_observed_depth_cm": None,
        "visible_cavity_volume_cm3": None,
        "depth_mm": None,
        "depth_provenance": "UNOBSERVED",
        "measurement_provenance": "UNOBSERVED",
        "cavity_measurement_status": "INSUFFICIENT_METRIC_EVIDENCE",
        "internal_continuation": "UNOBSERVED",
        "rim_points_3d_cm": [],
        "interior_points_3d_cm": [],
    }

    if not raw_digital_twin_allowed:
        base["status"] = "RAW_IRREGULAR_MESH_NOT_AUTHORIZED"
        return base

    if str(geometry_point_source or "") != "DENSE_MULTIVIEW_METRIC_DEPTH_CONSENSUS":
        base["status"] = "DENSE_MULTIVIEW_METRIC_CAVITY_SURFACE_REQUIRED"
        base["blocked_geometry_point_source"] = str(geometry_point_source or "")
        return base

    if not reconstruction_metric_ready:
        base["status"] = "GLOBAL_METRIC_RECONSTRUCTION_NOT_SOLVED"
        return base

    if not isinstance(polygon_xy, (list, tuple)) or len(polygon_xy) < 3:
        base["status"] = "CAVITY_SEGMENTATION_POLYGON_UNAVAILABLE"
        base["cavity_measurement_status"] = "DETECTED_2D_ONLY"
        return base

    camera_row = camera_rows_by_label.get(str(side))
    if not isinstance(camera_row, dict):
        base["status"] = "REGISTERED_CAMERA_NOT_AVAILABLE_FOR_CAPTURE"
        return base

    if (
        not camera_row.get("metric_scale_solved")
        or str(camera_row.get("coordinate_scale") or "")
        != "GLOBAL_METRIC_CENTIMETRES"
    ):
        base["status"] = "REGISTERED_CAMERA_NOT_IN_GLOBAL_METRIC_CENTIMETRES"
        return base

    world_from_camera = camera_row.get("world_from_camera")
    if world_from_camera is None:
        base["status"] = "WORLD_FROM_CAMERA_UNAVAILABLE"
        return base

    camera_matrix, intrinsics_source = _camera_matrix_for_dense_fusion(
        camera_row,
        calibration_by_label.get(str(side)),
    )
    if camera_matrix is None:
        base["status"] = "EXPLICIT_CAMERA_INTRINSICS_UNAVAILABLE"
        return base

    vertices = getattr(open3d_result, "mesh_vertices", None) or []
    triangles = getattr(open3d_result, "mesh_triangles", None) or []
    if not vertices or not triangles:
        base["status"] = "OBSERVED_IRREGULAR_MESH_UNAVAILABLE"
        return base

    try:
        measured = measure_cavity_from_polygon_on_mesh(
            polygon_xy,
            camera_matrix,
            world_from_camera,
            vertices,
            triangles,
        )
    except Exception as exc:
        base["status"] = "CAVITY_METRIC_MEASUREMENT_EXCEPTION"
        base["diagnostics"] = {"error": str(exc)}
        return base

    if not isinstance(measured, dict):
        base["status"] = "CAVITY_METRIC_MEASUREMENT_INVALID_RESULT"
        return base

    result = {**base, **measured}
    result["coordinate_scale"] = "GLOBAL_METRIC_CENTIMETRES"
    result["geometry_point_source"] = str(geometry_point_source)
    result["intrinsics_source"] = intrinsics_source
    result["camera_capture_label"] = str(side)
    result["camera_contract_source"] = "RECONSTRUCTION_REGISTERED_CAMERA"
    result["surface_provenance"] = (
        measured.get("surface_provenance")
        if measured.get("ok")
        else None
    )
    return result



# =============================================================================
# Multi-view physical cavity association
# =============================================================================

_CAVITY_ASSOCIATION_MAX_CENTER_DISTANCE_CM = 12.0
_CAVITY_ASSOCIATION_MAX_RIM_DISTANCE_CM = 14.0
_CAVITY_ASSOCIATION_MIN_SCORE = 0.68


def _cavity_vec3(
    value: Any,
) -> np.ndarray | None:
    try:
        array = np.asarray(
            value,
            dtype=np.float64,
        ).reshape(-1)
    except Exception:
        return None

    if (
        array.size != 3
        or not np.isfinite(
            array
        ).all()
    ):
        return None

    return array


def _cavity_points_mean(
    values: Any,
) -> np.ndarray | None:
    if not isinstance(
        values,
        (list, tuple),
    ):
        return None

    points = [
        point
        for point
        in (
            _cavity_vec3(
                value
            )
            for value
            in values
        )
        if point is not None
    ]

    if not points:
        return None

    return np.mean(
        np.vstack(
            points
        ),
        axis=0,
    )


def _cavity_finding_center(
    finding: dict[str, Any],
) -> np.ndarray | None:
    """
    Prefer reconstructed cavity evidence; fall back to the proven visible
    surface localization point. No 2D bbox centroid is converted into 3D.
    """
    geometry = (
        finding.get(
            "cavity_geometry"
        )
        if isinstance(
            finding.get(
                "cavity_geometry"
            ),
            dict,
        )
        else {}
    )

    center = _cavity_points_mean(
        geometry.get(
            "interior_points_3d_cm"
        )
    )
    if center is not None:
        return center

    center = _cavity_points_mean(
        geometry.get(
            "rim_points_3d_cm"
        )
    )
    if center is not None:
        return center

    location = finding.get(
        "location"
    )
    if isinstance(
        location,
        dict,
    ):
        center = _cavity_vec3(
            location.get(
                "visible_surface_point_cm"
            )
        )
        if center is not None:
            return center

    mesh_localization = finding.get(
        "mesh_localization"
    )
    if isinstance(
        mesh_localization,
        dict,
    ):
        center = _cavity_vec3(
            mesh_localization.get(
                "point_cm"
            )
        )
        if center is not None:
            return center

    return _cavity_vec3(
        finding.get(
            "point_3d_cm"
        )
    )


def _cavity_rim_centroid(
    finding: dict[str, Any],
) -> np.ndarray | None:
    geometry = finding.get(
        "cavity_geometry"
    )

    if not isinstance(
        geometry,
        dict,
    ):
        return None

    return _cavity_points_mean(
        geometry.get(
            "rim_points_3d_cm"
        )
    )


def _cavity_source_capture(
    finding: dict[str, Any],
) -> str:
    for container_key in (
        "metadata",
        "location",
    ):
        container = finding.get(
            container_key
        )
        if isinstance(
            container,
            dict,
        ):
            value = container.get(
                "source_capture"
            )
            if value:
                return str(
                    value
                )

    return str(
        finding.get(
            "surface"
        )
        or ""
    )


def _cavity_source_image_id(
    finding: dict[str, Any],
) -> str | None:
    for container_key in (
        "metadata",
        "location",
    ):
        container = finding.get(
            container_key
        )
        if isinstance(
            container,
            dict,
        ):
            value = container.get(
                "source_image_id"
            )
            if value:
                return str(
                    value
                )

    return None


def _cavity_kind_token(
    finding: dict[str, Any],
) -> str:
    normalized = (
        str(
            finding.get(
                "kind"
            )
            or finding.get(
                "type"
            )
            or "CAVITY"
        )
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )

    for token in (
        _CAVITY_FINDING_TOKENS
    ):
        if token in normalized:
            return token

    return normalized


def _cavity_metric(
    finding: dict[str, Any],
    key: str,
) -> float | None:
    geometry = finding.get(
        "cavity_geometry"
    )

    if isinstance(
        geometry,
        dict,
    ):
        value = _safe_float(
            geometry.get(
                key
            )
        )
        if value is not None:
            return value

    return _safe_float(
        finding.get(
            key
        )
    )


def _cavity_relative_similarity(
    left: float | None,
    right: float | None,
) -> float | None:
    if (
        left is None
        or right is None
        or left <= 0.0
        or right <= 0.0
    ):
        return None

    difference = abs(
        left - right
    ) / max(
        left,
        right,
    )

    return max(
        0.0,
        1.0 - min(
            difference,
            1.0,
        ),
    )


def _cavity_association_score(
    left: dict[str, Any],
    right: dict[str, Any],
) -> dict[str, Any]:
    """
    Decide whether two image observations can represent one physical cavity.

    Metric 3D location is mandatory. Photo order, capture labels and 2D bbox
    overlap are never sufficient to create an association.
    """
    if not (
        left.get(
            "is_cavity"
        )
        and right.get(
            "is_cavity"
        )
    ):
        return {
            "compatible": False,
            "score": 0.0,
            "reason": "NON_CAVITY_FINDING",
        }

    if (
        _cavity_source_image_id(
            left
        )
        and _cavity_source_image_id(
            left
        )
        == _cavity_source_image_id(
            right
        )
    ):
        return {
            "compatible": False,
            "score": 0.0,
            "reason": "SAME_SOURCE_IMAGE",
        }

    left_center = (
        _cavity_finding_center(
            left
        )
    )
    right_center = (
        _cavity_finding_center(
            right
        )
    )

    if (
        left_center is None
        or right_center is None
    ):
        return {
            "compatible": False,
            "score": 0.0,
            "reason": (
                "METRIC_3D_CENTER_UNAVAILABLE"
            ),
        }

    center_distance = float(
        np.linalg.norm(
            left_center
            - right_center
        )
    )

    if (
        not np.isfinite(
            center_distance
        )
        or center_distance
        > _CAVITY_ASSOCIATION_MAX_CENTER_DISTANCE_CM
    ):
        return {
            "compatible": False,
            "score": 0.0,
            "reason": (
                "CENTER_DISTANCE_TOO_LARGE"
            ),
            "center_distance_cm": round(
                center_distance,
                4,
            ),
        }

    weighted = (
        max(
            0.0,
            1.0
            - center_distance
            / _CAVITY_ASSOCIATION_MAX_CENTER_DISTANCE_CM,
        )
        * 0.60
    )
    weight = 0.60

    left_rim = (
        _cavity_rim_centroid(
            left
        )
    )
    right_rim = (
        _cavity_rim_centroid(
            right
        )
    )

    rim_distance = None
    if (
        left_rim is not None
        and right_rim is not None
    ):
        rim_distance = float(
            np.linalg.norm(
                left_rim
                - right_rim
            )
        )

        if (
            rim_distance
            > _CAVITY_ASSOCIATION_MAX_RIM_DISTANCE_CM
        ):
            return {
                "compatible": False,
                "score": 0.0,
                "reason": (
                    "RIM_DISTANCE_TOO_LARGE"
                ),
                "center_distance_cm": round(
                    center_distance,
                    4,
                ),
                "rim_distance_cm": round(
                    rim_distance,
                    4,
                ),
            }

        weighted += (
            max(
                0.0,
                1.0
                - rim_distance
                / _CAVITY_ASSOCIATION_MAX_RIM_DISTANCE_CM,
            )
            * 0.20
        )
        weight += 0.20

    dimension_scores = [
        score
        for score
        in (
            _cavity_relative_similarity(
                _cavity_metric(
                    left,
                    key,
                ),
                _cavity_metric(
                    right,
                    key,
                ),
            )
            for key
            in (
                "opening_width_cm",
                "opening_height_cm",
                "opening_area_cm2",
            )
        )
        if score is not None
    ]

    dimension_score = None
    if dimension_scores:
        dimension_score = float(
            np.mean(
                dimension_scores
            )
        )
        weighted += (
            dimension_score
            * 0.15
        )
        weight += 0.15

    kind_score = (
        1.0
        if _cavity_kind_token(
            left
        )
        == _cavity_kind_token(
            right
        )
        else 0.65
    )

    weighted += (
        kind_score
        * 0.05
    )
    weight += 0.05

    score = weighted / max(
        weight,
        1e-9,
    )

    return {
        "compatible": bool(
            score
            >= _CAVITY_ASSOCIATION_MIN_SCORE
        ),
        "score": round(
            float(
                score
            ),
            4,
        ),
        "center_distance_cm": round(
            center_distance,
            4,
        ),
        "rim_distance_cm": (
            round(
                rim_distance,
                4,
            )
            if rim_distance is not None
            else None
        ),
        "dimension_similarity": (
            round(
                dimension_score,
                4,
            )
            if dimension_score is not None
            else None
        ),
        "kind_similarity": (
            kind_score
        ),
        "policy": (
            "METRIC_3D_EVIDENCE_REQUIRED_NO_2D_ONLY_MERGE"
        ),
    }


def _merge_cavity_cluster(
    cluster: list[
        dict[str, Any]
    ],
    physical_index: int,
) -> dict[str, Any]:
    """
    Produce one physical cavity record while retaining every source observation.
    """
    physical_id = (
        f"CAVITY-{physical_index:03d}"
    )

    representative = max(
        cluster,
        key=lambda finding: (
            1
            if (
                isinstance(
                    finding.get(
                        "cavity_geometry"
                    ),
                    dict,
                )
                and finding[
                    "cavity_geometry"
                ].get(
                    "ok"
                )
            )
            else 0,
            _safe_float(
                finding.get(
                    "confidence"
                )
            )
            or 0.0,
        ),
    )

    merged = dict(
        representative
    )

    captures = sorted(
        {
            capture
            for capture
            in (
                _cavity_source_capture(
                    finding
                )
                for finding
                in cluster
            )
            if capture
        }
    )

    image_ids = sorted(
        {
            image_id
            for image_id
            in (
                _cavity_source_image_id(
                    finding
                )
                for finding
                in cluster
            )
            if image_id
        }
    )

    centers = [
        center
        for center
        in (
            _cavity_finding_center(
                finding
            )
            for finding
            in cluster
        )
        if center is not None
    ]

    physical_center = (
        np.mean(
            np.vstack(
                centers
            ),
            axis=0,
        ).tolist()
        if centers
        else None
    )

    def values(
        key: str,
    ) -> list[float]:
        return [
            value
            for value
            in (
                _cavity_metric(
                    finding,
                    key,
                )
                for finding
                in cluster
            )
            if value is not None
        ]

    widths = values(
        "opening_width_cm"
    )
    heights = values(
        "opening_height_cm"
    )
    areas = values(
        "opening_area_cm2"
    )
    max_depths = values(
        "max_observed_depth_cm"
    )
    mean_depths = values(
        "mean_observed_depth_cm"
    )
    volumes = values(
        "visible_cavity_volume_cm3"
    )

    rim_points: list[
        list[float]
    ] = []
    interior_points: list[
        list[float]
    ] = []

    for finding in cluster:
        geometry = finding.get(
            "cavity_geometry"
        )
        if not isinstance(
            geometry,
            dict,
        ):
            continue

        for source_key, target in (
            (
                "rim_points_3d_cm",
                rim_points,
            ),
            (
                "interior_points_3d_cm",
                interior_points,
            ),
        ):
            source = geometry.get(
                source_key
            )
            if not isinstance(
                source,
                list,
            ):
                continue

            for value in source:
                point = _cavity_vec3(
                    value
                )
                if point is not None:
                    target.append(
                        [
                            round(
                                float(
                                    coordinate
                                ),
                                5,
                            )
                            for coordinate
                            in point
                        ]
                    )

    geometry = dict(
        representative.get(
            "cavity_geometry"
        )
        if isinstance(
            representative.get(
                "cavity_geometry"
            ),
            dict,
        )
        else {}
    )

    geometry.update(
        {
            "physical_cavity_id": (
                physical_id
            ),
            "associated_observation_count": (
                len(
                    cluster
                )
            ),
            "evidence_views": captures,
            "source_image_ids": image_ids,
            "physical_center_cm": (
                physical_center
            ),
            "opening_width_cm": (
                round(
                    float(
                        np.median(
                            widths
                        )
                    ),
                    3,
                )
                if widths
                else None
            ),
            "opening_height_cm": (
                round(
                    float(
                        np.median(
                            heights
                        )
                    ),
                    3,
                )
                if heights
                else None
            ),
            "opening_area_cm2": (
                round(
                    float(
                        np.median(
                            areas
                        )
                    ),
                    3,
                )
                if areas
                else None
            ),
            # A deeper actually observed view may add legitimate evidence.
            "max_observed_depth_cm": (
                round(
                    float(
                        np.max(
                            max_depths
                        )
                    ),
                    3,
                )
                if max_depths
                else None
            ),
            "mean_observed_depth_cm": (
                round(
                    float(
                        np.median(
                            mean_depths
                        )
                    ),
                    3,
                )
                if mean_depths
                else None
            ),
            "visible_cavity_volume_cm3": (
                round(
                    float(
                        np.median(
                            volumes
                        )
                    ),
                    3,
                )
                if volumes
                else None
            ),
            "rim_points_3d_cm": (
                rim_points[
                    :240
                ]
            ),
            "interior_points_3d_cm": (
                interior_points[
                    :240
                ]
            ),
            "internal_continuation": (
                "UNOBSERVED"
            ),
            "internal_continuation_status": (
                "UNOBSERVED"
            ),
            "true_maximum_depth_status": (
                "UNKNOWN_UNLESS_CAVITY_BOTTOM_IS_FULLY_OBSERVED"
            ),
            "multi_view_measurement_policy": (
                "MEDIAN_OPENING_METRICS_MAX_OF_ACTUALLY_OBSERVED_DEPTHS"
            ),
        }
    )

    merged.update(
        {
            "id": physical_id,
            "physical_cavity_id": (
                physical_id
            ),
            "cavity_geometry": geometry,
            "associated_observation_count": (
                len(
                    cluster
                )
            ),
            "associated_observations": [
                dict(
                    finding
                )
                for finding
                in cluster
            ],
            "evidence_view_count": len(
                captures
            ),
            "evidence_views": captures,
            "source_image_ids": image_ids,
            "physical_center_cm": (
                physical_center
            ),
            "association_status": (
                "MULTIVIEW_ASSOCIATED"
                if len(
                    cluster
                )
                > 1
                else "SINGLE_VIEW_ONLY"
            ),
            "association_confidence": (
                "HIGH"
                if len(
                    captures
                )
                >= 3
                else (
                    "MEDIUM"
                    if len(
                        captures
                    )
                    >= 2
                    else "UNCONFIRMED_SINGLE_VIEW"
                )
            ),
            "association_policy": (
                "METRIC_3D_CENTER_RIM_AND_DIMENSION_COMPATIBILITY"
            ),
            "opening_width_cm": (
                geometry.get(
                    "opening_width_cm"
                )
            ),
            "opening_height_cm": (
                geometry.get(
                    "opening_height_cm"
                )
            ),
            "opening_area_cm2": (
                geometry.get(
                    "opening_area_cm2"
                )
            ),
            "max_observed_depth_cm": (
                geometry.get(
                    "max_observed_depth_cm"
                )
            ),
            "mean_observed_depth_cm": (
                geometry.get(
                    "mean_observed_depth_cm"
                )
            ),
            "visible_cavity_volume_cm3": (
                geometry.get(
                    "visible_cavity_volume_cm3"
                )
            ),
            "rim_points_3d_cm": (
                geometry.get(
                    "rim_points_3d_cm",
                    [],
                )
            ),
            "interior_points_3d_cm": (
                geometry.get(
                    "interior_points_3d_cm",
                    [],
                )
            ),
            "internal_continuation": (
                "UNOBSERVED"
            ),
            "internal_continuation_status": (
                "UNOBSERVED"
            ),
        }
    )

    if (
        geometry.get(
            "max_observed_depth_cm"
        )
        is not None
    ):
        merged[
            "depth_mm"
        ] = round(
            float(
                geometry[
                    "max_observed_depth_cm"
                ]
            )
            * 10.0,
            2,
        )

    return merged


def _associate_multiview_cavities(
    findings: list[
        dict[str, Any]
    ],
) -> tuple[
    list[
        dict[str, Any]
    ],
    dict[str, Any],
]:
    """
    Collapse repeated image observations into physical cavity records.

    Ambiguous observations remain separate. This intentionally prefers
    duplicate physical records over a false merge when metric evidence is weak.
    """
    cavities = [
        finding
        for finding
        in findings
        if finding.get(
            "is_cavity"
        )
    ]

    non_cavities = [
        finding
        for finding
        in findings
        if not finding.get(
            "is_cavity"
        )
    ]

    remaining = list(
        cavities
    )

    clusters: list[
        list[
            dict[str, Any]
        ]
    ] = []

    while remaining:
        seed = remaining.pop(
            0
        )

        cluster = [
            seed
        ]

        changed = True
        while changed:
            changed = False

            for candidate in list(
                remaining
            ):
                best = max(
                    (
                        _cavity_association_score(
                            member,
                            candidate,
                        )
                        for member
                        in cluster
                    ),
                    key=lambda item: item.get(
                        "score",
                        0.0,
                    ),
                )

                if best.get(
                    "compatible"
                ):
                    cluster.append(
                        candidate
                    )
                    remaining.remove(
                        candidate
                    )
                    changed = True

        clusters.append(
            cluster
        )

    physical_cavities = [
        _merge_cavity_cluster(
            cluster,
            index,
        )
        for index, cluster
        in enumerate(
            clusters,
            start=1,
        )
    ]

    diagnostics = {
        "cavity_observation_count": len(
            cavities
        ),
        "physical_cavity_count": len(
            physical_cavities
        ),
        "multi_view_physical_cavity_count": sum(
            1
            for cluster
            in clusters
            if len(
                cluster
            )
            > 1
        ),
        "single_view_physical_cavity_count": sum(
            1
            for cluster
            in clusters
            if len(
                cluster
            )
            == 1
        ),
        "forced_2d_only_merges": 0,
        "association_policy": (
            "METRIC_3D_EVIDENCE_REQUIRED_AMBIGUOUS_FINDINGS_REMAIN_SEPARATE"
        ),
        "minimum_association_score": (
            _CAVITY_ASSOCIATION_MIN_SCORE
        ),
        "hidden_continuation_policy": (
            "UNOBSERVED_NEVER_INFERRED"
        ),
    }

    return (
        non_cavities
        + physical_cavities,
        diagnostics,
    )

def _reconstruction_failure_payload(recon_output: Any) -> dict[str, Any]:
    """Build actionable reconstruction failure evidence without inventing results."""
    diagnostics = getattr(recon_output, "diagnostics", None)
    if not isinstance(diagnostics, dict):
        diagnostics = {}

    payload: dict[str, Any] = {
        "status": "RECONSTRUCTION_FAILED",
        "failure_reason": getattr(recon_output, "failure_reason", None),
        "registered_camera_count": getattr(recon_output, "registered_camera_count", None),
        "metric_scale_solved": getattr(recon_output, "metric_scale_solved", None),
        "coordinate_scale": getattr(recon_output, "coordinate_scale", None),
        "diagnostics": diagnostics,
    }

    for key in (
        "pair_diagnostics",
        "matching_diagnostics",
        "track_diagnostics",
        "reprojection_diagnostics",
        "metric_scale_diagnostics",
        "camera_registration_diagnostics",
        "capture_guidance",
        "recommended_actions",
    ):
        value = getattr(recon_output, key, None)
        if value not in (None, [], {}):
            payload[key] = value

    return payload


def _reconstruction_failure_message(recon_output: Any) -> str:
    """Return a concise operator-facing reason plus evidence-based next action."""
    base = str(
        getattr(recon_output, "failure_reason", None)
        or "Geometry reconstruction failed."
    ).strip()

    diagnostics = getattr(recon_output, "diagnostics", None)
    if not isinstance(diagnostics, dict):
        diagnostics = {}

    # Prefer guidance emitted by reconstruction itself. Do not manufacture
    # numerical thresholds or claim a surface/camera was observed when it was not.
    guidance = None
    for source in (
        getattr(recon_output, "capture_guidance", None),
        getattr(recon_output, "recommended_actions", None),
        diagnostics.get("capture_guidance"),
        diagnostics.get("recommended_actions"),
        diagnostics.get("operator_guidance"),
        diagnostics.get("next_action"),
    ):
        if isinstance(source, str) and source.strip():
            guidance = source.strip()
            break
        if isinstance(source, (list, tuple)):
            items = [str(item).strip() for item in source if str(item).strip()]
            if items:
                guidance = "; ".join(items[:3])
                break

    if guidance:
        return f"{base} Next capture action: {guidance}"

    # Conservative fallback guidance is based only on the failure text. It tells
    # the operator how to acquire stronger evidence, never that geometry exists.
    lower = base.lower()
    if any(token in lower for token in ("match", "feature", "correspond")):
        guidance = (
            "Retake overlapping views with the same granite texture visible in "
            "adjacent photos; avoid blur, glare, large viewpoint jumps, and "
            "background-only overlap."
        )
    elif any(token in lower for token in ("triang", "baseline", "parallax", "pose")):
        guidance = (
            "Retake a continuous arc around the block with overlapping views and "
            "clear viewpoint change so camera pose and parallax can be solved."
        )
    elif any(token in lower for token in ("calibr", "metric", "scale", "marker")):
        guidance = (
            "Retake calibration evidence so the physical reference and granite are "
            "sharp and visible together in multiple overlapping views."
        )
    else:
        guidance = (
            "Retake a continuous set of sharp, overlapping views around the same "
            "block while keeping distinctive granite surface texture visible."
        )

    return f"{base} Next capture action: {guidance}"


def _persist_reconstruction_failure_evidence(
    db: Session,
    session: CaptureSession | None,
    recon_output: Any,
) -> None:
    """Persist diagnostics in existing session JSON metadata; no schema change."""
    if session is None:
        return

    metadata = _metadata_dict(getattr(session, "session_metadata", None))
    metadata["analysis_reconstruction_failure"] = _reconstruction_failure_payload(
        recon_output
    )
    session.session_metadata = metadata
    db.flush()

def _run(
    db: Session,
    job_id: str,
) -> None:
    job = db.get(
        AnalysisJob,
        job_id,
    )

    if not job:
        return

    # RQ/API/test clients may deliver the same job more than once. A completed
    # analysis is immutable unless the retry endpoint explicitly resets/requeues
    # it. Re-running a completed job can race with the first delivery and attempt
    # to insert a second one-to-one result row (for example DefectResult.job_id),
    # violating the database uniqueness contract.
    if (
        job.state == AnalysisState.COMPLETED
        and job.completed_at is not None
    ):
        return

    settings = get_settings()

    if (
        job.demo_simulated
        and not settings.demo_mode
    ):
        _fail(
            db,
            job,
            (
                "Demo simulation requested but DEMO_MODE is false."
            ),
        )

        return

    job.started_at = datetime.now(
        timezone.utc
    )

    audit(
        db,
        entity_type="analysis_job",
        entity_id=job.id,
        action="analysis_started",
        actor_id=job.submitted_by_id,
        metadata={},
    )

    session = db.get(
        CaptureSession,
        job.capture_session_id,
    )

    images = (
        db.query(
            BlockImage
        )
        .filter(
            BlockImage.capture_session_id
            == job.capture_session_id
        )
        .order_by(
            BlockImage.sequence_number.asc().nulls_last(),
            BlockImage.created_at.asc(),
        )
        .all()
    )

    # ---------------------------------------------------------------------
    # 1. Image validation evidence
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.VALIDATING_IMAGES,
        stage_name="Validating Images",
        progress=10,
    )

    db.commit()

    accepted = [
        image
        for image in images
        if image.accepted
    ]

    if len(
        accepted
    ) < settings.minimum_capture_images:
        _fail(
            db,
            job,
            (
                f"Fewer than {settings.minimum_capture_images} accepted images "
                f"(found {len(accepted)})."
            ),
        )

        return

    # ---------------------------------------------------------------------
    # 2. Granite-presence evidence
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.DETECTING_GRANITE,
        stage_name="Checking Granite Presence Evidence",
        progress=20,
    )

    db.commit()

    # Preserve persisted capture-time validation as historical evidence, but do
    # not treat an UNKNOWN/NOT_CONFIGURED semantic result as a positive granite
    # classification. Only an explicit persisted False is a hard rejection.
    validation_rows: dict[str, ImageValidationResult] = {}

    for image in accepted:
        validation = (
            db.query(ImageValidationResult)
            .filter(ImageValidationResult.image_id == image.id)
            .one_or_none()
        )

        if validation is not None:
            validation_rows[image.id] = validation

        if validation is not None and validation.is_granite is False:
            _fail(
                db,
                job,
                (
                    f"Image {image.capture_side} was explicitly rejected by "
                    "capture-time granite-presence validation."
                ),
            )
            return

    # Decode the accepted images before running fresh semantic detection.
    loaded: list[
        tuple[
            str,
            np.ndarray,
            BlockImage,
        ]
    ] = []

    for image in accepted:
        decoded = _load_bgr(image.storage_path)

        if decoded is None:
            _fail(
                db,
                job,
                f"Could not decode image {image.id}",
            )
            return

        loaded.append(
            (
                image.capture_side,
                decoded,
                image,
            )
        )

    # Run the current granite detector against every accepted image. The
    # detector contract is tri-state:
    #   True  -> explicit granite evidence
    #   False -> explicit non-granite evidence
    #   None  -> semantic evidence unavailable/insufficient
    #
    # UNKNOWN must remain UNKNOWN. Missing model weights, no detections, or
    # generic classes are never converted into a fabricated positive result.
    detector = get_granite_detection_provider()
    granite_detection_evidence: list[dict[str, Any]] = []
    explicit_positive_count = 0
    explicit_negative_count = 0
    unknown_count = 0

    for side, image, image_row in loaded:
        try:
            detection = detector.detect(image)
        except Exception as exc:
            # Provider implementations are expected to return structured
            # failures, but keep the worker honest if an unexpected provider
            # exception escapes.
            granite_detection_evidence.append(
                {
                    "image_id": image_row.id,
                    "surface": side,
                    "is_granite": None,
                    "confidence": None,
                    "provider": detector.__class__.__name__,
                    "configured": None,
                    "error_code": "DETECTION_PROVIDER_EXCEPTION",
                    "error_message": str(exc),
                    "issues": [
                        "Granite semantic detection failed unexpectedly; "
                        "no positive or negative claim was inferred."
                    ],
                }
            )
            unknown_count += 1
            continue

        is_granite = getattr(detection, "is_granite", None)
        confidence = _safe_float(
            getattr(detection, "detection_confidence", None)
        )
        provider_name = getattr(
            detection,
            "provider",
            detector.__class__.__name__,
        )
        configured = getattr(detection, "configured", None)
        error_code = getattr(detection, "error_code", None)
        error_message = getattr(detection, "error_message", None)
        issues = list(getattr(detection, "issues", None) or [])
        boxes = list(getattr(detection, "boxes", None) or [])

        granite_detection_evidence.append(
            {
                "image_id": image_row.id,
                "surface": side,
                "is_granite": is_granite,
                "confidence": confidence,
                "provider": provider_name,
                "configured": configured,
                "error_code": error_code,
                "error_message": error_message,
                "issues": issues,
                "boxes": boxes,
            }
        )

        if is_granite is True:
            explicit_positive_count += 1
        elif is_granite is False:
            explicit_negative_count += 1
            _fail(
                db,
                job,
                (
                    f"Image {side} was explicitly classified as non-granite "
                    f"by {provider_name}."
                ),
            )
            return
        else:
            unknown_count += 1

    granite_detection_summary = {
        "images_checked": len(loaded),
        "explicit_positive_count": explicit_positive_count,
        "explicit_negative_count": explicit_negative_count,
        "unknown_count": unknown_count,
        "semantic_status": (
            "CONFIRMED_ON_ALL_IMAGES"
            if loaded and explicit_positive_count == len(loaded)
            else (
                "PARTIALLY_CONFIRMED"
                if explicit_positive_count > 0
                else "UNCONFIRMED"
            )
        ),
        "policy": (
            "Only explicit non-granite evidence rejects an image. "
            "UNKNOWN remains UNKNOWN and is not converted into granite=True."
        ),
    }

    # ---------------------------------------------------------------------
    # 3. Segmentation
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.SEGMENTING_GRANITE,
        stage_name=(
            "Segmenting Granite Boundaries"
        ),
        progress=30,
    )

    db.commit()

    seg_manager = (
        GraniteSegmentationManager()
    )

    seg_confidences: list[
        float
    ] = []

    seg_masks: list[
        np.ndarray | None
    ] = []

    segmentation_failures: list[
        dict[str, Any]
    ] = []

    for side, image, image_row in loaded:
        segmentation = (
            seg_manager.segment(
                image
            )
        )

        seg_masks.append(
            segmentation.mask
        )

        if (
            segmentation.confidence
            is not None
        ):
            confidence = _safe_float(
                segmentation.confidence
            )

            if confidence is not None:
                seg_confidences.append(
                    confidence
                )

        if segmentation.mask is not None:
            mask_u8 = (
                segmentation.mask
                .astype(
                    np.uint8
                )
                * 255
            )

            encoded_ok, encoded = (
                cv2.imencode(
                    ".png",
                    mask_u8,
                )
            )

            if encoded_ok:
                get_storage().save(
                    (
                        f"masks/{job.id}/"
                        f"{image_row.id}.png"
                    ),
                    encoded.tobytes(),
                    "image/png",
                )
        else:
            segmentation_failures.append(
                {
                    "surface": side,
                    "image_id": image_row.id,
                    "provider": (
                        segmentation.provider
                    ),
                    "error_code": getattr(
                        segmentation,
                        "error_code",
                        None,
                    ),
                    "error_message": getattr(
                        segmentation,
                        "error_message",
                        None,
                    ),
                }
            )

    usable_mask_count = sum(
        1
        for mask in seg_masks
        if mask is not None
    )

    if usable_mask_count < 2:
        _fail(
            db,
            job,
            (
                "Insufficient reliable granite masks for multi-view "
                f"reconstruction (found {usable_mask_count})."
            ),
        )

        return

    avg_seg_conf = (
        float(
            sum(
                seg_confidences
            )
            / len(
                seg_confidences
            )
        )
        if seg_confidences
        else 0.0
    )

    # ---------------------------------------------------------------------
    # 4. Metric calibration
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.CHECKING_CALIBRATION,
        stage_name="Calibrating Metric Scale",
        progress=40,
    )

    db.commit()

    cm_per_pixel: float | None = None
    calib_method = (
        session.calibration_type
        if session
        else None
    )
    calib_conf: float | None = None

    # Preserve every per-image calibration attempt. The scalar cm_per_pixel
    # remains the legacy/local compatibility value, but camera intrinsics and
    # marker pose evidence are now retained instead of being discarded after
    # the first usable marker.
    calibration_evidence: list[
        dict[str, Any]
    ] = []

    calibration_details: dict[
        str,
        Any,
    ] = {
        "status": "NOT_EVALUATED",
        "method": calib_method,
        "selected_image_id": None,
        "selected_surface": None,
        "selected_cm_per_pixel": None,
        "per_image": calibration_evidence,
        "global_metric_scale_status": (
            "NOT_SOLVED_BY_WORKER"
        ),
        "global_metric_scale_note": (
            "The worker preserves per-image camera/marker evidence and forwards "
            "that evidence into reconstruction. A single global SfM metric scale "
            "is accepted only when reconstruction solves it from geometrically "
            "linked reliable same-marker observations; it is not inferred from "
            "one local cm_per_pixel value."
        ),
        "forwarded_to_reconstruction": True,
    }

    selected_calibration_rank: tuple[
        int,
        float,
        float,
    ] | None = None

    if (
        session
        and session.calibration_type
        == CalibrationType.ARUCO
    ):
        calibration_details[
            "status"
        ] = "SEARCHING_ARUCO"

        for (
            side,
            image,
            image_row,
        ) in loaded:
            camera_metadata = (
                _camera_metadata_for_image(
                    image_row
                )
            )

            calibration = detect_aruco(
                image,
                session.marker_size_cm,
                camera_metadata=camera_metadata,
            )

            details = (
                calibration.details
                if isinstance(
                    calibration.details,
                    dict,
                )
                else {}
            )

            intrinsic_details = (
                details.get(
                    "camera_intrinsics"
                )
                if isinstance(
                    details.get(
                        "camera_intrinsics"
                    ),
                    dict,
                )
                else {}
            )

            pose_details = (
                details.get(
                    "marker_pose"
                )
                if isinstance(
                    details.get(
                        "marker_pose"
                    ),
                    dict,
                )
                else {}
            )

            local_scale = _safe_float(
                calibration.cm_per_pixel
            )

            local_confidence = _safe_float(
                calibration.calibration_confidence
            )

            metric_pose_reliable = bool(
                pose_details.get(
                    "metric_pose_reliable"
                )
            )

            pose_available = bool(
                pose_details.get(
                    "available"
                )
            )

            evidence_row = {
                "image_id": image_row.id,
                "surface": side,
                "detected": bool(
                    calibration.detected
                ),
                "cm_per_pixel": (
                    local_scale
                ),
                "calibration_confidence": (
                    local_confidence
                ),
                "camera_intrinsics": (
                    intrinsic_details
                ),
                "marker_pose": (
                    pose_details
                ),
                "metric_pose_reliable": (
                    metric_pose_reliable
                ),
                "camera_metadata_present": bool(
                    camera_metadata
                ),
                "details": details,
            }

            calibration_evidence.append(
                evidence_row
            )

            if (
                not calibration.detected
                or local_scale is None
                or local_scale <= 0.0
            ):
                continue

            # Select the strongest local compatibility scale without erasing
            # the other views. A genuinely calibrated/reliable pose outranks an
            # approximate pose, then any solved pose, then plain local scale.
            rank = (
                2
                if metric_pose_reliable
                else (
                    1
                    if pose_available
                    else 0
                ),
                local_confidence
                if local_confidence
                is not None
                else -1.0,
                float(
                    intrinsic_details.get(
                        "fx_px"
                    )
                    or 0.0
                ),
            )

            if (
                selected_calibration_rank
                is None
                or rank
                > selected_calibration_rank
            ):
                selected_calibration_rank = (
                    rank
                )

                cm_per_pixel = float(
                    local_scale
                )

                calib_conf = (
                    local_confidence
                )

                calibration_details[
                    "selected_image_id"
                ] = image_row.id

                calibration_details[
                    "selected_surface"
                ] = side

                calibration_details[
                    "selected_cm_per_pixel"
                ] = float(
                    local_scale
                )

                calibration_details[
                    "selected_calibration_confidence"
                ] = local_confidence

                calibration_details[
                    "selected_camera_intrinsics"
                ] = intrinsic_details

                calibration_details[
                    "selected_marker_pose"
                ] = pose_details

        if _positive_finite(
            cm_per_pixel
        ):
            calibration_details[
                "status"
            ] = "ARUCO_LOCAL_SCALE_AVAILABLE"

            reliable_pose_count = sum(
                1
                for item
                in calibration_evidence
                if item.get(
                    "metric_pose_reliable"
                )
            )

            solved_pose_count = sum(
                1
                for item
                in calibration_evidence
                if isinstance(
                    item.get(
                        "marker_pose"
                    ),
                    dict,
                )
                and item[
                    "marker_pose"
                ].get(
                    "available"
                )
            )

            calibration_details[
                "reliable_metric_pose_count"
            ] = reliable_pose_count

            calibration_details[
                "solved_marker_pose_count"
            ] = solved_pose_count

            calibration_details[
                "global_metric_scale_candidate"
            ] = bool(
                solved_pose_count
                > 0
            )

            calibration_details[
                "global_metric_scale_candidate_note"
            ] = (
                "Marker pose evidence exists and may be used by the "
                "reconstruction layer if it can be geometrically associated "
                "with the registered SfM camera/track graph."
                if solved_pose_count
                > 0
                else (
                    "Only local image-plane scale was observed; no marker pose "
                    "evidence is available for a global SfM metric constraint."
                )
            )
        else:
            calibration_details[
                "status"
            ] = "ARUCO_SCALE_UNAVAILABLE"

    elif (
        session
        and session.calibration_type
        == CalibrationType.MEASUREMENT_BOARD
        and _positive_finite(
            session.known_reference_cm
        )
    ):
        calibration_details[
            "status"
        ] = (
            "SEARCHING_MEASUREMENT_BOARD"
        )

        for (
            side,
            image,
            image_row,
        ) in loaded:
            camera_metadata = (
                _camera_metadata_for_image(
                    image_row
                )
            )

            calibration = (
                detect_measurement_board(
                    image,
                    float(
                        session.known_reference_cm
                    ),
                    camera_metadata=camera_metadata,
                )
            )

            details = (
                calibration.details
                if isinstance(
                    calibration.details,
                    dict,
                )
                else {}
            )

            local_scale = _safe_float(
                calibration.cm_per_pixel
            )

            local_confidence = _safe_float(
                calibration.calibration_confidence
            )

            calibration_evidence.append(
                {
                    "image_id": image_row.id,
                    "surface": side,
                    "detected": bool(
                        calibration.detected
                    ),
                    "cm_per_pixel": (
                        local_scale
                    ),
                    "calibration_confidence": (
                        local_confidence
                    ),
                    "camera_intrinsics": (
                        details.get(
                            "camera_intrinsics"
                        )
                    ),
                    "board_pose": (
                        details.get(
                            "board_pose"
                        )
                    ),
                    "camera_metadata_present": bool(
                        camera_metadata
                    ),
                    "details": details,
                }
            )

            if (
                not calibration.detected
                or local_scale is None
                or local_scale <= 0.0
            ):
                continue

            rank = (
                0,
                local_confidence
                if local_confidence
                is not None
                else -1.0,
                local_scale,
            )

            if (
                selected_calibration_rank
                is None
                or rank
                > selected_calibration_rank
            ):
                selected_calibration_rank = (
                    rank
                )

                cm_per_pixel = float(
                    local_scale
                )

                calib_conf = (
                    local_confidence
                )

                calibration_details[
                    "selected_image_id"
                ] = image_row.id

                calibration_details[
                    "selected_surface"
                ] = side

                calibration_details[
                    "selected_cm_per_pixel"
                ] = float(
                    local_scale
                )

                calibration_details[
                    "selected_calibration_confidence"
                ] = local_confidence

                calibration_details[
                    "selected_board_details"
                ] = details

        calibration_details[
            "status"
        ] = (
            "MEASUREMENT_BOARD_LOCAL_SCALE_AVAILABLE"
            if _positive_finite(
                cm_per_pixel
            )
            else "MEASUREMENT_BOARD_SCALE_UNAVAILABLE"
        )

        calibration_details[
            "global_metric_scale_candidate"
        ] = False

        calibration_details[
            "global_metric_scale_candidate_note"
        ] = (
            "The current board contract provides only one physical board "
            "length and does not solve a full metric board pose."
        )

    elif (
        session
        and session.calibration_type
        == CalibrationType.MANUAL_REFERENCE
        and _positive_finite(
            session.known_reference_cm
        )
    ):
        # Existing schema stores the manually observed pixel reference in
        # marker_size_cm for historical compatibility. Preserve that contract,
        # but do not claim camera pose or global metric SfM scale.
        manual_pixel_length = _safe_float(
            session.marker_size_cm
        )

        if (
            manual_pixel_length
            is not None
            and manual_pixel_length > 0.0
        ):
            cm_per_pixel = (
                float(
                    session.known_reference_cm
                )
                / manual_pixel_length
            )

            calib_conf = None

            calibration_details = {
                "status": (
                    "MANUAL_LOCAL_SCALE_AVAILABLE"
                ),
                "method": (
                    "MANUAL_PHYSICAL_LENGTH_DIVIDED_BY_RECORDED_PIXEL_LENGTH"
                ),
                "known_reference_cm": float(
                    session.known_reference_cm
                ),
                "reference_pixel_length": (
                    manual_pixel_length
                ),
                "selected_cm_per_pixel": (
                    cm_per_pixel
                ),
                "confidence": (
                    "NOT_AUTOMATICALLY_SCORED"
                ),
                "per_image": [],
                "global_metric_scale_status": (
                    "NOT_SOLVED_BY_WORKER"
                ),
                "global_metric_scale_candidate": (
                    False
                ),
                "global_metric_scale_candidate_note": (
                    "A manual scalar reference does not provide camera pose "
                    "or a global SfM metric constraint."
                ),
            }

    if not _positive_finite(
        cm_per_pixel
    ):
        _fail(
            db,
            job,
            (
                "Measurement calibration reference required."
            ),
        )

        return

    if session:
        session.calibration_confidence = (
            calib_conf
        )

        # Preserve the session-level calibration provenance in the existing
        # JSON metadata column. Do not add rigid schema columns before the
        # camera/pose contract stabilizes.
        session_metadata = _metadata_dict(
            getattr(
                session,
                "session_metadata",
                None,
            )
        )

        session_metadata[
            "analysis_calibration"
        ] = calibration_details

        session.session_metadata = (
            session_metadata
        )

        db.commit()

    # ---------------------------------------------------------------------
    # 5. Feature matching / pose / reconstruction
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.MATCHING_FEATURES,
        stage_name=(
            "Matching Features Across Views"
        ),
        progress=50,
    )

    db.commit()

    _transition(
        db,
        job,
        AnalysisState.ESTIMATING_CAMERA_POSES,
        stage_name=(
            "Estimating Camera Poses"
        ),
        progress=60,
    )

    db.commit()

    _transition(
        db,
        job,
        AnalysisState.RECONSTRUCTING_GEOMETRY,
        stage_name=(
            "3D Geometry Reconstruction"
        ),
        progress=70,
    )

    db.commit()

    # PRODUCTION TRUTH GATE
    # ------------------------------------------------------------------
    # The V19 connected silhouette/depth proxy is DISPLAY-ONLY relative
    # geometry. It must never bypass real feature matching, camera pose
    # estimation, global reconstruction, or metric-scale provenance.
    #
    # Production reconstruction therefore ALWAYS runs ReconstructionManager.
    # Relative monocular depth remains available later as secondary visual
    # evidence and can only contribute to non-metric visualization unless
    # authoritative metric CAMERA_Z depth + registered metric cameras exist.
    #
    # Keep this dictionary for the downstream depth-evidence loop. It is empty
    # because production analysis no longer precomputes depth through the V19
    # proxy route.
    depth_provider = DepthAnythingV2Provider()
    precomputed_depth_outputs: dict[str, Any] = {}

    recon_output = (
        ReconstructionManager()
        .reconstruct(
            [(side, image) for side, image, _ in loaded],
            float(cm_per_pixel),
            masks=seg_masks,
            calibration_evidence=calibration_evidence,
        )
    )

    # Defense in depth: even if a future reconstruction provider accidentally
    # returns a display proxy, stop it before any dimensions, MeasurementResult,
    # GeometryModel metric fields, cutting plan, wastage, or seigniorage can be
    # persisted from that proxy.
    recon_provider_name = str(
        getattr(
            recon_output,
            "provider",
            "",
        )
        or ""
    ).upper()

    recon_status_name = str(
        getattr(
            recon_output,
            "status",
            "",
        )
        or ""
    ).upper()

    recon_coordinate_scale = str(
        getattr(
            recon_output,
            "coordinate_scale",
            "",
        )
        or ""
    ).upper()

    display_only_reconstruction = bool(
        "CONNECTEDGRANITETOPOLOGYDEPTHPROXYV19"
        in recon_provider_name
        or "VISUAL_PROXY" in recon_status_name
        or "DISPLAY_SCALED_RELATIVE_DEPTH_PROXY"
        in recon_coordinate_scale
    )

    if display_only_reconstruction:
        _persist_reconstruction_failure_evidence(
            db,
            session,
            recon_output,
        )

        _fail(
            db,
            job,
            (
                "Production analysis rejected display-only relative-depth "
                "geometry. A real multi-view reconstruction with camera-pose "
                "evidence is required before engineering measurements."
            ),
        )

        return

    if not recon_output.ok:
        # Preserve the reconstruction layer's full diagnostics before the job is
        # transitioned to FAILED. The frontend can continue using failure_reason
        # immediately, while richer evidence remains available in session metadata
        # for the evidence assistant / retry workflow.
        _persist_reconstruction_failure_evidence(
            db,
            session,
            recon_output,
        )

        # RQ's "Job OK" means this Python function returned without raising; it
        # does NOT mean the domain analysis succeeded. Emit an explicit structured
        # reconstruction report so field failures can be diagnosed from the worker
        # terminal without querying the database manually.
        reconstruction_diagnostics = (
            recon_output.diagnostics
            if isinstance(
                recon_output.diagnostics,
                dict,
            )
            else {}
        )

        sparse_diagnostics = (
            reconstruction_diagnostics.get(
                "sparse_reconstruction"
            )
            if isinstance(
                reconstruction_diagnostics.get(
                    "sparse_reconstruction"
                ),
                dict,
            )
            else {}
        )

        pair_rows = (
            sparse_diagnostics.get(
                "pairs"
            )
            if isinstance(
                sparse_diagnostics.get(
                    "pairs"
                ),
                list,
            )
            else []
        )

        capture_guidance = (
            reconstruction_diagnostics.get(
                "capture_guidance"
            )
            if isinstance(
                reconstruction_diagnostics.get(
                    "capture_guidance"
                ),
                dict,
            )
            else (
                sparse_diagnostics.get(
                    "capture_guidance"
                )
                if isinstance(
                    sparse_diagnostics.get(
                        "capture_guidance"
                    ),
                    dict,
                )
                else {}
            )
        )

        pair_log_rows: list[
            dict[str, Any]
        ] = []

        for pair in pair_rows:
            if not isinstance(
                pair,
                dict,
            ):
                continue

            pair_log_rows.append(
                {
                    "view_a": pair.get(
                        "view_a",
                        pair.get(
                            "label_a"
                        ),
                    ),
                    "view_b": pair.get(
                        "view_b",
                        pair.get(
                            "label_b"
                        ),
                    ),
                    "status": pair.get(
                        "status"
                    ),
                    "usable": pair.get(
                        "usable"
                    ),
                    "classification": pair.get(
                        "classification"
                    ),
                    "reason": pair.get(
                        "reason"
                    ),
                    "feature_count_a": pair.get(
                        "feature_count_a"
                    ),
                    "feature_count_b": pair.get(
                        "feature_count_b"
                    ),
                    "candidate_match_count": pair.get(
                        "candidate_match_count",
                        pair.get(
                            "matches"
                        ),
                    ),
                    "verified_inlier_count": pair.get(
                        "verified_inlier_count",
                        pair.get(
                            "inliers"
                        ),
                    ),
                    "verified_inlier_ratio": pair.get(
                        "verified_inlier_ratio",
                        pair.get(
                            "inlier_ratio"
                        ),
                    ),
                    "median_parallax_px": pair.get(
                        "median_parallax_px"
                    ),
                    "median_parallax_deg": pair.get(
                        "median_parallax_deg"
                    ),
                    "matcher_error_code": pair.get(
                        "matcher_error_code"
                    ),
                    "matcher_error_message": pair.get(
                        "matcher_error_message"
                    ),
                    "triangulation": pair.get(
                        "triangulation"
                    ),
                    "capture_action": pair.get(
                        "capture_action"
                    ),
                }
            )

        # Preserve the registration/SfM evidence in the worker terminal.
        # Pair diagnostics alone are not enough to explain why a connected
        # pair graph still failed to register a third camera.
        production_geometry_gate = (
            sparse_diagnostics.get(
                "production_geometry_gate"
            )
            if isinstance(
                sparse_diagnostics.get(
                    "production_geometry_gate"
                ),
                dict,
            )
            else {}
        )

        selected_seed_pair = (
            sparse_diagnostics.get(
                "selected_seed_pair"
            )
            if isinstance(
                sparse_diagnostics.get(
                    "selected_seed_pair"
                ),
                dict,
            )
            else {}
        )

        seed_candidate_evaluation = (
            sparse_diagnostics.get(
                "seed_candidate_evaluation"
            )
            if isinstance(
                sparse_diagnostics.get(
                    "seed_candidate_evaluation"
                ),
                list,
            )
            else []
        )

        camera_poses = (
            sparse_diagnostics.get(
                "camera_poses"
            )
            if isinstance(
                sparse_diagnostics.get(
                    "camera_poses"
                ),
                dict,
            )
            else {}
        )

        camera_registration_rows: list[
            dict[str, Any]
        ] = []

        for camera_index, camera_row in (
            camera_poses.items()
        ):
            if not isinstance(
                camera_row,
                dict,
            ):
                continue

            registration = (
                camera_row.get(
                    "registration"
                )
                if isinstance(
                    camera_row.get(
                        "registration"
                    ),
                    dict,
                )
                else {}
            )

            camera_registration_rows.append(
                {
                    "camera_index": (
                        camera_index
                    ),
                    "capture_label": (
                        camera_row.get(
                            "capture_label"
                        )
                    ),
                    "registration": (
                        registration
                    ),
                }
            )

        worker_report = {
            "event": (
                "GRANITE_RECONSTRUCTION_FAILED"
            ),
            "analysis_job_id": job.id,
            "block_id": job.block_id,
            "capture_session_id": (
                job.capture_session_id
            ),
            "provider": (
                recon_output.provider
            ),
            "error_code": (
                recon_output.error_code
            ),
            "failure_reason": (
                recon_output.failure_reason
            ),
            "capture_count": (
                reconstruction_diagnostics.get(
                    "capture_count"
                )
            ),
            "valid_mask_count": (
                reconstruction_diagnostics.get(
                    "valid_mask_count"
                )
            ),
            "registered_camera_count": (
                reconstruction_diagnostics.get(
                    "registered_camera_count",
                    sparse_diagnostics.get(
                        "registered_camera_count"
                    ),
                )
            ),
            "registered_camera_indexes": (
                sparse_diagnostics.get(
                    "registered_camera_indexes"
                )
            ),
            "unregistered_camera_indexes": (
                sparse_diagnostics.get(
                    "unregistered_camera_indexes"
                )
            ),
            "global_sparse_point_count": (
                production_geometry_gate.get(
                    "global_sparse_point_count"
                )
            ),
            "required_global_sparse_point_count": (
                production_geometry_gate.get(
                    "required_global_sparse_point_count"
                )
            ),
            "track_count": (
                sparse_diagnostics.get(
                    "track_count"
                )
            ),
            "tracks_with_three_or_more_views": (
                sparse_diagnostics.get(
                    "tracks_with_three_or_more_views",
                    production_geometry_gate.get(
                        "tracks_with_three_or_more_views"
                    ),
                )
            ),
            "required_tracks_with_three_or_more_views": (
                production_geometry_gate.get(
                    "required_tracks_with_three_or_more_views"
                )
            ),
            "median_track_reprojection_error_px": (
                production_geometry_gate.get(
                    "median_track_reprojection_error_px"
                )
            ),
            "max_median_reprojection_error_px": (
                production_geometry_gate.get(
                    "max_median_reprojection_error_px"
                )
            ),
            "stable_feature_identity_pair_count": (
                sparse_diagnostics.get(
                    "stable_feature_identity_pair_count"
                )
            ),
            "tracks_with_stable_feature_identity": (
                sparse_diagnostics.get(
                    "tracks_with_stable_feature_identity"
                )
            ),
            "stable_feature_identity_observation_count": (
                sparse_diagnostics.get(
                    "stable_feature_identity_observation_count"
                )
            ),
            "selected_seed_pair": (
                selected_seed_pair
            ),
            "seed_candidate_evaluation": (
                seed_candidate_evaluation
            ),
            "camera_registration": (
                camera_registration_rows
            ),
            "global_bundle_adjustment": (
                sparse_diagnostics.get(
                    "global_bundle_adjustment"
                )
            ),
            "production_geometry_gate": (
                production_geometry_gate
            ),
            "capture_guidance": (
                capture_guidance
            ),
            "pair_rejection_summary": (
                reconstruction_diagnostics.get(
                    "pair_rejection_summary"
                )
            ),
            "pairs": pair_log_rows,
            "diagnostics_persisted_to_session_metadata": (
                True
            ),
            "diagnostics_persistence_key": (
                "analysis_reconstruction_failure"
            ),
            "domain_status": "FAILED",
            "rq_execution_status_note": (
                "RQ may still print Job OK because the worker function "
                "handled the domain failure and returned normally."
            ),
        }

        print(
            "\n[GraniteMeasure][RECONSTRUCTION_FAILURE]\n"
            + json.dumps(
                worker_report,
                indent=2,
                ensure_ascii=False,
                default=str,
            ),
            flush=True,
        )

        _fail(
            db,
            job,
            _reconstruction_failure_message(
                recon_output
            ),
        )

        return

    if (
        recon_output.extents_cm
        is None
        or len(
            recon_output.extents_cm
        ) < 3
    ):
        _fail(
            db,
            job,
            (
                "Reconstruction completed without valid 3D extents."
            ),
        )

        return

    # ---------------------------------------------------------------------
    # 6. Dense depth evidence + Open3D geometry
    # ---------------------------------------------------------------------
    #
    # Depth Anything V2 is a monocular relative-depth model in the current
    # project contract. Relative depth is valuable image evidence, but it is NOT
    # automatically physical camera-Z depth. Therefore:
    #
    #   1. estimate and persist relative depth for every usable capture;
    #   2. build DenseDepthObservation only if the provider explicitly returns
    #      authoritative CAMERA_Z depth in centimetres;
    #   3. require a genuinely metric registered SfM camera transform and
    #      explicit camera intrinsics;
    #   4. otherwise keep the verified sparse SfM/Open3D geometry unchanged.
    #
    # This avoids the common but invalid shortcut:
    #     relative monocular depth * cm_per_pixel == metric 3D depth.
    #
    if "depth_provider" not in locals():
        depth_provider = DepthAnythingV2Provider()

    registered_cameras = list(
        getattr(
            recon_output,
            "registered_cameras",
            None,
        )
        or []
    )

    camera_rows_by_label: dict[
        str,
        dict[str, Any],
    ] = {}

    duplicate_camera_labels: set[
        str
    ] = set()

    for camera_row in (
        registered_cameras
    ):
        if not isinstance(
            camera_row,
            dict,
        ):
            continue

        label = camera_row.get(
            "capture_label"
        )

        if not label:
            continue

        label_key = str(
            label
        )

        if label_key in (
            camera_rows_by_label
        ):
            duplicate_camera_labels.add(
                label_key
            )
            continue

        camera_rows_by_label[
            label_key
        ] = camera_row

    for label in (
        duplicate_camera_labels
    ):
        camera_rows_by_label.pop(
            label,
            None,
        )

    calibration_by_label: dict[
        str,
        dict[str, Any],
    ] = {}

    duplicate_calibration_labels: set[
        str
    ] = set()

    for evidence in (
        calibration_evidence
    ):
        if not isinstance(
            evidence,
            dict,
        ):
            continue

        label = evidence.get(
            "surface"
        )

        if not label:
            continue

        label_key = str(
            label
        )

        if label_key in (
            calibration_by_label
        ):
            duplicate_calibration_labels.add(
                label_key
            )
            continue

        calibration_by_label[
            label_key
        ] = evidence

    for label in (
        duplicate_calibration_labels
    ):
        calibration_by_label.pop(
            label,
            None,
        )

    depth_evidence: list[
        dict[str, Any]
    ] = []

    dense_observations: list[
        DenseDepthObservation
    ] = []
    relative_sfm_point_sets: list[np.ndarray] = []
    relative_alignment_diagnostics: list[dict[str, Any]] = []

    depth_operational_count = 0
    metric_depth_candidate_count = 0
    relative_sfm_aligned_view_count = 0

    reconstruction_metric_ready = bool(
        getattr(
            recon_output,
            "metric_scale_solved",
            False,
        )
    ) and (
        str(
            getattr(
                recon_output,
                "coordinate_scale",
                "",
            )
        )
        == "GLOBAL_METRIC_CENTIMETRES"
    )

    for view_index, (
        side,
        image,
        image_row,
    ) in enumerate(
        loaded
    ):
        mask = (
            seg_masks[
                view_index
            ]
            if view_index
            < len(
                seg_masks
            )
            else None
        )

        try:
            depth_output = (
                precomputed_depth_outputs.get(str(side))
                if "precomputed_depth_outputs" in locals()
                else None
            )
            if depth_output is None:
                depth_output = depth_provider.estimate_depth(
                    image,
                    granite_mask=mask,
                )
        except Exception as exc:
            depth_evidence.append(
                {
                    "image_id": (
                        image_row.id
                    ),
                    "capture_label": (
                        side
                    ),
                    "status": (
                        "unavailable"
                    ),
                    "configured": None,
                    "provider": (
                        depth_provider.__class__.__name__
                    ),
                    "relative_depth_artifact": None,
                    "metric_fusion_eligible": False,
                    "metric_fusion_rejection_reason": (
                        "DEPTH_PROVIDER_EXCEPTION"
                    ),
                    "error_message": (
                        str(
                            exc
                        )
                    ),
                }
            )
            continue

        if (
            depth_output.status
            == "operational"
        ):
            depth_operational_count += 1

        relative_artifact = None

        if (
            depth_output.relative_depth_map
            is not None
        ):
            relative_artifact = (
                _save_relative_depth_artifact(
                    job_id=job.id,
                    image_id=image_row.id,
                    relative_depth=(
                        depth_output.relative_depth_map
                    ),
                    granite_mask=mask,
                )
            )

        camera_row = (
            camera_rows_by_label.get(
                str(
                    side
                )
            )
        )

        calibration_row = (
            calibration_by_label.get(
                str(
                    side
                )
            )
        )

        camera_matrix = None
        intrinsics_source = None

        if camera_row is not None:
            (
                camera_matrix,
                intrinsics_source,
            ) = (
                _camera_matrix_for_dense_fusion(
                    camera_row,
                    calibration_row,
                )
            )

        world_from_camera = (
            camera_row.get(
                "world_from_camera"
            )
            if camera_row
            is not None
            else None
        )

        camera_metric_ready = bool(
            camera_row
            and camera_row.get(
                "metric_scale_solved"
            )
            and camera_row.get(
                "coordinate_scale"
            )
            == "GLOBAL_METRIC_CENTIMETRES"
            and world_from_camera
            is not None
        )

        provider_metric_ready = bool(
            getattr(
                depth_output,
                "is_calibrated_metric",
                False,
            )
            and getattr(
                depth_output,
                "metric_depth_map_cm",
                None,
            )
            is not None
            and getattr(
                depth_output,
                "metric_calibration_source",
                None,
            )
        )

        metric_fusion_eligible = bool(
            reconstruction_metric_ready
            and camera_metric_ready
            and provider_metric_ready
            and camera_matrix
            is not None
        )

        rejection_reason = None

        if not metric_fusion_eligible:
            if not reconstruction_metric_ready:
                rejection_reason = (
                    "GLOBAL_METRIC_SFM_CAMERA_FRAME_NOT_SOLVED"
                )
            elif camera_row is None:
                rejection_reason = (
                    "REGISTERED_CAMERA_NOT_AVAILABLE_FOR_CAPTURE"
                )
            elif not camera_metric_ready:
                rejection_reason = (
                    "REGISTERED_CAMERA_NOT_IN_GLOBAL_METRIC_CENTIMETRES"
                )
            elif camera_matrix is None:
                rejection_reason = (
                    "EXPLICIT_CAMERA_INTRINSICS_UNAVAILABLE"
                )
            elif not provider_metric_ready:
                rejection_reason = (
                    "DEPTH_IS_RELATIVE_MONOCULAR_NOT_AUTHORITATIVE_CAMERA_Z_CM"
                )

        if metric_fusion_eligible:
            try:
                dense_observations.append(
                    DenseDepthObservation(
                        observation_id=(
                            str(
                                image_row.id
                            )
                        ),
                        metric_depth_map_cm=(
                            np.asarray(
                                depth_output.metric_depth_map_cm,
                                dtype=np.float32,
                            )
                        ),
                        intrinsics=(
                            np.asarray(
                                camera_matrix,
                                dtype=np.float64,
                            )
                        ),
                        world_from_camera=(
                            np.asarray(
                                world_from_camera,
                                dtype=np.float64,
                            )
                        ),
                        granite_mask=(
                            mask
                        ),
                        confidence_map=None,
                        depth_semantics=(
                            "CAMERA_Z_DEPTH_CM"
                        ),
                        calibration_source=(
                            str(
                                depth_output.metric_calibration_source
                            )
                        ),
                    )
                )

                metric_depth_candidate_count += 1

            except Exception as exc:
                metric_fusion_eligible = False
                rejection_reason = (
                    "DENSE_OBSERVATION_CONTRACT_REJECTED: "
                    f"{exc}"
                )

        relative_sfm_alignment = {
            "ok": False,
            "reason": "RELATIVE_DEPTH_OR_REGISTERED_CAMERA_UNAVAILABLE",
            "metric_authority": False,
        }

        if (
            depth_output.status == "operational"
            and depth_output.relative_depth_map is not None
            and camera_row is not None
            and camera_matrix is not None
            and world_from_camera is not None
        ):
            anchors = camera_row.get("depth_alignment_anchors")
            if not isinstance(anchors, list):
                anchors = []
            relative_sfm_alignment = _robust_relative_depth_to_sfm_mapping(
                np.asarray(depth_output.relative_depth_map, dtype=np.float32),
                anchors,
                source_width_px=int(camera_row.get("image_width_px") or image.shape[1]),
                source_height_px=int(camera_row.get("image_height_px") or image.shape[0]),
            )
            if relative_sfm_alignment.get("ok"):
                relative_points = _backproject_relative_depth_to_sfm_points(
                    relative_depth=np.asarray(depth_output.relative_depth_map, dtype=np.float32),
                    fit=relative_sfm_alignment,
                    camera_matrix=camera_matrix,
                    world_from_camera=world_from_camera,
                    granite_mask=mask,
                    source_width_px=int(camera_row.get("image_width_px") or image.shape[1]),
                    source_height_px=int(camera_row.get("image_height_px") or image.shape[0]),
                )
                if len(relative_points) >= 24:
                    relative_sfm_point_sets.append(relative_points)
                    relative_sfm_aligned_view_count += 1
                    relative_sfm_alignment["backprojected_point_count"] = int(len(relative_points))
                else:
                    relative_sfm_alignment["ok"] = False
                    relative_sfm_alignment["reason"] = "ALIGNED_DEPTH_BACKPROJECTION_TOO_SPARSE"
                    relative_sfm_alignment["backprojected_point_count"] = int(len(relative_points))

        relative_alignment_diagnostics.append({
            "capture_label": str(side),
            **relative_sfm_alignment,
        })

        depth_evidence.append(
            {
                "image_id": (
                    image_row.id
                ),
                "capture_label": (
                    side
                ),
                "status": (
                    depth_output.status
                ),
                "configured": (
                    depth_output.configured
                ),
                "provider": (
                    depth_output.provider
                ),
                "device": getattr(
                    depth_output,
                    "device",
                    None,
                ),
                "relative_depth_artifact": (
                    relative_artifact
                ),
                "relative_depth_semantics": (
                    "MODEL_RELATIVE_MONOCULAR_DEPTH"
                ),
                "relative_min": (
                    depth_output.min_depth
                ),
                "relative_max": (
                    depth_output.max_depth
                ),
                "relative_mean": (
                    depth_output.mean_depth
                ),
                "valid_pixel_count": getattr(
                    depth_output,
                    "valid_pixel_count",
                    None,
                ),
                "valid_fraction": getattr(
                    depth_output,
                    "valid_fraction",
                    None,
                ),
                "granite_mask_applied": getattr(
                    depth_output,
                    "granite_mask_applied",
                    False,
                ),
                "is_calibrated_metric": bool(
                    getattr(
                        depth_output,
                        "is_calibrated_metric",
                        False,
                    )
                ),
                "metric_calibration_source": getattr(
                    depth_output,
                    "metric_calibration_source",
                    None,
                ),
                "registered_camera_available": (
                    camera_row
                    is not None
                ),
                "camera_metric_ready": (
                    camera_metric_ready
                ),
                "intrinsics_available": (
                    camera_matrix
                    is not None
                ),
                "intrinsics_source": (
                    intrinsics_source
                ),
                "metric_fusion_eligible": (
                    metric_fusion_eligible
                ),
                "metric_fusion_rejection_reason": (
                    rejection_reason
                ),
                "diagnostics": getattr(
                    depth_output,
                    "diagnostics",
                    {},
                ),
                "error_message": getattr(
                    depth_output,
                    "error_message",
                    None,
                ),
            }
        )

    dense_fusion = None
    dense_fusion_selected = False

    if len(
        dense_observations
    ) >= 2:
        try:
            dense_fusion = (
                fuse_metric_depth_maps_open3d(
                    dense_observations,
                    voxel_size_cm=0.5,
                    minimum_view_support=2,
                    geometry_voxel_size_cm=0.5,
                )
            )
        except Exception as exc:
            dense_fusion = None
            depth_evidence.append(
                {
                    "status": "unavailable",
                    "provider": (
                        "DenseMetricDepthFusion"
                    ),
                    "metric_fusion_eligible": False,
                    "metric_fusion_rejection_reason": (
                        "DENSE_FUSION_EXCEPTION"
                    ),
                    "error_message": str(
                        exc
                    ),
                }
            )

    relative_sfm_fused_points = np.empty((0, 3), dtype=np.float64)
    relative_sfm_fusion_diagnostics: dict[str, Any] = {
        "status": "NOT_ATTEMPTED",
        "metric_authority": False,
    }
    if relative_sfm_aligned_view_count >= 1:
        relative_sfm_fused_points, relative_sfm_fusion_diagnostics = (
            _fuse_relative_sfm_point_sets(
                relative_sfm_point_sets,
                recon_output.points,
            )
        )

    if (
        dense_fusion is not None
        and dense_fusion.ok
        and dense_fusion.geometry
        is not None
        and dense_fusion.geometry.ok
        and dense_fusion.fused_point_count
        >= 4
    ):
        open3d_res = dense_fusion.geometry
        dense_fusion_selected = True
        geometry_point_source = "DENSE_MULTIVIEW_METRIC_DEPTH_CONSENSUS"
    elif len(relative_sfm_fused_points) >= 24:
        open3d_res = process_point_cloud_open3d(
            relative_sfm_fused_points.tolist()
        )
        geometry_point_source = "DENSE_MULTIVIEW_RELATIVE_SFM_FUSION"
    else:
        open3d_res = process_point_cloud_open3d(
            recon_output.points
        )
        geometry_point_source = "SPARSE_SFM_FALLBACK"

    dense_depth_summary = {
        "provider": (
            depth_provider.__class__.__name__
        ),
        "capture_count": len(
            loaded
        ),
        "operational_relative_depth_count": (
            depth_operational_count
        ),
        "authoritative_metric_depth_candidate_count": (
            metric_depth_candidate_count
        ),
        "registered_camera_contract_count": len(
            registered_cameras
        ),
        "reconstruction_metric_ready": (
            reconstruction_metric_ready
        ),
        "dense_observation_count": len(
            dense_observations
        ),
        "dense_fusion_attempted": (
            len(
                dense_observations
            )
            >= 2
        ),
        "dense_fusion_selected": (
            dense_fusion_selected
        ),
        "selected_geometry_source": (
            geometry_point_source
        ),
        "dense_fusion_status": (
            getattr(
                dense_fusion,
                "status",
                None,
            )
            if dense_fusion
            is not None
            else "NOT_ATTEMPTED"
        ),
        "dense_fused_point_count": (
            getattr(
                dense_fusion,
                "fused_point_count",
                0,
            )
            if dense_fusion
            is not None
            else 0
        ),
        "relative_sfm_aligned_view_count": relative_sfm_aligned_view_count,
        "relative_sfm_dense_point_count": int(len(relative_sfm_fused_points)),
        "relative_sfm_alignment": relative_alignment_diagnostics,
        "relative_sfm_fusion": relative_sfm_fusion_diagnostics,
        "relative_sfm_visual_geometry_selected": (
            geometry_point_source == "DENSE_MULTIVIEW_RELATIVE_SFM_FUSION"
        ),
        "policy": (
            "Relative monocular depth may be aligned to real sparse SfM camera-Z anchors "
            "for non-metric observed-surface visualization. Metric engineering authority "
            "still requires authoritative CAMERA_Z_DEPTH_CM and a solved global metric frame."
        ),
        "relative_depth_is_metric": False,
        "cm_per_pixel_used_as_depth_scale": False,
        "unobserved_surface_completion": False,
        "depth_views": (
            depth_evidence
        ),
        "fusion_diagnostics": (
            getattr(
                dense_fusion,
                "diagnostics",
                {},
            )
            if dense_fusion
            is not None
            else {}
        ),
        "surface_evidence_gate": (
            surface_evidence_gate
            if "surface_evidence_gate" in locals()
            else None
        ),
    }

    if not open3d_res.ok:
        _fail(
            db,
            job,
            (
                open3d_res.error_message
                or "Open3D geometry processing failed."
            ),
        )

        return

    surface_evidence_gate = (
        _classify_irregular_surface_evidence(
            open3d_res,
            geometry_point_source,
        )
    )

    raw_digital_twin_allowed = bool(
        surface_evidence_gate[
            "raw_digital_twin_allowed"
        ]
    )

    dense_depth_summary[
        "surface_evidence_gate"
    ] = surface_evidence_gate

    recon_extents = [
        float(
            value
        )
        for value in recon_output.extents_cm[
            :3
        ]
    ]

    if (
        "PROXY" in str(
            geometry_point_source
        ).upper()
        or "DISPLAY_SCALED_RELATIVE" in str(
            getattr(
                recon_output,
                "coordinate_scale",
                "",
            )
        ).upper()
    ):
        _fail(
            db,
            job,
            (
                "Display-only relative geometry reached the engineering "
                "measurement gate. Production dimensions were blocked."
            ),
        )

        return

    relative_visual_geometry = geometry_point_source in {
        "DENSE_MULTIVIEW_RELATIVE_SFM_FUSION",
    }

    L = (
        recon_extents[0]
        if relative_visual_geometry
        else (
            float(open3d_res.length_cm)
            if _positive_finite(open3d_res.length_cm)
            else recon_extents[0]
        )
    )

    B = (
        recon_extents[1]
        if relative_visual_geometry
        else (
            float(open3d_res.breadth_cm)
            if _positive_finite(open3d_res.breadth_cm)
            else recon_extents[1]
        )
    )

    H = (
        recon_extents[2]
        if relative_visual_geometry
        else (
            float(open3d_res.height_cm)
            if _positive_finite(open3d_res.height_cm)
            else recon_extents[2]
        )
    )

    if not all(
        (
            _positive_finite(
                L
            ),
            _positive_finite(
                B
            ),
            _positive_finite(
                H
            ),
        )
    ):
        _fail(
            db,
            job,
            (
                "Geometry processing did not produce positive physical "
                "dimensions."
            ),
        )

        return

    lu, bu, hu = (
        recon_output.uncertainty_cm
    )

    # ---------------------------------------------------------------------
    # 7. Trimesh envelope validation
    # ---------------------------------------------------------------------
    trimesh_res = (
        validate_mesh_trimesh(
            open3d_res.cleaned_points,
            L,
            B,
            H,
            mesh_vertices_cm=(
                open3d_res.mesh_vertices
                if open3d_res.mesh_vertices
                else None
            ),
            mesh_triangles=(
                open3d_res.mesh_triangles
                if open3d_res.mesh_triangles
                else None
            ),
        )
    )

    bounding_vol_cm3 = (
        L
        * B
        * H
    )

    bounding_vol_m3 = (
        bounding_vol_cm3
        / 1_000_000.0
    )

    mesh_volume_m3 = (
        float(
            trimesh_res.volume_m3
        )
        if _positive_finite(
            trimesh_res.volume_m3
        )
        else None
    )

    geometry_volume_cm3 = (
        mesh_volume_m3
        * 1_000_000.0
        if mesh_volume_m3 is not None
        else None
    )

    # MeasurementResult historically requires a volume value. Prefer a real
    # observed irregular mesh only when Trimesh validates it as a reliable
    # watertight solid. Otherwise retain the engineering OBB envelope strictly
    # as a compatibility measurement fallback; never call it raw granite volume.
    if (
        mesh_volume_m3 is not None
        and trimesh_res.volume_status == "reliable"
        and bool(
            getattr(
                open3d_res,
                "mesh_triangles",
                None,
            )
        )
    ):
        reported_volume_m3 = round(
            mesh_volume_m3,
            4,
        )

        reported_volume_basis = (
            "OBSERVED_IRREGULAR_TRIANGLE_MESH"
        )
    else:
        reported_volume_m3 = round(
            bounding_vol_m3,
            4,
        )

        reported_volume_basis = (
            "ORIENTED_BOUNDING_BOX_ENVELOPE_FALLBACK_NOT_RAW_STONE_VOLUME"
        )

    # Clean up any existing result rows for this job before saving new records.
    for model_cls in (
        GeometryModel,
        MeasurementResult,
        DefectResult,
        GraniteClassificationResult,
        CuttingOptimizationResult,
        WastageResult,
        SeigniorageAssessment,
    ):
        (
            db.query(
                model_cls
            )
            .filter(
                model_cls.job_id
                == job.id
            )
            .delete()
        )

    db.flush()

    # ---------------------------------------------------------------------
    # Persist point-cloud geometry
    # ---------------------------------------------------------------------
    point_cloud_rel = None

    if open3d_res.cleaned_points:
        point_cloud_rel = (
            f"geometry/{job.id}/"
            + (
                "dense_metric_cloud.json"
                if dense_fusion_selected
                else "sparse_cloud.json"
            )
        )

        point_cloud_payload = {
            "points": (
                open3d_res.cleaned_points
            ),
            "point_count": len(
                open3d_res.cleaned_points
            ),
            "units": (
                "cm"
                if reconstruction_metric_ready
                or dense_fusion_selected
                else str(
                    getattr(
                        recon_output,
                        "coordinate_scale",
                        "sfm_world_units",
                    )
                    or "sfm_world_units"
                )
            ),
            "geometry_point_source": (
                geometry_point_source
            ),
            "dense_depth_summary": (
                dense_depth_summary
            ),
            "reconstruction_provider": (
                recon_output.provider
            ),
            "reconstruction_status": (
                recon_output.status
            ),
            "observed_point_count": getattr(
                recon_output,
                "observed_point_count",
                None,
            ),
            "estimated_point_count": getattr(
                recon_output,
                "estimated_point_count",
                None,
            ),
            "diagnostics": getattr(
                recon_output,
                "diagnostics",
                None,
            ),
            "calibration": (
                calibration_details
            ),
        }

        get_storage().save(
            point_cloud_rel,
            json.dumps(
                point_cloud_payload
            ).encode(),
            "application/json",
        )

    # ---------------------------------------------------------------------
    # 6B. Observed-shape validation: mesh -> registered cameras -> real masks
    # ---------------------------------------------------------------------
    #
    # The >=90% target is a VALIDATION target on OBSERVED photographic views.
    # It is never used to expand masks, fill missing faces, close holes, smooth
    # cavities, or modify the reconstructed mesh.
    #
    # A view is eligible only when all of the following are available:
    #   - authoritative granite segmentation mask;
    #   - a unique registered camera for the same capture label;
    #   - explicit camera intrinsics;
    #   - world_from_camera pose in the same reconstruction frame as the mesh.
    #
    # Missing / inaccessible / unregistered views remain outside the score and
    # therefore remain UNOBSERVED rather than being guessed.
    observed_shape_validation: dict[str, Any] = {
        "status": "NOT_ATTEMPTED",
        "target_iou": 0.90,
        "target_is_validation_goal_not_guarantee": True,
        "score_scope": "OBSERVED_PHOTOGRAPHIC_VIEWS_ONLY",
        "geometry_adjusted_to_improve_score": False,
        "unobserved_surface_policy": "EXCLUDED_FROM_SCORE_AND_LEFT_UNKNOWN",
        "per_view": [],
        "weak_view_ids": [],
        "recapture_recommended": False,
    }

    shape_validation_observations: list[
        ObservedMaskValidationObservation
    ] = []

    shape_validation_rejections: list[
        dict[str, Any]
    ] = []

    if (
        raw_digital_twin_allowed
        and getattr(
            open3d_res,
            "mesh_vertices",
            None,
        )
        and getattr(
            open3d_res,
            "mesh_triangles",
            None,
        )
    ):
        for view_index, (
            side,
            _image,
            image_row,
        ) in enumerate(
            loaded
        ):
            mask = (
                seg_masks[
                    view_index
                ]
                if view_index
                < len(
                    seg_masks
                )
                else None
            )

            if mask is None:
                shape_validation_rejections.append(
                    {
                        "image_id": image_row.id,
                        "capture_label": str(
                            side
                        ),
                        "reason": "AUTHORITATIVE_GRANITE_MASK_UNAVAILABLE",
                    }
                )
                continue

            camera_row = (
                camera_rows_by_label.get(
                    str(
                        side
                    )
                )
            )

            if camera_row is None:
                shape_validation_rejections.append(
                    {
                        "image_id": image_row.id,
                        "capture_label": str(
                            side
                        ),
                        "reason": "REGISTERED_CAMERA_UNAVAILABLE_OR_AMBIGUOUS",
                    }
                )
                continue

            world_from_camera = (
                camera_row.get(
                    "world_from_camera"
                )
            )

            if world_from_camera is None:
                shape_validation_rejections.append(
                    {
                        "image_id": image_row.id,
                        "capture_label": str(
                            side
                        ),
                        "reason": "CAMERA_POSE_UNAVAILABLE",
                    }
                )
                continue

            calibration_row = (
                calibration_by_label.get(
                    str(
                        side
                    )
                )
            )

            (
                camera_matrix,
                intrinsics_source,
            ) = (
                _camera_matrix_for_dense_fusion(
                    camera_row,
                    calibration_row,
                )
            )

            if camera_matrix is None:
                shape_validation_rejections.append(
                    {
                        "image_id": image_row.id,
                        "capture_label": str(
                            side
                        ),
                        "reason": "EXPLICIT_CAMERA_INTRINSICS_UNAVAILABLE",
                    }
                )
                continue

            try:
                shape_validation_observations.append(
                    ObservedMaskValidationObservation(
                        observation_id=str(
                            image_row.id
                        ),
                        granite_mask=np.asarray(
                            mask,
                            dtype=np.uint8,
                        ),
                        intrinsics=np.asarray(
                            camera_matrix,
                            dtype=np.float64,
                        ),
                        world_from_camera=np.asarray(
                            world_from_camera,
                            dtype=np.float64,
                        ),
                        view_label=str(
                            side
                        ),
                        capture_side=str(
                            side
                        ),
                        camera_pose_provenance=str(
                            camera_row.get(
                                "pose_provenance"
                            )
                            or camera_row.get(
                                "provider"
                            )
                            or "REGISTERED_RECONSTRUCTION_CAMERA"
                        ),
                        intrinsics_provenance=(
                            intrinsics_source
                        ),
                    )
                )
            except Exception as exc:
                shape_validation_rejections.append(
                    {
                        "image_id": image_row.id,
                        "capture_label": str(
                            side
                        ),
                        "reason": "VALIDATION_OBSERVATION_CONTRACT_ERROR",
                        "error": str(
                            exc
                        ),
                    }
                )

        try:
            shape_validation_result = (
                validate_mesh_against_observed_masks(
                    open3d_res.mesh_vertices,
                    open3d_res.mesh_triangles,
                    shape_validation_observations,
                    target_iou=0.90,
                    weak_view_iou=0.85,
                )
            )

            observed_shape_validation = {
                "ok": bool(
                    shape_validation_result.ok
                ),
                "status": str(
                    shape_validation_result.status
                ),
                "target_iou": float(
                    shape_validation_result.target_iou
                ),
                "target_is_validation_goal_not_guarantee": True,
                "target_met": bool(
                    shape_validation_result.target_met
                ),
                "overall_silhouette_iou": (
                    shape_validation_result.overall_silhouette_iou
                ),
                "median_silhouette_iou": (
                    shape_validation_result.median_silhouette_iou
                ),
                "minimum_silhouette_iou": (
                    shape_validation_result.minimum_silhouette_iou
                ),
                "mean_boundary_error_px": (
                    shape_validation_result.mean_boundary_error_px
                ),
                "maximum_boundary_error_px": (
                    shape_validation_result.maximum_boundary_error_px
                ),
                "valid_view_count": int(
                    shape_validation_result.valid_view_count
                ),
                "total_view_count": int(
                    shape_validation_result.total_view_count
                ),
                "weak_view_ids": list(
                    shape_validation_result.weak_view_ids
                ),
                "recapture_recommended": bool(
                    shape_validation_result.recapture_recommended
                ),
                "recapture_view_id": (
                    shape_validation_result.recapture_view_id
                ),
                "recapture_view_label": (
                    shape_validation_result.recapture_view_label
                ),
                "recapture_reason": (
                    shape_validation_result.recapture_reason
                ),
                "per_view": list(
                    shape_validation_result.per_view
                ),
                "diagnostics": dict(
                    shape_validation_result.diagnostics
                ),
                "rejected_views": (
                    shape_validation_rejections
                ),
                "score_scope": "OBSERVED_PHOTOGRAPHIC_VIEWS_ONLY",
                "geometry_adjusted_to_improve_score": False,
                "unobserved_surface_policy": "EXCLUDED_FROM_SCORE_AND_LEFT_UNKNOWN",
                "production_geometry_proven_by_this_score_alone": False,
            }

        except Exception as exc:
            observed_shape_validation = {
                "ok": False,
                "status": "VALIDATION_RUNTIME_ERROR",
                "target_iou": 0.90,
                "target_is_validation_goal_not_guarantee": True,
                "target_met": False,
                "overall_silhouette_iou": None,
                "mean_boundary_error_px": None,
                "valid_view_count": 0,
                "total_view_count": len(
                    shape_validation_observations
                ),
                "weak_view_ids": [],
                "recapture_recommended": False,
                "recapture_reason": (
                    "Observed-shape validation could not run. "
                    "Do not infer similarity from the Digital Twin preview."
                ),
                "per_view": [],
                "rejected_views": (
                    shape_validation_rejections
                ),
                "score_scope": "OBSERVED_PHOTOGRAPHIC_VIEWS_ONLY",
                "geometry_adjusted_to_improve_score": False,
                "unobserved_surface_policy": "EXCLUDED_FROM_SCORE_AND_LEFT_UNKNOWN",
                "error": str(
                    exc
                ),
            }

    elif not raw_digital_twin_allowed:
        observed_shape_validation.update(
            {
                "status": "RAW_DIGITAL_TWIN_NOT_AUTHORIZED",
                "recapture_recommended": True,
                "recapture_reason": (
                    "A production irregular mesh has not been authorized. "
                    "Collect stronger connected multi-view evidence before "
                    "shape-similarity validation."
                ),
            }
        )

    else:
        observed_shape_validation.update(
            {
                "status": "OBSERVED_TRIANGLE_MESH_UNAVAILABLE",
                "recapture_recommended": True,
                "recapture_reason": (
                    "No observed triangle mesh is available for render-back "
                    "validation."
                ),
            }
        )

    # Build the same per-photo contract consumed by the frontend. This is not a
    # second score: it is simply the render-back validation evidence projected
    # into the existing photo evidence matrix shape.
    shape_validation_photo_evidence: list[
        dict[str, Any]
    ] = []

    for view_result in (
        observed_shape_validation.get(
            "per_view",
            []
        )
        or []
    ):
        if not isinstance(
            view_result,
            dict,
        ):
            continue

        shape_validation_photo_evidence.append(
            {
                "photo_id": str(
                    view_result.get(
                        "observation_id",
                        "",
                    )
                ),
                "photo_label": str(
                    view_result.get(
                        "view_label"
                    )
                    or view_result.get(
                        "capture_side"
                    )
                    or "OBSERVED_VIEW"
                ),
                "view_name": (
                    view_result.get(
                        "view_label"
                    )
                ),
                "side": (
                    view_result.get(
                        "capture_side"
                    )
                ),
                "silhouette_iou": (
                    view_result.get(
                        "silhouette_iou"
                    )
                ),
                "boundary_error_px": (
                    view_result.get(
                        "boundary_error_px"
                    )
                ),
                "target_met": (
                    view_result.get(
                        "target_met"
                    )
                ),
                "weak_view": (
                    view_result.get(
                        "weak_view"
                    )
                ),
                "valid_for_shape_score": (
                    view_result.get(
                        "valid_for_shape_score"
                    )
                ),
                "validation_status": (
                    view_result.get(
                        "status"
                    )
                ),
                "camera_pose_provenance": (
                    view_result.get(
                        "camera_pose_provenance"
                    )
                ),
                "intrinsics_provenance": (
                    view_result.get(
                        "intrinsics_provenance"
                    )
                ),
                "score_scope": "OBSERVED_PHOTOGRAPHIC_MASK_ONLY",
                "geometry_adjusted_to_improve_score": False,
            }
        )

    # Persist the actual observed irregular granite surface separately from the
    # sparse point cloud and dimensional bounding boxes. The frontend can render
    # this artifact directly as the RAW DIGITAL TWIN. Open boundaries are kept
    # explicit; this worker does not synthesize missing faces.
    mesh_rel = None

    if (
        raw_digital_twin_allowed
        and getattr(
            open3d_res,
            "mesh_vertices",
            None,
        )
        and getattr(
            open3d_res,
            "mesh_triangles",
            None,
        )
    ):
        mesh_rel = (
            f"geometry/{job.id}/"
            "observed_irregular_mesh.json"
        )

        mesh_payload = {
            "format": "granitemeasure-observed-triangle-mesh-v1",
            "role": "RAW_IRREGULAR_GRANITE_DIGITAL_TWIN",
            "units": "cm",
            "vertices": open3d_res.mesh_vertices,
            "triangles": open3d_res.mesh_triangles,
            "vertex_normals": getattr(
                open3d_res,
                "mesh_vertex_normals",
                [],
            ),
            "vertex_count": len(
                open3d_res.mesh_vertices
            ),
            "triangle_count": len(
                open3d_res.mesh_triangles
            ),
            "surface_area_cm2": getattr(
                open3d_res,
                "mesh_surface_area_cm2",
                None,
            ),
            "volume_cm3": getattr(
                open3d_res,
                "mesh_volume_cm3",
                None,
            ),
            "is_watertight": getattr(
                open3d_res,
                "mesh_is_watertight",
                None,
            ),
            "mesh_method": getattr(
                open3d_res,
                "mesh_method",
                None,
            ),
            "mesh_status": getattr(
                open3d_res,
                "mesh_status",
                "NOT_CALCULATED",
            ),
            "unobserved_surface_policy": "PRESERVE_OPEN_BOUNDARIES",
            "hole_filling_performed": False,
            "raw_granite_is_bounding_box": False,
            "geometry_point_source": (
                geometry_point_source
            ),
            "raw_digital_twin_allowed": True,
            "engineering_surface_modes_allowed": bool(
                surface_evidence_gate.get("engineering_surface_modes_allowed")
            ),
            "visual_cut_simulation_allowed": bool(
                surface_evidence_gate.get("visual_cut_simulation_allowed")
            ),
            "surface_evidence_gate": (
                surface_evidence_gate
            ),
            "dense_depth_summary": (
                dense_depth_summary
            ),
            "reconstruction_provider": recon_output.provider,
            "reconstruction_status": recon_output.status,
            "trimesh_validation": getattr(
                trimesh_res,
                "diagnostics",
                {},
            ),
            "reconstruction_diagnostics": getattr(
                recon_output,
                "diagnostics",
                {},
            ),
            "observed_shape_validation": (
                observed_shape_validation
            ),
            "photo_evidence_matrix": (
                shape_validation_photo_evidence
            ),
        }

        get_storage().save(
            mesh_rel,
            json.dumps(
                mesh_payload
            ).encode(),
            "application/json",
        )

    geometry_notes = {
        "reconstruction_quality": (
            recon_output.status
        ),
        "reported_volume_basis": (
            reported_volume_basis
        ),
        "geometry_point_source": (
            geometry_point_source
        ),
        "observed_shape_validation": (
            observed_shape_validation
        ),
        "photo_evidence_matrix": (
            shape_validation_photo_evidence
        ),
        "dense_depth": (
            dense_depth_summary
        ),
        "trimesh_volume_status": (
            trimesh_res.volume_status
        ),
        "raw_digital_twin": {
            "mesh_path": mesh_rel,
            "mesh_status": getattr(
                open3d_res,
                "mesh_status",
                "NOT_CALCULATED",
            ),
            "mesh_method": getattr(
                open3d_res,
                "mesh_method",
                None,
            ),
            "triangle_count": getattr(
                open3d_res,
                "mesh_triangle_count",
                0,
            ),
            "is_watertight": getattr(
                open3d_res,
                "mesh_is_watertight",
                None,
            ),
            "role": (
                "RAW_IRREGULAR_GRANITE_DIGITAL_TWIN"
                if raw_digital_twin_allowed
                else "SPARSE_RECONSTRUCTION_EVIDENCE_ONLY"
            ),
            "raw_digital_twin_allowed": (
                raw_digital_twin_allowed
            ),
            "engineering_surface_modes_allowed": bool(
                surface_evidence_gate.get("engineering_surface_modes_allowed")
            ),
            "visual_cut_simulation_allowed": bool(
                surface_evidence_gate.get("visual_cut_simulation_allowed")
            ),
            "surface_evidence_gate": (
                surface_evidence_gate
            ),
            "unobserved_surface_policy": "PRESERVE_OPEN_BOUNDARIES",
        },
        "open3d_diagnostics": getattr(
            open3d_res,
            "diagnostics",
            {},
        ),
        "trimesh_diagnostics": getattr(
            trimesh_res,
            "diagnostics",
            {},
        ),
        "calibration_details": (
            calibration_details
        ),
        "segmentation_failures": (
            segmentation_failures
        ),
        "granite_detection_summary": (
            granite_detection_summary
        ),
        "granite_detection_evidence": (
            granite_detection_evidence
        ),
    }

    # OBSERVED_SHAPE_VALIDATION_DOES_NOT_PROVE_METRIC_SCALE
    # Silhouette agreement validates observed SHAPE projection only. Existing
    # metric-scale, camera, dense-depth, mesh, and officer-verification gates
    # remain authoritative for engineering measurements.
    geometry_row = GeometryModel(
        job_id=job.id,
        point_cloud_path=point_cloud_rel,
        mesh_path=mesh_rel,
        bounding_box_json=(
            recon_output.bounding_box
        ),
        oriented_bounding_box_json=(
            open3d_res.oriented_bounding_box
        ),
        axis_aligned_bounding_box_json=(
            open3d_res.axis_aligned_bounding_box
        ),
        simplified_geometry_json={
            "type": (
                "irregular_triangle_mesh"
                if mesh_rel
                else (
                    "sparse_reconstruction_evidence"
                    if point_cloud_rel
                    else "dimensional_envelope"
                )
            ),
            "role": (
                "RAW_IRREGULAR_GRANITE_DIGITAL_TWIN"
                if mesh_rel
                else (
                    "SPARSE_RECONSTRUCTION_EVIDENCE_ONLY"
                    if point_cloud_rel
                    else "DIMENSIONAL_ENGINEERING_OVERLAY_ONLY"
                )
            ),
            "mesh_path": mesh_rel,
            "mesh_status": getattr(
                open3d_res,
                "mesh_status",
                "NOT_CALCULATED",
            ),
            "mesh_method": getattr(
                open3d_res,
                "mesh_method",
                None,
            ),
            "mesh_triangle_count": getattr(
                open3d_res,
                "mesh_triangle_count",
                0,
            ),
            "mesh_is_watertight": getattr(
                open3d_res,
                "mesh_is_watertight",
                None,
            ),
            "raw_digital_twin_allowed": (
                raw_digital_twin_allowed
            ),
            "engineering_surface_modes_allowed": (
                raw_digital_twin_allowed
            ),
            "surface_evidence_gate": (
                surface_evidence_gate
            ),
            "bounding_box_role": "DIMENSIONAL_ENGINEERING_OVERLAY_ONLY",
            "geometry_point_source": (
                geometry_point_source
            ),
            "dense_depth": (
                dense_depth_summary
            ),
            "observed_shape_validation": (
                observed_shape_validation
            ),
            "photo_evidence_matrix": (
                shape_validation_photo_evidence
            ),
            "length_cm": L,
            "breadth_cm": B,
            "height_cm": H,
            "length_m": round(
                L / 100.0,
                3,
            ),
            "breadth_m": round(
                B / 100.0,
                3,
            ),
            "height_m": round(
                H / 100.0,
                3,
            ),
            "bounding_volume_cm3": round(
                bounding_vol_cm3,
                1,
            ),
            "reported_volume_m3": (
                reported_volume_m3
            ),
            "reported_volume_basis": (
                reported_volume_basis
            ),
            "surface_flatness_dev_cm": (
                open3d_res.surface_flatness_dev_cm
            ),
            "taper_x": (
                open3d_res.taper_x
            ),
            "taper_y": (
                open3d_res.taper_y
            ),
            "taper_z": (
                open3d_res.taper_z
            ),
            "edge_irregularity_pct": (
                open3d_res.edge_irregularity_pct
            ),
            "min_usable_l_cm": (
                open3d_res.min_usable_l_cm
            ),
            "min_usable_b_cm": (
                open3d_res.min_usable_b_cm
            ),
            "min_usable_h_cm": (
                open3d_res.min_usable_h_cm
            ),
            "chipped_volume_cm3": (
                open3d_res.chipped_volume_cm3
            ),
            "chipped_volume_status": (
                "NOT_CALCULATED"
                if not _positive_finite(
                    open3d_res.chipped_volume_cm3
                )
                else "CALCULATED"
            ),
            "open3d_diagnostics": getattr(
                open3d_res,
                "diagnostics",
                {},
            ),
            "trimesh_diagnostics": getattr(
                trimesh_res,
                "diagnostics",
                {},
            ),
            "calibration": (
                calibration_details
            ),
            "reconstruction_diagnostics": getattr(
                recon_output,
                "diagnostics",
                {},
            ),
            "metric_scale_status": (
                (
                    getattr(
                        recon_output,
                        "diagnostics",
                        {},
                    )
                    or {}
                ).get(
                    "metric_sfm_scale_solved"
                )
                if isinstance(
                    getattr(
                        recon_output,
                        "diagnostics",
                        {},
                    ),
                    dict,
                )
                else None
            ),
        },
        reconstruction_provider=(
            recon_output.provider
        ),
        reconstruction_confidence=(
            recon_output.confidence
        ),
        match_count=(
            recon_output.match_count
        ),
        point_count=(
            open3d_res.point_count
        ),
        inlier_ratio=(
            recon_output.inlier_ratio
        ),
        mesh_is_watertight=(
            trimesh_res.is_watertight
        ),
        mesh_volume_m3=(
            trimesh_res.volume_m3
        ),
        surface_area_m2=(
            trimesh_res.surface_area_m2
        ),
        volume_status=(
            trimesh_res.volume_status
        ),
        notes=json.dumps(
            geometry_notes
        ),
    )

    db.add(
        geometry_row
    )

    # ---------------------------------------------------------------------
    # 8. Pipeline confidence
    # ---------------------------------------------------------------------
    img_qualities = [
        image.quality_score
        for image in accepted
        if image.quality_score
        is not None
    ]

    conf_score = (
        calculate_pipeline_confidence(
            num_images=len(
                loaded
            ),
            image_qualities=(
                img_qualities
            ),
            match_inlier_ratio=(
                recon_output.inlier_ratio
            ),
            match_count=(
                recon_output.match_count
            ),
            calibration_confidence=(
                calib_conf
            ),
            length_cm=L,
            length_uncertainty_cm=(
                lu
            ),
            point_count=(
                open3d_res.point_count
            ),
            mesh_is_watertight=(
                trimesh_res.is_watertight
            ),
            segmentation_confidence=(
                avg_seg_conf
            ),
        )
    )

    # ---------------------------------------------------------------------
    # 9. Measurement result
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.ESTIMATING_DIMENSIONS,
        stage_name=(
            "Calculating Block Dimensions"
        ),
        progress=80,
    )

    db.commit()

    recon_diagnostics = (
        getattr(
            recon_output,
            "diagnostics",
            {},
        )
        or {}
    )

    metric_sfm_scale_solved = bool(
        recon_diagnostics.get(
            "metric_sfm_scale_solved"
        )
    ) if isinstance(
        recon_diagnostics,
        dict,
    ) else False

    scale_label = (
        "GLOBAL_METRIC_SFM_SCALE"
        if metric_sfm_scale_solved
        else "LOCAL_REFERENCE_SCALE_WITH_RECONSTRUCTION_PROVENANCE"
    )

    analysis_method = (
        "Open3D Multi-View Calibrated Geometry; "
        f"geometry_source={geometry_point_source}; "
        f"scale_basis={scale_label}; "
        f"global_metric_sfm_scale_solved={metric_sfm_scale_solved}; "
        "display_proxy_used_for_measurement=False; "
        f"volume_basis={reported_volume_basis}; "
        f"mesh_status={trimesh_res.volume_status}"
    )

    meas = MeasurementResult(
        job_id=job.id,
        length_cm=L,
        breadth_cm=B,
        height_cm=H,
        length_uncertainty_cm=(
            lu
        ),
        breadth_uncertainty_cm=(
            bu
        ),
        height_uncertainty_cm=(
            hu
        ),
        volume_m3=(
            reported_volume_m3
        ),
        measurement_confidence=(
            conf_score.overall_confidence
        ),
        confidence_grade=(
            conf_score.grade
        ),
        confidence_factors=(
            conf_score.factors
        ),
        analysis_method=(
            analysis_method
        ),
        images_used=len(
            loaded
        ),
        calibration_method=(
            calib_method
        ),
        surfaces_analyzed=(
            recon_output.surfaces_analyzed
            or [
                side
                for side, _, _
                in loaded
            ]
        ),
        cm_per_pixel=(
            cm_per_pixel
        ),
    )

    db.add(
        meas
    )

    # ---------------------------------------------------------------------
    # 10. Visible-surface defect + cavity analysis
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.ANALYZING_DEFECTS,
        stage_name=(
            "Analyzing Visible Surface Defects"
        ),
        progress=85,
    )

    db.commit()

    defect_provider = (
        EvidenceGroundedDefectProvider()
    )

    all_findings: list[
        dict[str, Any]
    ] = []

    annotations_found: list[
        Any
    ] = []

    for side, image, image_row in loaded:
        detection = (
            defect_provider.detect(
                image,
                side,
            )
        )

        try:
            annotations = (
                defect_provider.detect_annotations(
                    image
                )
            )
        except Exception:
            annotations = []

        annotations_found.extend(
            annotations
        )

        for finding in (
            detection.findings
        ):
            defect_index = (
                len(
                    all_findings
                )
                + 1
            )

            finding_kind = str(
                getattr(
                    finding,
                    "kind",
                    "UNKNOWN",
                )
                or "UNKNOWN"
            )

            is_cavity = (
                _is_visible_cavity_kind(
                    finding_kind
                )
            )

            polygon_xy = (
                getattr(
                    finding,
                    "polygon_xy",
                    None,
                )
                or []
            )

            mask_area_px = _safe_float(
                getattr(
                    finding,
                    "mask_area_px",
                    None,
                )
            )

            measured_area = _safe_float(
                getattr(
                    finding,
                    "estimated_area_cm2",
                    None,
                )
            )

            evidence = getattr(
                finding,
                "evidence",
                None,
            )

            if not evidence:
                evidence = (
                    f"Visible-image finding reported by "
                    f"{defect_provider.__class__.__name__} "
                    f"for capture {side}."
                )

            # General surface localization remains useful for every visible
            # finding, but it is never interpreted as defect penetration depth.
            mesh_localization = (
                _localize_visible_defect_on_observed_mesh(
                    side=str(side),
                    bbox=getattr(
                        finding,
                        "bbox",
                        None,
                    ),
                    camera_rows_by_label=(
                        camera_rows_by_label
                    ),
                    calibration_by_label=(
                        calibration_by_label
                    ),
                    open3d_result=open3d_res,
                    raw_digital_twin_allowed=(
                        raw_digital_twin_allowed
                    ),
                    reconstruction_metric_ready=(
                        reconstruction_metric_ready
                    ),
                )
            )

            # Hole/pit/cavity uses a stricter metric path. The V19 visual proxy,
            # relative SfM fusion and sparse-only meshes are explicitly blocked.
            if is_cavity:
                cavity_geometry = (
                    _measure_visible_cavity_on_observed_mesh(
                        side=str(side),
                        polygon_xy=polygon_xy,
                        camera_rows_by_label=(
                            camera_rows_by_label
                        ),
                        calibration_by_label=(
                            calibration_by_label
                        ),
                        open3d_result=open3d_res,
                        raw_digital_twin_allowed=(
                            raw_digital_twin_allowed
                        ),
                        reconstruction_metric_ready=(
                            reconstruction_metric_ready
                        ),
                        geometry_point_source=(
                            geometry_point_source
                        ),
                    )
                )
            else:
                cavity_geometry = {
                    "ok": False,
                    "status": "NOT_APPLICABLE",
                    "cavity_measurement_status": "NOT_APPLICABLE",
                    "internal_continuation": "NOT_APPLICABLE",
                }

            provider_location = (
                _defect_location_or_none(
                    finding
                )
            )

            if mesh_localization.get("ok"):
                defect_location = {
                    "coordinate_frame": (
                        "GLOBAL_METRIC_CENTIMETRES"
                    ),
                    "visible_surface_point_cm": (
                        mesh_localization.get(
                            "point_cm"
                        )
                    ),
                    "triangle_index": (
                        mesh_localization.get(
                            "triangle_index"
                        )
                    ),
                    "camera_distance_cm": (
                        mesh_localization.get(
                            "camera_distance_cm"
                        )
                    ),
                    "barycentric": (
                        mesh_localization.get(
                            "barycentric"
                        )
                    ),
                    "mesh_support_fraction": (
                        mesh_localization.get(
                            "support_fraction"
                        )
                    ),
                    "mesh_support_hits": (
                        mesh_localization.get(
                            "support_hits"
                        )
                    ),
                    "mesh_support_samples": (
                        mesh_localization.get(
                            "support_samples"
                        )
                    ),
                    "surface_spread_cm": (
                        mesh_localization.get(
                            "surface_spread_cm"
                        )
                    ),
                    "surface_provenance": (
                        "OBSERVED_IRREGULAR_TRIANGLE_MESH"
                    ),
                    "source_capture": str(side),
                    "source_image_id": str(
                        image_row.id
                    ),
                    "intrinsics_source": (
                        mesh_localization.get(
                            "intrinsics_source"
                        )
                    ),
                    "provider_2d_location": (
                        provider_location
                    ),
                }
            else:
                # Preserve real 2D evidence without pretending it has a 3D
                # position when the observed mesh/camera ray cannot prove it.
                defect_location = provider_location

            cavity_depth_mm = _safe_float(
                cavity_geometry.get(
                    "depth_mm"
                )
            )

            cavity_opening_area_cm2 = _safe_float(
                cavity_geometry.get(
                    "opening_area_cm2"
                )
            )

            if (
                is_cavity
                and cavity_opening_area_cm2 is not None
                and cavity_geometry.get("measurement_provenance")
                == "METRIC_CAVITY_GEOMETRY"
            ):
                measured_area = cavity_opening_area_cm2

            if cavity_depth_mm is not None:
                depth_mm = cavity_depth_mm
                depth_provenance = str(
                    cavity_geometry.get(
                        "depth_provenance"
                    )
                    or "METRIC_CAVITY_GEOMETRY"
                )
                depth_status = str(
                    cavity_geometry.get(
                        "depth_status"
                    )
                    or "METRIC_VISIBLE_CAVITY_DEPTH_OBSERVED"
                )
            else:
                depth_mm = None
                depth_provenance = str(
                    getattr(
                        finding,
                        "depth_provenance",
                        "UNOBSERVED",
                    )
                    or "UNOBSERVED"
                )
                depth_status = str(
                    cavity_geometry.get("depth_status")
                    or (
                        cavity_geometry.get("status")
                        if is_cavity
                        else getattr(
                            finding,
                            "depth_status",
                            "NOT_MEASURABLE_FROM_CURRENT_VIEWS",
                        )
                    )
                    or "NOT_MEASURABLE_FROM_CURRENT_VIEWS"
                )

            finding_metadata = getattr(
                finding,
                "metadata",
                None,
            )
            if not isinstance(
                finding_metadata,
                dict,
            ):
                finding_metadata = {}

            finding_metadata = dict(
                finding_metadata
            )
            finding_metadata.update(
                {
                    "source_image_id": str(
                        image_row.id
                    ),
                    "source_capture": str(side),
                    "segmentation_polygon_available": bool(
                        polygon_xy
                    ),
                    "segmentation_polygon_vertex_count": len(
                        polygon_xy
                    ),
                }
            )
            if is_cavity:
                finding_metadata[
                    "cavity_geometry"
                ] = cavity_geometry

            all_findings.append(
                {
                    "id": (
                        finding.id
                        or (
                            f"DEF-"
                            f"{defect_index:03d}"
                        )
                    ),
                    "type": finding_kind,
                    "kind": finding_kind,
                    "category": (
                        finding.category
                    ),
                    "severity": (
                        finding.severity
                    ),
                    "surface": (
                        finding.surface
                    ),
                    "bbox": (
                        finding.bbox
                    ),
                    "polygon_xy": polygon_xy,
                    "mask_area_px": mask_area_px,
                    "confidence": (
                        finding.confidence
                    ),
                    "visible_in_images": (
                        finding.visible_in_images
                        or [
                            finding.surface
                        ]
                    ),
                    "location": (
                        defect_location
                    ),
                    "mesh_localization": (
                        mesh_localization
                    ),
                    "surface_3d_localized": bool(
                        mesh_localization.get(
                            "ok"
                        )
                    ),
                    "is_cavity": bool(
                        is_cavity
                    ),
                    "cavity_geometry": (
                        cavity_geometry
                        if is_cavity
                        else None
                    ),
                    "cavity_measurement_status": (
                        cavity_geometry.get(
                            "cavity_measurement_status"
                        )
                        if is_cavity
                        else "NOT_APPLICABLE"
                    ),
                    "opening_width_cm": (
                        cavity_geometry.get(
                            "opening_width_cm"
                        )
                        if is_cavity
                        else None
                    ),
                    "opening_height_cm": (
                        cavity_geometry.get(
                            "opening_height_cm"
                        )
                        if is_cavity
                        else None
                    ),
                    "opening_area_cm2": (
                        cavity_geometry.get(
                            "opening_area_cm2"
                        )
                        if is_cavity
                        else None
                    ),
                    "max_observed_depth_cm": (
                        cavity_geometry.get(
                            "max_observed_depth_cm"
                        )
                        if is_cavity
                        else None
                    ),
                    "mean_observed_depth_cm": (
                        cavity_geometry.get(
                            "mean_observed_depth_cm"
                        )
                        if is_cavity
                        else None
                    ),
                    "visible_cavity_volume_cm3": (
                        cavity_geometry.get(
                            "visible_cavity_volume_cm3"
                        )
                        if is_cavity
                        else None
                    ),
                    "rim_points_3d_cm": (
                        cavity_geometry.get(
                            "rim_points_3d_cm",
                            [],
                        )
                        if is_cavity
                        else []
                    ),
                    "interior_points_3d_cm": (
                        cavity_geometry.get(
                            "interior_points_3d_cm",
                            [],
                        )
                        if is_cavity
                        else []
                    ),
                    "internal_continuation": (
                        cavity_geometry.get(
                            "internal_continuation",
                            "UNOBSERVED",
                        )
                        if is_cavity
                        else "NOT_APPLICABLE"
                    ),
                    "depth": (
                        {
                            "value_mm": depth_mm,
                            "status": depth_status,
                            "provenance": depth_provenance,
                        }
                        if depth_mm is not None
                        else None
                    ),
                    "depth_mm": depth_mm,
                    "depth_provenance": (
                        depth_provenance
                    ),
                    "depth_status": (
                        depth_status
                    ),
                    "estimated_area_cm2": (
                        measured_area
                    ),
                    "area_status": (
                        "METRIC_CAVITY_OPENING_AREA"
                        if (
                            is_cavity
                            and cavity_opening_area_cm2
                            is not None
                            and cavity_geometry.get(
                                "measurement_provenance"
                            )
                            == "METRIC_CAVITY_GEOMETRY"
                        )
                        else (
                            "MEASURED_OR_PROVIDER_ESTIMATED"
                            if measured_area
                            is not None
                            else "UNAVAILABLE"
                        )
                    ),
                    "measurement_provenance": (
                        cavity_geometry.get(
                            "measurement_provenance"
                        )
                        if (
                            is_cavity
                            and cavity_geometry.get(
                                "measurement_provenance"
                            )
                        )
                        else finding.measurement_provenance
                    ),
                    "cut_relevance": (
                        finding.cut_relevance
                    ),
                    "provenance": (
                        "OBSERVED_VISIBLE_SURFACE"
                    ),
                    "visible_surface_defect": True,
                    "internal_defect": False,
                    "cutting_impact": (
                        "Cavity Exclusion / Dressing Review"
                        if is_cavity
                        else (
                            "Candidate Trimming Region"
                            if finding.category
                            == "SURFACE_IRREGULARITY"
                            else (
                                "Visible Finding Requiring Review"
                            )
                        )
                    ),
                    "evidence": evidence,
                    "metadata": finding_metadata,
                    "notes": (
                        "Visible cavity geometry is reported only where the "
                        "registered metric mesh directly supports it. True "
                        "maximum/internal continuation remains UNOBSERVED unless "
                        "the cavity interior is fully captured."
                        if is_cavity
                        else (
                            "Visible-surface evidence only. Internal defect depth "
                            "and hidden continuation are not inferred."
                        )
                    ),
                }
            )

    # ---------------------------------------------------------------------
    # 10A. Multi-view physical cavity association
    # ---------------------------------------------------------------------
    cavity_observation_count_before_association = sum(
        1
        for finding
        in all_findings
        if finding.get(
            "is_cavity"
        )
    )

    (
        all_findings,
        cavity_association_diagnostics,
    ) = _associate_multiview_cavities(
        all_findings
    )

    # Downstream defect exclusion now sees physical cavities rather than one
    # duplicate cavity row per camera view.
    (
        defect_exclusion_cm3,
        defect_exclusion_details,
    ) = (
        _measurable_defect_exclusion_cm3(
            all_findings
        )
    )

    summary_counts = {
        "confirmed_defects": sum(
            1
            for finding
            in all_findings
            if finding.get(
                "category"
            )
            == "CONFIRMED_DEFECT"
        ),
        "surface_irregularities": sum(
            1
            for finding
            in all_findings
            if finding.get(
                "category"
            )
            == "SURFACE_IRREGULARITY"
        ),
        "uncertain_observations": sum(
            1
            for finding
            in all_findings
            if finding.get(
                "category"
            )
            in {
                "UNCERTAIN_OBSERVATION",
                "UNCONFIRMED_ANOMALY",
            }
        ),
        "visible_cavities": sum(
            1
            for finding
            in all_findings
            if finding.get(
                "is_cavity"
            )
        ),
        "cavity_observations_before_association": (
            cavity_observation_count_before_association
        ),
        "physical_cavities": (
            cavity_association_diagnostics.get(
                "physical_cavity_count",
                0,
            )
        ),
        "multiview_cavities": (
            cavity_association_diagnostics.get(
                "multi_view_physical_cavity_count",
                0,
            )
        ),
        "metric_cavities_measured": sum(
            1
            for finding
            in all_findings
            if (
                finding.get(
                    "is_cavity"
                )
                and finding.get(
                    "depth_mm"
                )
                is not None
            )
        ),
    }

    for finding in all_findings:
        if not finding.get(
            "is_cavity"
        ):
            continue

        existing_metadata = finding.get(
            "metadata"
        )

        metadata = (
            dict(
                existing_metadata
            )
            if isinstance(
                existing_metadata,
                dict,
            )
            else {}
        )

        metadata[
            "physical_cavity_association"
        ] = {
            "physical_cavity_id": (
                finding.get(
                    "physical_cavity_id"
                )
            ),
            "association_status": (
                finding.get(
                    "association_status"
                )
            ),
            "association_confidence": (
                finding.get(
                    "association_confidence"
                )
            ),
            "evidence_view_count": (
                finding.get(
                    "evidence_view_count",
                    1,
                )
            ),
            "evidence_views": (
                finding.get(
                    "evidence_views",
                    [],
                )
            ),
            "policy": (
                finding.get(
                    "association_policy"
                )
            ),
        }

        finding[
            "metadata"
        ] = metadata

    if all_findings:
        defect_narrative = (
            f"{summary_counts['confirmed_defects']} confirmed visible "
            "defect(s), "
            f"{summary_counts['surface_irregularities']} visible surface "
            "irregularity/ies, "
            f"{summary_counts['uncertain_observations']} uncertain visible "
            "observation(s), and "
            f"{summary_counts['cavity_observations_before_association']} "
            "cavity/hole image observation(s) resolved to "
            f"{summary_counts['physical_cavities']} physical cavity record(s); "
            f"{summary_counts['multiview_cavities']} have multi-view association. "
            f"{summary_counts['metric_cavities_measured']} physical cavity record(s) "
            "have metric observed-depth evidence. Hidden/internal continuation "
            "is not inferred."
        )
    else:
        defect_narrative = (
            "No visible surface findings were reported by the current "
            "provider in the analyzed views. This does not establish absence "
            "of hidden, internal, bottom-side, or unobserved defects."
        )

    db.add(
        DefectResult(
            job_id=job.id,
            provider=(
                "EvidenceGroundedDefectProvider "
                "(Visible-Surface + Metric Cavity Analysis)"
            ),
            status="operational",
            visible_defects=(
                all_findings
            ),
            bottom_surface=(
                "UNOBSERVED unless directly captured; resting-face geometry "
                "must not be inferred."
            ),
            internal_defects_claimed=False,
            error_code=None,
            error_message=(
                defect_narrative
            ),
        )
    )

    # ---------------------------------------------------------------------
    # 11. Multi-view granite classification
    # ---------------------------------------------------------------------
    classif_provider = (
        GraniteClassificationProvider()
    )

    classif_out = (
        _choose_multiview_classification(
            classif_provider,
            loaded,
        )
    )

    if classif_out:
        classif_error = (
            getattr(
                classif_out,
                "error_message",
                None,
            )
            or getattr(
                classif_out,
                "disclaimer",
                None,
            )
        )
    else:
        classif_error = (
            "Classification unavailable for all analyzed views."
        )

    db.add(
        GraniteClassificationResult(
            job_id=job.id,
            classification=(
                classif_out.classification
                if classif_out
                else None
            ),
            confidence=(
                classif_out.confidence
                if classif_out
                else None
            ),
            provider=(
                classif_out.provider
                if classif_out
                else "unconfigured"
            ),
            status=(
                classif_out.status
                if classif_out
                else "unavailable"
            ),
            error_message=(
                classif_error
            ),
        )
    )

    # ---------------------------------------------------------------------
    # 12. Cutting optimization and wastage
    # ---------------------------------------------------------------------
    _transition(
        db,
        job,
        AnalysisState.OPTIMIZING_CUTTING,
        stage_name=(
            "OR-Tools Cutting Optimization"
        ),
        progress=90,
    )

    db.commit()

    if (
        geometry_volume_cm3
        is not None
        and bounding_vol_cm3 > 0.0
    ):
        irregularity = float(
            np.clip(
                1.0
                - (
                    geometry_volume_cm3
                    / bounding_vol_cm3
                ),
                0.0,
                1.0,
            )
        )

        adjusted_vol_cm3 = round(
            geometry_volume_cm3,
            1,
        )

        adjusted_volume_basis = (
            "TRIMESH_CONVEX_HULL_OUTER_ENVELOPE_ESTIMATE"
        )
    else:
        # Optimization services currently require a numeric raw envelope. We
        # use the dimensional bounding envelope but flag it as a conservative
        # fallback rather than calling it reconstructed physical volume.
        irregularity = 0.0

        adjusted_vol_cm3 = round(
            bounding_vol_cm3,
            1,
        )

        adjusted_volume_basis = (
            "BOUNDING_ENVELOPE_FALLBACK_NO_MESH_VOLUME"
        )

    mesh_native_cutting_authorized = False
    cutting_geometry_status = (
        "PRELIMINARY_DIMENSIONAL_OPTIMIZATION_ONLY"
    )
    cutting_geometry_reason = (
        "The current optimize_cutting service consumes dimensions, taper, "
        "irregularity ratio and visible-defect metadata; it does not yet clip "
        "or optimize directly against the observed triangle mesh. Results must "
        "not be presented as a validated mesh-native cutting simulation."
    )

    cut_res = optimize_cutting(
        length_cm=L,
        breadth_cm=B,
        height_cm=H,
        defect_exclusion_cm3=(
            defect_exclusion_cm3
        ),
        irregularity_ratio=(
            irregularity
        ),
        raw_volume_m3=(
            reported_volume_m3
        ),
        taper_x=(
            open3d_res.taper_x
        ),
        taper_y=(
            open3d_res.taper_y
        ),
        taper_z=(
            open3d_res.taper_z
        ),
        defects_list=(
            all_findings
        ),
    )

    db.add(
        CuttingOptimizationResult(
            job_id=job.id,
            orientations=(
                cut_res[
                    "orientations"
                ]
            ),
            recommended_orientation=(
                cut_res[
                    "recommended_orientation"
                ]
            ),
            max_usable_volume_cm3=(
                cut_res[
                    "max_usable_volume_cm3"
                ]
            ),
            usable_area_m2=(
                cut_res[
                    "usable_area_m2"
                ]
            ),
            wastage_area_m2=(
                cut_res[
                    "wastage_area_m2"
                ]
            ),
            wastage_percentage=(
                cut_res[
                    "wastage_percentage"
                ]
            ),
            pieces_estimated=(
                cut_res[
                    "pieces_estimated"
                ]
            ),
            solver=(
                cut_res[
                    "solver"
                ]
            ),
            parameters={
                **(
                    cut_res.get(
                        "parameters"
                    )
                    or {}
                ),
                "scenarios": (
                    cut_res.get(
                        "scenarios"
                    )
                ),
                "confirmed_case": (
                    cut_res.get(
                        "confirmed_case"
                    )
                ),
                "conservative_case": (
                    cut_res.get(
                        "conservative_case"
                    )
                ),
                "maximum_recovery_case": (
                    cut_res.get(
                        "maximum_recovery_case"
                    )
                ),
                "final_dressed_dimensions": (
                    cut_res.get(
                        "final_dressed_dimensions"
                    )
                ),
                "cutting_steps": (
                    cut_res.get(
                        "cutting_steps"
                    )
                ),
                "geometry_volume_basis": (
                    adjusted_volume_basis
                ),
                "raw_digital_twin_allowed": (
                    raw_digital_twin_allowed
                ),
                "mesh_native_cutting_authorized": (
                    mesh_native_cutting_authorized
                ),
                "cutting_geometry_status": (
                    cutting_geometry_status
                ),
                "cutting_geometry_reason": (
                    cutting_geometry_reason
                ),
                "surface_evidence_gate": (
                    surface_evidence_gate
                ),
                "defect_exclusion": (
                    defect_exclusion_details
                ),
                "volume_status": (
                    trimesh_res.volume_status
                ),
                "warning": (
                    "Preliminary dimensional optimization only. The current "
                    "cutting service is not yet mesh-native and therefore is not "
                    "authorized as a real cut-on-irregular-surface simulation. "
                    "Unmeasured defect depth is not converted into synthetic "
                    "material-loss volume."
                ),
            },
            label=(
                cut_res[
                    "label"
                ]
            ),
        )
    )

    _transition(
        db,
        job,
        AnalysisState.ESTIMATING_WASTAGE,
        stage_name=(
            "Material Yield Analysis"
        ),
        progress=95,
    )

    db.commit()

    waste_res = (
        wastage_from_geometry(
            L,
            B,
            H,
            adjusted_vol_cm3,
            cut_res[
                "max_usable_volume_cm3"
            ],
            defect_exclusion_cm3,
        )
    )

    db.add(
        WastageResult(
            job_id=job.id,
            bounding_volume_cm3=(
                waste_res[
                    "bounding_volume_cm3"
                ]
            ),
            adjusted_geometry_volume_cm3=(
                waste_res[
                    "adjusted_geometry_volume_cm3"
                ]
            ),
            bounding_method=(
                waste_res[
                    "bounding_method"
                ]
            ),
            adjusted_method=(
                (
                    waste_res[
                        "adjusted_method"
                    ]
                    + "; "
                    + adjusted_volume_basis
                )
            ),
            irregularity_ratio=(
                waste_res[
                    "irregularity_ratio"
                ]
            ),
            max_usable_cut_volume_cm3=(
                waste_res[
                    "max_usable_cut_volume_cm3"
                ]
            ),
            estimated_waste_volume_cm3=(
                waste_res[
                    "estimated_waste_volume_cm3"
                ]
            ),
            waste_percentage=(
                waste_res[
                    "waste_percentage"
                ]
            ),
            defect_exclusion_volume_cm3=(
                waste_res[
                    "defect_exclusion_volume_cm3"
                ]
            ),
            shape_notes={
                "tapered_sides": (
                    open3d_res.taper_x
                    > 0.05
                    or open3d_res.taper_y
                    > 0.05
                ),
                "uneven_surfaces": (
                    open3d_res.surface_flatness_dev_cm
                    > 0.5
                ),
                "irregular_edges": (
                    open3d_res.edge_irregularity_pct
                    > 8.0
                ),
                "missing_corners": (
                    None
                ),
                "broken_regions": (
                    None
                ),
                "visible_findings_count": len(
                    all_findings
                ),
                "bottom_surface": (
                    "UNOBSERVED unless directly captured"
                ),
                "reconstruction_quality": (
                    recon_output.status
                ),
                "geometry_volume_basis": (
                    adjusted_volume_basis
                ),
                "trimesh_volume_status": (
                    trimesh_res.volume_status
                ),
                "defect_exclusion_details": (
                    defect_exclusion_details
                ),
            },
        )
    )

    # ---------------------------------------------------------------------
    # 13. Indicative seigniorage assessment
    # ---------------------------------------------------------------------
    block = db.get(
        GraniteBlock,
        job.block_id,
    )

    # Do not silently replace missing geometry volume with a cuboid for
    # monetary assessment. If no point-cloud envelope volume exists, leave the
    # assessed physical volume unavailable and do not calculate an amount.
    volume_for_assess = (
        round(
            geometry_volume_cm3,
            1,
        )
        if geometry_volume_cm3
        is not None
        else None
    )

    rate = None
    gclass = None

    if block:
        gclass = classify_gangsaw(
            L,
            B,
            270.0,
            150.0,
        )

        rate = active_rate(
            db,
            block.granite_category_id,
            gclass,
        )

    amount = None
    vol_m3_assess = None
    rate_val = None

    if (
        rate
        and volume_for_assess
    ):
        vol_m3_assess = (
            volume_for_assess
            / 1_000_000.0
        )

        rate_val = (
            rate.rate_per_cubic_metre
        )

        gclass = (
            classify_gangsaw(
                L,
                B,
                rate.above_length_cm,
                rate.above_breadth_cm,
            )
        )

    tonnes = None

    density = (
        settings.default_granite_density_t_m3
        or 2.7
    )

    if vol_m3_assess:
        tonnes = round(
            vol_m3_assess
            * density,
            3,
        )

        if rate:
            _, amount = (
                indicative_amount(
                    volume_for_assess,
                    rate.rate_per_cubic_metre,
                )
            )

    if volume_for_assess is None:
        assessment_note = (
            "No mesh-derived outer-envelope volume was available. Bounding "
            "box volume was not substituted for monetary assessment."
        )
    elif not rate:
        assessment_note = (
            "No published seigniorage rate matched this category/class. "
            "Geometry volume is an outer-envelope estimate, not a certified "
            "survey quantity."
        )
    else:
        assessment_note = (
            "Indicative AI assessment uses the available point-cloud convex-"
            "hull outer-envelope estimate. It is not a certified survey or "
            "statutory quantity."
        )

    db.add(
        SeigniorageAssessment(
            job_id=job.id,
            block_id=job.block_id,
            category_id=(
                block.granite_category_id
                if block
                else None
            ),
            rate_id=(
                rate.id
                if rate
                else None
            ),
            gangsaw_class=(
                gclass
            ),
            assessment_kind=(
                AssessmentKind.INDICATIVE_AI_ASSESSMENT
            ),
            volume_cm3=(
                volume_for_assess
            ),
            volume_m3=(
                vol_m3_assess
            ),
            rate_per_m3=(
                rate_val
            ),
            indicative_amount=(
                amount
            ),
            density_used_t_m3=(
                density
            ),
            estimated_tonnes=(
                tonnes
            ),
            created_by_id=(
                job.submitted_by_id
            ),
            notes=(
                assessment_note
            ),
        )
    )

    audit(
        db,
        entity_type=(
            "seigniorage_assessment"
        ),
        entity_id=job.id,
        action=(
            "assessment_generated"
        ),
        actor_id=(
            job.submitted_by_id
        ),
        metadata={
            "kind": (
                AssessmentKind.INDICATIVE_AI_ASSESSMENT
            ),
            "volume_basis": (
                "TRIMESH_CONVEX_HULL_OUTER_ENVELOPE_ESTIMATE"
                if volume_for_assess
                is not None
                else "UNAVAILABLE"
            ),
        },
    )

    if block:
        block.status = (
            "ANALYZED"
        )

    job.completed_at = datetime.now(
        timezone.utc
    )

    _transition(
        db,
        job,
        AnalysisState.COMPLETED,
        stage_name="Analysis Complete",
        progress=100,
    )

    audit(
        db,
        entity_type="analysis_job",
        entity_id=job.id,
        action="analysis_completed",
        actor_id=job.submitted_by_id,
        metadata={
            "reported_volume_basis": (
                reported_volume_basis
            ),
            "trimesh_volume_status": (
                trimesh_res.volume_status
            ),
            "raw_digital_twin_allowed": (
                raw_digital_twin_allowed
            ),
            "mesh_native_cutting_authorized": (
                mesh_native_cutting_authorized
            ),
            "visible_defect_count": len(
                all_findings
            ),
            "defect_exclusion_volume_cm3": (
                defect_exclusion_cm3
            ),
            "granite_detection_status": (
                granite_detection_summary["semantic_status"]
            ),
            "granite_detection_positive_count": (
                granite_detection_summary["explicit_positive_count"]
            ),
            "granite_detection_unknown_count": (
                granite_detection_summary["unknown_count"]
            ),
            "calibration_status": (
                calibration_details.get(
                    "status"
                )
                if isinstance(
                    calibration_details,
                    dict,
                )
                else None
            ),
            "calibration_selected_image_id": (
                calibration_details.get(
                    "selected_image_id"
                )
                if isinstance(
                    calibration_details,
                    dict,
                )
                else None
            ),
            "global_metric_scale_candidate": (
                calibration_details.get(
                    "global_metric_scale_candidate"
                )
                if isinstance(
                    calibration_details,
                    dict,
                )
                else None
            ),
            "metric_sfm_scale_solved": (
                metric_sfm_scale_solved
            ),
        },
    )

    db.commit()

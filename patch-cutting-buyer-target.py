from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
TARGET = ROOT / "backend" / "app" / "services" / "cutting.py"
MARKER = "# GRANITEMEASURE_BUYER_TARGET_MESH_CLIP_V1"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] File not found: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

if MARKER in text:
    print("[OK] Buyer-target mesh clip patch already installed.")
    raise SystemExit(0)

if "def optimize_cutting_mesh_native" not in text:
    raise SystemExit(
        "[ERROR] optimize_cutting_mesh_native was not found. No changes made."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(f"{TARGET.name}.backup-{stamp}")
shutil.copy2(TARGET, backup)

patch = r'''
# GRANITEMEASURE_BUYER_TARGET_MESH_CLIP_V1
#
# Buyer dimensions are a genuine geometry constraint, not a display label.
# The existing optimizer first performs its irregular-surface/defect workflow.
# When a buyer target is present this wrapper additionally performs a PCA-aligned
# six-plane clip of the source mesh and reports the actual retained extents.
# Geometry is never enlarged and no hidden surface is synthesized.

import inspect as _gm_inspect

_granitemeasure_mesh_optimizer_without_buyer_clip = optimize_cutting_mesh_native


def _gm_positive_dimension(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(number) or number <= 0.0:
        return None
    return number


def _gm_keep_positive_halfspace(mesh, normal, origin):
    try:
        clipped = trimesh.intersections.slice_mesh_plane(
            mesh,
            plane_normal=np.asarray(normal, dtype=np.float64),
            plane_origin=np.asarray(origin, dtype=np.float64),
            cap=True,
        )
    except Exception:
        try:
            clipped = trimesh.intersections.slice_mesh_plane(
                mesh,
                plane_normal=np.asarray(normal, dtype=np.float64),
                plane_origin=np.asarray(origin, dtype=np.float64),
                cap=False,
            )
        except Exception:
            return None

    if clipped is None:
        return None

    verts = np.asarray(getattr(clipped, "vertices", []), dtype=np.float64)
    if verts.ndim != 2 or verts.shape[0] < 4 or verts.shape[1] < 3:
        return None

    return clipped


def _gm_apply_buyer_target_mesh_clip(
    *,
    result,
    mesh_vertices,
    mesh_triangles,
    buyer_target_dimensions,
):
    if not isinstance(result, dict):
        return result

    if not isinstance(buyer_target_dimensions, dict):
        return result

    values = [
        _gm_positive_dimension(buyer_target_dimensions.get("length_cm")),
        _gm_positive_dimension(buyer_target_dimensions.get("breadth_cm")),
        _gm_positive_dimension(buyer_target_dimensions.get("height_cm")),
    ]

    if any(value is None for value in values):
        result["buyer_target_status"] = "INVALID_OR_INCOMPLETE_TARGET"
        return result

    requested = np.asarray(values, dtype=np.float64)

    try:
        vertices = np.asarray(mesh_vertices, dtype=np.float64)
        faces = np.asarray(mesh_triangles, dtype=np.int64)
    except Exception:
        result["buyer_target_status"] = "MESH_DATA_INVALID"
        return result

    if (
        vertices.ndim != 2
        or vertices.shape[0] < 4
        or vertices.shape[1] < 3
        or faces.ndim != 2
        or faces.shape[0] < 4
        or faces.shape[1] < 3
    ):
        result["buyer_target_status"] = "MESH_DATA_INSUFFICIENT"
        return result

    vertices = vertices[:, :3]
    faces = faces[:, :3]

    try:
        raw_mesh = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            process=False,
        )
    except Exception:
        result["buyer_target_status"] = "MESH_CONSTRUCTION_FAILED"
        return result

    centroid = np.mean(vertices, axis=0)
    centered = vertices - centroid

    try:
        _eigvals, eigvecs = np.linalg.eigh(np.cov(centered, rowvar=False))
    except Exception:
        eigvecs = np.eye(3, dtype=np.float64)

    first_local = centered @ eigvecs
    first_extents = np.ptp(first_local, axis=0)

    # Engineering L/B/H follow longest/middle/shortest principal extents.
    order = np.argsort(first_extents)[::-1]
    basis = eigvecs[:, order]

    local = centered @ basis
    local_min = np.min(local, axis=0)
    local_max = np.max(local, axis=0)
    raw_extents = local_max - local_min
    local_center = (local_min + local_max) / 2.0

    # A buyer target may reduce the retained block; it may never grow it.
    desired = np.minimum(requested, raw_extents)

    if np.any(desired <= 0.0):
        result["buyer_target_status"] = "TARGET_OUTSIDE_VALID_GEOMETRY"
        return result

    clipped = raw_mesh.copy()
    cut_records = []

    for axis_index, axis_name in enumerate(("LENGTH", "BREADTH", "HEIGHT")):
        if desired[axis_index] >= raw_extents[axis_index] - 1e-6:
            continue

        direction = basis[:, axis_index]
        half = desired[axis_index] / 2.0

        lower_local = local_center.copy()
        lower_local[axis_index] -= half
        lower_world = centroid + lower_local @ basis.T

        upper_local = local_center.copy()
        upper_local[axis_index] += half
        upper_world = centroid + upper_local @ basis.T

        before_faces = int(len(getattr(clipped, "faces", [])))

        clipped_lower = _gm_keep_positive_halfspace(
            clipped,
            direction,
            lower_world,
        )
        if clipped_lower is None:
            result["buyer_target_status"] = f"CLIP_FAILED_{axis_name}_LOWER"
            return result
        clipped = clipped_lower

        clipped_upper = _gm_keep_positive_halfspace(
            clipped,
            -direction,
            upper_world,
        )
        if clipped_upper is None:
            result["buyer_target_status"] = f"CLIP_FAILED_{axis_name}_UPPER"
            return result
        clipped = clipped_upper

        cut_records.append(
            {
                "axis": axis_name,
                "source_extent_cm": round(float(raw_extents[axis_index]), 4),
                "requested_dimension_cm": round(float(requested[axis_index]), 4),
                "retained_target_cm": round(float(desired[axis_index]), 4),
                "faces_before_axis_clip": before_faces,
                "faces_after_axis_clip": int(
                    len(getattr(clipped, "faces", []))
                ),
                "reason": "BUYER_TARGET_DIMENSION_CONSTRAINT",
            }
        )

    clipped_vertices = np.asarray(
        getattr(clipped, "vertices", []),
        dtype=np.float64,
    )
    if clipped_vertices.ndim != 2 or len(clipped_vertices) < 4:
        result["buyer_target_status"] = "TARGET_CLIP_EMPTY"
        return result

    clipped_local = (clipped_vertices - centroid) @ basis
    actual_extents = np.ptp(clipped_local, axis=0)

    final_dims = {
        "length_cm": min(
            round(float(actual_extents[0]), 4),
            round(float(desired[0]), 4),
        ),
        "breadth_cm": min(
            round(float(actual_extents[1]), 4),
            round(float(desired[1]), 4),
        ),
        "height_cm": min(
            round(float(actual_extents[2]), 4),
            round(float(desired[2]), 4),
        ),
    }

    result["final_dressed_dimensions"] = final_dims
    result["buyer_target_dimensions"] = {
        "length_cm": float(requested[0]),
        "breadth_cm": float(requested[1]),
        "height_cm": float(requested[2]),
    }
    result["buyer_target_status"] = "APPLIED_TO_MESH"
    result["buyer_target_method"] = "PCA_ALIGNED_SIX_PLANE_MESH_CLIP"
    result["buyer_target_cutting_steps"] = cut_records
    result["target_constrained_mesh_summary"] = {
        "vertex_count": int(len(clipped_vertices)),
        "triangle_count": int(len(getattr(clipped, "faces", []))),
        "is_watertight": bool(getattr(clipped, "is_watertight", False)),
        "hidden_surfaces_synthesized": False,
        "geometry_enlarged": False,
    }

    params = result.get("parameters")
    params = dict(params) if isinstance(params, dict) else {}
    params["buyer_target_dimensions"] = dict(result["buyer_target_dimensions"])
    params["buyer_target_status"] = result["buyer_target_status"]
    params["buyer_target_method"] = result["buyer_target_method"]
    params["buyer_target_cutting_steps"] = list(cut_records)
    params["final_dressed_dimensions"] = dict(final_dims)
    result["parameters"] = params

    # Only replace volume if the clipped mesh itself remains watertight.
    try:
        watertight = bool(clipped.is_watertight)
        clipped_volume_cm3 = abs(float(clipped.volume))
    except Exception:
        watertight = False
        clipped_volume_cm3 = 0.0

    if (
        watertight
        and np.isfinite(clipped_volume_cm3)
        and clipped_volume_cm3 > 0.0
    ):
        old_usable_cm3 = None
        try:
            old_usable_m3 = float(result.get("usable_volume_m3"))
            if np.isfinite(old_usable_m3) and old_usable_m3 > 0.0:
                old_usable_cm3 = old_usable_m3 * 1_000_000.0
        except (TypeError, ValueError):
            pass

        usable_cm3 = clipped_volume_cm3
        if old_usable_cm3 is not None:
            usable_cm3 = min(usable_cm3, old_usable_cm3)

        result["usable_volume_m3"] = round(usable_cm3 / 1_000_000.0, 6)
        result["max_usable_volume_cm3"] = round(usable_cm3, 3)
        result["buyer_target_volume_status"] = (
            "WATERTIGHT_TARGET_CLIPPED_MESH_VOLUME"
        )
    else:
        result["buyer_target_volume_status"] = (
            "DIMENSIONS_CLIPPED_VOLUME_NOT_REPLACED_MESH_NOT_WATERTIGHT"
        )

    return result


def optimize_cutting_mesh_native(*args, **kwargs):
    signature = _gm_inspect.signature(
        _granitemeasure_mesh_optimizer_without_buyer_clip
    )
    bound = signature.bind_partial(*args, **kwargs)

    result = _granitemeasure_mesh_optimizer_without_buyer_clip(
        *args,
        **kwargs,
    )

    return _gm_apply_buyer_target_mesh_clip(
        result=result,
        mesh_vertices=bound.arguments.get("mesh_vertices"),
        mesh_triangles=bound.arguments.get("mesh_triangles"),
        buyer_target_dimensions=bound.arguments.get(
            "buyer_target_dimensions"
        ),
    )
'''

TARGET.write_text(text.rstrip() + "\n\n" + patch + "\n", encoding="utf-8")
print(f"[BACKUP] {backup}")
print(f"[OK] Patched {TARGET}")
print("[OK] Buyer target now drives an actual PCA-aligned six-plane mesh clip.")
print("[OK] Geometry is never enlarged; hidden surfaces are not synthesized.")

from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
TARGET = BACKEND / "app" / "services" / "cutting.py"
MARKER = "# GRANITEMEASURE_BUYER_TARGET_TRIANGLE_CLIP_V3"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] Missing: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

if MARKER in text:
    print("[OK] Buyer-target triangle clip V3 already installed.")
else:
    if "_granitemeasure_mesh_optimizer_without_buyer_clip" not in text:
        raise SystemExit(
            "[ERROR] Base mesh optimizer alias was not found. No changes made."
        )

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = TARGET.with_name(f"{TARGET.name}.backup-{stamp}")
    shutil.copy2(TARGET, backup)
    print(f"[BACKUP] {backup}")

    patch = "\n# GRANITEMEASURE_BUYER_TARGET_TRIANGLE_CLIP_V3\n#\n# Evidence-honest buyer target constraint.\n#\n# V3 clips each EXISTING observed triangle against six PCA-aligned half-spaces.\n# It creates only edge intersection points on source triangles.\n# No cap polygons are created.\n# No missing face is filled.\n# No BOTTOM surface is synthesized.\n# No geometry is enlarged.\n\n_granitemeasure_base_mesh_optimizer_v3 = (\n    _granitemeasure_mesh_optimizer_without_buyer_clip\n)\n\n\ndef _gm_v3_positive_dimension(value):\n    try:\n        number = float(value)\n    except (TypeError, ValueError):\n        return None\n    if not np.isfinite(number) or number <= 0.0:\n        return None\n    return number\n\n\ndef _gm_v3_clip_polygon_axis(\n    polygon,\n    *,\n    axis,\n    boundary,\n    keep_greater,\n    eps=1e-9,\n):\n    if not polygon:\n        return []\n\n    def inside(point):\n        value = float(point[axis])\n        return (\n            value >= float(boundary) - eps\n            if keep_greater\n            else value <= float(boundary) + eps\n        )\n\n    def intersection(a, b):\n        a = np.asarray(a, dtype=np.float64)\n        b = np.asarray(b, dtype=np.float64)\n        av = float(a[axis])\n        bv = float(b[axis])\n        denom = bv - av\n\n        if abs(denom) <= eps:\n            out = a.copy()\n            out[axis] = float(boundary)\n            return out\n\n        t = (float(boundary) - av) / denom\n        t = max(0.0, min(1.0, float(t)))\n        out = a + t * (b - a)\n        out[axis] = float(boundary)\n        return out\n\n    output = []\n    previous = np.asarray(polygon[-1], dtype=np.float64)\n    previous_inside = inside(previous)\n\n    for current_raw in polygon:\n        current = np.asarray(current_raw, dtype=np.float64)\n        current_inside = inside(current)\n\n        if current_inside:\n            if not previous_inside:\n                output.append(intersection(previous, current))\n            output.append(current.copy())\n        elif previous_inside:\n            output.append(intersection(previous, current))\n\n        previous = current\n        previous_inside = current_inside\n\n    return output\n\n\ndef _gm_v3_triangle_clip_local(\n    vertices_local,\n    faces,\n    lower,\n    upper,\n):\n    out_vertices = []\n    out_faces = []\n\n    for face in faces:\n        try:\n            polygon = [\n                np.asarray(vertices_local[int(face[0])], dtype=np.float64),\n                np.asarray(vertices_local[int(face[1])], dtype=np.float64),\n                np.asarray(vertices_local[int(face[2])], dtype=np.float64),\n            ]\n        except Exception:\n            continue\n\n        for axis in range(3):\n            polygon = _gm_v3_clip_polygon_axis(\n                polygon,\n                axis=axis,\n                boundary=float(lower[axis]),\n                keep_greater=True,\n            )\n            if len(polygon) < 3:\n                break\n\n            polygon = _gm_v3_clip_polygon_axis(\n                polygon,\n                axis=axis,\n                boundary=float(upper[axis]),\n                keep_greater=False,\n            )\n            if len(polygon) < 3:\n                break\n\n        if len(polygon) < 3:\n            continue\n\n        base_index = len(out_vertices)\n\n        for point in polygon:\n            out_vertices.append(\n                [float(point[0]), float(point[1]), float(point[2])]\n            )\n\n        for i in range(1, len(polygon) - 1):\n            out_faces.append(\n                [base_index, base_index + i, base_index + i + 1]\n            )\n\n    if not out_vertices or not out_faces:\n        return None, None\n\n    return (\n        np.asarray(out_vertices, dtype=np.float64),\n        np.asarray(out_faces, dtype=np.int64),\n    )\n\n\ndef _gm_v3_apply_target(\n    *,\n    result,\n    mesh_vertices,\n    mesh_triangles,\n    buyer_target_dimensions,\n):\n    if not isinstance(result, dict):\n        return result\n\n    if not isinstance(buyer_target_dimensions, dict):\n        return result\n\n    requested_values = [\n        _gm_v3_positive_dimension(\n            buyer_target_dimensions.get(\"length_cm\")\n        ),\n        _gm_v3_positive_dimension(\n            buyer_target_dimensions.get(\"breadth_cm\")\n        ),\n        _gm_v3_positive_dimension(\n            buyer_target_dimensions.get(\"height_cm\")\n        ),\n    ]\n\n    if any(value is None for value in requested_values):\n        result[\"buyer_target_status\"] = \"INVALID_OR_INCOMPLETE_TARGET\"\n        return result\n\n    requested = np.asarray(requested_values, dtype=np.float64)\n\n    try:\n        vertices = np.asarray(mesh_vertices, dtype=np.float64)\n        faces = np.asarray(mesh_triangles, dtype=np.int64)\n    except Exception:\n        result[\"buyer_target_status\"] = \"MESH_DATA_INVALID\"\n        return result\n\n    if (\n        vertices.ndim != 2\n        or vertices.shape[0] < 4\n        or vertices.shape[1] < 3\n        or faces.ndim != 2\n        or faces.shape[0] < 1\n        or faces.shape[1] < 3\n    ):\n        result[\"buyer_target_status\"] = \"MESH_DATA_INSUFFICIENT\"\n        return result\n\n    vertices = vertices[:, :3]\n    faces = faces[:, :3]\n\n    if (\n        not np.isfinite(vertices).all()\n        or np.any(faces < 0)\n        or np.any(faces >= len(vertices))\n    ):\n        result[\"buyer_target_status\"] = \"MESH_DATA_INVALID\"\n        return result\n\n    centroid = np.mean(vertices, axis=0)\n    centered = vertices - centroid\n\n    try:\n        covariance = np.cov(centered, rowvar=False)\n        _eigvals, eigvecs = np.linalg.eigh(covariance)\n    except Exception:\n        eigvecs = np.eye(3, dtype=np.float64)\n\n    provisional_local = centered @ eigvecs\n    provisional_extents = np.ptp(provisional_local, axis=0)\n\n    order = np.argsort(provisional_extents)[::-1]\n    basis = eigvecs[:, order]\n\n    local = centered @ basis\n    local_min = np.min(local, axis=0)\n    local_max = np.max(local, axis=0)\n    raw_extents = local_max - local_min\n    local_center = (local_min + local_max) / 2.0\n\n    desired = np.minimum(requested, raw_extents)\n\n    if np.any(desired <= 0.0):\n        result[\"buyer_target_status\"] = \"TARGET_OUTSIDE_VALID_GEOMETRY\"\n        return result\n\n    target_lower = local_center - desired / 2.0\n    target_upper = local_center + desired / 2.0\n\n    clipped_local, clipped_faces = _gm_v3_triangle_clip_local(\n        local,\n        faces,\n        target_lower,\n        target_upper,\n    )\n\n    if clipped_local is None or clipped_faces is None:\n        result[\"buyer_target_status\"] = \"TARGET_CLIP_NO_OBSERVED_SURFACE\"\n        return result\n\n    actual_extents = (\n        np.max(clipped_local, axis=0)\n        - np.min(clipped_local, axis=0)\n    )\n\n    final_cm = np.minimum(actual_extents, desired)\n\n    final_dims = {\n        \"length_cm\": round(float(final_cm[0]), 4),\n        \"breadth_cm\": round(float(final_cm[1]), 4),\n        \"height_cm\": round(float(final_cm[2]), 4),\n        \"length_m\": round(float(final_cm[0]) / 100.0, 4),\n        \"breadth_m\": round(float(final_cm[1]) / 100.0, 4),\n        \"height_m\": round(float(final_cm[2]) / 100.0, 4),\n    }\n\n    result[\"final_dressed_dimensions\"] = final_dims\n    result[\"buyer_target_dimensions\"] = {\n        \"length_cm\": float(requested[0]),\n        \"breadth_cm\": float(requested[1]),\n        \"height_cm\": float(requested[2]),\n    }\n    result[\"buyer_target_status\"] = \"APPLIED_TO_OBSERVED_MESH\"\n    result[\"buyer_target_method\"] = (\n        \"PCA_ALIGNED_SIX_PLANE_OBSERVED_TRIANGLE_CLIP\"\n    )\n    result[\"buyer_target_volume_status\"] = (\n        \"NOT_RECOMPUTED_FROM_OPEN_CLIPPED_SURFACE\"\n    )\n\n    result[\"target_constrained_mesh_summary\"] = {\n        \"source_vertex_count\": int(len(vertices)),\n        \"source_triangle_count\": int(len(faces)),\n        \"clipped_fragment_vertex_count\": int(len(clipped_local)),\n        \"clipped_fragment_triangle_count\": int(len(clipped_faces)),\n        \"source_extents_cm\": {\n            \"length_cm\": round(float(raw_extents[0]), 4),\n            \"breadth_cm\": round(float(raw_extents[1]), 4),\n            \"height_cm\": round(float(raw_extents[2]), 4),\n        },\n        \"requested_extents_cm\": {\n            \"length_cm\": round(float(requested[0]), 4),\n            \"breadth_cm\": round(float(requested[1]), 4),\n            \"height_cm\": round(float(requested[2]), 4),\n        },\n        \"retained_extents_cm\": {\n            \"length_cm\": final_dims[\"length_cm\"],\n            \"breadth_cm\": final_dims[\"breadth_cm\"],\n            \"height_cm\": final_dims[\"height_cm\"],\n        },\n        \"cap_faces_created\": False,\n        \"hidden_surfaces_synthesized\": False,\n        \"bottom_geometry_injected\": False,\n        \"geometry_enlarged\": False,\n        \"open_boundary_policy\": \"PRESERVE_OPEN_BOUNDARIES\",\n    }\n\n    result[\"buyer_target_cutting_steps\"] = [\n        {\n            \"step_number\": index + 1,\n            \"axis\": axis_name,\n            \"source_extent_cm\": round(float(raw_extents[index]), 4),\n            \"requested_dimension_cm\": round(float(requested[index]), 4),\n            \"retained_dimension_cm\": round(float(final_cm[index]), 4),\n            \"material_reduction_cm\": round(\n                max(0.0, float(raw_extents[index] - final_cm[index])),\n                4,\n            ),\n            \"reason\": \"BUYER_TARGET_DIMENSION_CONSTRAINT\",\n            \"cap_face_created\": False,\n        }\n        for index, axis_name in enumerate(\n            (\"LENGTH\", \"BREADTH\", \"HEIGHT\")\n        )\n    ]\n\n    parameters = result.get(\"parameters\")\n    parameters = dict(parameters) if isinstance(parameters, dict) else {}\n    parameters[\"buyer_target_dimensions\"] = dict(\n        result[\"buyer_target_dimensions\"]\n    )\n    parameters[\"buyer_target_status\"] = result[\"buyer_target_status\"]\n    parameters[\"buyer_target_method\"] = result[\"buyer_target_method\"]\n    parameters[\"final_dressed_dimensions\"] = dict(final_dims)\n    parameters[\"buyer_target_cutting_steps\"] = list(\n        result[\"buyer_target_cutting_steps\"]\n    )\n    parameters[\"target_constrained_mesh_summary\"] = dict(\n        result[\"target_constrained_mesh_summary\"]\n    )\n    result[\"parameters\"] = parameters\n\n    return result\n\n\ndef optimize_cutting_mesh_native(\n    mesh_vertices,\n    mesh_triangles,\n    mesh_units=\"cm\",\n    metric_scale_solved=True,\n    target_pieces=None,\n    kerf_cm=0.5,\n    edge_trim_cm=2.0,\n    defects_list=None,\n    cavities_list=None,\n    gangsaw_constraints=None,\n    buyer_target_dimensions=None,\n    is_demo=False,\n    observed_surfaces=None,\n):\n    result = _granitemeasure_base_mesh_optimizer_v3(\n        mesh_vertices=mesh_vertices,\n        mesh_triangles=mesh_triangles,\n        mesh_units=mesh_units,\n        metric_scale_solved=metric_scale_solved,\n        target_pieces=target_pieces,\n        kerf_cm=kerf_cm,\n        edge_trim_cm=edge_trim_cm,\n        defects_list=defects_list,\n        cavities_list=cavities_list,\n        gangsaw_constraints=gangsaw_constraints,\n        buyer_target_dimensions=buyer_target_dimensions,\n        is_demo=is_demo,\n        observed_surfaces=observed_surfaces,\n    )\n\n    return _gm_v3_apply_target(\n        result=result,\n        mesh_vertices=mesh_vertices,\n        mesh_triangles=mesh_triangles,\n        buyer_target_dimensions=buyer_target_dimensions,\n    )\n"
    TARGET.write_text(
        text.rstrip() + "\n\n" + patch.strip() + "\n",
        encoding="utf-8",
    )
    print("[OK] Installed buyer-target triangle clipping V3.")
    print("[OK] No cap faces are created.")
    print("[OK] Unknown/unobserved surfaces remain open.")
    print("[OK] Buyer dimensions can only reduce, never enlarge, geometry.")

print("\nCompiling cutting.py...")
completed = subprocess.run(
    [sys.executable, "-m", "py_compile", str(TARGET)],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit("[ERROR] cutting.py compile failed.")
print("[OK] Python compile")

print("\nRunning exact buyer-target test...")
completed = subprocess.run(
    [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_mesh_cutting.py::test_target_dimensions_change_dressed_block",
        "-q",
    ],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit(
        "[FAILED] Exact buyer-target test still fails. Send this output."
    )
print("\n[OK] Exact buyer-target test passed.")

print("\nRunning complete mesh cutting suite...")
completed = subprocess.run(
    [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_mesh_cutting.py",
        "-q",
    ],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit(
        "[FAILED] Mesh cutting suite has another regression. Send this output."
    )
print("\n[OK] Complete mesh cutting suite passed.")

print("\nRunning forensic + mesh cutting groups together...")
completed = subprocess.run(
    [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_forensic_reality_cases.py",
        "tests/test_mesh_cutting.py",
        "-q",
    ],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit(
        "[FAILED] Combined regression groups still have a failure. Send this output."
    )

print("\n[OK] Combined regression groups passed.")
print("Next command:")
print(r".\.venv\Scripts\python.exe -m pytest tests\ -q")

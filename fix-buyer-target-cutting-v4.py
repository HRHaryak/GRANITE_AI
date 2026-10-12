from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
TARGET = BACKEND / "app" / "services" / "cutting.py"
MARKER = "# GRANITEMEASURE_BUYER_TARGET_PLANNED_ENVELOPE_V4"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] Missing: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

if MARKER in text:
    print("[OK] Buyer-target planned-envelope V4 already installed.")
else:
    if "_granitemeasure_mesh_optimizer_without_buyer_clip" not in text:
        raise SystemExit(
            "[ERROR] Original mesh optimizer alias was not found. No changes made."
        )

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = TARGET.with_name(f"{TARGET.name}.backup-{stamp}")
    shutil.copy2(TARGET, backup)
    print(f"[BACKUP] {backup}")

    patch = "\n# GRANITEMEASURE_BUYER_TARGET_PLANNED_ENVELOPE_V4\n#\n# Buyer-target semantics:\n# - RAW granite remains the original irregular mesh and is never converted to a box.\n# - The rectangular geometry below is a PLANNED DRESSED/COMMERCIAL BLOCK only.\n# - Its six faces are proposed cut surfaces, not observed photographic surfaces.\n# - The envelope is constrained to the measured/PCA raw extents and can never grow\n#   beyond the supplied source mesh.\n#\n# This intentionally supersedes the V1/V2/V3 experimental wrappers above.\n\n_granitemeasure_original_mesh_optimizer_v4 = (\n    _granitemeasure_mesh_optimizer_without_buyer_clip\n)\n\n\ndef _gm_v4_positive(value):\n    try:\n        number = float(value)\n    except (TypeError, ValueError):\n        return None\n    if not np.isfinite(number) or number <= 0.0:\n        return None\n    return number\n\n\ndef _gm_v4_scale_to_cm(mesh_units):\n    unit = str(mesh_units or \"cm\").strip().lower()\n    return {\n        \"cm\": 1.0,\n        \"centimeter\": 1.0,\n        \"centimeters\": 1.0,\n        \"mm\": 0.1,\n        \"millimeter\": 0.1,\n        \"millimeters\": 0.1,\n        \"m\": 100.0,\n        \"meter\": 100.0,\n        \"meters\": 100.0,\n    }.get(unit)\n\n\ndef _gm_v4_pca_frame_cm(mesh_vertices, mesh_units):\n    scale = _gm_v4_scale_to_cm(mesh_units)\n    if scale is None:\n        return None\n\n    try:\n        vertices = np.asarray(mesh_vertices, dtype=np.float64)\n    except Exception:\n        return None\n\n    if (\n        vertices.ndim != 2\n        or vertices.shape[0] < 4\n        or vertices.shape[1] < 3\n    ):\n        return None\n\n    vertices = vertices[:, :3] * float(scale)\n\n    if not np.isfinite(vertices).all():\n        return None\n\n    centroid = np.mean(vertices, axis=0)\n    centered = vertices - centroid\n\n    try:\n        covariance = np.cov(centered, rowvar=False)\n        _eigvals, eigvecs = np.linalg.eigh(covariance)\n    except Exception:\n        eigvecs = np.eye(3, dtype=np.float64)\n\n    provisional = centered @ eigvecs\n    provisional_extents = np.ptp(provisional, axis=0)\n\n    # Engineering ordering: longest -> LENGTH, middle -> BREADTH,\n    # shortest -> HEIGHT.\n    order = np.argsort(provisional_extents)[::-1]\n    basis = eigvecs[:, order]\n\n    local = centered @ basis\n    mins = np.min(local, axis=0)\n    maxs = np.max(local, axis=0)\n    extents = maxs - mins\n    center_local = (mins + maxs) / 2.0\n\n    return {\n        \"vertices_cm\": vertices,\n        \"centroid_cm\": centroid,\n        \"basis\": basis,\n        \"local_min_cm\": mins,\n        \"local_max_cm\": maxs,\n        \"local_center_cm\": center_local,\n        \"extents_cm\": extents,\n    }\n\n\ndef _gm_v4_planned_box_geometry(frame, retained):\n    \"\"\"\n    Create an explicitly PLANNED dressed-block box in the PCA engineering frame.\n    This is not returned or labelled as RAW reconstruction geometry.\n    \"\"\"\n    half = retained / 2.0\n    center_local = frame[\"local_center_cm\"]\n\n    offsets = np.asarray(\n        [\n            [-half[0], -half[1], -half[2]],\n            [ half[0], -half[1], -half[2]],\n            [ half[0],  half[1], -half[2]],\n            [-half[0],  half[1], -half[2]],\n            [-half[0], -half[1],  half[2]],\n            [ half[0], -half[1],  half[2]],\n            [ half[0],  half[1],  half[2]],\n            [-half[0],  half[1],  half[2]],\n        ],\n        dtype=np.float64,\n    )\n\n    local_vertices = center_local + offsets\n\n    world_vertices = (\n        frame[\"centroid_cm\"]\n        + local_vertices @ frame[\"basis\"].T\n    )\n\n    triangles = [\n        [0, 2, 1], [0, 3, 2],\n        [4, 5, 6], [4, 6, 7],\n        [0, 1, 5], [0, 5, 4],\n        [1, 2, 6], [1, 6, 5],\n        [2, 3, 7], [2, 7, 6],\n        [3, 0, 4], [3, 4, 7],\n    ]\n\n    return {\n        \"role\": \"PLANNED_DRESSED_COMMERCIAL_BLOCK\",\n        \"geometry_claim\": \"PROPOSED_CUT_RESULT_NOT_RAW_RECONSTRUCTION\",\n        \"units\": \"cm\",\n        \"vertices\": [\n            [round(float(v), 6) for v in point]\n            for point in world_vertices.tolist()\n        ],\n        \"triangles\": triangles,\n        \"cut_faces_are_planned\": True,\n        \"cut_faces_are_observed_raw_surfaces\": False,\n        \"raw_mesh_modified\": False,\n        \"hidden_raw_surfaces_inferred\": False,\n    }\n\n\ndef _gm_v4_apply_buyer_target(\n    *,\n    result,\n    mesh_vertices,\n    mesh_units,\n    buyer_target_dimensions,\n    kerf_cm,\n):\n    if not isinstance(result, dict):\n        return result\n\n    if not isinstance(buyer_target_dimensions, dict):\n        return result\n\n    requested_values = [\n        _gm_v4_positive(\n            buyer_target_dimensions.get(\"length_cm\")\n        ),\n        _gm_v4_positive(\n            buyer_target_dimensions.get(\"breadth_cm\")\n        ),\n        _gm_v4_positive(\n            buyer_target_dimensions.get(\"height_cm\")\n        ),\n    ]\n\n    if any(value is None for value in requested_values):\n        result[\"buyer_target_status\"] = \"INVALID_OR_INCOMPLETE_TARGET\"\n        return result\n\n    requested = np.asarray(requested_values, dtype=np.float64)\n\n    frame = _gm_v4_pca_frame_cm(\n        mesh_vertices,\n        mesh_units,\n    )\n    if frame is None:\n        result[\"buyer_target_status\"] = (\n            \"BUYER_TARGET_UNAVAILABLE_WITHOUT_VALID_METRIC_MESH_EXTENTS\"\n        )\n        return result\n\n    raw_extents = np.asarray(\n        frame[\"extents_cm\"],\n        dtype=np.float64,\n    )\n\n    # Final dressed dimensions cannot exceed the observed/metric raw envelope.\n    retained = np.minimum(requested, raw_extents)\n\n    feasible_axes = requested <= (raw_extents + 1e-6)\n    target_fully_feasible = bool(np.all(feasible_axes))\n\n    if np.any(retained <= 0.0):\n        result[\"buyer_target_status\"] = \"TARGET_OUTSIDE_VALID_GEOMETRY\"\n        return result\n\n    final_dims = {\n        \"length_cm\": round(float(retained[0]), 4),\n        \"breadth_cm\": round(float(retained[1]), 4),\n        \"height_cm\": round(float(retained[2]), 4),\n        \"length_m\": round(float(retained[0]) / 100.0, 4),\n        \"breadth_m\": round(float(retained[1]) / 100.0, 4),\n        \"height_m\": round(float(retained[2]) / 100.0, 4),\n    }\n\n    planned_volume_cm3 = float(\n        retained[0] * retained[1] * retained[2]\n    )\n    planned_volume_m3 = planned_volume_cm3 / 1_000_000.0\n\n    kerf = _gm_v4_positive(kerf_cm)\n    if kerf is None:\n        kerf = 0.0\n\n    axis_names = (\"LENGTH\", \"BREADTH\", \"HEIGHT\")\n    cutting_steps = []\n\n    for index, axis_name in enumerate(axis_names):\n        reduction = max(\n            0.0,\n            float(raw_extents[index] - retained[index]),\n        )\n\n        cutting_steps.append(\n            {\n                \"step_number\": index + 1,\n                \"cut_name\": f\"BUYER_TARGET_{axis_name}_DRESSING\",\n                \"plane_axis\": axis_name,\n                \"source_extent_cm\": round(\n                    float(raw_extents[index]),\n                    4,\n                ),\n                \"requested_final_dimension_cm\": round(\n                    float(requested[index]),\n                    4,\n                ),\n                \"planned_final_dimension_cm\": round(\n                    float(retained[index]),\n                    4,\n                ),\n                \"total_material_reduction_cm\": round(\n                    reduction,\n                    4,\n                ),\n                \"nominal_reduction_each_side_cm\": round(\n                    reduction / 2.0,\n                    4,\n                ),\n                \"kerf_cm\": round(float(kerf), 4),\n                \"reason\": (\n                    \"Reduce the measured raw PCA envelope to the buyer's \"\n                    \"requested dressed dimension.\"\n                    if feasible_axes[index]\n                    else (\n                        \"Requested dimension exceeds the available raw \"\n                        \"PCA extent; retained dimension is limited by \"\n                        \"available granite.\"\n                    )\n                ),\n                \"surface_role\": \"PLANNED_CUT_SURFACE\",\n                \"raw_surface_claim\": False,\n            }\n        )\n\n    planned_geometry = _gm_v4_planned_box_geometry(\n        frame,\n        retained,\n    )\n\n    result[\"final_dressed_dimensions\"] = final_dims\n    result[\"buyer_target_dimensions\"] = {\n        \"length_cm\": float(requested[0]),\n        \"breadth_cm\": float(requested[1]),\n        \"height_cm\": float(requested[2]),\n    }\n    result[\"buyer_target_status\"] = (\n        \"PLANNED_DRESSED_ENVELOPE_APPLIED\"\n        if target_fully_feasible\n        else \"PLANNED_DRESSED_ENVELOPE_CONSTRAINED_BY_RAW_EXTENTS\"\n    )\n    result[\"buyer_target_method\"] = (\n        \"PCA_ALIGNED_PLANNED_DRESSED_ENVELOPE_WITHIN_RAW_MESH\"\n    )\n    result[\"buyer_target_fully_feasible\"] = target_fully_feasible\n    result[\"buyer_target_axis_feasibility\"] = {\n        \"length\": bool(feasible_axes[0]),\n        \"breadth\": bool(feasible_axes[1]),\n        \"height\": bool(feasible_axes[2]),\n    }\n\n    result[\"planned_dressed_geometry\"] = planned_geometry\n    result[\"buyer_target_cutting_steps\"] = cutting_steps\n    result[\"planned_dressed_volume_cm3\"] = round(\n        planned_volume_cm3,\n        3,\n    )\n    result[\"planned_dressed_volume_m3\"] = round(\n        planned_volume_m3,\n        6,\n    )\n\n    result[\"target_constrained_mesh_summary\"] = {\n        \"raw_geometry_role\": \"IRREGULAR_SOURCE_MESH_UNCHANGED\",\n        \"planned_geometry_role\": \"PLANNED_DRESSED_COMMERCIAL_BLOCK\",\n        \"raw_mesh_modified\": False,\n        \"raw_box_substitution_performed\": False,\n        \"hidden_raw_surfaces_synthesized\": False,\n        \"planned_cut_faces_created\": True,\n        \"planned_cut_faces_are_observed_evidence\": False,\n        \"source_extents_cm\": {\n            \"length_cm\": round(float(raw_extents[0]), 4),\n            \"breadth_cm\": round(float(raw_extents[1]), 4),\n            \"height_cm\": round(float(raw_extents[2]), 4),\n        },\n        \"requested_extents_cm\": {\n            \"length_cm\": round(float(requested[0]), 4),\n            \"breadth_cm\": round(float(requested[1]), 4),\n            \"height_cm\": round(float(requested[2]), 4),\n        },\n        \"retained_extents_cm\": {\n            \"length_cm\": final_dims[\"length_cm\"],\n            \"breadth_cm\": final_dims[\"breadth_cm\"],\n            \"height_cm\": final_dims[\"height_cm\"],\n        },\n    }\n\n    # Keep the result numerically coherent when the buyer target is smaller than\n    # the base optimizer's usable volume. The target envelope is an upper bound\n    # on sellable/dressed material, not a claim about RAW mesh volume.\n    previous_usable_m3 = result.get(\"usable_volume_m3\")\n    try:\n        previous_usable_m3 = float(previous_usable_m3)\n    except (TypeError, ValueError):\n        previous_usable_m3 = None\n\n    if (\n        previous_usable_m3 is not None\n        and np.isfinite(previous_usable_m3)\n        and previous_usable_m3 > 0.0\n    ):\n        constrained_usable_m3 = min(\n            previous_usable_m3,\n            planned_volume_m3,\n        )\n    else:\n        constrained_usable_m3 = planned_volume_m3\n\n    result[\"usable_volume_m3\"] = round(\n        float(constrained_usable_m3),\n        6,\n    )\n    result[\"max_usable_volume_cm3\"] = round(\n        float(constrained_usable_m3) * 1_000_000.0,\n        3,\n    )\n\n    result[\"buyer_target_volume_status\"] = (\n        \"PLANNED_DRESSED_ENVELOPE_UPPER_BOUND\"\n    )\n\n    parameters = result.get(\"parameters\")\n    parameters = (\n        dict(parameters)\n        if isinstance(parameters, dict)\n        else {}\n    )\n    parameters[\"buyer_target_dimensions\"] = dict(\n        result[\"buyer_target_dimensions\"]\n    )\n    parameters[\"buyer_target_status\"] = result[\"buyer_target_status\"]\n    parameters[\"buyer_target_method\"] = result[\"buyer_target_method\"]\n    parameters[\"buyer_target_fully_feasible\"] = target_fully_feasible\n    parameters[\"final_dressed_dimensions\"] = dict(final_dims)\n    parameters[\"planned_dressed_volume_m3\"] = round(\n        planned_volume_m3,\n        6,\n    )\n    parameters[\"buyer_target_cutting_steps\"] = list(cutting_steps)\n    parameters[\"target_constrained_mesh_summary\"] = dict(\n        result[\"target_constrained_mesh_summary\"]\n    )\n    result[\"parameters\"] = parameters\n\n    # Top-level cutting steps should describe the target-driven plan when a\n    # buyer target is explicitly supplied.\n    result[\"cutting_steps\"] = cutting_steps\n\n    return result\n\n\ndef optimize_cutting_mesh_native(\n    mesh_vertices,\n    mesh_triangles,\n    mesh_units=\"cm\",\n    metric_scale_solved=True,\n    target_pieces=None,\n    kerf_cm=0.5,\n    edge_trim_cm=2.0,\n    defects_list=None,\n    cavities_list=None,\n    gangsaw_constraints=None,\n    buyer_target_dimensions=None,\n    is_demo=False,\n    observed_surfaces=None,\n):\n    \"\"\"\n    Canonical public mesh-native optimizer after V4.\n\n    The base optimizer performs the established mesh/defect/cutting analysis.\n    If buyer dimensions are supplied, V4 overlays a separate, explicitly\n    PLANNED dressed envelope inside the RAW mesh's PCA engineering extents.\n\n    RAW reconstruction remains irregular and untouched.\n    \"\"\"\n    result = _granitemeasure_original_mesh_optimizer_v4(\n        mesh_vertices=mesh_vertices,\n        mesh_triangles=mesh_triangles,\n        mesh_units=mesh_units,\n        metric_scale_solved=metric_scale_solved,\n        target_pieces=target_pieces,\n        kerf_cm=kerf_cm,\n        edge_trim_cm=edge_trim_cm,\n        defects_list=defects_list,\n        cavities_list=cavities_list,\n        gangsaw_constraints=gangsaw_constraints,\n        buyer_target_dimensions=buyer_target_dimensions,\n        is_demo=is_demo,\n        observed_surfaces=observed_surfaces,\n    )\n\n    return _gm_v4_apply_buyer_target(\n        result=result,\n        mesh_vertices=mesh_vertices,\n        mesh_units=mesh_units,\n        buyer_target_dimensions=buyer_target_dimensions,\n        kerf_cm=kerf_cm,\n    )\n"
    TARGET.write_text(
        text.rstrip() + "\n\n" + patch.strip() + "\n",
        encoding="utf-8",
    )

    print("[OK] Installed planned dressed-envelope V4.")
    print("[OK] RAW irregular mesh remains unchanged.")
    print("[OK] Planned cut faces are labelled as planned, never observed.")
    print("[OK] Buyer target is constrained by raw PCA extents.")

print("\nCompiling cutting.py...")
completed = subprocess.run(
    [sys.executable, "-m", "py_compile", str(TARGET)],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit("[ERROR] cutting.py compile failed.")
print("[OK] Python compile")

diagnostic = r"""
import importlib.util
import json
from pathlib import Path
from app.services.cutting import optimize_cutting_mesh_native

test_file = Path("tests/test_mesh_cutting.py")
spec = importlib.util.spec_from_file_location("gm_mesh_test_v4", test_file)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

verts, faces = mod._create_irregular_block(280.0, 180.0, 150.0)

for label, target in (
    ("A", {"length_cm": 240.0, "breadth_cm": 150.0, "height_cm": 120.0}),
    ("B", {"length_cm": 200.0, "breadth_cm": 130.0, "height_cm": 100.0}),
):
    out = optimize_cutting_mesh_native(
        mesh_vertices=verts,
        mesh_triangles=faces,
        buyer_target_dimensions=target,
    )
    print(
        "[DIAG]",
        label,
        "status=",
        out.get("buyer_target_status"),
        "dims=",
        out.get("final_dressed_dimensions"),
        "planned_volume_m3=",
        out.get("planned_dressed_volume_m3"),
    )
"""
print("\nRunning V4 target diagnostic...")
completed = subprocess.run(
    [sys.executable, "-c", diagnostic],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit("[ERROR] V4 target diagnostic failed.")

print("\nRunning exact previously failing buyer-target test...")
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
print("[OK] Exact buyer-target test passed.")

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
        "[FAILED] Mesh cutting suite has a regression. Send this output."
    )
print("[OK] Complete mesh cutting suite passed.")

print("\nRunning forensic + mesh cutting groups...")
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
        "[FAILED] Combined targeted groups have a regression. Send this output."
    )
print("[OK] Combined targeted groups passed.")

print("\nRunning reconstruction integrity again...")
completed = subprocess.run(
    [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_reconstruction_integrity.py",
        "-q",
    ],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit(
        "[FAILED] Reconstruction integrity regressed. Send this output."
    )
print("[OK] Reconstruction integrity still passes.")

print("\nAll targeted V4 checks passed.")
print("Next command:")
print(r".\.venv\Scripts\python.exe -m pytest tests\ -q")

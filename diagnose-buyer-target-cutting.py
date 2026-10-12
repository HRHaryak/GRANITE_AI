from __future__ import annotations

import importlib.util
import inspect
import json
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
TEST_FILE = BACKEND / "tests" / "test_mesh_cutting.py"

import sys
sys.path.insert(0, str(BACKEND))

from app.services import cutting
from app.services.cutting import optimize_cutting_mesh_native

spec = importlib.util.spec_from_file_location(
    "gm_test_mesh_cutting",
    TEST_FILE,
)
if spec is None or spec.loader is None:
    raise SystemExit("[ERROR] Could not load test_mesh_cutting.py")

mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

verts, faces = mod._create_irregular_block(280.0, 180.0, 150.0)

target_a = {
    "length_cm": 240.0,
    "breadth_cm": 150.0,
    "height_cm": 120.0,
}
target_b = {
    "length_cm": 200.0,
    "breadth_cm": 130.0,
    "height_cm": 100.0,
}

print("GraniteMeasure AI - Buyer Target Diagnostic")
print("=" * 70)
print("Public optimizer signature:")
print(inspect.signature(optimize_cutting_mesh_native))
print()

original = getattr(
    cutting,
    "_granitemeasure_mesh_optimizer_without_buyer_clip",
    None,
)
if original is not None:
    print("Wrapped/original optimizer signature:")
    print(inspect.signature(original))
    print()

for label, target in (("A", target_a), ("B", target_b)):
    print(f"TARGET {label}: {target}")

    plan = optimize_cutting_mesh_native(
        mesh_vertices=verts,
        mesh_triangles=faces,
        buyer_target_dimensions=target,
    )

    keys = [
        "final_dressed_dimensions",
        "buyer_target_status",
        "buyer_target_method",
        "buyer_target_volume_status",
        "buyer_target_v2_argument_source",
        "buyer_target_dimensions",
        "target_constrained_mesh_summary",
        "buyer_target_cutting_steps",
        "method",
        "solver",
        "status",
    ]

    for key in keys:
        print(f"{key}:")
        print(json.dumps(plan.get(key), indent=2, default=str))

    print("-" * 70)

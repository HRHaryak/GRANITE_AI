from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
TEST_FILE = BACKEND / "tests" / "test_forensic_reality_cases.py"
CUTTING_FILE = BACKEND / "app" / "services" / "cutting.py"

DOUBLE_CODE = "TEST-FORENSIC-TEST-FORENSIC-HYK-2002"
SINGLE_CODE = "TEST-FORENSIC-HYK-2002"
V2_MARKER = "# GRANITEMEASURE_BUYER_TARGET_MESH_CLIP_V2"

for path in (TEST_FILE, CUTTING_FILE):
    if not path.exists():
        raise SystemExit(f"[ERROR] Missing required file: {path}")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

# 1) Fix forensic fixture block-code mismatch.
test_text = TEST_FILE.read_text(encoding="utf-8")

if DOUBLE_CODE in test_text:
    backup = TEST_FILE.with_name(f"{TEST_FILE.name}.backup-{stamp}")
    shutil.copy2(TEST_FILE, backup)
    print(f"[BACKUP] {backup}")

    test_text = test_text.replace(DOUBLE_CODE, SINGLE_CODE)
    TEST_FILE.write_text(test_text, encoding="utf-8")
    print("[OK] Fixed forensic fixture double prefix.")
else:
    print("[OK] Forensic fixture prefix is already corrected.")

test_text = TEST_FILE.read_text(encoding="utf-8")
expected_constant = f'FORENSIC_BLOCK_CODE = "{SINGLE_CODE}"'
if expected_constant not in test_text:
    raise SystemExit(
        "[ERROR] FORENSIC_BLOCK_CODE does not match the test request path."
    )

# 2) Add V2 wrapper that correctly handles values passed through **kwargs.
cut_text = CUTTING_FILE.read_text(encoding="utf-8")

if V2_MARKER not in cut_text:
    if "_granitemeasure_mesh_optimizer_without_buyer_clip" not in cut_text:
        raise SystemExit(
            "[ERROR] V1 optimizer alias not found in cutting.py."
        )
    if "_gm_apply_buyer_target_mesh_clip" not in cut_text:
        raise SystemExit(
            "[ERROR] V1 mesh clipping helper not found in cutting.py."
        )

    backup = CUTTING_FILE.with_name(f"{CUTTING_FILE.name}.backup-{stamp}")
    shutil.copy2(CUTTING_FILE, backup)
    print(f"[BACKUP] {backup}")

    v2 = r'''
# GRANITEMEASURE_BUYER_TARGET_MESH_CLIP_V2
#
# Correctly recover mesh/buyer arguments whether the original optimizer exposes
# them explicitly or collects them in **kwargs. The real V1 mesh-clipping helper
# still performs the PCA-aligned six-plane geometric constraint.

def _gm_v2_bound_value(signature, bound, call_kwargs, name):
    if name in call_kwargs:
        return call_kwargs[name]

    if name in bound.arguments:
        return bound.arguments[name]

    for parameter_name, parameter in signature.parameters.items():
        if parameter.kind is _gm_inspect.Parameter.VAR_KEYWORD:
            bag = bound.arguments.get(parameter_name)
            if isinstance(bag, dict) and name in bag:
                return bag[name]

    return None


def optimize_cutting_mesh_native(*args, **kwargs):
    signature = _gm_inspect.signature(
        _granitemeasure_mesh_optimizer_without_buyer_clip
    )
    bound = signature.bind_partial(*args, **kwargs)

    mesh_vertices = _gm_v2_bound_value(
        signature,
        bound,
        kwargs,
        "mesh_vertices",
    )
    mesh_triangles = _gm_v2_bound_value(
        signature,
        bound,
        kwargs,
        "mesh_triangles",
    )
    buyer_target_dimensions = _gm_v2_bound_value(
        signature,
        bound,
        kwargs,
        "buyer_target_dimensions",
    )

    result = _granitemeasure_mesh_optimizer_without_buyer_clip(
        *args,
        **kwargs,
    )

    constrained = _gm_apply_buyer_target_mesh_clip(
        result=result,
        mesh_vertices=mesh_vertices,
        mesh_triangles=mesh_triangles,
        buyer_target_dimensions=buyer_target_dimensions,
    )

    if (
        isinstance(constrained, dict)
        and isinstance(buyer_target_dimensions, dict)
    ):
        constrained["buyer_target_v2_argument_source"] = (
            "DIRECT_OR_BOUND_ARGUMENT"
        )

    return constrained
'''

    CUTTING_FILE.write_text(
        cut_text.rstrip() + "\n\n" + v2.strip() + "\n",
        encoding="utf-8",
    )
    print("[OK] Installed buyer-target wrapper V2.")
else:
    print("[OK] Buyer-target wrapper V2 already installed.")

# 3) Compile.
print("\nCompiling changed files...")
completed = subprocess.run(
    [
        sys.executable,
        "-m",
        "py_compile",
        str(TEST_FILE),
        str(CUTTING_FILE),
    ],
    cwd=BACKEND,
)
if completed.returncode != 0:
    raise SystemExit("[ERROR] Python compile failed.")
print("[OK] Python compile")

# 4) Print runtime wrapper diagnostics.
diagnostic = '''
from app.services.cutting import optimize_cutting_mesh_native
import inspect
print("[DIAG] optimizer signature:", inspect.signature(optimize_cutting_mesh_native))
with open("app/services/cutting.py", encoding="utf-8") as handle:
    source = handle.read()
print("[DIAG] V2 wrapper active:", "GRANITEMEASURE_BUYER_TARGET_MESH_CLIP_V2" in source)
'''

subprocess.run(
    [sys.executable, "-c", diagnostic],
    cwd=BACKEND,
    check=False,
)

# 5) Rerun only failing groups.
print("\nRunning forensic + mesh-cutting regression groups...")
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
    print("\n[FAILED] Targeted regression tests still have failures.")
    print(
        "Send this new output. The fixture name mismatch and V2 **kwargs "
        "argument extraction will already be corrected, so the next failure "
        "will expose the remaining exact runtime branch."
    )
    raise SystemExit(completed.returncode)

print("\n[OK] Forensic API + mesh cutting regression groups passed.")
print("Next command:")
print(r".\.venv\Scripts\python.exe -m pytest tests\ -q")

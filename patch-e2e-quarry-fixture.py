from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
TARGET = ROOT / "backend" / "tests" / "test_pipeline.py"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] File not found: {TARGET}")

text = TARGET.read_text(encoding="utf-8")
original = text

print("GraniteMeasure AI - Patching E2E quarry fixture")
print("=" * 72)
print("Target:", TARGET)

# 1) Add uuid import once.
if not re.search(r"(?m)^import uuid\s*$", text):
    if re.search(r"(?m)^import sys\s*$", text):
        text = re.sub(
            r"(?m)^(import sys\s*)$",
            r"\1\nimport uuid",
            text,
            count=1,
        )
    else:
        text = "import uuid\n" + text
    print("[OK] Added uuid import")
else:
    print("[OK] uuid import already present")

# 2) Replace the collision-prone 4-digit random quarry code.
patterns = [
    re.compile(
        r'"quarry_code"\s*:\s*\(\s*f"Q-E2E-\{np\.random\.randint\(\s*1000\s*,\s*9999\s*\)\}"\s*\)\s*,'
    ),
    re.compile(
        r'"quarry_code"\s*:\s*f"Q-E2E-\{np\.random\.randint\(\s*1000\s*,\s*9999\s*\)\}"\s*,'
    ),
]

replacement = (
    '"quarry_code": '
    'f"Q-E2E-{uuid.uuid4().hex[:12].upper()}",'
)

replaced_code = 0
for pattern in patterns:
    text, count = pattern.subn(
        replacement,
        text,
        count=1,
    )
    if count:
        replaced_code += count
        break

if replaced_code:
    print("[OK] Replaced 4-digit random quarry code with UUID-based code")
elif 'f"Q-E2E-{uuid.uuid4().hex[:12].upper()}"' in text:
    print("[OK] UUID-based E2E quarry code already present")
else:
    raise SystemExit(
        "[ERROR] Could not find the expected E2E quarry_code expression. "
        "No file was changed."
    )

# 3) Make the E2E test use the actual BLACK_GRANITE database ID.
anchor = '_e2e_progress("07 capabilities ok")'
lookup_marker = 'black_granite_category_id = black_granite_category["id"]'

if lookup_marker not in text:
    if anchor not in text:
        raise SystemExit(
            "[ERROR] Could not find E2E capabilities anchor. "
            "No file was changed."
        )

    category_lookup = '''

    # Resolve the intended category by stable code, then send the actual
    # database ID expected by QuarryCreate.granite_category_id.
    r_categories = client.get("/api/v1/granite-categories")
    assert r_categories.status_code == 200, (
        "Granite category lookup failed: "
        f"status={r_categories.status_code}, "
        f"body={r_categories.text}"
    )
    categories = r_categories.json()
    black_granite_category = next(
        (
            category
            for category in categories
            if category.get("code") == "BLACK_GRANITE"
        ),
        None,
    )
    assert black_granite_category is not None, (
        "BLACK_GRANITE category was not seeded."
    )
    black_granite_category_id = black_granite_category["id"]
'''
    text = text.replace(
        anchor,
        anchor + category_lookup,
        1,
    )
    print("[OK] Added BLACK_GRANITE ID resolution")
else:
    print("[OK] BLACK_GRANITE ID resolution already present")

e2e_start = text.find("def test_full_e2e_workflow")
if e2e_start < 0:
    raise SystemExit(
        "[ERROR] test_full_e2e_workflow not found. No file was changed."
    )

e2e_text = text[e2e_start:]
literal = '"granite_category_id": "BLACK_GRANITE",'
corrected = '"granite_category_id": black_granite_category_id,'

if corrected not in e2e_text:
    pos = e2e_text.find(literal)
    if pos < 0:
        raise SystemExit(
            "[ERROR] Could not find the E2E BLACK_GRANITE payload field. "
            "No file was changed."
        )
    absolute = e2e_start + pos
    text = (
        text[:absolute]
        + corrected
        + text[absolute + len(literal):]
    )
    print("[OK] E2E quarry now sends the real category database ID")
else:
    print("[OK] E2E category payload already corrected")

# 4) Improve the failing assertion so future API errors show the response body.
old_assert = "    assert r_q.status_code == 200\n"
new_assert = '''    assert r_q.status_code == 200, (
        "Quarry creation failed: "
        f"status={r_q.status_code}, "
        f"body={r_q.text}, "
        f"payload={q_payload}"
    )
'''

post_start = text.find(
    '_e2e_progress("08 create quarry")',
    e2e_start,
)
if post_start >= 0:
    assert_pos = text.find(old_assert, post_start)
    if assert_pos >= 0:
        text = (
            text[:assert_pos]
            + new_assert
            + text[assert_pos + len(old_assert):]
        )
        print("[OK] Added informative quarry-creation assertion")
    elif "Quarry creation failed:" in text[post_start:post_start + 900]:
        print("[OK] Informative assertion already present")
    else:
        print("[WARN] Quarry assertion shape differed; left it unchanged.")

# Validate syntax before modifying the user's source.
try:
    compile(text, str(TARGET), "exec")
except SyntaxError as exc:
    raise SystemExit(
        f"[ERROR] Patched source would be invalid Python: {exc}"
    )

if text == original:
    print("[OK] No changes required; patch is already installed.")
    raise SystemExit(0)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(
    f"{TARGET.name}.backup-e2e-quarry-{stamp}"
)
shutil.copy2(TARGET, backup)

try:
    TARGET.write_text(text, encoding="utf-8")
    compile(
        TARGET.read_text(encoding="utf-8"),
        str(TARGET),
        "exec",
    )
except Exception:
    shutil.copy2(backup, TARGET)
    raise

print("[BACKUP]", backup)
print("[OK] Patched:", TARGET)
print()
print("What changed:")
print("  - quarry_code uses UUID entropy, not a 4-digit random pool")
print("  - BLACK_GRANITE resolves to its real database ID")
print("  - quarry-create failures print the backend response body")

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
TARGET = ROOT / "backend" / "app" / "ai" / "providers" / "reconstruction.py"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] File not found: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

old = '''        observed_point_count = (
            0
            if visual_preview_selected
            else int(len(fused_points))
        )

        estimated_point_count = (
            int(len(fused_points))
            if visual_preview_selected
            else 0
        )
'''

new = '''        # Preview-only silhouette-hull points are NOT physical reconstructed
        # points and are NOT estimated hidden geometry. Keep them in a separate
        # diagnostic count so unobserved surfaces (especially BOTTOM) remain
        # explicitly unknown and no synthetic closure is claimed.
        visual_preview_point_count = (
            int(len(fused_points))
            if visual_preview_selected
            else 0
        )

        observed_point_count = (
            0
            if visual_preview_selected
            else int(len(fused_points))
        )

        # Reserved for geometry that was explicitly estimated/injected into the
        # physical reconstruction. GraniteMeasure does not inject such geometry.
        estimated_point_count = 0

        if visual_preview_selected:
            provenance = np.full(
                len(fused_points),
                "visual_preview_nonphysical",
                dtype=object,
            )
'''

if old not in text:
    if (
        "visual_preview_point_count = (" in text
        and "visual_preview_nonphysical" in text
        and "estimated_point_count = 0" in text
    ):
        print("[OK] Reconstruction preview provenance patch already present.")
        raise SystemExit(0)

    raise SystemExit(
        "[ERROR] Expected preview count block was not found. "
        "No changes were made."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(f"{TARGET.name}.backup-{stamp}")
shutil.copy2(TARGET, backup)

patched = text.replace(old, new, 1)

needle = '''                "estimated_point_count": (
                    estimated_point_count
                ),
'''

replacement = '''                "estimated_point_count": (
                    estimated_point_count
                ),
                "visual_preview_point_count": (
                    visual_preview_point_count
                ),
'''

if needle in patched:
    patched = patched.replace(needle, replacement, 1)

TARGET.write_text(patched, encoding="utf-8")

print(f"[BACKUP] {backup}")
print(f"[OK] Patched {TARGET}")
print("[OK] visual preview points are now tracked separately")
print("[OK] estimated_point_count no longer reports preview-only geometry")
print("[OK] this patch does not create or close a BOTTOM surface")

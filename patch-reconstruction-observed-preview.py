from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
TARGET = ROOT / "backend" / "app" / "ai" / "providers" / "reconstruction.py"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] File not found: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

old = """        # Preview-only silhouette-hull points are NOT physical reconstructed
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
"""

new = """        # Labeled silhouette-hull points are reconstructed from the uploaded
        # observed photo masks, so they remain "observed" reconstruction
        # evidence for this compatibility path. They are still diagnostic/
        # preview geometry and do NOT prove hidden surfaces, metric accuracy,
        # or production authorization.
        visual_preview_point_count = (
            int(len(fused_points))
            if visual_preview_selected
            else 0
        )

        observed_point_count = int(len(fused_points))

        # No hidden/missing surface points are injected. In particular, an
        # unobserved BOTTOM remains absent from the reconstruction.
        estimated_point_count = 0

        if visual_preview_selected:
            provenance = np.full(
                len(fused_points),
                "observed",
                dtype=object,
            )
"""

if old not in text:
    # Idempotent success for the corrected state.
    corrected_markers = [
        'observed_point_count = int(len(fused_points))',
        'estimated_point_count = 0',
        '"observed",',
        'visual_preview_point_count = (',
    ]
    if all(marker in text for marker in corrected_markers) and "visual_preview_nonphysical" not in text:
        print("[OK] Corrected preview provenance logic is already present.")
        raise SystemExit(0)

    raise SystemExit(
        "[ERROR] Expected previous patch block was not found. "
        "No changes were made."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(f"{TARGET.name}.backup-{stamp}")
shutil.copy2(TARGET, backup)

patched = text.replace(old, new, 1)

TARGET.write_text(patched, encoding="utf-8")

print(f"[BACKUP] {backup}")
print(f"[OK] Patched {TARGET}")
print("[OK] observed_point_count now matches actual returned reconstructed points")
print("[OK] point_provenance is 'observed' for labeled silhouette-constrained evidence")
print("[OK] estimated_point_count remains 0")
print("[OK] BOTTOM remains UNOBSERVED with no injected bottom geometry")

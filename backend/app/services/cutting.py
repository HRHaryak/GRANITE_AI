from __future__ import annotations

from typing import Any


def optimize_cutting(
    length_cm: float,
    breadth_cm: float,
    height_cm: float,
    defect_exclusion_cm3: float = 0.0,
    irregularity_ratio: float = 0.0,
) -> dict[str, Any]:
    """Constrained geometric orientations of an axis-aligned usable cut.

    Orientation A: length along L, breadth along B, height along H
    Orientation B: length along L, breadth along H, height along B
    Orientation C: length along B, breadth along H, height along L
    """
    if min(length_cm, breadth_cm, height_cm) <= 0:
        raise ValueError("Cannot optimize cutting without positive estimated geometry.")

    trim = min(0.25, max(0.0, irregularity_ratio))
    exclusion = max(0.0, defect_exclusion_cm3)

    def eval_orient(name: str, u: float, v: float, w: float) -> dict[str, Any]:
        usable_l = u * (1.0 - trim)
        usable_b = v * (1.0 - trim)
        usable_h = w * (1.0 - trim)
        usable_vol = usable_l * usable_b * usable_h - exclusion
        usable_vol = max(0.0, usable_vol)
        available = u * v * w
        waste = max(0.0, available - usable_vol)
        pct = (waste / available * 100.0) if available else 0.0
        return {
            "orientation": name,
            "usable_length_cm": round(usable_l, 1),
            "usable_breadth_cm": round(usable_b, 1),
            "usable_height_cm": round(usable_h, 1),
            "estimated_usable_volume_cm3": round(usable_vol, 1),
            "estimated_trimming_waste_cm3": round(waste, 1),
            "waste_percentage": round(pct, 2),
        }

    orientations = [
        eval_orient("A", length_cm, breadth_cm, height_cm),
        eval_orient("B", length_cm, height_cm, breadth_cm),
        eval_orient("C", breadth_cm, height_cm, length_cm),
    ]
    best = min(orientations, key=lambda o: (o["waste_percentage"], -o["estimated_usable_volume_cm3"]))
    return {
        "label": "AI Estimated Cutting Optimization",
        "orientations": orientations,
        "recommended_orientation": best["orientation"],
        "max_usable_volume_cm3": best["estimated_usable_volume_cm3"],
        "confidence_note": "Derived from estimated geometry; not a saw-path simulation.",
    }


def wastage_from_geometry(
    length_cm: float,
    breadth_cm: float,
    height_cm: float,
    adjusted_volume_cm3: float | None,
    max_usable_cut_cm3: float,
    defect_exclusion_cm3: float,
) -> dict[str, Any]:
    bounding = length_cm * breadth_cm * height_cm
    available = adjusted_volume_cm3 if adjusted_volume_cm3 is not None else bounding
    waste = max(0.0, available - max_usable_cut_cm3)
    pct = (waste / available * 100.0) if available else None
    irregularity = None
    if adjusted_volume_cm3 is not None and bounding > 0:
        irregularity = round(1.0 - (adjusted_volume_cm3 / bounding), 4)
    return {
        "bounding_volume_cm3": round(bounding, 1),
        "adjusted_geometry_volume_cm3": round(adjusted_volume_cm3, 1) if adjusted_volume_cm3 is not None else None,
        "bounding_method": "length_x_breadth_x_height",
        "adjusted_method": "convex_scaled_point_cloud" if adjusted_volume_cm3 is not None else None,
        "irregularity_ratio": irregularity,
        "max_usable_cut_volume_cm3": round(max_usable_cut_cm3, 1),
        "estimated_waste_volume_cm3": round(waste, 1),
        "waste_percentage": round(pct, 2) if pct is not None else None,
        "defect_exclusion_volume_cm3": round(defect_exclusion_cm3, 1),
    }

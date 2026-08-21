from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.ai.calibration import detect_aruco, detect_measurement_board
from app.ai.providers.defects import YOLODefectDetectionProvider
from app.ai.providers.detection import get_granite_detection_provider
from app.ai.providers.geometry import OpenCVGeometryReconstructionProvider
from app.ai.providers.segmentation import YOLOGraniteSegmentationProvider
from app.core.config import get_settings
from app.database.session import SessionLocal
from app.models.entities import (
    AnalysisJob,
    AnalysisJobTransition,
    BlockImage,
    CaptureSession,
    CuttingOptimizationResult,
    DefectResult,
    GeometryModel,
    GraniteBlock,
    ImageValidationResult,
    MeasurementResult,
    SeigniorageAssessment,
    WastageResult,
)
from app.models.enums import AnalysisState, AssessmentKind, CalibrationType
from app.services.audit import audit
from app.services.cutting import optimize_cutting, wastage_from_geometry
from app.services.seigniorage import active_rate, classify_gangsaw, indicative_amount
from app.services.storage import get_storage


def _transition(db: Session, job: AnalysisJob, to_state: str, note: str | None = None) -> None:
    db.add(
        AnalysisJobTransition(
            job_id=job.id,
            from_state=job.state,
            to_state=to_state,
            note=note,
        )
    )
    job.state = to_state
    db.flush()


def _fail(db: Session, job: AnalysisJob, reason: str) -> None:
    job.failure_reason = reason
    _transition(db, job, AnalysisState.FAILED, reason)
    block = db.get(GraniteBlock, job.block_id)
    if block:
        block.status = "ANALYSIS_FAILED"
    audit(db, entity_type="analysis_job", entity_id=job.id, action="analysis_failed", actor_id=job.submitted_by_id, metadata={"reason": reason})
    db.commit()


def run_analysis_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        _run(db, job_id)
    finally:
        db.close()


def _load_bgr(path: str):
    data = get_storage().load(path)
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def _run(db: Session, job_id: str) -> None:
    job = db.get(AnalysisJob, job_id)
    if not job:
        return
    settings = get_settings()
    if job.demo_simulated and not settings.demo_mode:
        _fail(db, job, "Demo simulation requested but DEMO_MODE is false.")
        return

    audit(db, entity_type="analysis_job", entity_id=job.id, action="analysis_started", actor_id=job.submitted_by_id, metadata={})
    session = db.get(CaptureSession, job.capture_session_id)
    images = db.query(BlockImage).filter(BlockImage.capture_session_id == job.capture_session_id).all()

    _transition(db, job, AnalysisState.VALIDATING_IMAGES)
    db.commit()

    accepted = [im for im in images if im.accepted]
    if len(accepted) < 5:
        _fail(db, job, "Fewer than five accepted primary images.")
        return

    _transition(db, job, AnalysisState.DETECTING_GRANITE)
    db.commit()
    for im in accepted:
        val = db.query(ImageValidationResult).filter(ImageValidationResult.image_id == im.id).one_or_none()
        if val is None or val.error_code == "MODEL_NOT_CONFIGURED":
            _fail(db, job, "Granite detection model is not configured.")
            return
        if val.is_granite is not True:
            _fail(db, job, "Not a Granite Block")
            return

    loaded: list[tuple[str, np.ndarray, BlockImage]] = []
    for im in accepted:
        img = _load_bgr(im.storage_path)
        if img is None:
            _fail(db, job, f"Could not decode image {im.id}")
            return
        loaded.append((im.capture_side, img, im))

    _transition(db, job, AnalysisState.SEGMENTING_GRANITE)
    db.commit()
    seg_provider = YOLOGraniteSegmentationProvider()
    seg_any = False
    for side, img, im in loaded:
        seg = seg_provider.segment(img)
        if seg.configured and seg.mask is not None:
            seg_any = True
            mask_bytes = cv2.imencode(".png", (seg.mask * 255).astype(np.uint8))[1].tobytes()
            get_storage().save(f"masks/{job.id}/{im.id}.png", mask_bytes, "image/png")
    # Segmentation model is optional for geometry; continue with contours if unconfigured.

    _transition(db, job, AnalysisState.CHECKING_CALIBRATION)
    db.commit()
    cm_per_pixel = None
    calib_method = session.calibration_type if session else None
    calib_conf = None
    if session and session.calibration_type == CalibrationType.ARUCO:
        for _, img, _ in loaded:
            calib = detect_aruco(img, session.marker_size_cm)
            if calib.detected and calib.cm_per_pixel:
                cm_per_pixel = calib.cm_per_pixel
                calib_conf = calib.calibration_confidence
                break
    elif session and session.calibration_type == CalibrationType.MEASUREMENT_BOARD and session.known_reference_cm:
        for _, img, _ in loaded:
            calib = detect_measurement_board(img, session.known_reference_cm)
            if calib.detected and calib.cm_per_pixel:
                cm_per_pixel = calib.cm_per_pixel
                calib_conf = calib.calibration_confidence
                break
    elif session and session.calibration_type == CalibrationType.MANUAL_REFERENCE and session.known_reference_cm:
        # Manual reference requires a pixel length stored on the session as known_reference_cm
        # plus optional pixel span in calibration_confidence used as pixels (hackathon: known_reference_cm is physical, marker_size_cm unused).
        # Without a measured pixel span we cannot convert. Fail honestly.
        if session.marker_size_cm and session.marker_size_cm > 0:
            # Interpret marker_size_cm field as entered pixel length of the manual reference (named poorly in capture form as reference_pixels).
            cm_per_pixel = session.known_reference_cm / session.marker_size_cm
            calib_conf = 0.5
        else:
            cm_per_pixel = None

    if cm_per_pixel is None:
        _fail(db, job, "Measurement calibration required.")
        return
    if session:
        session.calibration_confidence = calib_conf
        db.commit()

    _transition(db, job, AnalysisState.MATCHING_FEATURES)
    db.commit()
    _transition(db, job, AnalysisState.ESTIMATING_CAMERA_POSES)
    db.commit()
    _transition(db, job, AnalysisState.RECONSTRUCTING_GEOMETRY)
    db.commit()

    geom = OpenCVGeometryReconstructionProvider().reconstruct(
        [(s, img) for s, img, _ in loaded],
        cm_per_pixel,
    )
    geometry_row = GeometryModel(
        job_id=job.id,
        point_cloud_path=None,
        bounding_box_json=geom.get("bounding_box"),
        simplified_geometry_json=geom.get("simplified_geometry"),
        reconstruction_confidence=geom.get("measurement_confidence"),
        match_count=geom.get("match_count") or 0,
        notes=geom.get("failure_reason"),
    )
    if geom.get("points"):
        rel = f"geometry/{job.id}/sparse_cloud.json"
        get_storage().save(rel, json.dumps({"points": geom["points"]}).encode(), "application/json")
        geometry_row.point_cloud_path = rel
    db.add(geometry_row)

    if not geom.get("ok"):
        db.commit()
        _fail(db, job, geom.get("failure_reason") or "Geometry reconstruction failed")
        return

    _transition(db, job, AnalysisState.ESTIMATING_DIMENSIONS)
    db.commit()
    meas = MeasurementResult(
        job_id=job.id,
        length_cm=geom["length_cm"],
        breadth_cm=geom["breadth_cm"],
        height_cm=geom["height_cm"],
        length_uncertainty_cm=geom.get("length_uncertainty_cm"),
        breadth_uncertainty_cm=geom.get("breadth_uncertainty_cm"),
        height_uncertainty_cm=geom.get("height_uncertainty_cm"),
        measurement_confidence=geom.get("measurement_confidence"),
        analysis_method=geom.get("analysis_method") or "Multi-View Calibrated Geometry",
        images_used=len(loaded),
        calibration_method=calib_method,
        surfaces_analyzed=geom.get("surfaces_analyzed") or [s for s, _, _ in loaded],
        cm_per_pixel=cm_per_pixel,
    )
    db.add(meas)

    _transition(db, job, AnalysisState.CALCULATING_VOLUME)
    db.commit()
    L, B, H = geom["length_cm"], geom["breadth_cm"], geom["height_cm"]
    bounding = L * B * H
    adjusted = None
    if geom.get("points"):
        pts = np.array(geom["points"])
        # Conservative convex volume proxy: bounding * occupancy of AABB bins
        if len(pts) >= 20:
            occupancy = min(1.0, max(0.4, len(pts) / 2000.0))
            # Do not invent a tighter mesh. Only report adjusted if occupancy evidence exists.
            adjusted = round(bounding * occupancy, 1) if occupancy < 0.98 else None

    _transition(db, job, AnalysisState.ANALYZING_DEFECTS)
    db.commit()
    defect_provider = YOLODefectDetectionProvider()
    all_findings = []
    defect_error = None
    for side, img, _ in loaded:
        d = defect_provider.detect(img, side)
        if not d.configured:
            defect_error = d.error_message
            break
        all_findings.extend(
            [
                {
                    "kind": f.kind,
                    "severity": f.severity,
                    "surface": f.surface,
                    "bbox": f.bbox,
                    "confidence": f.confidence,
                    "visible_surface_defect": True,
                    "internal_defect": False,
                }
                for f in d.findings
            ]
        )
    db.add(
        DefectResult(
            job_id=job.id,
            provider="YOLODefectDetectionProvider",
            visible_defects=all_findings if defect_error is None else [],
            bottom_surface="Not Observed",
            internal_defects_claimed=False,
            error_code="MODEL_NOT_CONFIGURED" if defect_error else None,
            error_message=defect_error,
        )
    )
    defect_exclusion = 0.0
    if all_findings:
        # Each visible finding excludes a small surface slab, not an invented cavity volume.
        defect_exclusion = round(0.01 * bounding * min(len(all_findings), 10), 1)

    _transition(db, job, AnalysisState.OPTIMIZING_CUTTING)
    db.commit()
    irregularity = 0.0
    if adjusted is not None and bounding > 0:
        irregularity = max(0.0, 1.0 - adjusted / bounding)
    cut = optimize_cutting(L, B, H, defect_exclusion_cm3=defect_exclusion, irregularity_ratio=irregularity)
    db.add(
        CuttingOptimizationResult(
            job_id=job.id,
            orientations=cut["orientations"],
            recommended_orientation=cut["recommended_orientation"],
            max_usable_volume_cm3=cut["max_usable_volume_cm3"],
            label=cut["label"],
        )
    )

    _transition(db, job, AnalysisState.ESTIMATING_WASTAGE)
    db.commit()
    waste = wastage_from_geometry(
        L, B, H, adjusted, cut["max_usable_volume_cm3"], defect_exclusion
    )
    db.add(
        WastageResult(
            job_id=job.id,
            bounding_volume_cm3=waste["bounding_volume_cm3"],
            adjusted_geometry_volume_cm3=waste["adjusted_geometry_volume_cm3"],
            bounding_method=waste["bounding_method"],
            adjusted_method=waste["adjusted_method"],
            irregularity_ratio=waste["irregularity_ratio"],
            max_usable_cut_volume_cm3=waste["max_usable_cut_volume_cm3"],
            estimated_waste_volume_cm3=waste["estimated_waste_volume_cm3"],
            waste_percentage=waste["waste_percentage"],
            defect_exclusion_volume_cm3=waste["defect_exclusion_volume_cm3"],
            shape_notes={
                "tapered_sides": irregularity > 0.08,
                "uneven_surfaces": irregularity > 0.05,
                "irregular_edges": irregularity > 0.1,
                "missing_corners": bool(all_findings),
                "broken_regions": bool(all_findings),
                "bottom_surface": "Not Observed",
            },
        )
    )

    block = db.get(GraniteBlock, job.block_id)
    volume_for_assess = waste["adjusted_geometry_volume_cm3"] or waste["bounding_volume_cm3"]
    rate = None
    gclass = None
    if block:
        gclass = classify_gangsaw(L, B, 270.0, 150.0)
        rate = active_rate(db, block.granite_category_id, gclass)
    amount = None
    vol_m3 = None
    rate_val = None
    if rate and volume_for_assess:
        vol_m3, amount = indicative_amount(volume_for_assess, rate.rate_per_cubic_metre)
        rate_val = rate.rate_per_cubic_metre
        gclass = rate.gangsaw_class
        # Reclassify with configured thresholds
        gclass = classify_gangsaw(L, B, rate.above_length_cm, rate.above_breadth_cm)
    tonnes = None
    density = settings.default_granite_density_t_m3
    if density and vol_m3:
        tonnes = round(vol_m3 * density, 3)
    db.add(
        SeigniorageAssessment(
            job_id=job.id,
            block_id=job.block_id,
            category_id=block.granite_category_id if block else None,
            rate_id=rate.id if rate else None,
            gangsaw_class=gclass,
            assessment_kind=AssessmentKind.INDICATIVE_AI_ASSESSMENT,
            volume_cm3=volume_for_assess,
            volume_m3=vol_m3,
            rate_per_m3=rate_val,
            indicative_amount=amount,
            density_used_t_m3=density if tonnes is not None else None,
            estimated_tonnes=tonnes,
            created_by_id=job.submitted_by_id,
            notes=None if rate else "No published seigniorage rate matched this category/class.",
        )
    )
    audit(db, entity_type="seigniorage_assessment", entity_id=job.id, action="assessment_generated", actor_id=job.submitted_by_id, metadata={"kind": AssessmentKind.INDICATIVE_AI_ASSESSMENT})

    if block:
        block.status = "ANALYZED"
    _transition(db, job, AnalysisState.COMPLETED)
    audit(db, entity_type="analysis_job", entity_id=job.id, action="analysis_completed", actor_id=job.submitted_by_id, metadata={})
    db.commit()

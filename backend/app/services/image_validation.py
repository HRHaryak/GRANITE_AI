from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.calibration import detect_aruco, detect_measurement_board
from app.ai.providers.detection import get_granite_detection_provider
from app.ai.quality import assess_image_quality, hamming_distance, perceptual_hash
from app.models.entities import BlockImage, ImageValidationResult
from app.models.enums import CalibrationType
from app.services.audit import audit


def validate_image(
    db: Session,
    image: BlockImage,
    image_bgr,
    *,
    actor_id: str,
    calibration_type: str | None,
    known_reference_cm: float | None,
    marker_size_cm: float | None,
    sibling_hashes: list[str],
) -> ImageValidationResult:
    quality = assess_image_quality(image_bgr)
    issues = list(quality.issues)
    details: dict = {
        "quality": {
            "method": quality.method,
            "blur_var": quality.blur_var,
            "brightness_mean": quality.brightness_mean,
            "overexposed_ratio": quality.overexposed_ratio,
            "width": quality.width,
            "height": quality.height,
        }
    }

    phash = perceptual_hash(image_bgr)
    details["phash"] = phash
    for other in sibling_hashes:
        if hamming_distance(phash, other) <= 8:
            issues.append("Duplicate image")
            break

    detection = get_granite_detection_provider().detect(image_bgr)
    details["detection"] = {
        "provider": detection.provider,
        "configured": detection.configured,
        "boxes": detection.boxes,
    }

    error_code = detection.error_code
    error_message = detection.error_message
    is_granite = detection.is_granite
    detection_confidence = detection.detection_confidence

    calibration_detected = False
    calib_details = None
    if calibration_type == CalibrationType.ARUCO:
        calib = detect_aruco(image_bgr, marker_size_cm)
        calibration_detected = calib.detected
        calib_details = calib.details
        details["calibration"] = calib.__dict__
        if not calib.detected:
            issues.append("Calibration not visible")
    elif calibration_type == CalibrationType.MEASUREMENT_BOARD and known_reference_cm:
        calib = detect_measurement_board(image_bgr, known_reference_cm)
        calibration_detected = calib.detected
        details["calibration"] = calib.__dict__
        if not calib.detected:
            issues.append("Calibration not visible")
    elif calibration_type == CalibrationType.MANUAL_REFERENCE and known_reference_cm:
        calibration_detected = True
        details["calibration"] = {"type": "MANUAL_REFERENCE", "known_reference_cm": known_reference_cm}
    else:
        issues.append("Measurement calibration required")

    accepted = False
    if not detection.configured:
        issues.append("Granite detection model is not configured.")
        accepted = False
    elif is_granite is False:
        issues.append("Not a Granite Block")
        accepted = False
    elif is_granite is True and not quality.issues and "Duplicate image" not in issues:
        accepted = True
        if calibration_type and calibration_type != CalibrationType.MANUAL_REFERENCE and not calibration_detected:
            # Calibration can be on another view; do not reject granite solely for missing marker on this frame.
            accepted = True

    existing = db.scalar(select(ImageValidationResult).where(ImageValidationResult.image_id == image.id))
    payload = dict(
        is_granite=is_granite,
        detection_confidence=detection_confidence,
        quality_score=quality.quality_score,
        calibration_detected=calibration_detected,
        accepted=accepted,
        issues=issues,
        detection_provider=detection.provider,
        quality_method=quality.method,
        error_code=error_code,
        error_message=error_message,
        details=details,
    )
    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
        result = existing
    else:
        result = ImageValidationResult(image_id=image.id, **payload)
        db.add(result)

    image.accepted = accepted
    image.rejected = not accepted
    image.width_px = quality.width
    image.height_px = quality.height
    db.flush()
    audit(
        db,
        entity_type="block_image",
        entity_id=image.id,
        action="image_accepted" if accepted else "image_rejected",
        actor_id=actor_id,
        metadata={"issues": issues, "error_code": error_code},
    )
    return result

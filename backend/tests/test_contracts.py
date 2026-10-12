from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models.enums import CalibrationType, CaptureSide
from app.schemas.common import BlockCreate, SessionCreate
from app.services.seigniorage import classify_gangsaw, indicative_amount


def test_calibration_type_enumeration():
    assert CalibrationType.MANUAL_REFERENCE == "MANUAL_REFERENCE"
    assert CalibrationType.ARUCO == "ARUCO"
    assert CalibrationType.MEASUREMENT_BOARD == "MEASUREMENT_BOARD"


def test_block_create_schema_validation():
    block = BlockCreate(
        quarry_id="q-1",
        granite_category_id="cat-1",
        capture_date=datetime.now(),
        notes="Test block entry",
    )
    assert block.quarry_id == "q-1"
    assert block.granite_category_id == "cat-1"
    assert block.skip_gps is True



def test_manual_reference_requires_positive_physical_and_pixel_lengths():
    payload = SessionCreate(
        block_id="block-1",
        calibration_type="MANUAL_REFERENCE",
        known_reference_cm=10,
        reference_pixels=100,
    )

    assert payload.known_reference_cm == 10
    assert payload.reference_pixels == 100

    with pytest.raises(ValidationError):
        SessionCreate(
            block_id="block-1",
            calibration_type="MANUAL_REFERENCE",
            known_reference_cm=0,
            reference_pixels=100,
        )

    with pytest.raises(ValidationError):
        SessionCreate(
            block_id="block-1",
            calibration_type="MANUAL_REFERENCE",
            known_reference_cm=10,
        )


def test_aruco_calibration_accepts_positive_marker_size():
    payload = SessionCreate(
        block_id="block-1",
        calibration_type="ARUCO",
        marker_size_cm=10.0,
    )
    assert payload.marker_size_cm == 10.0
    assert payload.calibration_type == "ARUCO"

    with pytest.raises(ValidationError):
        SessionCreate(
            block_id="block-1",
            calibration_type="ARUCO",
            marker_size_cm=-5.0,
        )


def test_seigniorage_rate_per_cubic_metre_uses_volume_units():
    assert indicative_amount(2_000_000, 125) == (2.0, 250.0)
    assert indicative_amount(5_000_000, 200) == (5.0, 1000.0)


def test_gangsaw_classification_thresholds():
    # Above gangsaw: length > 270 AND breadth > 150
    assert classify_gangsaw(280.0, 160.0, 270.0, 150.0) == "ABOVE_GANGSAW"
    # Exact threshold or below: classified as BELOW_GANGSAW
    assert classify_gangsaw(270.0, 150.0, 270.0, 150.0) == "BELOW_GANGSAW"
    assert classify_gangsaw(260.0, 160.0, 270.0, 150.0) == "BELOW_GANGSAW"
    assert classify_gangsaw(280.0, 140.0, 270.0, 150.0) == "BELOW_GANGSAW"
    assert classify_gangsaw(200.0, 100.0, 270.0, 150.0) == "BELOW_GANGSAW"



def test_sequential_photo_labels_enumeration():
    # Verify sequential labels PHOTO_001 through PHOTO_012 exist
    for i in range(1, 13):
        label = f"PHOTO_{i:03d}"
        assert CaptureSide(label).value == label

    # Legacy sides still supported for backward compatibility
    assert CaptureSide.FRONT == "FRONT"
    assert CaptureSide.BACK == "BACK"
    assert CaptureSide.LEFT == "LEFT"
    assert CaptureSide.RIGHT == "RIGHT"
    assert CaptureSide.TOP == "TOP"


def test_generate_cutting_explanation_telugu():
    from app.services.explanation import generate_cutting_explanation, answer_block_question
    measurement = {
        "length_cm": 300.0,
        "breadth_cm": 150.0,
        "height_cm": 120.0,
        "volume_m3": 5.4,
        "measurement_confidence": 0.90,
        "confidence_grade": "HIGH",
    }
    geometry = {"simplified_geometry_json": {"surface_flatness_dev_cm": 0.8, "taper_x": 0.02}}
    defects = {"visible_defects": [{"kind": "TERRACED_SURFACE_RIDGES", "surface": "FRONT"}], "bottom_surface": "Not Observed"}
    cutting = {
        "recommended_orientation": "Orientation A (L×B×H)",
        "usable_volume_m3": 4.1,
        "usable_area_m2": 25.0,
        "pieces_estimated": 200,
        "wastage_percentage": 24.0,
    }
    wastage = {"waste_percentage": 24.0}

    res_te = generate_cutting_explanation(
        measurement=measurement,
        geometry=geometry,
        defects=defects,
        cutting=cutting,
        wastage=wastage,
        seigniorage=None,
        classification=None,
        language="te",
    )

    assert res_te["locale"] == "te-IN"
    assert "వాణిజ్య" in res_te["summary"] or "దిగుబడి" in res_te["summary"]
    assert any("దిగుబడి" in w or "సమలేఖనం" in w for w in res_te["why"])
    assert any("ట్రిమ్మింగ్" in wb["category"] or "రంపపు" in wb["category"] for wb in res_te["waste_breakdown"])

    res_q = answer_block_question(
        question="ఈ కట్టింగ్ దిశను ఎందుకు సిఫార్సు చేశారు?",
        analysis_dict={
            "block_id": "BLOCK-001",
            "measurement": measurement,
            "cutting": cutting,
            "wastage": wastage,
            "defects": defects,
        },
        language="te",
    )
    assert res_q["locale"] == "te-IN"
    assert "సిఫార్సు" in res_q["answer"] or "రికవరీ" in res_q["answer"]



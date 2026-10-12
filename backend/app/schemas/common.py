from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DemoUserOut(BaseModel):
    id: str
    name: str
    role: str
    is_active: bool
    avatar_initials: str | None

    model_config = {"from_attributes": True}


class DemoUserCreate(BaseModel):
    name: str
    role: str
    avatar_initials: str | None = None


class QuarryCreate(BaseModel):
    quarry_name: str
    quarry_code: str
    lease_id: str
    district: str
    mandal: str
    village: str
    granite_category_id: str
    latitude: float | None = None
    longitude: float | None = None
    boundary_geojson: dict[str, Any] | None = None
    status: str = "ACTIVE"


class QuarryOut(BaseModel):
    id: str
    quarry_name: str
    quarry_code: str
    lease_id: str
    district: str
    mandal: str
    village: str
    granite_category_id: str
    latitude: float | None
    longitude: float | None
    boundary_geojson: dict[str, Any] | None
    status: str

    model_config = {"from_attributes": True}


class GpsIn(BaseModel):
    latitude: float
    longitude: float
    accuracy: float | None = None


class BlockCreate(BaseModel):
    block_code: str | None = None
    quarry_id: str
    granite_category_id: str
    capture_date: datetime
    notes: str | None = None
    gps: GpsIn | None = None
    skip_gps: bool = True


class BlockOut(BaseModel):
    id: str
    block_code: str
    quarry_id: str
    granite_category_id: str
    capture_date: datetime
    operator_id: str
    notes: str | None
    status: str
    latitude: float | None
    longitude: float | None
    gps_accuracy_m: float | None
    gps_captured_at: datetime | None

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    block_id: str
    calibration_type: str
    known_reference_cm: float | None = None
    marker_size_cm: float | None = None
    # For MANUAL_REFERENCE: pixel length of the measured reference in the image
    reference_pixels: float | None = None


class SessionOut(BaseModel):
    id: str
    block_id: str
    operator_id: str
    status: str
    calibration_type: str | None
    known_reference_cm: float | None
    marker_size_cm: float | None
    calibration_confidence: float | None

    model_config = {"from_attributes": True}


class ValidationOut(BaseModel):
    is_granite: bool | None
    detection_confidence: float | None
    quality_score: float | None
    calibration_detected: bool
    accepted: bool
    issues: list[Any]
    detection_provider: str
    quality_method: str
    error_code: str | None
    error_message: str | None


class ImageOut(BaseModel):
    id: str
    capture_session_id: str
    capture_side: str
    accepted: bool
    rejected: bool
    mime_type: str
    validation: ValidationOut | None = None

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    capture_session_id: str


class JobOut(BaseModel):
    id: str
    capture_session_id: str
    block_id: str
    state: str
    failure_reason: str | None
    demo_simulated: bool
    transitions: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class VerificationIn(BaseModel):
    job_id: str
    verified_length_cm: float
    verified_breadth_cm: float
    verified_height_cm: float
    decision: str
    remarks: str | None = None


class RateCreate(BaseModel):
    version_label: str
    effective_from: datetime
    effective_to: datetime | None = None
    notes: str | None = None
    rates: list[dict[str, Any]]


class CategoryCreate(BaseModel):
    code: str
    name: str
    description: str | None = None


class CaptureGuidanceResponse(BaseModel):
    requested_view: str | None = None
    next_recommended_view: str | None = None
    instruction: str = ""
    reason: str = ""
    existing_image_id: str | None = None
    recapture_view_label: str | None = None
    recommended_capture_side: str | None = None
    instruction_type: str = "REQUESTED"
    available_views: list[str] = Field(default_factory=list)
    current_views: list[str] = Field(default_factory=list)
    capture_side: str | None = None
    status: str = "IN_PROGRESS"
    validation: dict[str, Any] | None = None
    instruction_override: str | None = None
    current_view_label: str | None = None
    recapture_required: bool | None = None
    existing_view_replacement_required: bool | None = None
    recapture_evidence_added: bool | None = None
    inaccessible_surfaces: dict[str, Any] = Field(default_factory=dict)


class BlockCaptureOut(BaseModel):
    block: BlockOut
    session: SessionOut | None = None
    images: list[ImageOut] = Field(default_factory=list)

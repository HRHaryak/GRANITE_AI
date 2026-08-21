from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKey, new_uuid, utcnow


class DemoUser(UUIDPrimaryKey, TimestampMixin, Base):
    """Hackathon selected-user list. Not authentication."""

    __tablename__ = "demo_users"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    avatar_initials: Mapped[str | None] = mapped_column(String(8), nullable=True)


class Profile(UUIDPrimaryKey, TimestampMixin, Base):
    """Attribution profile mirrored from selected demo user. No passwords."""

    __tablename__ = "profiles"

    demo_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)


class Quarry(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "quarries"

    quarry_name: Mapped[str] = mapped_column(String(200), nullable=False)
    quarry_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    lease_id: Mapped[str] = mapped_column(String(80), nullable=False)
    district: Mapped[str] = mapped_column(String(120), nullable=False)
    mandal: Mapped[str] = mapped_column(String(120), nullable=False)
    village: Mapped[str] = mapped_column(String(120), nullable=False)
    granite_category_id: Mapped[str] = mapped_column(ForeignKey("granite_categories.id"))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    boundary_geojson: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"), nullable=True)


class GraniteCategory(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "granite_categories"

    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SeigniorageRateVersion(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "seigniorage_rate_versions"

    version_label: Mapped[str] = mapped_column(String(80), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)


class SeigniorageRate(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "seigniorage_rates"
    __table_args__ = (
        UniqueConstraint("version_id", "category_id", "gangsaw_class", name="uq_rate_version_cat_class"),
    )

    version_id: Mapped[str] = mapped_column(ForeignKey("seigniorage_rate_versions.id"))
    category_id: Mapped[str] = mapped_column(ForeignKey("granite_categories.id"))
    gangsaw_class: Mapped[str] = mapped_column(String(40), nullable=False)
    rate_per_cubic_metre: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    # Configurable classification thresholds (cm)
    above_length_cm: Mapped[float] = mapped_column(Float, default=270.0)
    above_breadth_cm: Mapped[float] = mapped_column(Float, default=150.0)


class GraniteBlock(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "granite_blocks"

    block_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    quarry_id: Mapped[str] = mapped_column(ForeignKey("quarries.id"))
    granite_category_id: Mapped[str] = mapped_column(ForeignKey("granite_categories.id"))
    capture_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    operator_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="REGISTERED")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    quarry: Mapped[Quarry] = relationship()
    category: Mapped[GraniteCategory] = relationship()


class BlockSequence(Base):
    __tablename__ = "block_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CaptureSession(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "capture_sessions"

    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    operator_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))
    status: Mapped[str] = mapped_column(String(40), default="OPEN")
    calibration_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    known_reference_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    marker_size_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibration_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)


class BlockImage(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "block_images"

    capture_session_id: Mapped[str] = mapped_column(ForeignKey("capture_sessions.id"))
    capture_side: Mapped[str] = mapped_column(String(20), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    captured_by_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))


class ImageValidationResult(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "image_validation_results"

    image_id: Mapped[str] = mapped_column(ForeignKey("block_images.id"), unique=True)
    is_granite: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    detection_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibration_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    issues: Mapped[list[Any]] = mapped_column(JSON, default=list)
    detection_provider: Mapped[str] = mapped_column(String(80), default="unconfigured")
    quality_method: Mapped[str] = mapped_column(String(80), default="opencv_heuristic")
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AnalysisJob(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "analysis_jobs"

    capture_session_id: Mapped[str] = mapped_column(ForeignKey("capture_sessions.id"))
    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    submitted_by_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))
    state: Mapped[str] = mapped_column(String(40), default="CREATED")
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    demo_simulated: Mapped[bool] = mapped_column(Boolean, default=False)


class AnalysisJobTransition(UUIDPrimaryKey, Base):
    __tablename__ = "analysis_job_transitions"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"))
    from_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_state: Mapped[str] = mapped_column(String(40), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class MeasurementResult(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "measurement_results"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True)
    length_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    breadth_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    length_uncertainty_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    breadth_uncertainty_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_uncertainty_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    measurement_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    analysis_method: Mapped[str] = mapped_column(String(80), default="Multi-View Calibrated Geometry")
    images_used: Mapped[int] = mapped_column(Integer, default=0)
    calibration_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    surfaces_analyzed: Mapped[list[Any]] = mapped_column(JSON, default=list)
    cm_per_pixel: Mapped[float | None] = mapped_column(Float, nullable=True)


class GeometryModel(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "geometry_models"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True)
    point_cloud_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bounding_box_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    simplified_geometry_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    reconstruction_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class DefectResult(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "defect_results"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    visible_defects: Mapped[list[Any]] = mapped_column(JSON, default=list)
    bottom_surface: Mapped[str] = mapped_column(String(40), default="Not Observed")
    internal_defects_claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class CuttingOptimizationResult(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "cutting_optimization_results"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True)
    orientations: Mapped[list[Any]] = mapped_column(JSON, default=list)
    recommended_orientation: Mapped[str | None] = mapped_column(String(40), nullable=True)
    max_usable_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    label: Mapped[str] = mapped_column(String(80), default="AI Estimated Cutting Optimization")


class WastageResult(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "wastage_results"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"), unique=True)
    bounding_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    adjusted_geometry_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounding_method: Mapped[str] = mapped_column(String(80), default="length_x_breadth_x_height")
    adjusted_method: Mapped[str | None] = mapped_column(String(80), nullable=True)
    irregularity_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_usable_cut_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_waste_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    waste_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    defect_exclusion_volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    shape_notes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class SeigniorageAssessment(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "seigniorage_assessments"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"))
    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    category_id: Mapped[str] = mapped_column(ForeignKey("granite_categories.id"))
    rate_id: Mapped[str | None] = mapped_column(ForeignKey("seigniorage_rates.id"), nullable=True)
    gangsaw_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assessment_kind: Mapped[str] = mapped_column(String(60), default="INDICATIVE_AI_ASSESSMENT")
    volume_cm3: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume_m3: Mapped[float | None] = mapped_column(Float, nullable=True)
    rate_per_m3: Mapped[float | None] = mapped_column(Float, nullable=True)
    indicative_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    density_used_t_m3: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ManualVerification(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "manual_verifications"

    job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs.id"))
    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    officer_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))
    verified_length_cm: Mapped[float] = mapped_column(Float, nullable=False)
    verified_breadth_cm: Mapped[float] = mapped_column(Float, nullable=False)
    verified_height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    dimension_variance_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    volume_variance_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WeighbridgeRecord(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "weighbridge_records"

    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    vehicle_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    gross_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    tare_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    weighment_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), default="unconfigured")
    demo_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))


class DispatchRecord(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "dispatch_records"

    block_id: Mapped[str] = mapped_column(ForeignKey("granite_blocks.id"))
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="DRAFT")
    omeps_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"))


class AuditLog(UUIDPrimaryKey, Base):
    __tablename__ = "audit_logs"

    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

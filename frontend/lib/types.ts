export type EvidenceStatus =
  | "OBSERVED"
  | "ESTIMATED"
  | "UNOBSERVED"
  | "NOT_MEASURABLE"
  | "AVAILABLE"
  | "MISSING"
  | "UNKNOWN"
  | string;

export type ConfidenceGrade =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT"
  | string;

export type DemoUser = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  avatar_initials?: string | null;
};

export type Quarry = {
  id: string;
  quarry_name: string;
  quarry_code: string;
  lease_id?: string;
  district?: string;
  mandal?: string;
  village?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type Category = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

export type BlockOut = {
  id: string;
  block_code: string;
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  operator_id: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
};

export type SessionOut = {
  id: string;
  block_id: string;
  operator_id: string;
  status: string;
  calibration_type?: string | null;
  known_reference_cm?: number | null;
  marker_size_cm?: number | null;
  calibration_confidence?: number | null;
  session_metadata?: CaptureSessionMetadata | null;
};

/**
 * Backend accepts legacy canonical labels as well as sequential PHOTO_xxx labels.
 * Never infer a physical granite surface from a sequential label.
 */
export type CaptureSide =
  | "FRONT"
  | "FRONT_RIGHT"
  | "RIGHT"
  | "BACK_RIGHT"
  | "BACK"
  | "BACK_LEFT"
  | "LEFT"
  | "FRONT_LEFT"
  | "TOP"
  | "BOTTOM"
  | `PHOTO_${string}`
  | string;

export type ValidationOut = {
  is_granite: boolean | null;
  detection_confidence: number | null;
  quality_score: number | null;
  calibration_detected: boolean;
  accepted: boolean;
  issues: string[];
  detection_provider: string;
  quality_method: string;
  error_code: string | null;
  error_message: string | null;
  details?: Record<string, unknown>;
};

export type ImageOut = {
  id: string;
  capture_session_id: string;
  capture_side: CaptureSide;
  accepted: boolean;
  rejected: boolean;
  original_filename?: string | null;
  mime_type?: string;
  width_px?: number | null;
  height_px?: number | null;
  sequence_number?: number | null;
  captured_at?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_accuracy?: number | null;
  orientation?: string | null;
  quality_score?: number | null;
  quality_warnings?: string[] | null;
  upload_idempotency_key?: string | null;
  image_url?: string | null;
  device_metadata?: Record<string, unknown> | null;
  validation?: ValidationOut | null;
};

export type CaptureBundle = {
  session: SessionOut | null;
  images: ImageOut[];
};


export type CaptureMode = "GUIDED" | "SEQUENTIAL" | "LEGACY" | string;

export type SurfaceObservationState =
  | "OBSERVED"
  | "UNOBSERVED"
  | "INACCESSIBLE"
  | "NOT_REQUIRED"
  | string;

export type InaccessibleSurfaceEvidence = {
  declared?: boolean;
  reason?: string | null;
  actor_id?: string | null;
  declared_at?: string | null;
  source?: string | null;
  [key: string]: unknown;
};

export type GuidedCaptureView =
  | "FRONT"
  | "FRONT_RIGHT"
  | "RIGHT"
  | "BACK_RIGHT"
  | "BACK"
  | "BACK_LEFT"
  | "LEFT"
  | "FRONT_LEFT"
  | "TOP"
  | "BOTTOM";

export type CaptureGuidanceRecommendation = {
  status?: string | null;
  requested_view?: GuidedCaptureView | string | null;
  next_recommended_view?: GuidedCaptureView | string | null;
  recommended_capture_side?: GuidedCaptureView | string | null;
  reason?: string | null;
  instruction?: string | null;
  priority?: "REQUIRED" | "RECOMMENDED" | "OPTIONAL" | string;
  recapture_required?: boolean;
  recapture_reason?: string | null;
  recapture_recommended?: boolean;
  recapture_view_id?: string | null;
  recapture_view_label?: GuidedCaptureView | string | null;
  analysis_job_id?: string | null;
  capture_session_id?: string | null;
  overlap_status?: string | null;
  overlap_guidance?: string | null;
  missing_views?: string[];
  inaccessible_surfaces?: string[];
  observed_surfaces?: string[];
  weak_view_ids?: string[];
  target_similarity?: number | null;
  target_similarity_status?: string | null;
  target_observed_shape_similarity?: number | null;
  target_is_validation_goal_not_guarantee?: boolean;
  target_met?: boolean;
  overall_silhouette_iou?: number | null;
  score_scope?: string | null;
  source?: string | null;
  existing_view_replacement_required?: boolean;
  existing_image_id?: string | null;
  existing_capture_side?: GuidedCaptureView | string | null;
  replacement_instruction?: string | null;
  satisfied_by_image_id?: string | null;
  satisfied_by_capture_side?: GuidedCaptureView | string | null;
  evidence_added_at?: string | null;
  rerun_analysis_required?: boolean;
  planned_capture_guidance?: Record<string, unknown>;
  production_geometry_proven?: boolean;
  production_geometry_proven_by_this_score_alone?: boolean;
  geometry_adjusted_to_improve_score?: boolean;
  analysis_authoritative?: boolean;
  [key: string]: unknown;
};

export type CaptureSessionMetadata = {
  capture_mode?: CaptureMode;
  guided_capture?: boolean;
  guided_sequence?: string[];
  current_requested_view?: string | null;
  next_recommended_view?: string | null;
  completed_views?: string[];
  missing_views?: string[];
  inaccessible_surfaces?:
    | Record<string, InaccessibleSurfaceEvidence>
    | string[];
  unobserved_surfaces?: string[];
  surface_states?: Record<string, SurfaceObservationState>;
  analysis_recapture_request?: CaptureGuidanceRecommendation | null;
  recapture_reopened?: boolean;
  recapture_reopened_at?: string | null;
  analysis_recapture_evidence_added?: boolean;
  fresh_analysis_required?: boolean;
  guidance?: CaptureGuidanceRecommendation | null;
  observed_shape_similarity_target?: number | null;
  observed_shape_similarity_target_status?: string | null;
  observed_shape_similarity_target_policy?: string | null;
  [key: string]: unknown;
};

export type CaptureOverlapMetrics = {
  detector?: string | null;
  incoming_feature_count?: number | null;
  reference_feature_count?: number | null;
  mutual_ratio_match_count?: number | null;
  verified_inlier_count?: number | null;
  verified_inlier_ratio?: number | null;
  median_displacement_px?: number | null;
  incoming_verified_spatial_coverage?: number | null;
  geometric_model?: string | null;
};

export type SessionCaptureGraph = {
  state?: string;
  node_count?: number | null;
  accepted_node_count?: number | null;
  edge_count?: number | null;
  root_image_id?: string | null;
  connected_image_ids?: string[];
  disconnected_image_ids?: string[];
  accepted_disconnected_image_ids?: string[];
  accepted_disconnected_capture_sides?: string[];
  minimum_capture_images?: number | null;
  reconstruction_attempt_permitted?: boolean;
  production_geometry_proven?: boolean;
  analysis_authoritative?: boolean;
  guidance?: string | null;
  edges?: Array<{
    image_a_id?: string;
    image_b_id?: string;
    capture_side_a?: string;
    capture_side_b?: string;
    status?: string;
    verified_inlier_count?: number | null;
    verified_inlier_ratio?: number | null;
    spatial_coverage?: number | null;
  }>;
  policy?: string | null;
};

export type CaptureOverlapPreflight = {
  status?: string | null;
  analysis_authoritative?: boolean;
  production_geometry_proven?: boolean;
  same_physical_block_proven?: boolean;
  best_partner?: {
    image_id?: string | null;
    capture_side?: string | null;
    sequence_number?: number | null;
  } | null;
  evaluated_reference_count?: number | null;
  connected_reference_count?: number | null;
  guidance?: string | null;
  metrics?: CaptureOverlapMetrics | null;
  comparisons?: Array<Record<string, unknown>>;
  session_graph?: SessionCaptureGraph | null;
  capture_readiness?: string | null;
  [key: string]: unknown;
};

export type CaptureImageUploadResult = ImageOut & {
  storage_path?: string | null;
  capture_overlap_preflight?: CaptureOverlapPreflight | null;
  capture_session_graph?: SessionCaptureGraph | null;
  guidance?: CaptureGuidanceRecommendation | null;
  next_recommended_view?: string | null;
};

export type CaptureCompleteResult = {
  status: string;
  accepted_images: number;
  uploaded_images?: number;
  capture_graph?: SessionCaptureGraph | null;
  reconstruction_attempt_permitted?: boolean;
  capture_overlap_advisory_ready?: boolean | null;
  production_geometry_proven?: boolean;
  missing_views?: string[];
  inaccessible_surfaces?: string[];
  next_recommended_view?: string | null;
  [key: string]: unknown;
};

export type SurfaceObservationUpdate = {
  surface: GuidedCaptureView | string;
  state: Extract<SurfaceObservationState, "INACCESSIBLE" | "UNOBSERVED"> | string;
  reason?: string | null;
};

export type SurfaceObservationUpdateResult = {
  session_id?: string;
  session_metadata?: CaptureSessionMetadata | null;
  surface?: string;
  state?: string;
  next_recommended_view?: string | null;
  guidance?: CaptureGuidanceRecommendation | null;
  [key: string]: unknown;
};

export type GuidedCaptureStatus = {
  session_id?: string;
  mode?: CaptureMode;
  current_requested_view?: string | null;
  next_recommended_view?: string | null;
  completed_views?: string[];
  missing_views?: string[];
  inaccessible_surfaces?: string[];
  unobserved_surfaces?: string[];
  guidance?: CaptureGuidanceRecommendation | null;
  capture_graph?: SessionCaptureGraph | null;
  production_geometry_proven?: boolean;
  analysis_authoritative?: boolean;
  [key: string]: unknown;
};

export type AnalysisTransition = {
  from_state: string | null;
  to_state: string;
  timestamp: string;
  note: string | null;
};

export type AnalysisJob = {
  id: string;
  capture_session_id: string;
  block_id: string;
  state: string;
  status?: string;
  current_stage?: string | null;
  progress_percent?: number;
  failure_reason: string | null;
  demo_simulated: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  transitions: AnalysisTransition[];
};

export type MeasurementOut = {
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  length_m?: number | null;
  breadth_m?: number | null;
  height_m?: number | null;
  length_uncertainty_cm?: number | null;
  breadth_uncertainty_cm?: number | null;
  height_uncertainty_cm?: number | null;
  volume_m3?: number | null;
  volume_cm3?: number | null;
  measurement_confidence?: number | null;
  confidence_grade?: ConfidenceGrade | null;
  confidence_factors?: Record<string, number> | null;
  analysis_method?: string;
  images_used?: number;
  calibration_method?: string | null;
  surfaces_analyzed?: string[];
  cm_per_pixel?: number | null;
};

export type CameraPoseEvidence = {
  capture_label?: string | null;
  image_index?: number | null;
  rotation?: number[][] | null;
  rotation_world_to_camera?: number[][] | null;
  translation_sfm_units?: number[] | null;
  translation_arbitrary_scale?: number[] | null;
  translation_cm?: number[] | null;
  coordinate_frame?: string | null;
  metric_scale_applied?: boolean;
  registration?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type CameraIntrinsicsEvidence = {
  source?: string | null;
  status?: string | null;
  camera_matrix?: number[][] | null;
  distortion_coefficients?: number[] | null;
  fx?: number | null;
  fy?: number | null;
  cx?: number | null;
  cy?: number | null;
  metric_pose_reliable?: boolean;
  warning?: string | null;
  [key: string]: unknown;
};

export type MarkerPoseEvidence = {
  available?: boolean;
  status?: string | null;
  marker_id?: number | string | null;
  selected_marker_id?: number | string | null;
  pose_method?: string | null;
  coordinate_units?: string | null;
  rvec?: number[] | null;
  tvec_cm?: number[] | null;
  rotation_matrix?: number[][] | null;
  camera_to_marker_distance_cm?: number | null;
  reprojection_rmse_px?: number | null;
  reprojection_median_px?: number | null;
  metric_pose_reliable?: boolean;
  warning?: string | null;
  [key: string]: unknown;
};

export type MetricScaleSolverEvidence = {
  status?: string | null;
  solved?: boolean;
  scale_cm_per_sfm_unit?: number | null;
  marker_id?: number | string | null;
  camera_count?: number | null;
  baseline_count?: number | null;
  ratio_candidate_count?: number | null;
  retained_ratio_count?: number | null;
  median_ratio?: number | null;
  mad?: number | null;
  relative_spread?: number | null;
  reason?: string | null;
  [key: string]: unknown;
};

export type SparseReconstructionSummary = {
  registered_camera_indexes?: number[];
  unregistered_camera_indexes?: number[];
  registered_camera_count?: number;
  track_count?: number;
  tracks_with_three_or_more_views?: number;
  median_track_length?: number | null;
  median_track_reprojection_error_px?: number | null;
  global_coordinate_frame?: string | null;
  track_identity_source?: string | null;
  exact_identity_pair_count?: number;
  legacy_proximity_pair_count?: number;
  conflicting_track_count?: number;
  rejected_ambiguous_observation_count?: number;
  [key: string]: unknown;
};

export type GeometrySimplified = {
  type?: string;
  length_cm?: number;
  breadth_cm?: number;
  height_cm?: number;
  length_m?: number;
  breadth_m?: number;
  height_m?: number;
  surface_flatness_dev_cm?: number;
  taper_x?: number;
  taper_y?: number;
  taper_z?: number;
  edge_irregularity_pct?: number;
  min_usable_l_cm?: number;
  min_usable_b_cm?: number;
  min_usable_h_cm?: number;
  chipped_volume_cm3?: number;
  camera_poses?: CameraPoseEvidence[];
  registered_cameras?: number[];
  reconstruction_diagnostics?: Record<string, unknown>;
  calibration?: Record<string, unknown>;
  [key: string]: unknown;
};

export type GeometryOut = {
  point_cloud_path?: string | null;
  mesh_path?: string | null;
  bounding_box_json?: Record<string, unknown> | null;
  oriented_bounding_box_json?: Record<string, unknown> | null;
  axis_aligned_bounding_box_json?: Record<string, unknown> | null;
  simplified_geometry_json?: GeometrySimplified | null;
  reconstruction_provider?: string | null;
  reconstruction_confidence?: number | null;
  match_count?: number;
  point_count?: number;
  inlier_ratio?: number | null;
  mesh_is_watertight?: boolean | null;
  mesh_volume_m3?: number | null;
  surface_area_m2?: number | null;
  volume_status?: string | null;
  notes?: string | null;
};

export type Point3Dcm = [number, number, number];

export type CavityGeometryMeasurement = {
  ok?: boolean;
  status?: string | null;
  cavity_measurement_status?: string | null;
  opening_width_cm?: number | null;
  opening_height_cm?: number | null;
  opening_area_cm2?: number | null;
  max_observed_depth_cm?: number | null;
  mean_observed_depth_cm?: number | null;
  median_observed_depth_cm?: number | null;
  visible_cavity_volume_cm3?: number | null;
  visible_cavity_volume_method?: string | null;
  depth_status?: string | null;
  internal_continuation?: string | null;
  internal_continuation_status?: string | null;
  point_3d_cm?: Point3Dcm | null;
  triangle_index?: number | null;
  rim_points_3d_cm?: Point3Dcm[];
  interior_points_3d_cm?: Point3Dcm[];
  rim_plane?: Record<string, unknown> | null;
  provenance?: string | null;
  warning?: string | null;

  // Multi-view physical cavity identity. These fields are worker/API evidence,
  // not frontend-created associations.
  physical_cavity_id?: string | null;
  associated_observation_count?: number | null;
  evidence_views?: string[];
  source_image_ids?: string[];
  physical_center_cm?: Point3Dcm | null;
  true_maximum_depth_status?: string | null;
  association_policy?: string | null;

  [key: string]: unknown;
};

export type PhysicalCavityAssociationStatus =
  | "MULTIVIEW_ASSOCIATED"
  | "SINGLE_VIEW_ONLY"
  | string;

export type PhysicalCavityAssociationConfidence =
  | "HIGH"
  | "MEDIUM"
  | "UNCONFIRMED_SINGLE_VIEW"
  | string;

export type PhysicalCavityObservation = {
  id?: string;
  kind?: string;
  type?: string;
  surface?: string;
  confidence?: number | null;
  point_3d_cm?: Point3Dcm | null;
  opening_width_cm?: number | null;
  opening_height_cm?: number | null;
  opening_area_cm2?: number | null;
  max_observed_depth_cm?: number | null;
  mean_observed_depth_cm?: number | null;
  visible_cavity_volume_cm3?: number | null;
  cavity_measurement_status?: string | null;
  internal_continuation_status?: string | null;
  cavity_geometry?: CavityGeometryMeasurement | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type PhysicalCavityRecord = {
  physical_cavity_id: string | null;
  association_status?: PhysicalCavityAssociationStatus | null;
  association_confidence?: PhysicalCavityAssociationConfidence | null;
  associated_observation_count?: number | null;
  associated_observations?: PhysicalCavityObservation[];

  evidence_view_count?: number | null;
  evidence_views: string[];
  source_image_ids: string[];
  physical_center_cm?: Point3Dcm | null;

  opening_width_cm?: number | null;
  opening_height_cm?: number | null;
  opening_area_cm2?: number | null;
  max_observed_depth_cm?: number | null;
  mean_observed_depth_cm?: number | null;
  visible_cavity_volume_cm3?: number | null;

  cavity_measurement_status?: string | null;
  internal_continuation_status?: string | null;
  true_maximum_depth_status?: string | null;
  association_policy?: string | null;

  rim_points_3d_cm?: Point3Dcm[];
  interior_points_3d_cm?: Point3Dcm[];
  cavity_geometry?: CavityGeometryMeasurement | null;

  [key: string]: unknown;
};

export type PhysicalCavitySummary = {
  physical_cavity_count: number;
  multi_view_physical_cavity_count: number;
  single_view_physical_cavity_count: number;
  metric_measured_physical_cavity_count: number;
  total_evidence_view_count: number;
  forced_2d_only_merges: number;
  association_policy: string;
  hidden_continuation_policy: string;
  records: PhysicalCavityRecord[];
};

export type DefectFinding = {
  id?: string;
  kind: string;
  type?: string;
  category?: string;
  severity: string;
  surface: string;
  bbox: number[];
  polygon_xy?: number[][] | null;
  mask_area_px?: number | null;
  confidence: number | null;

  visible_surface_defect: boolean;
  internal_defect: boolean;

  location?: Record<string, unknown> | null;
  point_3d_cm?: Point3Dcm | null;
  triangle_index?: number | null;

  depth_mm?: number | null;
  depth_provenance?: string | null;
  depth_status?: string | null;

  estimated_area_cm2?: number | null;
  measurement_provenance?: string | null;
  cutting_impact?: string | null;
  cut_relevance?: string | null;
  geometry_region?: Record<string, unknown> | null;

  opening_width_cm?: number | null;
  opening_height_cm?: number | null;
  opening_area_cm2?: number | null;
  max_observed_depth_cm?: number | null;
  mean_observed_depth_cm?: number | null;
  visible_cavity_volume_cm3?: number | null;
  cavity_measurement_status?: string | null;
  internal_continuation_status?: string | null;
  rim_points_3d_cm?: Point3Dcm[];
  interior_points_3d_cm?: Point3Dcm[];

  physical_cavity_id?: string | null;
  association_status?: PhysicalCavityAssociationStatus | null;
  association_confidence?: PhysicalCavityAssociationConfidence | null;
  associated_observation_count?: number | null;
  associated_observations?: PhysicalCavityObservation[];
  evidence_view_count?: number | null;
  evidence_views?: string[];
  source_image_ids?: string[];
  physical_center_cm?: Point3Dcm | null;
  association_policy?: string | null;
  true_maximum_depth_status?: string | null;

  visible_in_images?: string[];
  evidence?: Array<Record<string, unknown>>;
  metadata?: {
    segmentation_polygon?: number[][] | null;
    polygon_xy?: number[][] | null;
    cavity_geometry?: CavityGeometryMeasurement | null;
    cavity_measurement_status?: string | null;
    [key: string]: unknown;
  } | null;
};

export type DefectOut = {
  provider: string;
  status: string;
  visible_defects: DefectFinding[];
  summary?: Record<string, unknown> | null;
  bottom_surface: string;
  internal_defects_claimed: boolean;
  error_code?: string | null;
  error_message?: string | null;
};

export type DressingCutStep = {
  step_number: number;
  cut_name: string;
  plane_axis: "X" | "Y" | "Z" | string;
  position_m: number;
  position_cm: number;
  cut_area_m2: number;
  removed_volume_m3: number;
  waste_category: string;
  reason: string;
};

export type OrientationOption = {
  orientation: string;
  description?: string;
  dressed_length_m?: number;
  dressed_breadth_m?: number;
  dressed_height_m?: number;
  dressed_length_cm?: number;
  dressed_breadth_cm?: number;
  dressed_height_cm?: number;
  usable_length_cm?: number;
  usable_breadth_cm?: number;
  usable_height_cm?: number;
  usable_volume_m3?: number;
  usable_volume_cm3?: number;
  estimated_usable_volume_cm3?: number;
  trimming_waste_m3?: number;
  trimming_waste_cm3?: number;
  estimated_trimming_waste_cm3?: number;
  defect_waste_m3?: number;
  kerf_waste_m3?: number;
  total_waste_m3?: number;
  waste_percentage: number;
  yield_percentage?: number;
  cut_surface_area_m2?: number;
  primary_dressing_cuts?: number;
  estimated_slabs?: number;
  defect_avoidance_score?: number;
  commercial_suitability_score?: number;
  cutting_steps?: DressingCutStep[];
};

export type CuttingOut = {
  label: string;
  solver?: string | null;
  recommended_orientation?: string | null;
  max_usable_volume_cm3?: number | null;
  usable_volume_m3?: number | null;
  usable_area_m2?: number | null;
  wastage_area_m2?: number | null;
  wastage_percentage?: number | null;
  yield_percentage?: number | null;
  pieces_estimated?: number | null;
  orientations: OrientationOption[];
  final_dressed_dimensions?: {
    length_m?: number;
    breadth_m?: number;
    height_m?: number;
    length_cm?: number;
    breadth_cm?: number;
    height_cm?: number;
  } | null;
  cutting_steps?: DressingCutStep[];
  parameters?: Record<string, unknown> | null;
  scenarios?: Record<string, unknown>;
  confirmed_case?: Record<string, unknown>;
  conservative_case?: Record<string, unknown>;
  maximum_recovery_case?: Record<string, unknown>;
};

export type WastageOut = {
  bounding_volume_cm3?: number | null;
  bounding_volume_m3?: number | null;
  adjusted_geometry_volume_cm3?: number | null;
  adjusted_geometry_volume_m3?: number | null;
  bounding_method?: string;
  adjusted_method?: string | null;
  irregularity_ratio?: number | null;
  max_usable_cut_volume_cm3?: number | null;
  max_usable_cut_volume_m3?: number | null;
  estimated_waste_volume_cm3?: number | null;
  estimated_waste_volume_m3?: number | null;
  waste_percentage?: number | null;
  recovery_yield_percentage?: number | null;
  defect_exclusion_volume_cm3?: number | null;
  defect_exclusion_volume_m3?: number | null;
  waste_breakdown_m3?: {
    geometric_trimming_m3?: number;
    defect_exclusion_m3?: number;
    kerf_loss_m3?: number;
    residual_offcut_m3?: number;
  };
  shape_notes?: Record<string, unknown>;
};

export type SeigniorageOut = {
  gangsaw_class?: string | null;
  assessment_kind?: string;
  volume_cm3?: number | null;
  volume_m3?: number | null;
  rate_per_m3?: number | null;
  indicative_amount?: number | null;
  currency?: string;
  density_used_t_m3?: number | null;
  estimated_tonnes?: number | null;
  notes?: string | null;
};

export type ClassificationOut = {
  classification?: string | null;
  confidence?: number | null;
  provider: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
};

export type CapabilityItem = {
  status:
    | "operational"
    | "degraded"
    | "unavailable"
    | "not_configured"
    | string;
  provider: string;
  configured?: boolean;
  reason?: string | null;
  [key: string]: unknown;
};

export type CapabilitiesOut = Record<
  string,
  CapabilityItem
>;

export type ManualVerificationOut = {
  id: string;
  job_id: string;
  block_id: string;
  officer_id: string;
  verified_length_cm: number;
  verified_breadth_cm: number;
  verified_height_cm: number;
  dimension_variance_json: {
    delta_length_cm?: number;
    delta_breadth_cm?: number;
    delta_height_cm?: number;
    length_variance_percent?: number;
    breadth_variance_percent?: number;
    height_variance_percent?: number;
  };
  volume_variance_json: {
    physical_volume_m3?: number;
    ai_volume_m3?: number;
    delta_volume_m3?: number;
    volume_variance_percent?: number;
  };
  decision:
    | "VERIFIED"
    | "VERIFIED_WITH_CORRECTION"
    | "REJECTED"
    | "REQUIRES_REANALYSIS"
    | string;
  remarks?: string | null;
  created_at: string;
};

export type AIExplanationOut = {
  decision: string;
  summary: string;
  why: string[];
  tradeoffs: string[];
  confidence_grade: string;
  confidence_score: number;
  waste_percentage: number;
  usable_volume_m3?: number;
  usable_area_m2: number;
  estimated_pieces: number;
  waste_breakdown: Array<{
    category: string;
    description: string;
    modeled_pct: number;
    nature: string;
  }>;
  evidence_matrix: {
    observed_facts: string[];
    derived_measurements?: string[];
    estimated_geometry?: string[];
    estimated_values?: string[];
    optimization_decisions: string[];
    assumptions?: string[];
    ai_interpretations?: string[];
  };
  orientations_comparison:
    | OrientationOption[]
    | Array<Record<string, unknown>>;
  limitations: string[];
};

export type AIAssistantResponse = {
  question: string;
  answer: string;
  fact_type: string;
  data_fields_referenced: string[];
  suggested_followups: string[];
  disclaimer: string;
};

export type ObservedShapePerViewValidation = {
  photo_id?: string | null;
  view_id?: string | null;
  photo_label?: string | null;
  side?: string | null;
  status?: string | null;
  silhouette_iou?: number | null;
  boundary_error_px?: number | null;
  target_iou?: number | null;
  target_met?: boolean;
  weak_view?: boolean;
  pose_provenance?: string | null;
  intrinsics_provenance?: string | null;
  [key: string]: unknown;
};

export type ObservedShapeValidation = {
  ok?: boolean;
  status: string;
  target_iou: number;
  target_is_goal_not_guarantee?: boolean;
  target_met: boolean;

  overall_silhouette_iou?: number | null;
  median_silhouette_iou?: number | null;
  minimum_silhouette_iou?: number | null;
  mean_boundary_error_px?: number | null;
  maximum_boundary_error_px?: number | null;

  valid_view_count?: number;
  total_view_count?: number;
  weak_view_ids?: string[];

  recapture_recommended?: boolean;
  recapture_view_id?: string | null;
  recapture_view_label?: string | null;
  recapture_reason?: string | null;

  per_view?: ObservedShapePerViewValidation[];
  rejected_views?: Array<Record<string, unknown>>;
  diagnostics?: Record<string, unknown>;

  score_scope?: string | null;
  geometry_adjusted_to_improve_score?: boolean;
  unobserved_surface_policy?: string | null;
  production_geometry_proven_by_this_score_alone?: boolean;

  [key: string]: unknown;
};

export type PhotoEvidenceItem = {
  photo_id: string;
  photo_label: string;
  side: string;
  view_name: string;
  /**
   * Kept nullable/optional. The API deliberately does not fabricate Euler
   * angles from a reconstruction just to satisfy the UI.
   */
  camera_angles?:
    | {
        azimuth: number;
        elevation: number;
        distance_m: number;
      }
    | null;
  camera_pose_status?: string;
  camera_pose?: CameraPoseEvidence | null;
  camera_intrinsics?: CameraIntrinsicsEvidence | null;
  marker_pose?: MarkerPoseEvidence | null;
  metric_pose_reliable?: boolean;
  image_url?: string | null;
  is_provided?: boolean;
  is_observed?: boolean;
  silhouette_iou?: number | null;
  boundary_error_px?: number | null;
  feature_reprojection_error_px?: number | null;

  shape_validation_source?: string | null;
  shape_validation_status?: string | null;
  shape_target_iou?: number | null;
  shape_target_met?: boolean | null;
  weak_view?: boolean;
  shape_score_scope?: string | null;
  view_confidence?:
    | "HIGH"
    | "MEDIUM"
    | "LOW"
    | "UNOBSERVED"
    | string;
  view_confidence_score?: number;
  reconstruction_status?: string;
  confirmed_geometry: string[];
  unconfirmed_geometry: string[];
  reconstruction_confidence: number;
  calibration_status: string;
  provenance: string;
  defects_detected: string[];
  detected_defects_details?: Array<{
    id: string;
    type: string;
    category: string;
    severity?: string;
    confidence: number;
    depth_status: string;
    measurement_provenance: string;
    cutting_impact: string;
    image_region:
      | [number, number, number, number]
      | number[];
    geometry_region?: Record<string, unknown>;
  }>;
  validation_layers?: {
    has_original_image: boolean;
    has_granite_mask: boolean;
    has_boundary_overlay: boolean;
    has_defect_overlay: boolean;
    has_reprojected_3d: boolean;
    has_difference_map: boolean;
  };
};

export type ReconstructionQualityReport = {
  valid_views_count: number;
  total_views_count: number;
  valid_views_fraction: string;
  calibration_status:
    | "AVAILABLE"
    | "MISSING"
    | string;
  calibration_method: string;
  feature_match_quality: number;
  silhouette_consistency: number;
  overall_silhouette_iou?: number | null;
  mean_boundary_error_px?: number | null;
  mean_reprojection_error_px?: number | null;
  camera_coverage_percentage: number;
  missing_surfaces: string[];
  observed_surfaces: string[];
  reconstruction_confidence: number;
  metric_measurement_allowed: boolean;
  metric_measurement_status:
    | "ALLOWED"
    | "NOT_ALLOWED"
    | string;
  status: string;
  provenance: string;

  registered_camera_count?: number;
  camera_pose_status?: string | null;
  camera_poses_available?: boolean;
  global_bundle_adjustment?: boolean;

  sfm_coordinate_scale?: string | null;
  metric_sfm_scale_solved?: boolean;
  metric_scale_source?: string | null;
  metric_scale_provenance?: string | null;
  metric_scale_cm_per_sfm_unit?: number | null;
  metric_scale_solver?: MetricScaleSolverEvidence | null;

  sparse_reconstruction_summary?: SparseReconstructionSummary | null;

  calibration_evidence_status?: string | null;
  calibration_evidence_view_count?: number;

  observed_shape_validation_status?: string | null;
  observed_shape_target_iou?: number | null;
  observed_shape_target_met?: boolean;
  observed_shape_similarity_iou?: number | null;
  observed_shape_valid_view_count?: number;
  observed_shape_weak_view_ids?: string[];
  observed_shape_recapture_recommended?: boolean;
  observed_shape_recapture_view_id?: string | null;
  observed_shape_recapture_view_label?: string | null;
  observed_shape_recapture_reason?: string | null;
  observed_shape_score_scope?: string | null;
  observed_shape_target_is_goal_not_guarantee?: boolean;
  observed_shape_validation_does_not_prove_metric_scale?: boolean;

  [key: string]: unknown;
};

export type DigitalTwinPhysicalCavitySummary = {
  count: number;
  multiview_count: number;
  metric_measured_count: number;
  hidden_continuation_policy: string;
};

export type DigitalTwinOut = {
  status?: string | null;
  label?: string | null;
  evidence_status?: string | null;
  production_authorized?: boolean;
  metric_scale_solved?: boolean;
  coordinate_scale?: string | null;
  point_cloud_url?: string | null;
  mesh_url?: string | null;
  texture_url?: string | null;
  observed_surfaces?: string[];
  missing_surfaces?: string[];
  unobserved_surfaces?: string[];
  registered_cameras?: Array<Record<string, unknown>>;
  reconstruction_provider?: string | null;
  geometry_point_source?: string | null;
  warnings?: string[];

  observed_shape_validation_status?: string | null;
  observed_shape_target_iou?: number | null;
  observed_shape_target_met?: boolean;
  observed_shape_similarity_iou?: number | null;
  observed_shape_score_scope?: string | null;
  observed_shape_validation_does_not_prove_metric_scale?: boolean;
  recapture_recommended?: boolean;
  recapture_view_id?: string | null;
  recapture_view_label?: string | null;
  recapture_reason?: string | null;

  physical_cavities?: DigitalTwinPhysicalCavitySummary;

  [key: string]: unknown;
};

export type BlockAnalysis = {
  block_id?: string;
  status?: string;
  capabilities?: CapabilitiesOut;
  job: AnalysisJob | null;
  measurement: MeasurementOut | null;
  geometry: GeometryOut | null;
  defects: DefectOut | null;
  physical_cavities?: PhysicalCavitySummary | null;
  classification: ClassificationOut | null;
  cutting: CuttingOut | null;
  wastage: WastageOut | null;
  seigniorage: SeigniorageOut | null;
  reconstruction_quality?: ReconstructionQualityReport | null;
  observed_shape_validation?: ObservedShapeValidation | null;
  photo_evidence_matrix?: PhotoEvidenceItem[] | null;
  points_3d_url?: string | null;
  mesh_3d_url?: string | null;
  digital_twin?: DigitalTwinOut | null;
  verifications?: ManualVerificationOut[];
  ai_explanation?: AIExplanationOut | null;
};

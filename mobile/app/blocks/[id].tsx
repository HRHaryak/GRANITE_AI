import * as ExpoRouter from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GraniteMesh3DViewer, {
  type ObservedShapeValidation,
} from "../../components/GraniteMesh3DViewer";

type Language = "en" | "te";
type RouteParams = Record<string, string | string[] | undefined>;

type RouterRuntime = {
  useLocalSearchParams: () => RouteParams;
};

const useLocalSearchParams = (
  ExpoRouter as unknown as RouterRuntime
).useLocalSearchParams;
const router = ExpoRouter.router;

type BlockOut = {
  id: string;
  block_code: string;
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  operator_id: string;
  notes?: string | null;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
  gps_captured_at?: string | null;
};

type Quarry = {
  id: string;
  quarry_name?: string | null;
  name?: string | null;
  quarry_code?: string | null;
  lease_id?: string | null;
  district?: string | null;
  mandal?: string | null;
  village?: string | null;
};

type GraniteCategory = {
  id: string;
  code?: string | null;
  name?: string | null;
};

type DemoUser = {
  id: string;
  name: string;
  role?: string | null;
  is_active?: boolean | null;
};

type ValidationOut = {
  accepted?: boolean | null;
  rejected?: boolean | null;
  quality_score?: number | null;
  issues?: string[] | null;
  error_code?: string | null;
  error_message?: string | null;
  details?: Record<string, unknown> | null;
};

type ImageOut = {
  id: string;
  capture_session_id: string;
  capture_side?: string | null;
  accepted?: boolean | null;
  rejected?: boolean | null;
  original_filename?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  sequence_number?: number | null;
  captured_at?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_accuracy?: number | null;
  quality_score?: number | null;
  quality_warnings?: string[] | null;
  image_url?: string | null;
  validation?: ValidationOut | null;
};

type SessionOut = {
  id: string;
  block_id?: string;
  operator_id?: string;
  status?: string | null;
  calibration_type?: string | null;
  known_reference_cm?: number | null;
  marker_size_cm?: number | null;
  created_at?: string | null;
  session_metadata?: Record<string, unknown> | null;
};

type CaptureBundle = {
  session: SessionOut | null;
  images: ImageOut[];
  guidance?: Record<string, unknown> | null;
};

type AnalysisTransition = {
  from_state?: string | null;
  to_state?: string | null;
  timestamp?: string | null;
  note?: string | null;
};

type AnalysisJob = {
  id: string;
  capture_session_id: string;
  block_id: string;
  state: string;
  current_stage?: string | null;
  progress_percent?: number | null;
  failure_reason?: string | null;
  demo_simulated?: boolean | null;
  started_at?: string | null;
  completed_at?: string | null;
  transitions?: AnalysisTransition[] | null;
};

type MeasurementOut = {
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  length_uncertainty_cm?: number | null;
  breadth_uncertainty_cm?: number | null;
  height_uncertainty_cm?: number | null;
  volume_m3?: number | null;
  measurement_confidence?: number | null;
  confidence_grade?: string | null;
  analysis_method?: string | null;
  images_used?: number | null;
  calibration_method?: string | null;
  surfaces_analyzed?: string[] | null;
  cm_per_pixel?: number | null;
};

type GeometryOut = {
  point_cloud_path?: string | null;
  mesh_path?: string | null;
  reconstruction_provider?: string | null;
  reconstruction_confidence?: number | null;
  match_count?: number | null;
  point_count?: number | null;
  inlier_ratio?: number | null;
  mesh_is_watertight?: boolean | null;
  mesh_volume_m3?: number | null;
  surface_area_m2?: number | null;
  volume_status?: string | null;
  notes?: string | null;
  simplified_geometry_json?: Record<string, unknown> | null;
};

type DefectFinding = {
  id?: string | null;
  kind?: string | null;
  type?: string | null;
  category?: string | null;
  severity?: string | null;
  surface?: string | null;
  confidence?: number | null;
  visible_surface_defect?: boolean | null;
  internal_defect?: boolean | null;
  depth_mm?: number | null;
  depth_status?: string | null;
  estimated_area_cm2?: number | null;
  measurement_provenance?: string | null;
  cutting_impact?: string | null;
  cut_relevance?: string | null;
  visible_in_images?: string[] | null;
  evidence?: Array<Record<string, unknown>> | null;
};

type DefectOut = {
  provider?: string | null;
  status?: string | null;
  visible_defects?: DefectFinding[] | null;
  bottom_surface?: string | null;
  internal_defects_claimed?: boolean | null;
  error_code?: string | null;
  error_message?: string | null;
};

type CuttingStep = {
  step_number?: number | null;
  cut_name?: string | null;
  plane_axis?: string | null;
  position_cm?: number | null;
  cut_area_m2?: number | null;
  removed_volume_m3?: number | null;
  waste_category?: string | null;
  reason?: string | null;
};

type CuttingOut = {
  label?: string | null;
  solver?: string | null;
  recommended_orientation?: string | null;
  max_usable_volume_cm3?: number | null;
  usable_volume_m3?: number | null;
  usable_area_m2?: number | null;
  wastage_percentage?: number | null;
  yield_percentage?: number | null;
  pieces_estimated?: number | null;
  final_dressed_dimensions?: {
    length_cm?: number | null;
    breadth_cm?: number | null;
    height_cm?: number | null;
  } | null;
  cutting_steps?: CuttingStep[] | null;
  orientations?: Array<Record<string, unknown>> | null;
};

type WastageOut = {
  bounding_volume_m3?: number | null;
  adjusted_geometry_volume_m3?: number | null;
  irregularity_ratio?: number | null;
  max_usable_cut_volume_m3?: number | null;
  estimated_waste_volume_m3?: number | null;
  waste_percentage?: number | null;
  recovery_yield_percentage?: number | null;
  defect_exclusion_volume_m3?: number | null;
  waste_breakdown_m3?: {
    geometric_trimming_m3?: number | null;
    defect_exclusion_m3?: number | null;
    kerf_loss_m3?: number | null;
    residual_offcut_m3?: number | null;
  } | null;
};

type SeigniorageOut = {
  gangsaw_class?: string | null;
  assessment_kind?: string | null;
  volume_m3?: number | null;
  rate_per_m3?: number | null;
  indicative_amount?: number | null;
  currency?: string | null;
  density_used_t_m3?: number | null;
  estimated_tonnes?: number | null;
  notes?: string | null;
};

type ClassificationOut = {
  classification?: string | null;
  confidence?: number | null;
  provider?: string | null;
  status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};

type ReconstructionQuality = {
  valid_views_count?: number | null;
  total_views_count?: number | null;
  calibration_status?: string | null;
  calibration_method?: string | null;
  feature_match_quality?: number | null;
  silhouette_consistency?: number | null;
  overall_silhouette_iou?: number | null;
  mean_boundary_error_px?: number | null;
  mean_reprojection_error_px?: number | null;
  camera_coverage_percentage?: number | null;
  missing_surfaces?: string[] | null;
  observed_surfaces?: string[] | null;
  reconstruction_confidence?: number | null;
  metric_measurement_allowed?: boolean | null;
  metric_measurement_status?: string | null;
  status?: string | null;
  provenance?: string | null;
  registered_camera_count?: number | null;
  camera_pose_status?: string | null;
  camera_poses_available?: boolean | null;
  metric_sfm_scale_solved?: boolean | null;
  metric_scale_source?: string | null;
  calibration_evidence_status?: string | null;
  calibration_evidence_view_count?: number | null;
};

type DigitalTwinOut = {
  status?: string | null;
  label?: string | null;
  evidence_status?: string | null;
  production_authorized?: boolean | null;
  metric_scale_solved?: boolean | null;
  coordinate_scale?: string | null;
  point_cloud_url?: string | null;
  mesh_url?: string | null;
  texture_url?: string | null;
  observed_surfaces?: string[] | null;
  missing_surfaces?: string[] | null;
  unobserved_surfaces?: string[] | null;
  reconstruction_provider?: string | null;
  geometry_point_source?: string | null;
  warnings?: string[] | null;
};

type BlockAnalysis = {
  block_id?: string | null;
  status?: string | null;
  job: AnalysisJob | null;
  measurement: MeasurementOut | null;
  geometry: GeometryOut | null;
  defects: DefectOut | null;
  classification: ClassificationOut | null;
  cutting: CuttingOut | null;
  wastage: WastageOut | null;
  seigniorage: SeigniorageOut | null;
  reconstruction_quality?: ReconstructionQuality | null;
  observed_shape_validation?: ObservedShapeValidation | null;
  photo_evidence_matrix?: Array<Record<string, unknown>> | null;
  points_3d_url?: string | null;
  mesh_3d_url?: string | null;
  digital_twin?: DigitalTwinOut | null;
  ai_explanation?: Record<string, unknown> | null;
};

type VerificationOut = {
  id: string;
  job_id: string;
  block_id: string;
  officer_id: string;
  verified_length_cm: number;
  verified_breadth_cm: number;
  verified_height_cm: number;
  dimension_variance_json?: Record<string, unknown> | null;
  volume_variance_json?: Record<string, unknown> | null;
  decision: string;
  remarks?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
};

type Copy = {
  loading: string;
  back: string;
  eyebrow: string;
  unknownBlock: string;
  backendRecord: string;
  analyzedNotVerified: string;
  refresh: string;
  capture: string;
  accepted: string;
  rejected: string;
  evidence: string;
  noPhotos: string;
  imageQuality: string;
  imageEvidenceNote: string;
  analysis: string;
  noAnalysis: string;
  analysisQueued: string;
  progress: string;
  failed: string;
  retryAnalysis: string;
  retrying: string;
  failureReason: string;
  measurements: string;
  measurementUnavailable: string;
  length: string;
  breadth: string;
  height: string;
  volume: string;
  uncertainty: string;
  confidence: string;
  method: string;
  calibration: string;
  reconstruction: string;
  provider: string;
  points: string;
  matches: string;
  surfaceArea: string;
  watertight: string;
  metricScale: string;
  cameraPoses: string;
  observed: string;
  unobserved: string;
  noSurfaceEvidence: string;
  twin: string;
  twinAvailable: string;
  twinUnavailable: string;
  twinTruth: string;
  defects: string;
  noDefects: string;
  noDefectAnalysis: string;
  visibleOnly: string;
  internalWarning: string;
  classification: string;
  cutting: string;
  noCutting: string;
  orientation: string;
  yield: string;
  waste: string;
  usableVolume: string;
  pieces: string;
  finalDimensions: string;
  removed: string;
  reason: string;
  wastage: string;
  noWastage: string;
  irregularity: string;
  estimatedWaste: string;
  recovery: string;
  seigniorage: string;
  noSeigniorage: string;
  indicativeOnly: string;
  rate: string;
  amount: string;
  tonnes: string;
  gangsaw: string;
  verification: string;
  noVerification: string;
  physicallyVerified: string;
  verificationTruth: string;
  timeline: string;
  noTimeline: string;
  quarry: string;
  granite: string;
  operator: string;
  capturedOn: string;
  gps: string;
  lease: string;
  session: string;
  yes: string;
  no: string;
  notReported: string;
  demoWarning: string;
  errorTitle: string;
  retry: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    loading: "Loading real block evidence…",
    back: "Back",
    eyebrow: "BLOCK EVIDENCE / MOBILE",
    unknownBlock: "Granite block",
    backendRecord: "Backend record",
    analyzedNotVerified: "ANALYZED is an AI pipeline state. It is not the same as physically VERIFIED.",
    refresh: "Refresh",
    capture: "Capture evidence",
    accepted: "Accepted",
    rejected: "Rejected",
    evidence: "Photo evidence",
    noPhotos: "No capture images are available for this block.",
    imageQuality: "Quality",
    imageEvidenceNote: "These are the actual uploaded capture images returned by the backend. Repeated photos do not prove additional surfaces.",
    analysis: "Analysis state",
    noAnalysis: "No analysis job exists for this block yet.",
    analysisQueued: "Analysis is still running. This page polls the real backend state.",
    progress: "Progress",
    failed: "Analysis failed",
    retryAnalysis: "Run analysis again",
    retrying: "Submitting…",
    failureReason: "Failure reason",
    measurements: "Metric measurements",
    measurementUnavailable: "Metric dimensions are not reported. The UI will not infer values from photos or a placeholder model.",
    length: "Length",
    breadth: "Breadth",
    height: "Height",
    volume: "Raw volume",
    uncertainty: "Uncertainty",
    confidence: "Confidence",
    method: "Method",
    calibration: "Calibration",
    reconstruction: "Reconstruction evidence",
    provider: "Provider",
    points: "3D points",
    matches: "Matches",
    surfaceArea: "Surface area",
    watertight: "Watertight mesh",
    metricScale: "Metric scale",
    cameraPoses: "Registered cameras",
    observed: "Observed surfaces",
    unobserved: "Unobserved / missing surfaces",
    noSurfaceEvidence: "Surface coverage was not reported by reconstruction.",
    twin: "Digital twin evidence",
    twinAvailable: "Backend 3D artifact reported",
    twinUnavailable: "No backend 3D artifact reported",
    twinTruth: "The mobile UI does not substitute a generic cube. Interactive 3D should render only the point cloud or mesh produced for this exact block.",
    defects: "Visible defect findings",
    noDefects: "No visible defects were reported by the backend.",
    noDefectAnalysis: "Defect analysis is not available for this job.",
    visibleOnly: "Photo-visible evidence only",
    internalWarning: "Internal defects are not inferred unless the backend has direct supporting evidence.",
    classification: "Granite classification",
    cutting: "Cutting & dressing",
    noCutting: "No evidence-grounded cutting result is available.",
    orientation: "Recommended orientation",
    yield: "Recovery yield",
    waste: "Waste",
    usableVolume: "Usable volume",
    pieces: "Estimated pieces",
    finalDimensions: "Final dressed dimensions",
    removed: "Material removed",
    reason: "Why this cut",
    wastage: "Wastage analysis",
    noWastage: "Wastage values were not calculated for this analysis.",
    irregularity: "Irregularity ratio",
    estimatedWaste: "Estimated waste volume",
    recovery: "Recovery",
    seigniorage: "Indicative seigniorage",
    noSeigniorage: "No seigniorage assessment was returned.",
    indicativeOnly: "AI-assisted indicative assessment only. Official physical inspection and the applicable government assessment remain authoritative.",
    rate: "Rate / m³",
    amount: "Indicative amount",
    tonnes: "Estimated tonnes",
    gangsaw: "Gangsaw class",
    verification: "Physical verification",
    noVerification: "No officer physical verification has been recorded.",
    physicallyVerified: "Physical verification recorded",
    verificationTruth: "Verification history is kept separate from AI analysis status.",
    timeline: "Analysis timeline",
    noTimeline: "No job transitions were returned.",
    quarry: "Quarry",
    granite: "Granite",
    operator: "Operator",
    capturedOn: "Captured",
    gps: "GPS",
    lease: "Lease",
    session: "Session",
    yes: "Yes",
    no: "No",
    notReported: "Not reported",
    demoWarning: "The backend marked this job as DEMO / SIMULATED. Do not treat these results as production evidence.",
    errorTitle: "Unable to load block evidence",
    retry: "Retry",
  },
  te: {
    loading: "నిజమైన బ్లాక్ ఆధారాలు లోడ్ అవుతున్నాయి…",
    back: "వెనుకకు",
    eyebrow: "బ్లాక్ ఆధారాలు / మొబైల్",
    unknownBlock: "గ్రానైట్ బ్లాక్",
    backendRecord: "బ్యాక్‌ఎండ్ రికార్డ్",
    analyzedNotVerified: "ANALYZED అనేది AI పైప్‌లైన్ స్థితి మాత్రమే. అది భౌతికంగా VERIFIED అన్నది కాదు.",
    refresh: "రిఫ్రెష్",
    capture: "క్యాప్చర్ ఆధారాలు",
    accepted: "ఆమోదించబడింది",
    rejected: "తిరస్కరించబడింది",
    evidence: "ఫోటో ఆధారాలు",
    noPhotos: "ఈ బ్లాక్‌కు క్యాప్చర్ చిత్రాలు లభ్యం కావు.",
    imageQuality: "నాణ్యత",
    imageEvidenceNote: "ఇవి బ్యాక్‌ఎండ్ ఇచ్చిన అసలు అప్‌లోడ్ చేసిన క్యాప్చర్ చిత్రాలు. ఒకే విధమైన పునరావృత ఫోటోలు కొత్త ఉపరితలాన్ని నిరూపించవు.",
    analysis: "విశ్లేషణ స్థితి",
    noAnalysis: "ఈ బ్లాక్‌కు ఇంకా విశ్లేషణ జాబ్ లేదు.",
    analysisQueued: "విశ్లేషణ కొనసాగుతోంది. ఈ పేజీ నిజమైన బ్యాక్‌ఎండ్ స్థితిని పోలింగ్ చేస్తుంది.",
    progress: "పురోగతి",
    failed: "విశ్లేషణ విఫలమైంది",
    retryAnalysis: "మళ్లీ విశ్లేషించు",
    retrying: "సమర్పిస్తోంది…",
    failureReason: "విఫలమైన కారణం",
    measurements: "మెట్రిక్ కొలతలు",
    measurementUnavailable: "మెట్రిక్ కొలతలు నివేదించబడలేదు. ఫోటోలు లేదా డమ్మీ మోడల్ ఆధారంగా విలువలు ఊహించబడవు.",
    length: "పొడవు",
    breadth: "వెడల్పు",
    height: "ఎత్తు",
    volume: "ముడి పరిమాణం",
    uncertainty: "అనిశ్చితి",
    confidence: "నమ్మక స్థాయి",
    method: "పద్ధతి",
    calibration: "క్యాలిబ్రేషన్",
    reconstruction: "పునర్నిర్మాణ ఆధారాలు",
    provider: "ప్రొవైడర్",
    points: "3D పాయింట్లు",
    matches: "మ్యాచ్‌లు",
    surfaceArea: "ఉపరితల విస్తీర్ణం",
    watertight: "వాటర్‌టైట్ మెష్",
    metricScale: "మెట్రిక్ స్కేల్",
    cameraPoses: "రిజిస్టర్ కెమెరాలు",
    observed: "పరిశీలించిన ఉపరితలాలు",
    unobserved: "పరిశీలించని / మిస్సింగ్ ఉపరితలాలు",
    noSurfaceEvidence: "ఉపరితల కవరేజ్ పునర్నిర్మాణంలో నివేదించబడలేదు.",
    twin: "డిజిటల్ ట్విన్ ఆధారాలు",
    twinAvailable: "బ్యాక్‌ఎండ్ 3D ఆర్టిఫాక్ట్ లభ్యం",
    twinUnavailable: "బ్యాక్‌ఎండ్ 3D ఆర్టిఫాక్ట్ లేదు",
    twinTruth: "మొబైల్ UI సాధారణ క్యూబ్‌ను చూపదు. ఇంటరాక్టివ్ 3D ఈ బ్లాక్‌కు తయారైన నిజమైన పాయింట్ క్లౌడ్ లేదా మెష్‌ను మాత్రమే చూపాలి.",
    defects: "కనిపించే లోపాల ఆధారాలు",
    noDefects: "బ్యాక్‌ఎండ్ ఎటువంటి కనిపించే లోపాలను నివేదించలేదు.",
    noDefectAnalysis: "ఈ జాబ్‌కు లోప విశ్లేషణ లభ్యం కాదు.",
    visibleOnly: "ఫోటోలో కనిపించిన ఆధారాలు మాత్రమే",
    internalWarning: "నేరుగా ఆధారం లేకపోతే అంతర్గత లోపాలను ఊహించరు.",
    classification: "గ్రానైట్ వర్గీకరణ",
    cutting: "కట్టింగ్ & డ్రెస్సింగ్",
    noCutting: "ఆధారాలతో కూడిన కట్టింగ్ ఫలితం లభ్యం కాదు.",
    orientation: "సిఫార్సు చేసిన దిశ",
    yield: "రికవరీ యీల్డ్",
    waste: "వ్యర్థం",
    usableVolume: "ఉపయోగించగల పరిమాణం",
    pieces: "అంచనా ముక్కలు",
    finalDimensions: "చివరి డ్రెస్డ్ కొలతలు",
    removed: "తొలగించిన పదార్థం",
    reason: "ఈ కట్ ఎందుకు",
    wastage: "వ్యర్థ విశ్లేషణ",
    noWastage: "ఈ విశ్లేషణకు వ్యర్థ విలువలు లెక్కించబడలేదు.",
    irregularity: "అసమానత నిష్పత్తి",
    estimatedWaste: "అంచనా వ్యర్థ పరిమాణం",
    recovery: "రికవరీ",
    seigniorage: "సూచనాత్మక సీనియరేజ్",
    noSeigniorage: "సీనియరేజ్ అంచనా లభ్యం కాలేదు.",
    indicativeOnly: "ఇది AI సహాయంతో ఇచ్చే సూచనాత్మక అంచనా మాత్రమే. అధికారిక భౌతిక పరిశీలన మరియు ప్రభుత్వ అంచనా ప్రామాణికం.",
    rate: "రేటు / m³",
    amount: "సూచనాత్మక మొత్తం",
    tonnes: "అంచనా టన్నులు",
    gangsaw: "గ్యాంగ్‌సా క్లాస్",
    verification: "భౌతిక ధృవీకరణ",
    noVerification: "అధికారి భౌతిక ధృవీకరణ ఇంకా నమోదు కాలేదు.",
    physicallyVerified: "భౌతిక ధృవీకరణ నమోదు అయింది",
    verificationTruth: "భౌతిక ధృవీకరణను AI విశ్లేషణ స్థితి నుండి వేరుగా చూపిస్తాము.",
    timeline: "విశ్లేషణ టైమ్‌లైన్",
    noTimeline: "జాబ్ ట్రాన్సిషన్లు లభ్యం కాలేదు.",
    quarry: "క్వారీ",
    granite: "గ్రానైట్",
    operator: "ఆపరేటర్",
    capturedOn: "క్యాప్చర్",
    gps: "GPS",
    lease: "లీజ్",
    session: "సెషన్",
    yes: "అవును",
    no: "కాదు",
    notReported: "నివేదించబడలేదు",
    demoWarning: "బ్యాక్‌ఎండ్ ఈ జాబ్‌ను DEMO / SIMULATED గా గుర్తించింది. దీనిని ప్రొడక్షన్ ఆధారంగా పరిగణించవద్దు.",
    errorTitle: "బ్లాక్ ఆధారాలను లోడ్ చేయలేకపోయాము",
    retry: "మళ్లీ ప్రయత్నించు",
  },
};

const LANGUAGE_KEY = "granitemeasure.mobile.language";
const SELECTED_USER_KEY = "granitemeasure.mobile.selectedUserId";

const RAW_API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.trim() || "http://127.0.0.1:8000";
const SERVER_ROOT = RAW_API_BASE.replace(/\/api\/v1\/?$/i, "").replace(/\/+$/, "");
const API_ROOT = `${SERVER_ROOT}/api/v1`;

const ACTIVE_JOB_STATES = new Set([
  "CREATED",
  "QUEUED",
  "RUNNING",
  "PROCESSING",
  "ANALYZING",
  "IN_PROGRESS",
]);

export default function BlockDetailScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width <= 390;

  const blockId = firstParam(params.id);
  const routeAnalysisJobId = firstParam(params.analysisJobId);

  const [language, setLanguage] = useState<Language>("te");
  const copy = COPY[language];

  const [block, setBlock] = useState<BlockOut | null>(null);
  const [capture, setCapture] = useState<CaptureBundle>({ session: null, images: [] });
  const [analysis, setAnalysis] = useState<BlockAnalysis | null>(null);
  const [verifications, setVerifications] = useState<VerificationOut[]>([]);
  const [quarries, setQuarries] = useState<Quarry[]>([]);
  const [categories, setCategories] = useState<GraniteCategory[]>([]);
  const [users, setUsers] = useState<DemoUser[]>([]);

  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollBusyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    void SecureStore.getItemAsync(LANGUAGE_KEY)
      .then((saved) => {
        if (mountedRef.current && (saved === "en" || saved === "te")) {
          setLanguage(saved);
        }
      })
      .catch(() => undefined);

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadReferenceData = useCallback(async () => {
    const [quarryResult, categoryResult, userResult] = await Promise.all([
      requestJson<Quarry[]>("/quarries").catch(() => []),
      requestJson<GraniteCategory[]>("/granite-categories").catch(() => []),
      requestJson<DemoUser[]>("/demo-users").catch(() => []),
    ]);

    if (!mountedRef.current) return;
    setQuarries(Array.isArray(quarryResult) ? quarryResult : []);
    setCategories(Array.isArray(categoryResult) ? categoryResult : []);
    setUsers(Array.isArray(userResult) ? userResult : []);
  }, []);

  const loadPrimary = useCallback(
    async (refresh = false) => {
      if (!blockId) {
        setLoading(false);
        setError("Missing block id in route.");
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [blockResult, captureResult, analysisResult, verificationResult] =
          await Promise.all([
            requestJson<BlockOut>(`/granite-blocks/${encodeURIComponent(blockId)}`),
            requestJson<CaptureBundle>(
              `/granite-blocks/${encodeURIComponent(blockId)}/capture`,
            ).catch(() => ({ session: null, images: [] })),
            requestJson<BlockAnalysis>(
              `/granite-blocks/${encodeURIComponent(blockId)}/analysis?language=${language}`,
            ),
            requestJson<VerificationOut[]>(
              `/granite-blocks/${encodeURIComponent(blockId)}/verification`,
            ).catch(() => []),
          ]);

        if (!mountedRef.current) return;
        setBlock(blockResult);
        setCapture(normalizeCapture(captureResult));
        setAnalysis(analysisResult);
        setVerifications(Array.isArray(verificationResult) ? verificationResult : []);

        const firstImage = normalizeCapture(captureResult).images[0];
        setSelectedPhotoId((current) => current || firstImage?.id || null);
      } catch (cause) {
        if (mountedRef.current) setError(errorMessage(cause));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [blockId, language],
  );

  const refreshAnalysisOnly = useCallback(async () => {
    if (!blockId || pollBusyRef.current) return;
    pollBusyRef.current = true;

    try {
      const exactJobId = routeAnalysisJobId || analysis?.job?.id || "";
      const [analysisResult, jobResult] = await Promise.all([
        requestJson<BlockAnalysis>(
          `/granite-blocks/${encodeURIComponent(blockId)}/analysis?language=${language}`,
          { timeoutMs: 12_000 },
        ),
        exactJobId
          ? requestJson<AnalysisJob>(
              `/analysis-jobs/${encodeURIComponent(exactJobId)}`,
              { timeoutMs: 12_000 },
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (!mountedRef.current) return;
      if (jobResult && analysisResult.job?.id === jobResult.id) {
        analysisResult.job = jobResult;
      }
      setAnalysis(analysisResult);

      const state = (analysisResult.job?.state || jobResult?.state || "").toUpperCase();
      if (state === "COMPLETED" || state === "FAILED") {
        const [blockResult, verificationResult] = await Promise.all([
          requestJson<BlockOut>(`/granite-blocks/${encodeURIComponent(blockId)}`).catch(
            () => null,
          ),
          requestJson<VerificationOut[]>(
            `/granite-blocks/${encodeURIComponent(blockId)}/verification`,
          ).catch(() => []),
        ]);
        if (mountedRef.current && blockResult) setBlock(blockResult);
        if (mountedRef.current) setVerifications(verificationResult);
      }
    } catch {
      // Keep the last known dossier during transient polling failures.
    } finally {
      pollBusyRef.current = false;
    }
  }, [analysis?.job?.id, blockId, language, routeAnalysisJobId]);

  useEffect(() => {
    void loadPrimary();
    void loadReferenceData();
  }, [loadPrimary, loadReferenceData]);

  const jobState = (analysis?.job?.state || "").toUpperCase();
  const shouldPoll = Boolean(
    analysis?.job &&
      jobState !== "COMPLETED" &&
      jobState !== "FAILED" &&
      (ACTIVE_JOB_STATES.has(jobState) || jobState.length > 0),
  );

  useEffect(() => {
    if (!shouldPoll) return undefined;
    const poll = setInterval(() => {
      void refreshAnalysisOnly();
    }, 3500);
    return () => clearInterval(poll);
  }, [refreshAnalysisOnly, shouldPoll]);

  const toggleLanguage = useCallback(() => {
    const next: Language = language === "en" ? "te" : "en";
    setLanguage(next);
    void SecureStore.setItemAsync(LANGUAGE_KEY, next).catch(() => undefined);
  }, [language]);

  const rerunAnalysis = useCallback(async () => {
    const sessionId = capture.session?.id;
    if (!sessionId || retryingAnalysis) return;

    setRetryingAnalysis(true);
    setError(null);
    try {
      const job = await requestJson<AnalysisJob>("/analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_session_id: sessionId }),
      });
      if (!mountedRef.current) return;
      setAnalysis((current) => ({
        block_id: blockId,
        status: current?.status || block?.status || null,
        job,
        // A rerun is a new evidence computation. Never pair the new running job
        // with measurements, geometry, defects, cutting or assessments from an
        // older completed/failed job while the latest dossier is still pending.
        measurement: null,
        geometry: null,
        defects: null,
        classification: null,
        cutting: null,
        wastage: null,
        seigniorage: null,
        reconstruction_quality: null,
        photo_evidence_matrix: null,
        points_3d_url: null,
        mesh_3d_url: null,
        digital_twin: null,
        ai_explanation: null,
      }));
      void refreshAnalysisOnly();
    } catch (cause) {
      if (mountedRef.current) setError(errorMessage(cause));
    } finally {
      if (mountedRef.current) setRetryingAnalysis(false);
    }
  }, [block?.status, blockId, capture.session?.id, refreshAnalysisOnly, retryingAnalysis]);

  const quarryMap = useMemo(
    () => new Map(quarries.map((item) => [item.id, item])),
    [quarries],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((item) => [item.id, item])),
    [categories],
  );
  const userMap = useMemo(
    () => new Map(users.map((item) => [item.id, item])),
    [users],
  );

  const quarry = block ? quarryMap.get(block.quarry_id) : undefined;
  const category = block ? categoryMap.get(block.granite_category_id) : undefined;
  const operator = block ? userMap.get(block.operator_id) : undefined;
  const job = analysis?.job || null;
  const measurement = analysis?.measurement || null;
  const geometry = analysis?.geometry || null;
  const defects = analysis?.defects || null;
  const cutting = analysis?.cutting || null;
  const wastage = analysis?.wastage || null;
  const seigniorage = analysis?.seigniorage || null;
  const reconstructionQuality = analysis?.reconstruction_quality || null;
  const digitalTwin = analysis?.digital_twin || null;
  const shapeValidation = analysis?.observed_shape_validation || null;
  const mesh3DUrl = analysis?.mesh_3d_url
    ? assetUrl(analysis.mesh_3d_url)
    : digitalTwin?.mesh_url
      ? assetUrl(digitalTwin.mesh_url)
      : null;
  const points3DUrl = analysis?.points_3d_url
    ? assetUrl(analysis.points_3d_url)
    : digitalTwin?.point_cloud_url
      ? assetUrl(digitalTwin.point_cloud_url)
      : null;

  const selectedPhoto =
    capture.images.find((item) => item.id === selectedPhotoId) ||
    capture.images[0] ||
    null;

  const selectedPhotoEvidence = useMemo(
    () =>
      findPhotoEvidenceForImage(
        analysis?.photo_evidence_matrix,
        selectedPhoto,
      ),
    [
      analysis?.photo_evidence_matrix,
      selectedPhoto,
    ],
  );

  const selectedPhotoHasPose =
    hasRegisteredPhotoPose(
      selectedPhotoEvidence,
    );

  const selectedPhotoIoU =
    finiteRecordNumber(
      selectedPhotoEvidence,
      "silhouette_iou",
    );

  const acceptedCount = capture.images.filter(
    (item) => item.accepted === true || item.validation?.accepted === true,
  ).length;
  const rejectedCount = capture.images.filter(
    (item) => item.rejected === true || item.validation?.rejected === true,
  ).length;

  const observedSurfaces = useMemo(
    () =>
      uniqueStrings([
        ...(reconstructionQuality?.observed_surfaces || []),
        ...(digitalTwin?.observed_surfaces || []),
        ...(measurement?.surfaces_analyzed || []),
      ]),
    [digitalTwin?.observed_surfaces, measurement?.surfaces_analyzed, reconstructionQuality?.observed_surfaces],
  );
  const unobservedSurfaces = useMemo(
    () =>
      uniqueStrings([
        ...(reconstructionQuality?.missing_surfaces || []),
        ...(digitalTwin?.missing_surfaces || []),
        ...(digitalTwin?.unobserved_surfaces || []),
      ]),
    [digitalTwin?.missing_surfaces, digitalTwin?.unobserved_surfaces, reconstructionQuality?.missing_surfaces],
  );

  const hasReal3DArtifact = Boolean(
    mesh3DUrl ||
      points3DUrl ||
      geometry?.point_cloud_path ||
      geometry?.mesh_path,
  );

  const progress = clampPercent(job?.progress_percent);
  const visibleDefects = Array.isArray(defects?.visible_defects)
    ? defects.visible_defects
    : [];
  const latestVerification = verifications[0] || null;

  // GRANITE_BLOCK_DETAIL_DECISION_COCKPIT_V2
  // Summary values below come only from existing backend analysis fields.
  const metricScaleProven =
    reconstructionQuality?.metric_measurement_allowed === true ||
    reconstructionQuality?.metric_sfm_scale_solved === true ||
    digitalTwin?.metric_scale_solved === true;

  const observedShapeScore =
    isFiniteNumber(shapeValidation?.overall_silhouette_iou)
      ? shapeValidation.overall_silhouette_iou
      : isFiniteNumber(reconstructionQuality?.overall_silhouette_iou)
        ? reconstructionQuality.overall_silhouette_iou
        : null;

  const observedShapeTarget =
    isFiniteNumber(shapeValidation?.target_iou)
      ? shapeValidation.target_iou
      : 0.9;

  const shapeTargetMet =
    shapeValidation?.target_met === true;

  const recoveryPercent =
    isFiniteNumber(cutting?.yield_percentage)
      ? cutting.yield_percentage
      : isFiniteNumber(wastage?.recovery_yield_percentage)
        ? wastage.recovery_yield_percentage
        : null;

  const recaptureView =
    shapeValidation?.recapture_recommended === true
      ? (
          shapeValidation.recapture_view_label ||
          shapeValidation.recapture_view_id ||
          shapeValidation.weak_view_ids?.[0] ||
          ""
        )
      : "";

  const physicalVerified =
    Boolean(latestVerification);

  const measurementDecisionText =
    hasAnyMeasurement(measurement) && metricScaleProven
      ? language === "te"
        ? "మెట్రిక్ కొలతలు సిద్ధం"
        : "Metric measurements ready"
      : hasAnyMeasurement(measurement)
        ? language === "te"
          ? "కొలతలు ఉన్నాయి · స్కేల్ స్థితి చూడండి"
          : "Measurements present · check scale status"
        : language === "te"
          ? "ఇంకా నిర్ధారించలేదు"
          : "Not yet proven";

  const twinDecisionText =
    hasReal3DArtifact
      ? language === "te"
        ? "నిజమైన 3D ఆర్టిఫాక్ట్ ఉంది"
        : "Real 3D artifact available"
      : language === "te"
        ? "3D ఆర్టిఫాక్ట్ ఇంకా లేదు"
        : "3D artifact unavailable";

  const shapeDecisionText =
    shapeTargetMet
      ? `${formatPercent01(observedShapeScore)} ${
          language === "te" ? "ధృవీకరించబడింది" : "validated"
        }`
      : observedShapeScore !== null
        ? `${formatPercent01(observedShapeScore)} · ${
            language === "te" ? "లక్ష్యం" : "target"
          } ${formatPercent01(observedShapeTarget)}`
        : language === "te"
          ? "90% లక్ష్యం · ఇంకా ధృవీకరణ లేదు"
          : "90% target · not yet validated";

  const recoveryDecisionText =
    recoveryPercent !== null
      ? formatPercent100(recoveryPercent)
      : language === "te"
        ? "లెక్కించబడలేదు"
        : "Not calculated";

  if (loading && !block && !analysis) {
    return (
      <View style={styles.loadingScreen}>
        <AmbientBackground />
        <ActivityIndicator color="#15949B" size="large" />
        <Text style={styles.loadingText}>{copy.loading}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AmbientBackground />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPrimary(true)}
            tintColor="#15949B"
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 10, 22),
            paddingBottom: Math.max(insets.bottom + 44, 74),
          },
        ]}
      >
        <Animated.View entering={FadeInDown.duration(350)} style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>{copy.back}</Text>
          </Pressable>

          <View style={styles.topActions}>
            <Pressable
              onPress={() => void loadPrimary(true)}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
            >
              <Text style={styles.ghostText}>{copy.refresh}</Text>
            </Pressable>
            <Pressable
              onPress={toggleLanguage}
              style={({ pressed }) => [styles.languageButton, pressed && styles.pressed]}
            >
              <Text style={styles.languageText}>
                {language === "en" ? "EN / తెలుగు" : "తెలుగు / EN"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).duration(360)} style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroTitleWrap}>
              <Text numberOfLines={1} style={styles.blockCode}>
                {block?.block_code || copy.unknownBlock}
              </Text>
              <Text numberOfLines={1} style={styles.blockIdText}>
                {block?.id || blockId || "—"}
              </Text>
            </View>
            <StatusPill status={block?.status || analysis?.status || "UNKNOWN"} />
          </View>

          <View style={[styles.metaGrid, compact && styles.metaGridCompact]}>
            <MetaCell label={copy.quarry} value={quarryName(quarry)} />
            <MetaCell label={copy.granite} value={categoryName(category)} />
            <MetaCell label={copy.operator} value={operator?.name || block?.operator_id || copy.notReported} />
            <MetaCell label={copy.capturedOn} value={formatDateTime(block?.capture_date, language)} />
            <MetaCell label={copy.lease} value={quarry?.lease_id || copy.notReported} />
            <MetaCell label={copy.gps} value={gpsText(block, copy.notReported)} />
          </View>

          <View style={styles.truthRail}>
            <Text style={styles.truthMark}>i</Text>
            <Text style={styles.truthText}>{copy.analyzedNotVerified}</Text>
          </View>
        </Animated.View>

        {/* GRANITE_MOBILE_AI_ENTRY_V1 */}
        <Animated.View
          entering={FadeInDown.delay(70).duration(340)}
          style={styles.aiAssistantEntry}
        >
          <Pressable
            onPress={() => {
              if (!blockId) return;
              const code = block?.block_code || "";
              router.push(
                `/ai-assistant?blockId=${encodeURIComponent(blockId)}&blockCode=${encodeURIComponent(code)}`,
              );
            }}
            style={({ pressed }) => [
              styles.aiAssistantEntryPress,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.aiAssistantOrb}>
              <Text style={styles.aiAssistantOrbText}>AI</Text>
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.aiAssistantEyebrow}>
                {language === "te" ? "తెలుగు వాయిస్ AI" : "GRANITE VOICE AI"}
              </Text>
              <Text style={styles.aiAssistantTitle}>
                {language === "te"
                  ? "ఈ బ్లాక్ గురించి మాట్లాడి అడగండి"
                  : "Talk to AI about this block"}
              </Text>
              <Text style={styles.aiAssistantSubtitle}>
                {language === "te"
                  ? "కొలతలు · 3D · లోపాలు · కట్టింగ్ · వేస్టేజ్"
                  : "Measurements · 3D · defects · cutting · wastage"}
              </Text>
            </View>
            <Text style={styles.aiAssistantArrow}>›</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(105).duration(360)}
          style={styles.decisionCockpit}
        >
          <View pointerEvents="none" style={styles.decisionCockpitGlow} />

          <View style={styles.decisionCockpitHeader}>
            <View style={styles.flexOne}>
              <Text style={styles.decisionCockpitEyebrow}>
                {language === "te"
                  ? "AI నిర్ణయ సారాంశం"
                  : "AI DECISION SNAPSHOT"}
              </Text>
              <Text style={styles.decisionCockpitTitle}>
                {language === "te"
                  ? "ఈ బ్లాక్ ప్రస్తుతం ఏ స్థితిలో ఉంది?"
                  : "What is actually ready for this block?"}
              </Text>
              <Text style={styles.decisionCockpitSubtitle}>
                {language === "te"
                  ? "బ్యాక్‌ఎండ్‌లో ఉన్న నిజమైన ఆధారాల నుంచే ఈ సారాంశం."
                  : "This summary is derived only from evidence currently returned by the backend."}
              </Text>
            </View>

            <View
              style={[
                styles.decisionTruthBadge,
                physicalVerified && styles.decisionTruthBadgeVerified,
              ]}
            >
              <View
                style={[
                  styles.decisionTruthDot,
                  physicalVerified && styles.decisionTruthDotVerified,
                ]}
              />
              <Text
                style={[
                  styles.decisionTruthText,
                  physicalVerified && styles.decisionTruthTextVerified,
                ]}
              >
                {physicalVerified
                  ? language === "te"
                    ? "భౌతికంగా ధృవీకరించబడింది"
                    : "PHYSICALLY VERIFIED"
                  : language === "te"
                    ? "AI విశ్లేషణ మాత్రమే"
                    : "AI ANALYSIS ONLY"}
              </Text>
            </View>
          </View>

          <View style={styles.decisionCockpitGrid}>
            <View style={styles.decisionCockpitCell}>
              <View style={styles.decisionCockpitIcon}>
                <Text style={styles.decisionCockpitIconText}>L×B×H</Text>
              </View>
              <Text style={styles.decisionCockpitLabel}>
                {language === "te" ? "కొలతలు" : "MEASUREMENTS"}
              </Text>
              <Text numberOfLines={2} style={styles.decisionCockpitValue}>
                {measurementDecisionText}
              </Text>
              <Text style={styles.decisionCockpitMeta}>
                {metricScaleProven
                  ? language === "te"
                    ? "మెట్రిక్ స్కేల్ నిర్ధారితం"
                    : "Metric scale proven"
                  : language === "te"
                    ? "మెట్రిక్ స్కేల్ నిర్ధారణ చూడండి"
                    : "Metric scale proof required"}
              </Text>
            </View>

            <View style={styles.decisionCockpitCell}>
              <View style={styles.decisionCockpitIcon}>
                <Text style={styles.decisionCockpitIconText}>3D</Text>
              </View>
              <Text style={styles.decisionCockpitLabel}>
                {language === "te" ? "3D ఆధారం" : "3D EVIDENCE"}
              </Text>
              <Text numberOfLines={2} style={styles.decisionCockpitValue}>
                {twinDecisionText}
              </Text>
              <Text style={styles.decisionCockpitMeta}>
                {language === "te"
                  ? `${observedSurfaces.length} పరిశీలించిన ఉపరితలాలు`
                  : `${observedSurfaces.length} observed surfaces`}
              </Text>
            </View>

            <View
              style={[
                styles.decisionCockpitCell,
                !shapeTargetMet && styles.decisionCockpitCellAttention,
              ]}
            >
              <View style={styles.decisionCockpitIcon}>
                <Text style={styles.decisionCockpitIconText}>◎</Text>
              </View>
              <Text style={styles.decisionCockpitLabel}>
                {language === "te" ? "షేప్ వాలిడేషన్" : "SHAPE VALIDATION"}
              </Text>
              <Text numberOfLines={2} style={styles.decisionCockpitValue}>
                {shapeDecisionText}
              </Text>
              <Text style={styles.decisionCockpitMeta}>
                {shapeTargetMet
                  ? language === "te"
                    ? "పరిశీలించిన వీక్షణల లక్ష్యం చేరింది"
                    : "Observed-view target met"
                  : language === "te"
                    ? "90% ను విజయంగా చూపడం లేదు"
                    : "90% is not shown as achieved"}
              </Text>
            </View>

            <View style={styles.decisionCockpitCell}>
              <View style={styles.decisionCockpitIcon}>
                <Text style={styles.decisionCockpitIconText}>%</Text>
              </View>
              <Text style={styles.decisionCockpitLabel}>
                {language === "te" ? "రికవరీ" : "RECOVERY"}
              </Text>
              <Text numberOfLines={2} style={styles.decisionCockpitValue}>
                {recoveryDecisionText}
              </Text>
              <Text style={styles.decisionCockpitMeta}>
                {language === "te"
                  ? `${visibleDefects.length} కనిపించే లోపాలు`
                  : `${visibleDefects.length} visible defects`}
              </Text>
            </View>
          </View>

          {unobservedSurfaces.length > 0 || recaptureView ? (
            <View style={styles.decisionAttentionRail}>
              <View style={styles.decisionAttentionIcon}>
                <Text style={styles.decisionAttentionIconText}>!</Text>
              </View>

              <View style={styles.flexOne}>
                <Text style={styles.decisionAttentionTitle}>
                  {recaptureView
                    ? language === "te"
                      ? "మరొక ఫోటో అవసరం"
                      : "Recapture recommended"
                    : language === "te"
                      ? "పరిశీలించని ఉపరితలాలు ఉన్నాయి"
                      : "Unobserved surfaces remain"}
                </Text>

                <Text style={styles.decisionAttentionText}>
                  {recaptureView
                    ? language === "te"
                      ? `${recaptureView} దృశ్యాన్ని మళ్లీ క్యాప్చర్ చేయండి. కనిపించని భాగాన్ని AI తయారు చేయదు.`
                      : `Recapture ${recaptureView}. The AI will not fabricate an unseen surface.`
                    : language === "te"
                      ? `${unobservedSurfaces.join(", ")} ఇంకా UNKNOWN / UNOBSERVED గా ఉంచబడతాయి.`
                      : `${unobservedSurfaces.join(", ")} remain UNKNOWN / UNOBSERVED.`}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.decisionSafeRail}>
              <View style={styles.decisionSafeDot} />
              <Text style={styles.decisionSafeText}>
                {language === "te"
                  ? "ప్రస్తుతం బ్యాక్‌ఎండ్ అదనపు రీక్యాప్చర్ హెచ్చరికను నివేదించలేదు."
                  : "The backend currently reports no additional recapture warning."}
              </Text>
            </View>
          )}
        </Animated.View>

        {error ? (
          <Animated.View entering={FadeInDown.duration(280)} style={styles.errorCard}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.errorTitle}>{copy.errorTitle}</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              onPress={() => void loadPrimary(true)}
              style={({ pressed }) => [styles.smallRetry, pressed && styles.pressed]}
            >
              <Text style={styles.smallRetryText}>{copy.retry}</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <Section index="01" title={copy.analysis} delay={80}>
          {job ? (
            <View style={styles.analysisCard}>
              <View style={styles.analysisTopRow}>
                <View style={styles.flexOne}>
                  <Text style={styles.analysisStage}>
                    {job.current_stage || job.state || copy.backendRecord}
                  </Text>
                  <Text style={styles.analysisJobId}>JOB · {job.id}</Text>
                </View>
                <StatusPill status={job.state} compact />
              </View>

              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>{copy.progress}</Text>
                <Text style={styles.progressValue}>
                  {progress === null ? "—" : `${Math.round(progress)}%`}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress === null ? 0 : progress}%` },
                  ]}
                />
              </View>

              {shouldPoll ? (
                <View style={styles.liveRail}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{copy.analysisQueued}</Text>
                </View>
              ) : null}

              {job.demo_simulated ? (
                <View style={styles.demoWarning}>
                  <Text style={styles.demoWarningText}>{copy.demoWarning}</Text>
                </View>
              ) : null}

              {job.state.toUpperCase() === "FAILED" ? (
                <View style={styles.failureCard}>
                  <Text style={styles.failureTitle}>{copy.failed}</Text>
                  <Text style={styles.failureLabel}>{copy.failureReason}</Text>
                  <Text style={styles.failureText}>
                    {job.failure_reason || copy.notReported}
                  </Text>
                  {capture.session?.id ? (
                    <Pressable
                      disabled={retryingAnalysis}
                      onPress={() => void rerunAnalysis()}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        retryingAnalysis && styles.disabledButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      {retryingAnalysis ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : null}
                      <Text style={styles.primaryButtonText}>
                        {retryingAnalysis ? copy.retrying : copy.retryAnalysis}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <EmptyCard text={copy.noAnalysis} />
          )}
        </Section>

        <Section index="02" title={copy.evidence} delay={120}>
          <View style={styles.evidenceSummaryRow}>
            <SummaryChip value={capture.images.length} label={copy.capture} tone="neutral" />
            <SummaryChip value={acceptedCount} label={copy.accepted} tone="good" />
            <SummaryChip value={rejectedCount} label={copy.rejected} tone="bad" />
          </View>

          {selectedPhoto ? (
            <View style={styles.photoViewerCard}>
              {selectedPhoto.image_url ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: assetUrl(selectedPhoto.image_url) }}
                  style={styles.heroPhoto}
                />
              ) : (
                <View style={styles.photoUnavailable}>
                  <Text style={styles.photoUnavailableText}>{copy.notReported}</Text>
                </View>
              )}
              <View style={styles.photoCaptionRow}>
                <View>
                  <Text style={styles.photoSide}>
                    {selectedPhoto.capture_side || copy.notReported}
                  </Text>
                  <Text style={styles.photoMeta}>
                    {formatPixels(selectedPhoto)} · {copy.imageQuality} {formatQuality(selectedPhoto)}
                  </Text>
                </View>
                <View style={styles.photoPillStack}>
                  <EvidencePill image={selectedPhoto} copy={copy} />
                  <PhotoSyncPill
                    language={language}
                    hasPose={selectedPhotoHasPose}
                    iou={selectedPhotoIoU}
                  />
                </View>
              </View>
            </View>
          ) : (
            <EmptyCard text={copy.noPhotos} />
          )}

          {capture.images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRail}
            >
              {capture.images.map((image) => {
                const active = image.id === selectedPhoto?.id;
                return (
                  <Pressable
                    key={image.id}
                    onPress={() => setSelectedPhotoId(image.id)}
                    style={({ pressed }) => [
                      styles.thumbCard,
                      active && styles.thumbCardActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    {image.image_url ? (
                      <Image
                        resizeMode="cover"
                        source={{ uri: assetUrl(image.image_url) }}
                        style={styles.thumbImage}
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder} />
                    )}
                    <View style={styles.thumbFooter}>
                      <Text numberOfLines={1} style={styles.thumbSide}>
                        {image.capture_side || "PHOTO"}
                      </Text>
                      <View
                        style={[
                          styles.thumbPoseDot,
                          hasRegisteredPhotoPose(
                            findPhotoEvidenceForImage(
                              analysis?.photo_evidence_matrix,
                              image,
                            ),
                          ) && styles.thumbPoseDotReady,
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <InfoNote
            text={
              selectedPhotoHasPose
                ? language === "te"
                  ? "ఎంచుకున్న ఫోటోకు రిజిస్టర్డ్ కెమెరా పోజ్ ఉంది. కింద ఉన్న 3D వ్యూయర్ అదే కెమెరా దిశకు ఆటోమేటిక్‌గా అలైన్ అవుతుంది; డ్రాగ్ చేస్తే మాన్యువల్ వ్యూకు మారుతుంది."
                  : "The selected photo has a registered camera pose. The 3D viewer below auto-aligns to that camera orientation; dragging switches to manual view."
                : language === "te"
                  ? "ఈ ఫోటోకు కెమెరా పోజ్ అందుబాటులో లేదు. 3D దిశను యాప్ ఊహించదు; CAMERA_POSE_UNAVAILABLE గా ఉంచుతుంది."
                  : "No registered camera pose is available for this photo. The app does not simulate its 3D orientation and keeps CAMERA_POSE_UNAVAILABLE."
            }
            warning={!selectedPhotoHasPose}
          />

          <InfoNote text={copy.imageEvidenceNote} />
        </Section>

        <Section index="03" title={copy.measurements} delay={160}>
          {hasAnyMeasurement(measurement) ? (
            <>
              <View style={styles.measurementGrid}>
                <MeasurementCard
                  label={copy.length}
                  value={formatCm(measurement?.length_cm)}
                  secondary={formatUncertainty(measurement?.length_uncertainty_cm, copy)}
                />
                <MeasurementCard
                  label={copy.breadth}
                  value={formatCm(measurement?.breadth_cm)}
                  secondary={formatUncertainty(measurement?.breadth_uncertainty_cm, copy)}
                />
                <MeasurementCard
                  label={copy.height}
                  value={formatCm(measurement?.height_cm)}
                  secondary={formatUncertainty(measurement?.height_uncertainty_cm, copy)}
                />
                <MeasurementCard
                  label={copy.volume}
                  value={formatM3(measurement?.volume_m3)}
                  secondary={measurement?.confidence_grade || copy.notReported}
                  accent
                />
              </View>
              <View style={styles.detailListCard}>
                <KeyValue label={copy.confidence} value={formatPercent01(measurement?.measurement_confidence)} />
                <KeyValue label={copy.method} value={measurement?.analysis_method || copy.notReported} />
                <KeyValue label={copy.calibration} value={measurement?.calibration_method || copy.notReported} last />
              </View>
            </>
          ) : (
            <EmptyCard text={copy.measurementUnavailable} />
          )}
        </Section>

        <Section index="04" title={copy.reconstruction} delay={200}>
          <View style={styles.reconstructionCard}>
            <View style={styles.reconstructionHeader}>
              <View style={styles.twinOrb}>
                <View style={styles.twinOrbInner} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.reconstructionTitle}>
                  {hasReal3DArtifact ? copy.twinAvailable : copy.twinUnavailable}
                </Text>
                <Text style={styles.reconstructionSubtitle}>
                  {digitalTwin?.evidence_status || reconstructionQuality?.status || geometry?.volume_status || copy.notReported}
                </Text>
              </View>
            </View>

            <View style={styles.reconstructionGrid}>
              <MiniMetric label={copy.provider} value={geometry?.reconstruction_provider || digitalTwin?.reconstruction_provider || copy.notReported} />
              <MiniMetric label={copy.points} value={formatInteger(geometry?.point_count)} />
              <MiniMetric label={copy.matches} value={formatInteger(geometry?.match_count)} />
              <MiniMetric label={copy.surfaceArea} value={formatM2(geometry?.surface_area_m2)} />
              <MiniMetric label={copy.watertight} value={formatBoolean(geometry?.mesh_is_watertight, copy)} />
              <MiniMetric label={copy.metricScale} value={metricScaleText(reconstructionQuality, digitalTwin, copy)} />
              <MiniMetric label={copy.cameraPoses} value={formatInteger(reconstructionQuality?.registered_camera_count)} />
              <MiniMetric label={copy.confidence} value={formatPercent01(reconstructionQuality?.reconstruction_confidence ?? geometry?.reconstruction_confidence)} />
            </View>

            <InfoNote text={copy.twinTruth} />
          </View>

          <GraniteMesh3DViewer
            meshUrl={mesh3DUrl}
            pointsUrl={points3DUrl}
            language={language}
            shapeValidation={shapeValidation}
            selectedPhotoId={selectedPhoto?.id || null}
            selectedPhotoLabel={selectedPhoto?.capture_side || null}
            selectedPhotoSequenceNumber={selectedPhoto?.sequence_number ?? null}
            photoEvidenceMatrix={analysis?.photo_evidence_matrix || null}
            measurement={measurement}
            metricScaleProven={metricScaleProven}
            unobservedSurfaces={unobservedSurfaces}
          />

          <SurfaceCoverage
            copy={copy}
            observed={observedSurfaces}
            unobserved={unobservedSurfaces}
          />
        </Section>

        <Section index="05" title={copy.defects} delay={240}>
          {defects ? (
            <View style={styles.stackGap}>
              <View style={styles.providerRail}>
                <Text style={styles.providerName}>{defects.provider || copy.notReported}</Text>
                <StatusPill status={defects.status || "UNKNOWN"} compact />
              </View>
              {visibleDefects.length > 0 ? (
                visibleDefects.map((finding, index) => (
                  <DefectCard
                    key={finding.id || `${finding.kind || "defect"}-${index}`}
                    finding={finding}
                    index={index}
                    copy={copy}
                  />
                ))
              ) : (
                <EmptyCard text={copy.noDefects} />
              )}
              <InfoNote
                text={`${copy.visibleOnly}. ${copy.internalWarning}`}
                warning={Boolean(defects.internal_defects_claimed)}
              />
            </View>
          ) : (
            <EmptyCard text={copy.noDefectAnalysis} />
          )}
        </Section>

        {analysis?.classification ? (
          <Section index="06" title={copy.classification} delay={280}>
            <View style={styles.classificationCard}>
              <Text style={styles.classificationName}>
                {analysis.classification.classification || copy.notReported}
              </Text>
              <View style={styles.classificationMetaRow}>
                <KeyValueInline label={copy.confidence} value={formatPercent01(analysis.classification.confidence)} />
                <KeyValueInline label={copy.provider} value={analysis.classification.provider || copy.notReported} />
              </View>
              <StatusPill status={analysis.classification.status || "UNKNOWN"} compact />
            </View>
          </Section>
        ) : null}

        <Section index="07" title={copy.cutting} delay={320}>
          {cutting ? (
            <View style={styles.stackGap}>
              <View style={styles.cuttingHero}>
                <Text style={styles.cuttingHeroLabel}>{copy.orientation}</Text>
                <Text style={styles.cuttingOrientation}>
                  {cutting.recommended_orientation || copy.notReported}
                </Text>
                <Text style={styles.cuttingSolver}>
                  {cutting.solver || cutting.label || copy.notReported}
                </Text>
              </View>

              <View style={styles.fourMetrics}>
                <DecisionMetric label={copy.yield} value={formatPercent100(cutting.yield_percentage)} />
                <DecisionMetric label={copy.waste} value={formatPercent100(cutting.wastage_percentage)} />
                <DecisionMetric label={copy.usableVolume} value={formatM3(cutting.usable_volume_m3 ?? cm3ToM3(cutting.max_usable_volume_cm3))} />
                <DecisionMetric label={copy.pieces} value={formatInteger(cutting.pieces_estimated)} />
              </View>

              {cutting.final_dressed_dimensions ? (
                <View style={styles.finalDimsCard}>
                  <Text style={styles.finalDimsLabel}>{copy.finalDimensions}</Text>
                  <Text style={styles.finalDimsValue}>
                    {formatDimensions(cutting.final_dressed_dimensions, copy.notReported)}
                  </Text>
                </View>
              ) : null}

              {Array.isArray(cutting.cutting_steps) && cutting.cutting_steps.length > 0 ? (
                <View style={styles.cutSteps}>
                  {cutting.cutting_steps.map((step, index) => (
                    <CutStepCard key={`${step.step_number || index}-${step.cut_name || "cut"}`} step={step} index={index} copy={copy} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <EmptyCard text={copy.noCutting} />
          )}
        </Section>

        <Section index="08" title={copy.wastage} delay={360}>
          {wastage ? (
            <View style={styles.stackGap}>
              <View style={styles.threeMetrics}>
                <DecisionMetric label={copy.irregularity} value={formatPercent100(wastage.irregularity_ratio)} />
                <DecisionMetric label={copy.estimatedWaste} value={formatM3(wastage.estimated_waste_volume_m3)} />
                <DecisionMetric label={copy.recovery} value={formatPercent100(wastage.recovery_yield_percentage)} />
              </View>
              {wastage.waste_breakdown_m3 ? (
                <View style={styles.detailListCard}>
                  <KeyValue label="Geometric trimming" value={formatM3(wastage.waste_breakdown_m3.geometric_trimming_m3)} />
                  <KeyValue label="Defect exclusion" value={formatM3(wastage.waste_breakdown_m3.defect_exclusion_m3)} />
                  <KeyValue label="Kerf loss" value={formatM3(wastage.waste_breakdown_m3.kerf_loss_m3)} />
                  <KeyValue label="Residual offcut" value={formatM3(wastage.waste_breakdown_m3.residual_offcut_m3)} last />
                </View>
              ) : null}
            </View>
          ) : (
            <EmptyCard text={copy.noWastage} />
          )}
        </Section>

        <Section index="09" title={copy.seigniorage} delay={400}>
          {seigniorage ? (
            <View style={styles.seigniorageCard}>
              <View style={styles.seigniorageTop}>
                <Text style={styles.seigniorageKind}>
                  {seigniorage.assessment_kind || "INDICATIVE_AI_ASSESSMENT"}
                </Text>
                <Text style={styles.seigniorageAmount}>
                  {formatCurrency(seigniorage.indicative_amount, seigniorage.currency)}
                </Text>
              </View>
              <View style={styles.reconstructionGrid}>
                <MiniMetric label={copy.rate} value={formatCurrency(seigniorage.rate_per_m3, seigniorage.currency)} />
                <MiniMetric label={copy.volume} value={formatM3(seigniorage.volume_m3)} />
                <MiniMetric label={copy.tonnes} value={formatTonnes(seigniorage.estimated_tonnes)} />
                <MiniMetric label={copy.gangsaw} value={seigniorage.gangsaw_class || copy.notReported} />
              </View>
              <InfoNote text={copy.indicativeOnly} warning />
            </View>
          ) : (
            <EmptyCard text={copy.noSeigniorage} />
          )}
        </Section>

        <Section index="10" title={copy.verification} delay={440}>
          {latestVerification ? (
            <View style={styles.verificationCard}>
              <View style={styles.verificationHeader}>
                <View style={styles.verificationSeal}>
                  <Text style={styles.verificationSealText}>✓</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.verificationTitle}>{copy.physicallyVerified}</Text>
                  <Text style={styles.verificationDate}>
                    {formatDateTime(latestVerification.created_at || latestVerification.timestamp, language)}
                  </Text>
                </View>
                <StatusPill status={latestVerification.decision} compact />
              </View>
              <View style={styles.measurementGrid}>
                <MeasurementCard label={copy.length} value={formatCm(latestVerification.verified_length_cm)} secondary="PHYSICAL" />
                <MeasurementCard label={copy.breadth} value={formatCm(latestVerification.verified_breadth_cm)} secondary="PHYSICAL" />
                <MeasurementCard label={copy.height} value={formatCm(latestVerification.verified_height_cm)} secondary="PHYSICAL" />
              </View>
              {latestVerification.remarks ? (
                <Text style={styles.verificationRemarks}>{latestVerification.remarks}</Text>
              ) : null}
              <InfoNote text={copy.verificationTruth} />
            </View>
          ) : (
            <EmptyCard text={copy.noVerification} />
          )}
        </Section>

        <Section index="11" title={copy.timeline} delay={480}>
          {Array.isArray(job?.transitions) && job.transitions.length > 0 ? (
            <View style={styles.timelineCard}>
              {job.transitions.map((transition, index) => (
                <TimelineItem
                  key={`${transition.timestamp || index}-${transition.to_state || "state"}`}
                  item={transition}
                  index={index}
                  total={job.transitions?.length || 0}
                  language={language}
                />
              ))}
            </View>
          ) : (
            <EmptyCard text={copy.noTimeline} />
          )}
        </Section>

        <View style={styles.footerTruth}>
          <Text style={styles.footerTruthTitle}>EVIDENCE-FIRST MOBILE</Text>
          <Text style={styles.footerTruthText}>
            {copy.twinTruth}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  index,
  title,
  delay,
  children,
}: {
  index: string;
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(360)} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIndex}>{index}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionLine} />
      </View>
      {children}
    </Animated.View>
  );
}

function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  const tone = statusTone(status);
  return (
    <View
      style={[
        styles.statusPill,
        compact && styles.statusPillCompact,
        tone === "good" && styles.statusGood,
        tone === "bad" && styles.statusBad,
        tone === "warn" && styles.statusWarn,
        tone === "live" && styles.statusLive,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          tone === "good" && styles.statusDotGood,
          tone === "bad" && styles.statusDotBad,
          tone === "warn" && styles.statusDotWarn,
          tone === "live" && styles.statusDotLive,
        ]}
      />
      <Text numberOfLines={1} style={styles.statusText}>
        {prettyStatus(status)}
      </Text>
    </View>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SummaryChip({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "neutral" | "good" | "bad";
}) {
  return (
    <View
      style={[
        styles.summaryChip,
        tone === "good" && styles.summaryChipGood,
        tone === "bad" && styles.summaryChipBad,
      ]}
    >
      <Text style={styles.summaryValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function EvidencePill({ image, copy }: { image: ImageOut; copy: Copy }) {
  const accepted = image.accepted === true || image.validation?.accepted === true;
  const rejected = image.rejected === true || image.validation?.rejected === true;
  const label = accepted ? copy.accepted : rejected ? copy.rejected : copy.notReported;
  return (
    <View style={[styles.evidencePill, accepted && styles.evidencePillGood, rejected && styles.evidencePillBad]}>
      <Text style={styles.evidencePillText}>{label}</Text>
    </View>
  );
}

function PhotoSyncPill({
  language,
  hasPose,
  iou,
}: {
  language: Language;
  hasPose: boolean;
  iou: number | null;
}) {
  return (
    <View
      style={[
        styles.photoSyncPill,
        hasPose
          ? styles.photoSyncPillReady
          : styles.photoSyncPillUnavailable,
      ]}
    >
      <View
        style={[
          styles.photoSyncPillDot,
          hasPose && styles.photoSyncPillDotReady,
        ]}
      />
      <Text
        style={[
          styles.photoSyncPillText,
          hasPose && styles.photoSyncPillTextReady,
        ]}
      >
        {hasPose
          ? `${language === "te" ? "3D సింక్" : "3D SYNC"}${
              iou !== null ? ` · ${formatPercent01(iou)}` : ""
            }`
          : language === "te"
            ? "కెమెరా పోజ్ లేదు"
            : "NO CAMERA POSE"}
      </Text>
    </View>
  );
}

function MeasurementCard({
  label,
  value,
  secondary,
  accent = false,
}: {
  label: string;
  value: string;
  secondary: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.measurementCard, accent && styles.measurementCardAccent]}>
      <Text style={[styles.measurementLabel, accent && styles.measurementLabelAccent]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.measurementValue, accent && styles.measurementValueAccent]}>{value}</Text>
      <Text numberOfLines={1} style={styles.measurementSecondary}>{secondary}</Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.miniMetricValue}>{value}</Text>
    </View>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.decisionMetric}>
      <Text style={styles.decisionLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.decisionValue}>{value}</Text>
    </View>
  );
}

function KeyValue({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.keyValueRow, last && styles.keyValueRowLast]}>
      <Text style={styles.keyValueLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.keyValueValue}>{value}</Text>
    </View>
  );
}

function KeyValueInline({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.inlineMeta}>
      <Text style={styles.inlineMetaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.inlineMetaValue}>{value}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyMark}>
        <View style={styles.emptyMarkInner} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function InfoNote({ text, warning = false }: { text: string; warning?: boolean }) {
  return (
    <View style={[styles.infoNote, warning && styles.infoNoteWarning]}>
      <Text style={[styles.infoNoteMark, warning && styles.infoNoteMarkWarning]}>{warning ? "!" : "i"}</Text>
      <Text style={styles.infoNoteText}>{text}</Text>
    </View>
  );
}

function SurfaceCoverage({ copy, observed, unobserved }: { copy: Copy; observed: string[]; unobserved: string[] }) {
  if (observed.length === 0 && unobserved.length === 0) {
    return <EmptyCard text={copy.noSurfaceEvidence} />;
  }
  return (
    <View style={styles.surfaceCard}>
      <SurfaceGroup label={copy.observed} items={observed} good />
      <SurfaceGroup label={copy.unobserved} items={unobserved} />
    </View>
  );
}

function SurfaceGroup({ label, items, good = false }: { label: string; items: string[]; good?: boolean }) {
  return (
    <View style={styles.surfaceGroup}>
      <Text style={styles.surfaceGroupLabel}>{label}</Text>
      {items.length ? (
        <View style={styles.chipWrap}>
          {items.map((item) => (
            <View key={`${label}-${item}`} style={[styles.surfaceChip, good && styles.surfaceChipGood]}>
              <Text style={[styles.surfaceChipText, good && styles.surfaceChipTextGood]}>{prettyStatus(item)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.surfaceEmpty}>—</Text>
      )}
    </View>
  );
}

function DefectCard({ finding, index, copy }: { finding: DefectFinding; index: number; copy: Copy }) {
  const title = finding.kind || finding.type || finding.category || `Defect ${index + 1}`;
  return (
    <View style={styles.defectCard}>
      <View style={styles.defectTopRow}>
        <View style={styles.defectNumber}><Text style={styles.defectNumberText}>{String(index + 1).padStart(2, "0")}</Text></View>
        <View style={styles.flexOne}>
          <Text style={styles.defectTitle}>{prettyStatus(title)}</Text>
          <Text style={styles.defectSurface}>{finding.surface || copy.notReported}</Text>
        </View>
        <StatusPill status={finding.severity || "UNKNOWN"} compact />
      </View>
      <View style={styles.defectMetrics}>
        <MiniMetric label={copy.confidence} value={formatPercent01(finding.confidence)} />
        <MiniMetric label="Area" value={formatCm2(finding.estimated_area_cm2)} />
        <MiniMetric label="Depth" value={formatMm(finding.depth_mm, finding.depth_status)} />
      </View>
      {finding.cutting_impact || finding.cut_relevance ? (
        <Text style={styles.defectImpact}>{finding.cutting_impact || finding.cut_relevance}</Text>
      ) : null}
    </View>
  );
}

function CutStepCard({ step, index, copy }: { step: CuttingStep; index: number; copy: Copy }) {
  return (
    <View style={styles.cutStepCard}>
      <View style={styles.cutStepRail}>
        <View style={styles.cutStepNumber}><Text style={styles.cutStepNumberText}>{step.step_number || index + 1}</Text></View>
        <View style={styles.flexOne}>
          <Text style={styles.cutStepName}>{step.cut_name || `Cut ${index + 1}`}</Text>
          <Text style={styles.cutStepAxis}>
            {step.plane_axis ? `Axis ${step.plane_axis}` : ""}
            {isFiniteNumber(step.position_cm) ? ` · ${formatNumber(step.position_cm, 1)} cm` : ""}
          </Text>
        </View>
      </View>
      <View style={styles.cutReasonBox}>
        <Text style={styles.cutReasonLabel}>{copy.reason}</Text>
        <Text style={styles.cutReasonText}>{step.reason || copy.notReported}</Text>
      </View>
      <View style={styles.cutBottomRow}>
        <Text style={styles.cutBottomLabel}>{copy.removed}</Text>
        <Text style={styles.cutBottomValue}>{formatM3(step.removed_volume_m3)}</Text>
      </View>
    </View>
  );
}

function TimelineItem({ item, index, total, language }: { item: AnalysisTransition; index: number; total: number; language: Language }) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineAxis}>
        <View style={[styles.timelineDot, index === total - 1 && styles.timelineDotLatest]} />
        {index < total - 1 ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineState}>{prettyStatus(item.to_state || "STATE")}</Text>
        <Text style={styles.timelineTime}>{formatDateTime(item.timestamp, language)}</Text>
        {item.note ? <Text style={styles.timelineNote}>{item.note}</Text> : null}
      </View>
    </View>
  );
}

function AmbientBackground() {
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [phase]);

  const orbOne = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [-24, 28]) },
      { translateY: interpolate(phase.value, [0, 1], [0, 52]) },
      { scale: interpolate(phase.value, [0, 1], [0.95, 1.08]) },
    ],
  }));
  const orbTwo = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [20, -34]) },
      { translateY: interpolate(phase.value, [0, 1], [34, -18]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={styles.ambientRoot}>
      <Animated.View style={[styles.ambientOrbOne, orbOne]} />
      <Animated.View style={[styles.ambientOrbTwo, orbTwo]} />
      <View style={styles.gridLineOne} />
      <View style={styles.gridLineTwo} />
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function normalizeCapture(value: CaptureBundle | null | undefined): CaptureBundle {
  return {
    session: value?.session || null,
    images: Array.isArray(value?.images) ? value.images : [],
    guidance: value?.guidance || null,
  };
}

function quarryName(value?: Quarry): string {
  if (!value) return "Not reported";
  return value.quarry_name || value.name || value.quarry_code || value.id;
}

function categoryName(value?: GraniteCategory): string {
  if (!value) return "Not reported";
  return value.name || value.code || value.id;
}

function gpsText(block: BlockOut | null, fallback: string): string {
  if (!block || !isFiniteNumber(block.latitude) || !isFiniteNumber(block.longitude)) return fallback;
  return `${formatNumber(block.latitude, 5)}, ${formatNumber(block.longitude, 5)}`;
}

function asEvidenceRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteRecordNumber(
  value: unknown,
  key: string,
): number | null {
  const record = asEvidenceRecord(value);
  const candidate = record[key];

  return typeof candidate === "number" &&
    Number.isFinite(candidate)
    ? candidate
    : null;
}

function findPhotoEvidenceForImage(
  rows: Array<Record<string, unknown>> | null | undefined,
  image: ImageOut | null,
): Record<string, unknown> | null {
  if (!image || !Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const exact = rows.find((row) => {
    const photoId =
      typeof row.photo_id === "string"
        ? row.photo_id
        : typeof row.image_id === "string"
          ? row.image_id
          : "";

    if (photoId === image.id) {
      return true;
    }

    const imageUrl =
      typeof row.image_url === "string"
        ? row.image_url
        : "";

    return Boolean(
      imageUrl &&
      imageUrl.includes(image.id),
    );
  });

  if (exact) {
    return exact;
  }

  if (
    typeof image.sequence_number === "number" &&
    Number.isFinite(image.sequence_number)
  ) {
    const bySequence = rows.filter(
      (row) =>
        typeof row.sequence_number === "number" &&
        row.sequence_number === image.sequence_number,
    );

    if (bySequence.length === 1) {
      return bySequence[0];
    }
  }

  const side =
    (image.capture_side || "")
      .trim()
      .toUpperCase();

  if (side) {
    const bySide = rows.filter((row) =>
      [
        row.side,
        row.view_name,
        row.photo_label,
      ].some(
        (candidate) =>
          typeof candidate === "string" &&
          candidate.trim().toUpperCase() === side,
      ),
    );

    if (bySide.length === 1) {
      return bySide[0];
    }
  }

  return null;
}

function hasRegisteredPhotoPose(
  row: Record<string, unknown> | null,
): boolean {
  if (!row) return false;

  const pose = asEvidenceRecord(
    row.camera_pose,
  );

  const rotation = pose.rotation;

  if (
    !Array.isArray(rotation) ||
    rotation.length !== 3
  ) {
    return false;
  }

  for (const matrixRow of rotation) {
    if (
      !Array.isArray(matrixRow) ||
      matrixRow.length !== 3
    ) {
      return false;
    }

    if (
      !matrixRow.every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value),
      )
    ) {
      return false;
    }
  }

  return true;
}

function hasAnyMeasurement(value: MeasurementOut | null): boolean {
  return Boolean(
    value &&
      [value.length_cm, value.breadth_cm, value.height_cm, value.volume_m3].some(
        isFiniteNumber,
      ),
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

function clampPercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return isFiniteNumber(value) ? value.toFixed(digits) : "—";
}

function formatInteger(value: number | null | undefined): string {
  return isFiniteNumber(value) ? Math.round(value).toLocaleString("en-IN") : "—";
}

function formatCm(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(1)} cm`;
}

function formatCm2(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(1)} cm²`;
}

function formatM2(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(3)} m²`;
}

function formatM3(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(4)} m³`;
}

function formatMm(value: number | null | undefined, status?: string | null): string {
  if (isFiniteNumber(value)) return `${value.toFixed(1)} mm`;
  return status || "—";
}

function formatPercent01(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function formatPercent100(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatUncertainty(value: number | null | undefined, copy: Copy): string {
  return isFiniteNumber(value) ? `${copy.uncertainty} ±${value.toFixed(1)} cm` : `${copy.uncertainty} —`;
}

function cm3ToM3(value: number | null | undefined): number | null {
  return isFiniteNumber(value) ? value / 1_000_000 : null;
}

function formatDimensions(value: NonNullable<CuttingOut["final_dressed_dimensions"]>, fallback: string): string {
  if (![value.length_cm, value.breadth_cm, value.height_cm].every(isFiniteNumber)) return fallback;
  return `${value.length_cm!.toFixed(1)} × ${value.breadth_cm!.toFixed(1)} × ${value.height_cm!.toFixed(1)} cm`;
}

function formatBoolean(value: boolean | null | undefined, copy: Copy): string {
  if (value === true) return copy.yes;
  if (value === false) return copy.no;
  return copy.notReported;
}

function metricScaleText(quality: ReconstructionQuality | null, twin: DigitalTwinOut | null, copy: Copy): string {
  if (quality?.metric_sfm_scale_solved === true || twin?.metric_scale_solved === true) {
    return quality?.metric_scale_source || copy.yes;
  }
  if (quality?.metric_measurement_status) return quality.metric_measurement_status;
  if (quality?.calibration_status) return quality.calibration_status;
  return copy.notReported;
}

function formatQuality(image: ImageOut): string {
  const value = image.validation?.quality_score ?? image.quality_score;
  if (!isFiniteNumber(value)) return "—";
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(0)}%`;
}

function formatPixels(image: ImageOut): string {
  if (!isFiniteNumber(image.width_px) || !isFiniteNumber(image.height_px)) return "Resolution —";
  return `${Math.round(image.width_px)}×${Math.round(image.height_px)}`;
}

function formatTonnes(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${value.toFixed(3)} t` : "—";
}

function formatCurrency(value: number | null | undefined, currency?: string | null): string {
  if (!isFiniteNumber(value)) return "—";
  const code = currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

function formatDateTime(value: string | null | undefined, language: Language): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(language === "te" ? "te-IN" : "en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function prettyStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function statusTone(value: string): "good" | "bad" | "warn" | "live" | "neutral" {
  const state = value.toUpperCase();
  if (state.includes("VERIFIED") || state.includes("COMPLETED") || state.includes("ACCEPTED") || state.includes("HIGH")) return "good";
  if (state.includes("FAILED") || state.includes("REJECTED") || state.includes("ERROR")) return "bad";
  if (state.includes("FLAG") || state.includes("WARN") || state.includes("MISSING") || state.includes("LOW")) return "warn";
  if (state.includes("ANALYZ") || state.includes("RUN") || state.includes("QUEUE") || state.includes("PROCESS") || state.includes("CREATED")) return "live";
  return "neutral";
}

function assetUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SERVER_ROOT}${value.startsWith("/") ? "" : "/"}${value}`;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const { timeoutMs = 20_000, ...requestInit } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(requestInit.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    const selectedUserId = await SecureStore.getItemAsync(SELECTED_USER_KEY).catch(() => null);
    if (selectedUserId && !headers.has("x-selected-user-id")) {
      headers.set("x-selected-user-id", selectedUserId);
    }

    const response = await fetch(`${API_ROOT}${path}`, {
      ...requestInit,
      headers,
      signal: controller.signal,
    });
    const raw = await response.text();

    if (!response.ok) {
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
        else if (typeof parsed.message === "string") detail = parsed.message;
        else if (parsed.detail) detail = JSON.stringify(parsed.detail);
      } catch {
        // Preserve the server response body.
      }
      throw new Error(detail || `Request failed with HTTP ${response.status}.`);
    }

    if (!raw) return undefined as T;
    return JSON.parse(raw) as T;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error(`Request timed out while connecting to ${SERVER_ROOT}.`);
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load this granite block.";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F2F6F6" },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F6F6", gap: 14 },
  loadingText: { color: "#536976", fontSize: 13, fontWeight: "600" },
  ambientRoot: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  ambientOrbOne: { position: "absolute", top: -90, right: -100, width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(21,148,155,0.08)" },
  ambientOrbTwo: { position: "absolute", top: 430, left: -130, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(105,180,155,0.06)" },
  gridLineOne: { position: "absolute", top: 280, right: -40, width: 180, height: 1, backgroundColor: "rgba(29,57,70,0.045)", transform: [{ rotate: "-28deg" }] },
  gridLineTwo: { position: "absolute", top: 330, right: -40, width: 210, height: 1, backgroundColor: "rgba(29,57,70,0.04)", transform: [{ rotate: "-28deg" }] },
  content: { paddingHorizontal: 16, gap: 14 },
  topBar: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backButton: { height: 38, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 },
  backArrow: { color: "#163744", fontSize: 30, lineHeight: 32, fontWeight: "400", marginTop: -2 },
  backText: { color: "#163744", fontSize: 13, fontWeight: "800" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  ghostButton: { height: 34, borderRadius: 12, borderWidth: 1, borderColor: "#D9E3E4", backgroundColor: "rgba(255,255,255,0.84)", paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  ghostText: { color: "#536976", fontSize: 11, fontWeight: "800" },
  languageButton: { height: 34, borderRadius: 12, backgroundColor: "#183B48", paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  languageText: { color: "#F7FBFB", fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  heroCard: { overflow: "hidden", borderRadius: 24, backgroundColor: "#163844", padding: 18, shadowColor: "#08242C", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  heroGlow: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(95,205,183,0.11)", top: -100, right: -35 },
  eyebrow: { color: "#79D6C4", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heroTitleRow: { marginTop: 8, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroTitleWrap: { flex: 1, minWidth: 0 },
  blockCode: { color: "#FFFFFF", fontSize: 25, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  blockIdText: { color: "#A9BDC4", fontSize: 9, marginTop: 4, fontWeight: "600" },
  statusPill: { maxWidth: 150, minHeight: 31, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, backgroundColor: "#EDF2F2", borderWidth: 1, borderColor: "#D7E2E3" },
  statusPillCompact: { minHeight: 26, paddingHorizontal: 8, borderRadius: 10 },
  statusGood: { backgroundColor: "#E7F6EF", borderColor: "#BCE7D3" },
  statusBad: { backgroundColor: "#FFF0EC", borderColor: "#F6C9BC" },
  statusWarn: { backgroundColor: "#FFF6E6", borderColor: "#F0D7A2" },
  statusLive: { backgroundColor: "#E8F5F6", borderColor: "#B8DDDF" },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#7A8B94" },
  statusDotGood: { backgroundColor: "#2E9A72" },
  statusDotBad: { backgroundColor: "#D45B43" },
  statusDotWarn: { backgroundColor: "#C89236" },
  statusDotLive: { backgroundColor: "#15949B" },
  statusText: { flexShrink: 1, color: "#2C4651", fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.35 },
  metaGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaGridCompact: { gap: 7 },
  metaCell: { width: "31%", minWidth: 92, flexGrow: 1, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", paddingHorizontal: 10, paddingVertical: 9 },
  metaLabel: { color: "#8EA8B1", fontSize: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  metaValue: { marginTop: 4, color: "#EFF7F7", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  truthRail: { marginTop: 12, borderRadius: 13, flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "rgba(116,212,193,0.085)", borderWidth: 1, borderColor: "rgba(116,212,193,0.15)", padding: 10 },
  truthMark: { width: 19, height: 19, borderRadius: 10, overflow: "hidden", textAlign: "center", lineHeight: 19, color: "#82DDCB", backgroundColor: "rgba(130,221,203,0.10)", fontSize: 11, fontWeight: "800" },
  truthText: { flex: 1, color: "#C0D2D6", fontSize: 10, lineHeight: 15, fontWeight: "600" },
  errorCard: { borderRadius: 16, backgroundColor: "#FFF3EF", borderWidth: 1, borderColor: "#F2CBBE", padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  errorIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E26B50", alignItems: "center", justifyContent: "center" },
  errorIconText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  errorTitle: { color: "#8D3E2F", fontSize: 12, fontWeight: "800" },
  errorText: { color: "#845A50", fontSize: 10, lineHeight: 14, marginTop: 2 },
  smallRetry: { borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7BFB4", paddingHorizontal: 9, paddingVertical: 7 },
  smallRetryText: { color: "#9A4C3B", fontSize: 9, fontWeight: "800" },
  flexOne: { flex: 1, minWidth: 0 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  sectionIndex: { color: "#16939A", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { color: "#183B48", fontSize: 13, fontWeight: "800" },
  sectionLine: { flex: 1, height: 1, backgroundColor: "#DCE5E6" },
  analysisCard: { borderRadius: 20, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "#DCE6E6", padding: 15, shadowColor: "#153B45", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  analysisTopRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  analysisStage: { color: "#173B47", fontSize: 16, lineHeight: 21, fontWeight: "800" },
  analysisJobId: { color: "#8A9BA3", fontSize: 8, marginTop: 4, fontWeight: "700", letterSpacing: 0.35 },
  progressHeader: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { color: "#71858E", fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  progressValue: { color: "#15949B", fontSize: 12, fontWeight: "800" },
  progressTrack: { marginTop: 7, height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: "#E5EEEE" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#15949B" },
  liveRail: { marginTop: 12, borderRadius: 11, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#EEF8F8", paddingHorizontal: 10, paddingVertical: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#15949B" },
  liveText: { flex: 1, color: "#3C7378", fontSize: 10, lineHeight: 14, fontWeight: "600" },
  demoWarning: { marginTop: 10, borderRadius: 11, backgroundColor: "#FFF3DF", borderWidth: 1, borderColor: "#EBCF9A", padding: 9 },
  demoWarningText: { color: "#835F22", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  failureCard: { marginTop: 12, borderRadius: 14, backgroundColor: "#FFF1ED", borderWidth: 1, borderColor: "#F0C8BC", padding: 12 },
  failureTitle: { color: "#A44734", fontSize: 13, fontWeight: "800" },
  failureLabel: { color: "#9A665B", fontSize: 8, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 8 },
  failureText: { color: "#70483F", fontSize: 11, lineHeight: 16, marginTop: 3 },
  primaryButton: { marginTop: 12, minHeight: 42, borderRadius: 13, backgroundColor: "#183B48", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
  evidenceSummaryRow: { flexDirection: "row", gap: 8 },
  summaryChip: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DFE7E8", padding: 11 },
  summaryChipGood: { backgroundColor: "#F1FAF6", borderColor: "#C9E9DA" },
  summaryChipBad: { backgroundColor: "#FFF6F3", borderColor: "#F0D0C7" },
  summaryValue: { color: "#173B47", fontSize: 18, fontWeight: "800" },
  summaryLabel: { color: "#72858D", fontSize: 8, fontWeight: "700", marginTop: 2, textTransform: "uppercase" },
  photoViewerCard: { borderRadius: 20, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5E6" },
  heroPhoto: { width: "100%", height: 232, backgroundColor: "#DCE5E5" },
  photoUnavailable: { width: "100%", height: 190, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF0F0" },
  photoUnavailableText: { color: "#73868E", fontSize: 11, fontWeight: "700" },
  photoCaptionRow: { padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  photoSide: { color: "#173B47", fontSize: 13, fontWeight: "800" },
  photoMeta: { color: "#809099", fontSize: 9, fontWeight: "600", marginTop: 2 },
  photoPillStack: {
    alignItems: "flex-end",
    gap: 6,
  },
  photoSyncPill: {
    minHeight: 23,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
  },
  photoSyncPillReady: {
    backgroundColor: "#E9F7F2",
    borderColor: "#C6E6DA",
  },
  photoSyncPillUnavailable: {
    backgroundColor: "#FFF6E6",
    borderColor: "#EBD4A4",
  },
  photoSyncPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#BD8A32",
  },
  photoSyncPillDotReady: {
    backgroundColor: "#2F9B73",
  },
  photoSyncPillText: {
    color: "#946C2C",
    fontSize: 6.8,
    fontWeight: "900",
  },
  photoSyncPillTextReady: {
    color: "#2D765F",
  },
  evidencePill: { borderRadius: 9, backgroundColor: "#EDF2F2", paddingHorizontal: 8, paddingVertical: 5 },
  evidencePillGood: { backgroundColor: "#E7F6EF" },
  evidencePillBad: { backgroundColor: "#FFF0EC" },
  evidencePillText: { color: "#47616A", fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  thumbRail: { gap: 8, paddingVertical: 1 },
  thumbCard: { width: 84, borderRadius: 13, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5E6", paddingBottom: 7 },
  thumbCardActive: { borderColor: "#15949B", borderWidth: 2 },
  thumbImage: { width: "100%", height: 62, backgroundColor: "#DCE5E5" },
  thumbPlaceholder: { width: "100%", height: 62, backgroundColor: "#E7EEEE" },
  thumbFooter: {
    paddingHorizontal: 7,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  thumbSide: {
    flex: 1,
    color: "#536A74",
    fontSize: 8,
    fontWeight: "800",
    textAlign: "left",
  },
  thumbPoseDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1B06B",
  },
  thumbPoseDotReady: {
    backgroundColor: "#39A57B",
  },
  infoNote: { borderRadius: 13, flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EEF7F7", borderWidth: 1, borderColor: "#D2E8E8", padding: 10 },
  infoNoteWarning: { backgroundColor: "#FFF7E9", borderColor: "#EBD8AD" },
  infoNoteMark: { width: 18, height: 18, borderRadius: 9, overflow: "hidden", textAlign: "center", lineHeight: 18, backgroundColor: "#D9EEEE", color: "#197D84", fontSize: 10, fontWeight: "800" },
  infoNoteMarkWarning: { backgroundColor: "#F4E2B9", color: "#8D681E" },
  infoNoteText: { flex: 1, color: "#5B737C", fontSize: 9.5, lineHeight: 14, fontWeight: "600" },
  measurementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measurementCard: { width: "48%", flexGrow: 1, minWidth: 140, borderRadius: 17, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DEE7E7", padding: 13 },
  measurementCardAccent: { backgroundColor: "#173B47", borderColor: "#173B47" },
  measurementLabel: { color: "#71858D", fontSize: 8, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  measurementLabelAccent: { color: "#89CFC5" },
  measurementValue: { color: "#173B47", fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 5 },
  measurementValueAccent: { color: "#FFFFFF" },
  measurementSecondary: { color: "#8A9BA2", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
  detailListCard: { borderRadius: 17, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DEE7E7" },
  keyValueRow: { minHeight: 45, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: "#EDF1F1" },
  keyValueRowLast: { borderBottomWidth: 0 },
  keyValueLabel: { color: "#73858D", fontSize: 9, fontWeight: "700" },
  keyValueValue: { flex: 1, textAlign: "right", color: "#233F49", fontSize: 10, lineHeight: 14, fontWeight: "800" },
  reconstructionCard: { borderRadius: 20, backgroundColor: "#173B47", padding: 15, gap: 13, overflow: "hidden" },
  reconstructionHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  twinOrb: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(107,207,188,0.12)", borderWidth: 1, borderColor: "rgba(107,207,188,0.28)", alignItems: "center", justifyContent: "center" },
  twinOrbInner: { width: 17, height: 17, borderRadius: 5, borderWidth: 2, borderColor: "#70D1BE", transform: [{ rotate: "18deg" }] },
  reconstructionTitle: { color: "#F5FBFA", fontSize: 14, fontWeight: "800" },
  reconstructionSubtitle: { color: "#A8BDC3", fontSize: 9, marginTop: 3, fontWeight: "600" },
  reconstructionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  miniMetric: { width: "47%", flexGrow: 1, minWidth: 125, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 10 },
  miniMetricLabel: { color: "#8FA9B1", fontSize: 7.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.55 },
  miniMetricValue: { color: "#EAF5F4", fontSize: 10.5, lineHeight: 14, fontWeight: "700", marginTop: 4 },
  surfaceCard: { borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 13, gap: 12 },
  surfaceGroup: { gap: 7 },
  surfaceGroupLabel: { color: "#627982", fontSize: 9, fontWeight: "800" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  surfaceChip: { borderRadius: 9, backgroundColor: "#FFF3E7", borderWidth: 1, borderColor: "#EED8B7", paddingHorizontal: 8, paddingVertical: 5 },
  surfaceChipGood: { backgroundColor: "#EAF7F1", borderColor: "#C8E7D9" },
  surfaceChipText: { color: "#8A6527", fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  surfaceChipTextGood: { color: "#287657" },
  surfaceEmpty: { color: "#9DAAAD", fontSize: 10 },
  stackGap: { gap: 9 },
  providerRail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 11 },
  providerName: { flex: 1, color: "#284550", fontSize: 10, fontWeight: "800" },
  defectCard: { borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E7E7", padding: 13, gap: 10 },
  defectTopRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  defectNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#183B48", alignItems: "center", justifyContent: "center" },
  defectNumberText: { color: "#8ED6C9", fontSize: 9, fontWeight: "800" },
  defectTitle: { color: "#1B3C47", fontSize: 12, fontWeight: "800" },
  defectSurface: { color: "#82939A", fontSize: 8.5, marginTop: 2, fontWeight: "600" },
  defectMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  defectImpact: { borderRadius: 10, backgroundColor: "#F3F7F7", color: "#5F7279", fontSize: 9.5, lineHeight: 14, padding: 9, fontWeight: "600" },
  classificationCard: { borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 14, gap: 11 },
  classificationName: { color: "#193B47", fontSize: 20, fontWeight: "800" },
  classificationMetaRow: { flexDirection: "row", gap: 7 },
  inlineMeta: { flex: 1, borderRadius: 11, backgroundColor: "#F1F6F6", padding: 9 },
  inlineMetaLabel: { color: "#82949B", fontSize: 7.5, fontWeight: "800", textTransform: "uppercase" },
  inlineMetaValue: { color: "#2A4650", fontSize: 9.5, fontWeight: "800", marginTop: 3 },
  cuttingHero: { borderRadius: 19, backgroundColor: "#173B47", padding: 15 },
  cuttingHeroLabel: { color: "#88CEC3", fontSize: 8, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  cuttingOrientation: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginTop: 5 },
  cuttingSolver: { color: "#A9BCC2", fontSize: 9, marginTop: 3, fontWeight: "600" },
  fourMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  threeMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  decisionMetric: { flex: 1, minWidth: 78, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 11 },
  decisionLabel: { color: "#809198", fontSize: 7.5, fontWeight: "800", textTransform: "uppercase" },
  decisionValue: { color: "#1A3E49", fontSize: 14, lineHeight: 19, fontWeight: "800", marginTop: 4 },
  finalDimsCard: { borderRadius: 15, backgroundColor: "#EAF6F3", borderWidth: 1, borderColor: "#CAE5DC", padding: 12 },
  finalDimsLabel: { color: "#4B7B6D", fontSize: 8, fontWeight: "800", textTransform: "uppercase" },
  finalDimsValue: { color: "#1E5E4A", fontSize: 14, fontWeight: "800", marginTop: 4 },
  cutSteps: { gap: 8 },
  cutStepCard: { borderRadius: 17, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 12, gap: 9 },
  cutStepRail: { flexDirection: "row", alignItems: "center", gap: 9 },
  cutStepNumber: { width: 31, height: 31, borderRadius: 10, backgroundColor: "#E5F3F2", alignItems: "center", justifyContent: "center" },
  cutStepNumberText: { color: "#167E84", fontSize: 10, fontWeight: "800" },
  cutStepName: { color: "#203F49", fontSize: 12, fontWeight: "800" },
  cutStepAxis: { color: "#84949A", fontSize: 8.5, marginTop: 2, fontWeight: "600" },
  cutReasonBox: { borderRadius: 10, backgroundColor: "#F4F7F7", padding: 9 },
  cutReasonLabel: { color: "#819096", fontSize: 7.5, fontWeight: "800", textTransform: "uppercase" },
  cutReasonText: { color: "#4E646D", fontSize: 9.5, lineHeight: 14, marginTop: 3, fontWeight: "600" },
  cutBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cutBottomLabel: { color: "#819198", fontSize: 8.5, fontWeight: "700" },
  cutBottomValue: { color: "#1B5F65", fontSize: 10, fontWeight: "800" },
  seigniorageCard: { borderRadius: 20, backgroundColor: "#173B47", padding: 15, gap: 12 },
  seigniorageTop: { gap: 5 },
  seigniorageKind: { color: "#8CD3C7", fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  seigniorageAmount: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  verificationCard: { borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E6E1", padding: 14, gap: 12 },
  verificationHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  verificationSeal: { width: 39, height: 39, borderRadius: 20, backgroundColor: "#E3F5EC", alignItems: "center", justifyContent: "center" },
  verificationSealText: { color: "#278363", fontSize: 17, fontWeight: "800" },
  verificationTitle: { color: "#1F4B3F", fontSize: 13, fontWeight: "800" },
  verificationDate: { color: "#85958F", fontSize: 8.5, marginTop: 2, fontWeight: "600" },
  verificationRemarks: { borderRadius: 11, backgroundColor: "#F4F8F6", color: "#587069", fontSize: 9.5, lineHeight: 14, padding: 10, fontWeight: "600" },
  timelineCard: { borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE6E6", padding: 13 },
  timelineItem: { flexDirection: "row", minHeight: 62 },
  timelineAxis: { width: 24, alignItems: "center" },
  timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#9CB0B6", marginTop: 4, zIndex: 2 },
  timelineDotLatest: { backgroundColor: "#15949B", width: 11, height: 11, borderRadius: 6 },
  timelineLine: { position: "absolute", top: 13, bottom: -4, width: 1, backgroundColor: "#D7E3E3" },
  timelineCopy: { flex: 1, paddingBottom: 15 },
  timelineState: { color: "#284750", fontSize: 10.5, fontWeight: "800" },
  timelineTime: { color: "#8A9A9F", fontSize: 8, fontWeight: "600", marginTop: 2 },
  timelineNote: { color: "#657981", fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  emptyCard: { minHeight: 86, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "rgba(255,255,255,0.88)", borderWidth: 1, borderColor: "#DDE6E6", padding: 13 },
  emptyMark: { width: 35, height: 35, borderRadius: 12, backgroundColor: "#EDF4F4", alignItems: "center", justifyContent: "center" },
  emptyMarkInner: { width: 12, height: 12, borderRadius: 4, borderWidth: 2, borderColor: "#8FA6AD", transform: [{ rotate: "14deg" }] },
  emptyText: { flex: 1, color: "#647981", fontSize: 10.5, lineHeight: 15, fontWeight: "600" },
  footerTruth: { marginTop: 2, borderRadius: 19, backgroundColor: "rgba(23,59,71,0.94)", padding: 15 },
  footerTruthTitle: { color: "#80CEC0", fontSize: 8, fontWeight: "800", letterSpacing: 1.1 },
  footerTruthText: { color: "#BED0D4", fontSize: 9.5, lineHeight: 15, marginTop: 5, fontWeight: "600" },
  aiAssistantEntry: {
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CFE4E1",
    shadowColor: "#143A45",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  aiAssistantEntryPress: {
    minHeight: 76,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  aiAssistantOrb: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#173B47",
  },
  aiAssistantOrbText: {
    color: "#7CDBC8",
    fontSize: 12,
    fontWeight: "900",
  },
  aiAssistantEyebrow: {
    color: "#15949B",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  aiAssistantTitle: {
    color: "#25434D",
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
    fontWeight: "900",
  },
  aiAssistantSubtitle: {
    color: "#809298",
    fontSize: 8,
    lineHeight: 12,
    marginTop: 2,
    fontWeight: "700",
  },
  aiAssistantArrow: {
    color: "#709097",
    fontSize: 25,
    lineHeight: 28,
  },

  decisionCockpit: {
    overflow: "hidden",
    borderRadius: 22,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8E6E5",
    shadowColor: "#123741",
    shadowOpacity: 0.07,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  decisionCockpitGlow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -76,
    top: -104,
    backgroundColor: "rgba(76,205,181,0.075)",
  },
  decisionCockpitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  decisionCockpitEyebrow: {
    color: "#15949B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.85,
  },
  decisionCockpitTitle: {
    marginTop: 4,
    color: "#183B47",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  decisionCockpitSubtitle: {
    marginTop: 4,
    color: "#778B91",
    fontSize: 8.5,
    lineHeight: 13,
    fontWeight: "600",
  },
  decisionTruthBadge: {
    maxWidth: 112,
    minHeight: 28,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF7E8",
    borderWidth: 1,
    borderColor: "#ECD8AA",
  },
  decisionTruthBadgeVerified: {
    backgroundColor: "#EAF8F1",
    borderColor: "#C5E6D5",
  },
  decisionTruthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C78D2E",
  },
  decisionTruthDotVerified: {
    backgroundColor: "#2E9A72",
  },
  decisionTruthText: {
    flexShrink: 1,
    color: "#906A2B",
    fontSize: 6.4,
    lineHeight: 9,
    fontWeight: "900",
  },
  decisionTruthTextVerified: {
    color: "#287C60",
  },
  decisionCockpitGrid: {
    marginTop: 13,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  decisionCockpitCell: {
    width: "48%",
    flexGrow: 1,
    minWidth: 138,
    minHeight: 115,
    borderRadius: 16,
    padding: 11,
    backgroundColor: "#F6F9F9",
    borderWidth: 1,
    borderColor: "#E0E9E9",
  },
  decisionCockpitCellAttention: {
    backgroundColor: "#FFFBF3",
    borderColor: "#EBDDBD",
  },
  decisionCockpitIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E1F2EF",
  },
  decisionCockpitIconText: {
    color: "#167F84",
    fontSize: 8,
    fontWeight: "900",
  },
  decisionCockpitLabel: {
    marginTop: 8,
    color: "#72878E",
    fontSize: 7.2,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  decisionCockpitValue: {
    marginTop: 4,
    color: "#254650",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "900",
  },
  decisionCockpitMeta: {
    marginTop: 5,
    color: "#8A9A9F",
    fontSize: 7.2,
    lineHeight: 10,
    fontWeight: "700",
  },
  decisionAttentionRail: {
    marginTop: 10,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF5E7",
    borderWidth: 1,
    borderColor: "#ECD4A7",
  },
  decisionAttentionIcon: {
    width: 23,
    height: 23,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3DEB8",
  },
  decisionAttentionIconText: {
    color: "#90661D",
    fontSize: 10,
    fontWeight: "900",
  },
  decisionAttentionTitle: {
    color: "#805C24",
    fontSize: 9.5,
    fontWeight: "900",
  },
  decisionAttentionText: {
    marginTop: 3,
    color: "#7A694C",
    fontSize: 8.2,
    lineHeight: 12,
    fontWeight: "600",
  },
  decisionSafeRail: {
    marginTop: 10,
    minHeight: 35,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#EEF8F5",
    borderWidth: 1,
    borderColor: "#D2E9E1",
  },
  decisionSafeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#43A982",
  },
  decisionSafeText: {
    flex: 1,
    color: "#4C776A",
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "700",
  },

});

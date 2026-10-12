"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Language = "en" | "te";

const STORAGE_KEY = "granitemeasure.lang";

const en = {
  // Navigation / shell
  nav_dashboard: "Dashboard",
  nav_capture: "New Granite",
  nav_blocks: "Granite Blocks",
  nav_quarries: "Quarries",
  nav_ai_assistant: "AI Assistant",
  nav_analytics: "Analytics",
  nav_profile: "Profile",
  real_photo_3d_mode: "CAPTURE EVIDENCE + 3D VIEW",
  theme_light: "Light",
  theme_dark: "Dark",
  theme_system: "System",
  workspace: "Menu",
  system_health: "App Connection",
  api_connected: "Connected",
  api_disconnected: "Disconnected",
  local_dev: "Granite Measurement & Analysis",
  operations: "GraniteMeasure AI",
  select_operator: "Select User",

  // Assistant
  assistant_title: "Granite AI Assistant",
  assistant_subtitle:
    "Ask questions about measurements, reconstruction, visible findings, cutting, wastage, and limitations returned for the selected block.",
  assistant_eyebrow: "AI ASSISTANT",
  assistant_block_context: "Selected block",
  assistant_selected_record: "Selected block",
  assistant_evidence_prompts: "Suggested questions",
  assistant_question_placeholder:
    "Ask about measurements, reconstruction, findings, cutting, or limitations...",
  assistant_ask: "Ask",
  assistant_reviewing: "Reviewing...",
  assistant_empty_title: "Ask about the analysis evidence",
  assistant_empty_subtitle:
    "Unavailable measurements, surfaces, defects, cutting values, or confidence are not substituted with defaults.",
  assistant_referenced_fields: "Referenced fields:",
  assistant_follow_up: "Follow-up:",
  assistant_no_answer: "The backend returned no answer text.",
  assistant_request_failed: "Assistant request failed",
  assistant_analysis_failed: "Unable to load this block analysis",
  assistant_blocks_failed: "Unable to load blocks",
  assistant_no_blocks: "No block is available for analysis",
  assistant_no_blocks_sub:
    "Create a granite block capture before opening the assistant.",

  // Landing / dashboard
  hero_eyebrow: "GRANITE MEASUREMENT",
  hero_title: "Capture granite. Inspect the evidence.",
  hero_subtitle:
    "Use mobile photographs to create a block record and review measurements, reconstruction evidence, visible findings, cutting analysis, and limitations returned by the backend.",
  new_capture: "New Capture",
  enter_dashboard: "Enter Dashboard",
  start_capture: "Start Capture",
  access_console: "USER SELECTION",
  select_operator_title: "Select Your Name",
  continue_btn: "Continue",
  continue_as_guest: "Continue Without Selecting",
  live: "LIVE",
  kpi_blocks: "Granite Blocks",
  kpi_blocks_note: "Registered records",
  kpi_latest: "Latest Capture",
  kpi_latest_note: "Most recent record",
  kpi_quarries: "Quarries",
  kpi_quarries_note: "Registered sites",
  kpi_ai: "Analysis Capabilities",
  kpi_ai_note: "Backend-reported status",
  analyzed: "ANALYZED",
  volume_verified: "Volume reported",
  in_progress: "IN PROGRESS",
  active_pipeline: "Analysis in progress",
  recent_blocks: "Recent Blocks",
  view_register: "View All Blocks",
  workflow: "HOW IT WORKS",
  step_capture: "Take Photos",
  step_validate: "Check Photos",
  step_reconstruct: "Build 3D Model",
  step_measure: "Measure Block",
  step_yield: "Plan Cutting",

  // Blocks
  blocks_eyebrow: "GRANITE BLOCKS",
  blocks_title: "Granite Blocks",
  blocks_subtitle:
    "Browse captured block records and open the analysis evidence returned for each block.",
  search_blocks: "Search by block code, quarry, status...",
  filter_all: "ALL",
  filter_analyzed: "ANALYZED",
  filter_processing: "PROCESSING",
  filter_failed: "FAILED",
  no_blocks_found: "No granite blocks found",
  no_blocks_found_sub:
    "Captured granite block records returned by the backend will appear here.",
  no_match_blocks: "No matching blocks",
  no_match_blocks_sub: "Try a different search query or filter.",
  captured_on: "Captured on",
  quarry_ref: "Quarry",
  inspect_report: "Inspect Analysis",

  // Block detail
  detail_eyebrow: "BLOCK RESULT",
  back_to_register: "Back to Blocks",
  loading_report: "Loading block analysis...",
  high_confidence: "HIGH CONFIDENCE",
  medium_confidence: "MEDIUM CONFIDENCE",
  low_confidence: "LOW CONFIDENCE",
  calibrated_extents: "Measurements",
  ortools_yield: "Cutting Plan",
  length: "Length",
  breadth: "Breadth",
  height: "Height",
  volume_m3: "Volume (m³)",
  uncertainty: "Uncertainty",
  max_usable_volume: "Usable Volume",
  usable_area: "Usable Area",
  wastage_area: "Wastage Area",
  waste_percentage: "Waste Ratio",
  pieces_est: "Estimated Pieces",
  solver: "Solver / Method",
  confidence_breakdown: "Reported Confidence Factors",
  factor_image_quality: "Image Quality",
  factor_coverage: "Capture Coverage",
  factor_geometry: "Geometry Evidence",
  factor_watertight: "Mesh Status",
  geometry_mesh_card: "3D Geometry Evidence",
  watertight_volume: "Mesh Volume",
  surface_area: "Surface Area",
  point_count: "Point Count",
  inlier_ratio: "Feature Inlier Ratio",
  watertight_status: "Watertight Status",
  ai_capabilities_matrix: "Analysis Capabilities",
  surface_defects: "Visible Surface Findings",
  no_defects:
    "No visible-surface findings were reported for the analyzed evidence. This does not establish that the complete block is defect-free.",
  defects_found: "visible-surface finding(s) reported",
  bottom_surface: "Bottom Surface",
  bottom_surface_note: "Observation status is determined by capture evidence.",
  granite_classification: "Granite Classification",
  classification_result: "Reported Variety",
  classification_confidence: "Model Confidence",
  classification_provider: "Inference Provider",
  classification_unavailable:
    "Classification is unavailable or not configured for this analysis.",
  seigniorage_card: "Seigniorage Assessment",
  indicative_amount: "Indicative Amount",
  gangsaw_class: "Gangsaw Class",
  gazetted_rate: "Configured Rate / m³",
  est_mass: "Estimated Mass",
  density_used: "Density Used",
  photo_gallery: "Capture Evidence",
  photo_label: "Photo",

  // Capture
  capture_header: "CAPTURE WORKFLOW",
  capture_eyebrow: "FIELD CAPTURE",
  capture_title: "Granite Photo Capture",
  capture_subtitle:
    "Capture distinct overlapping viewpoints around the granite block. Follow backend capture guidance and keep any required scale or calibration reference visible.",
  config_step: "STEP 1: BLOCK & CALIBRATION",
  block_code_label: "Block Code",
  block_code_placeholder: "Auto-generated when supported",
  quarry_label: "Quarry",
  select_quarry_placeholder: "Select quarry site...",
  category_label: "Granite Category",
  select_category_placeholder: "Select category...",
  calib_method: "Calibration Method",
  calib_manual: "Manual Reference",
  calib_aruco: "ArUco Marker",
  calib_board: "Measurement Board",
  ref_size: "Reference Physical Length",
  ref_pixels: "Reference Pixel Length",
  gps_btn: "Acquire GPS Coordinates",
  gps_locked: "GPS Captured",
  sequence_step: "STEP 2: PHOTOGRAPHS",
  photos_required: "MORE EVIDENCE NEEDED",
  ready_to_submit: "READY TO SUBMIT",
  take_photo: "Take Photo",
  from_gallery: "Choose Files",
  drop_files_here: "Drop photographs here or click to select",
  photo_count_status: "Photos Captured",
  duplicate_warning:
    "Duplicate photograph detected. Capture a distinct viewpoint.",
  limit_reached: "The current backend capture contract rejected additional photos.",
  quality_score: "Quality",
  submit_capture: "SUBMIT CAPTURE FOR ANALYSIS",
  submitting: "SUBMITTING...",
  submit_incomplete_warning:
    "Complete the required block metadata and capture evidence before submitting.",
  upload_stage_init: "Creating block record...",
  upload_stage_uploading: "Uploading photographs...",
  upload_stage_analyzing: "Submitting analysis request...",

  // Quarries
  quarries_eyebrow: "QUARRY DIRECTORY",
  quarries_title: "Quarries",
  quarries_subtitle:
    "Manage quarry records and location metadata returned by the backend.",
  search_quarries: "Search quarry records...",
  lease_id: "Lease ID",
  district: "District",
  mandal: "Mandal",
  village: "Village",
  coordinates: "Coordinates",
  add_quarry_btn: "Add Quarry",
  quarry_name_label: "Quarry Name",
  quarry_code_label: "Quarry Code",
  create_quarry_submit: "Register Quarry",
  quarry_registered_success: "Quarry registered successfully.",
  quarry_no_records: "No quarries registered",
  quarry_no_records_sub:
    "Quarry records returned by the backend will appear here.",
  quarry_no_match: "No matching quarries",
  quarry_no_match_sub:
    "Try another quarry name, code, district, mandal, village, or lease reference.",
  quarry_location: "Location",
  quarry_gps: "GPS",
  quarry_gps_not_recorded: "Not recorded",
  quarry_code_not_recorded: "Code not recorded",
  quarry_enter_known_metadata: "Enter only known quarry and lease metadata.",
  quarry_gps_optional: "Optional device-location evidence",
  quarry_use_device_gps: "Use device GPS",
  quarry_acquiring_gps: "Acquiring...",
  quarry_gps_evidence_note:
    "GPS values are stored as captured or entered. No quarry location is inferred when coordinates are unavailable.",

  // Profile
  profile_eyebrow: "PROFILE",
  profile_title: "Profile",
  profile_subtitle:
    "Manage your selected user, language, and app connection.",
  active_operator: "Current User",
  operator_directory: "Users",
  language_pref: "Language Preference",
  language_desc: "Choose English or Telugu for the interface.",
  backend_config: "Backend Connection & Diagnostics",
  active_endpoint: "Active API Endpoint",
  ping_server: "Test Connection",
  testing: "Testing...",
  ping_success: "Reachable",
  ping_failed: "Connection Failed",
  logout: "Switch User",
  operator_id: "User ID",
  session_attribution: "Session Attribution",
  selected_for_session: "Selected for this device session",
  no_operator_selected: "No user selected",
  operator_attribution_note:
    "The selected user identifies the active app session. Roles or permissions are shown only when the backend provides them.",
  refresh_operator_directory: "Refresh users",
  no_operators_returned: "No users are available.",
  health_not_tested: "Connection status has not been tested on this screen.",
  health_reachable_note:
    "The health endpoint responded successfully. This confirms reachability only; it does not certify every analysis capability.",

  // Verification / 3D
  manual_verification_title: "Physical Verification",
  manual_verification_subtitle:
    "Compare backend-reported dimensions with physical yard measurements when a verification workflow is required.",
  physical_measurements: "Physical Yard Measure",
  ai_measurements: "Reported Analysis Extents",
  variance_pct: "Variance %",
  delta_cm: "Delta (cm)",
  decision_label: "Verification Decision",
  decision_verified: "VERIFIED (MATCHES)",
  decision_correction: "VERIFIED WITH CORRECTION",
  decision_rejected: "REJECTED (MISMATCH)",
  decision_reanalysis: "REQUIRES REANALYSIS",
  officer_remarks: "Field Notes / Remarks",
  submit_verification: "SUBMIT VERIFICATION",
  verification_history: "Verification History",
  no_verifications: "No physical verification records are available for this block.",
  view_3d_title: "Interactive 3D Evidence Viewer",
  view_3d_point_cloud: "3D Point Cloud",
  view_3d_bounding_box: "Bounding Box",
  orbit_controls_hint: "Drag: Rotate • Scroll/Pinch: Zoom",

  // Common
  loading: "Loading...",
  error: "Error",
  retry: "Retry",
  refresh: "Refresh",
  save: "Save",
  saving: "Saving...",
  cancel: "Cancel",
  delete: "Delete",
  clear: "Clear",
  unknown: "Unknown",
  not_reported: "Not reported",
  not_recorded: "Not recorded",
  status_operational: "OPERATIONAL",
  status_degraded: "DEGRADED",
  status_unavailable: "UNAVAILABLE",
  status_pending: "PENDING",
  status_synced: "SYNCED",
  status_failed: "FAILED",
  status_completed: "COMPLETED",
  status_analyzing: "ANALYZING",

  // Voice Assistant
  voice_assistant: 'Voice Assistant',
  voice_tap_to_speak: 'Tap to speak',
  voice_listening: 'Listening...',
  voice_processing: 'Processing...',
  voice_speaking: 'Speaking...',
  voice_stop: 'Stop',
  voice_retry: 'Retry',
  voice_replay: 'Replay',
  voice_cancel: 'Cancel',
  voice_mic_permission: 'Microphone permission required',
  voice_unavailable: 'Voice not available',
  voice_language_auto: 'Auto',
  voice_language_en: 'English',
  voice_language_te: 'Telugu',
  voice_transcript: 'Transcript',
  voice_ask_about_block: 'Ask about this block',
  voice_error_no_audio: 'No audio detected',
  voice_error_transcription: 'Could not transcribe audio',
  voice_tts_unavailable: 'Voice playback not available for this language',
} as const;

type TranslationShape = { [K in keyof typeof en]: string };

const te: TranslationShape = {
  // Navigation / shell
  nav_dashboard: "డాష్‌బోర్డ్",
  nav_capture: "కొత్త గ్రానైట్",
  nav_blocks: "గ్రానైట్ బ్లాకులు",
  nav_quarries: "క్వారీలు",
  nav_ai_assistant: "AI సహాయకుడు",
  nav_analytics: "విశ్లేషణలు",
  nav_profile: "ప్రొఫైల్",
  real_photo_3d_mode: "క్యాప్చర్ ఆధారాలు + 3D వీక్షణ",
  theme_light: "లైట్",
  theme_dark: "డార్క్",
  theme_system: "సిస్టమ్",
  workspace: "మెను",
  system_health: "యాప్ కనెక్షన్",
  api_connected: "API అందుబాటులో ఉంది",
  api_disconnected: "API కనెక్షన్ లేదు",
  local_dev: "ఇంజనీరింగ్ వర్క్‌స్పేస్",
  operations: "గ్రానైట్‌మెజర్ AI",
  select_operator: "వినియోగదారుని ఎంచుకోండి",

  // Assistant
  assistant_title: "గ్రానైట్ ఎవిడెన్స్ అసిస్టెంట్",
  assistant_subtitle:
    "ఎంచుకున్న బ్లాక్‌కు బ్యాక్‌ఎండ్ ఇచ్చిన కొలతలు, పునర్నిర్మాణం, కనిపించే లోపాలు, కట్టింగ్, వ్యర్థాలు మరియు పరిమితుల గురించి అడగండి.",
  assistant_eyebrow: "బ్లాక్ విశ్లేషణ సహాయకుడు",
  assistant_block_context: "బ్లాక్ సందర్భం",
  assistant_selected_record: "ఎంచుకున్న రికార్డ్",
  assistant_evidence_prompts: "ఆధార ప్రశ్నలు",
  assistant_question_placeholder:
    "కొలతలు, పునర్నిర్మాణం, లోపాలు, కట్టింగ్ లేదా పరిమితుల గురించి అడగండి...",
  assistant_ask: "అడగండి",
  assistant_reviewing: "పరిశీలిస్తోంది...",
  assistant_empty_title: "విశ్లేషణ ఆధారాల గురించి అడగండి",
  assistant_empty_subtitle:
    "అందుబాటులో లేని కొలతలు, ఉపరితలాలు, లోపాలు, కట్టింగ్ విలువలు లేదా విశ్వసనీయతకు డిఫాల్ట్ విలువలు పెట్టబడవు.",
  assistant_referenced_fields: "సూచించిన ఫీల్డ్స్:",
  assistant_follow_up: "తదుపరి:",
  assistant_no_answer: "బ్యాక్‌ఎండ్ సమాధాన టెక్స్ట్ ఇవ్వలేదు.",
  assistant_request_failed: "అసిస్టెంట్ అభ్యర్థన విఫలమైంది",
  assistant_analysis_failed: "ఈ బ్లాక్ విశ్లేషణను లోడ్ చేయలేకపోయాం",
  assistant_blocks_failed: "బ్లాక్‌లను లోడ్ చేయలేకపోయాం",
  assistant_no_blocks: "విశ్లేషించడానికి బ్లాక్ అందుబాటులో లేదు",
  assistant_no_blocks_sub:
    "అసిస్టెంట్‌ను ఉపయోగించే ముందు గ్రానైట్ బ్లాక్ క్యాప్చర్‌ను సృష్టించండి.",

  // Landing / dashboard
  hero_eyebrow: "గ్రానైట్ కొలత",
  hero_title: "గ్రానైట్‌ను క్యాప్చర్ చేయండి. ఆధారాలను పరిశీలించండి.",
  hero_subtitle:
    "మొబైల్ ఫోటోలతో బ్లాక్ రికార్డ్ సృష్టించి, బ్యాక్‌ఎండ్ ఇచ్చిన కొలతలు, పునర్నిర్మాణ ఆధారాలు, కనిపించే లోపాలు, కట్టింగ్ విశ్లేషణ మరియు పరిమితులను పరిశీలించండి.",
  new_capture: "కొత్త క్యాప్చర్",
  enter_dashboard: "డాష్‌బోర్డ్‌లోకి వెళ్లండి",
  start_capture: "క్యాప్చర్ ప్రారంభించండి",
  access_console: "వినియోగదారు ఎంపిక",
  select_operator_title: "మీ పేరును ఎంచుకోండి",
  continue_btn: "కొనసాగించండి",
  continue_as_guest: "ఎంపిక చేయకుండా కొనసాగండి",
  live: "లైవ్",
  kpi_blocks: "గ్రానైట్ బ్లాకులు",
  kpi_blocks_note: "నమోదైన రికార్డులు",
  kpi_latest: "తాజా క్యాప్చర్",
  kpi_latest_note: "ఇటీవలి రికార్డ్",
  kpi_quarries: "క్వారీలు",
  kpi_quarries_note: "నమోదైన సైట్లు",
  kpi_ai: "విశ్లేషణ సామర్థ్యాలు",
  kpi_ai_note: "బ్యాక్‌ఎండ్ తెలిపిన స్థితి",
  analyzed: "విశ్లేషించబడింది",
  volume_verified: "పరిమాణం నివేదించబడింది",
  in_progress: "ప్రాసెసింగ్‌లో ఉంది",
  active_pipeline: "విశ్లేషణ జరుగుతోంది",
  recent_blocks: "ఇటీవలి బ్లాకులు",
  view_register: "అన్ని బ్లాకులు చూడండి",
  workflow: "మెజర్‌మెంట్ వర్క్‌ఫ్లో",
  step_capture: "వరుస క్యాప్చర్",
  step_validate: "ఫోటోలు తనిఖీ చేయండి",
  step_reconstruct: "3D మోడల్ తయారు చేయండి",
  step_measure: "బ్లాక్ కొలవండి",
  step_yield: "కట్టింగ్ విశ్లేషణ",

  // Blocks
  blocks_eyebrow: "గ్రానైట్ బ్లాక్స్",
  blocks_title: "గ్రానైట్ బ్లాక్స్",
  blocks_subtitle:
    "క్యాప్చర్ చేసిన బ్లాక్ రికార్డులను చూసి ప్రతి బ్లాక్‌కు బ్యాక్‌ఎండ్ ఇచ్చిన విశ్లేషణ ఆధారాలను తెరవండి.",
  search_blocks: "బ్లాక్ కోడ్, క్వారీ, స్థితి ద్వారా వెతకండి...",
  filter_all: "అన్నీ",
  filter_analyzed: "విశ్లేషించబడినవి",
  filter_processing: "ప్రాసెసింగ్",
  filter_failed: "విఫలమైనవి",
  no_blocks_found: "గ్రానైట్ బ్లాకులు లేవు",
  no_blocks_found_sub:
    "బ్యాక్‌ఎండ్ ఇచ్చిన క్యాప్చర్ రికార్డులు ఇక్కడ కనిపిస్తాయి.",
  no_match_blocks: "సరిపోలే బ్లాకులు లేవు",
  no_match_blocks_sub: "మరొక శోధన పదం లేదా ఫిల్టర్ ప్రయత్నించండి.",
  captured_on: "క్యాప్చర్ తేదీ",
  quarry_ref: "క్వారీ",
  inspect_report: "విశ్లేషణ చూడండి",

  // Block detail
  detail_eyebrow: "బ్లాక్ ఫలితం",
  back_to_register: "రిజిస్టర్‌కు తిరిగి వెళ్లండి",
  loading_report: "బ్లాక్ విశ్లేషణ లోడ్ అవుతోంది...",
  high_confidence: "అధిక విశ్వసనీయత",
  medium_confidence: "మధ్యస్థ విశ్వసనీయత",
  low_confidence: "తక్కువ విశ్వసనీయత",
  calibrated_extents: "నివేదించిన భౌతిక కొలతలు",
  ortools_yield: "కట్టింగ్ ప్లాన్",
  length: "పొడవు",
  breadth: "వెడల్పు",
  height: "ఎత్తు",
  volume_m3: "ఘనపరిమాణం (m³)",
  uncertainty: "అనిశ్చితి",
  max_usable_volume: "ఉపయోగకర ఘనపరిమాణం",
  usable_area: "ఉపయోగకర విస్తీర్ణం",
  wastage_area: "వ్యర్థ విస్తీర్ణం",
  waste_percentage: "వ్యర్థ నిష్పత్తి",
  pieces_est: "అంచనా ముక్కలు",
  solver: "సాల్వర్ / పద్ధతి",
  confidence_breakdown: "నివేదించిన విశ్వసనీయత అంశాలు",
  factor_image_quality: "చిత్ర నాణ్యత",
  factor_coverage: "క్యాప్చర్ కవరేజ్",
  factor_geometry: "జ్యామితి ఆధారం",
  factor_watertight: "మెష్ స్థితి",
  geometry_mesh_card: "3D జ్యామితి ఆధారం",
  watertight_volume: "మెష్ ఘనపరిమాణం",
  surface_area: "ఉపరితల వైశాల్యం",
  point_count: "పాయింట్ల సంఖ్య",
  inlier_ratio: "ఫీచర్ ఇన్‌లయర్ నిష్పత్తి",
  watertight_status: "వాటర్‌టైట్ స్థితి",
  ai_capabilities_matrix: "విశ్లేషణ సామర్థ్యాలు",
  surface_defects: "కనిపించే ఉపరితల ఫలితాలు",
  no_defects:
    "విశ్లేషించిన ఆధారాల్లో కనిపించే ఉపరితల ఫలితాలు నివేదించబడలేదు. దీనివల్ల మొత్తం బ్లాక్ లోపరహితం అని నిర్ధారించబడదు.",
  defects_found: "కనిపించే ఉపరితల ఫలితం(లు) నివేదించబడ్డాయి",
  bottom_surface: "క్రింది ఉపరితలం",
  bottom_surface_note: "పరిశీలన స్థితి క్యాప్చర్ ఆధారాల ద్వారా నిర్ణయించబడుతుంది.",
  granite_classification: "గ్రానైట్ వర్గీకరణ",
  classification_result: "నివేదించిన రకం",
  classification_confidence: "మోడల్ విశ్వసనీయత",
  classification_provider: "ఇన్‌ఫరెన్స్ ప్రొవైడర్",
  classification_unavailable:
    "ఈ విశ్లేషణకు వర్గీకరణ అందుబాటులో లేదు లేదా కాన్ఫిగర్ చేయబడలేదు.",
  seigniorage_card: "సీనియోరేజ్ అంచనా",
  indicative_amount: "సూచనాత్మక మొత్తం",
  gangsaw_class: "గ్యాంగ్‌సా క్లాస్",
  gazetted_rate: "కాన్ఫిగర్ చేసిన రేటు / m³",
  est_mass: "అంచనా బరువు",
  density_used: "ఉపయోగించిన సాంద్రత",
  photo_gallery: "క్యాప్చర్ ఆధారాలు",
  photo_label: "ఫోటో",

  // Capture
  capture_header: "క్యాప్చర్ వర్క్‌ఫ్లో",
  capture_eyebrow: "ఫీల్డ్ క్యాప్చర్",
  capture_title: "గ్రానైట్ ఫోటో క్యాప్చర్",
  capture_subtitle:
    "గ్రానైట్ బ్లాక్ చుట్టూ వేర్వేరు ఓవర్ల్యాపింగ్ కోణాల నుంచి ఫోటోలు తీయండి. బ్యాక్‌ఎండ్ క్యాప్చర్ సూచనలను అనుసరించి అవసరమైన స్కేల్ లేదా కాలిబ్రేషన్ రిఫరెన్స్‌ను ఫ్రేమ్‌లో ఉంచండి.",
  config_step: "దశ 1: బ్లాక్ & కాలిబ్రేషన్",
  block_code_label: "బ్లాక్ కోడ్",
  block_code_placeholder: "మద్దతు ఉంటే ఆటో-జెనరేట్ అవుతుంది",
  quarry_label: "క్వారీ",
  select_quarry_placeholder: "క్వారీ సైట్ ఎంచుకోండి...",
  category_label: "గ్రానైట్ కేటగిరీ",
  select_category_placeholder: "కేటగిరీ ఎంచుకోండి...",
  calib_method: "కాలిబ్రేషన్ పద్ధతి",
  calib_manual: "మాన్యువల్ రిఫరెన్స్",
  calib_aruco: "ArUco మార్కర్",
  calib_board: "మెజర్‌మెంట్ బోర్డ్",
  ref_size: "రిఫరెన్స్ భౌతిక పొడవు",
  ref_pixels: "రిఫరెన్స్ పిక్సెల్ పొడవు",
  gps_btn: "GPS కోఆర్డినేట్స్ పొందండి",
  gps_locked: "GPS క్యాప్చర్ అయింది",
  sequence_step: "దశ 2: ఫోటోలు",
  photos_required: "ఇంకా ఆధారాలు అవసరం",
  ready_to_submit: "సమర్పించడానికి సిద్ధం",
  take_photo: "ఫోటో తీయండి",
  from_gallery: "ఫైళ్ళను ఎంచుకోండి",
  drop_files_here: "ఫోటోలను ఇక్కడ డ్రాప్ చేయండి లేదా ఎంచుకోండి",
  photo_count_status: "క్యాప్చర్ చేసిన ఫోటోలు",
  duplicate_warning:
    "ఒకే ఫోటో గుర్తించబడింది. వేరే కోణం నుంచి క్యాప్చర్ చేయండి.",
  limit_reached:
    "ప్రస్తుత బ్యాక్‌ఎండ్ క్యాప్చర్ కాంట్రాక్ట్ అదనపు ఫోటోలను తిరస్కరించింది.",
  quality_score: "నాణ్యత",
  submit_capture: "విశ్లేషణ కోసం క్యాప్చర్ సమర్పించండి",
  submitting: "సమర్పిస్తోంది...",
  submit_incomplete_warning:
    "సమర్పించే ముందు అవసరమైన బ్లాక్ వివరాలు మరియు క్యాప్చర్ ఆధారాలను పూర్తి చేయండి.",
  upload_stage_init: "బ్లాక్ రికార్డ్ సృష్టిస్తోంది...",
  upload_stage_uploading: "ఫోటోలను అప్‌లోడ్ చేస్తోంది...",
  upload_stage_analyzing: "విశ్లేషణ అభ్యర్థన సమర్పిస్తోంది...",

  // Quarries
  quarries_eyebrow: "క్వారీ డైరెక్టరీ",
  quarries_title: "క్వారీలు",
  quarries_subtitle:
    "బ్యాక్‌ఎండ్ ఇచ్చిన క్వారీ రికార్డులు మరియు స్థానం మెటాడేటాను నిర్వహించండి.",
  search_quarries: "క్వారీ రికార్డులను వెతకండి...",
  lease_id: "లీజు ఐడీ",
  district: "జిల్లా",
  mandal: "మండలం",
  village: "గ్రామం",
  coordinates: "కోఆర్డినేట్స్",
  add_quarry_btn: "క్వారీ జోడించండి",
  quarry_name_label: "క్వారీ పేరు",
  quarry_code_label: "క్వారీ కోడ్",
  create_quarry_submit: "క్వారీ నమోదు చేయండి",
  quarry_registered_success: "క్వారీ విజయవంతంగా నమోదైంది.",
  quarry_no_records: "క్వారీలు నమోదు కాలేదు",
  quarry_no_records_sub: "బ్యాక్‌ఎండ్ ఇచ్చిన క్వారీ రికార్డులు ఇక్కడ కనిపిస్తాయి.",
  quarry_no_match: "సరిపోలే క్వారీలు లేవు",
  quarry_no_match_sub:
    "మరొక క్వారీ పేరు, కోడ్, జిల్లా, మండలం, గ్రామం లేదా లీజు రిఫరెన్స్ ప్రయత్నించండి.",
  quarry_location: "స్థానం",
  quarry_gps: "GPS",
  quarry_gps_not_recorded: "నమోదు కాలేదు",
  quarry_code_not_recorded: "కోడ్ నమోదు కాలేదు",
  quarry_enter_known_metadata: "తెలిసిన క్వారీ మరియు లీజు వివరాలను మాత్రమే నమోదు చేయండి.",
  quarry_gps_optional: "ఐచ్ఛిక డివైస్-లోకేషన్ ఆధారం",
  quarry_use_device_gps: "డివైస్ GPS ఉపయోగించండి",
  quarry_acquiring_gps: "GPS పొందుతోంది...",
  quarry_gps_evidence_note:
    "GPS విలువలు క్యాప్చర్ చేసినట్లుగా లేదా నమోదు చేసినట్లుగా నిల్వ చేయబడతాయి. కోఆర్డినేట్స్ లేనప్పుడు క్వారీ స్థానాన్ని ఊహించదు.",

  // Profile
  profile_eyebrow: "ప్రొఫైల్",
  profile_title: "ప్రొఫైల్",
  profile_subtitle:
    "ఎంచుకున్న వినియోగదారు, భాష మరియు యాప్ కనెక్షన్‌ను నిర్వహించండి.",
  active_operator: "ప్రస్తుత వినియోగదారు",
  operator_directory: "వినియోగదారులు",
  language_pref: "భాషా ప్రాధాన్యత",
  language_desc: "ఇంటర్‌ఫేస్ కోసం ఇంగ్లీష్ లేదా తెలుగును ఎంచుకోండి.",
  backend_config: "బ్యాక్‌ఎండ్ కనెక్షన్ & డయాగ్నస్టిక్స్",
  active_endpoint: "యాక్టివ్ API ఎండ్‌పాయింట్",
  ping_server: "కనెక్షన్ పరీక్షించండి",
  testing: "పరీక్షిస్తోంది...",
  ping_success: "అందుబాటులో ఉంది",
  ping_failed: "కనెక్షన్ విఫలమైంది",
  logout: "వినియోగదారుని మార్చండి",
  operator_id: "వినియోగదారు ఐడీ",
  session_attribution: "సెషన్ అట్రిబ్యూషన్",
  selected_for_session: "ఈ డివైస్ సెషన్ కోసం ఎంచుకోబడింది",
  no_operator_selected: "వినియోగదారు ఎంచుకోలేదు",
  operator_attribution_note:
    "ఎంచుకున్న వినియోగదారు ప్రస్తుత యాప్ సెషన్‌ను సూచిస్తారు. పాత్ర లేదా అనుమతులు బ్యాక్‌ఎండ్ ఇచ్చినప్పుడు మాత్రమే చూపబడతాయి.",
  refresh_operator_directory: "వినియోగదారులను రిఫ్రెష్ చేయండి",
  no_operators_returned: "వినియోగదారులు అందుబాటులో లేరు.",
  health_not_tested: "ఈ స్క్రీన్‌లో కనెక్షన్ స్థితి ఇంకా పరీక్షించబడలేదు.",
  health_reachable_note:
    "హెల్త్ ఎండ్‌పాయింట్ విజయవంతంగా స్పందించింది. ఇది అందుబాటును మాత్రమే నిర్ధారిస్తుంది; ప్రతి విశ్లేషణ సామర్థ్యాన్ని ధృవీకరించదు.",

  // Verification / 3D
  manual_verification_title: "భౌతిక ధృవీకరణ",
  manual_verification_subtitle:
    "ధృవీకరణ అవసరమైనప్పుడు బ్యాక్‌ఎండ్ తెలిపిన కొలతలను యార్డ్‌లో తీసిన భౌతిక కొలతలతో పోల్చండి.",
  physical_measurements: "భౌతిక యార్డ్ కొలతలు",
  ai_measurements: "నివేదించిన విశ్లేషణ కొలతలు",
  variance_pct: "వ్యత్యాసం %",
  delta_cm: "తేడా (సెం.మీ)",
  decision_label: "ధృవీకరణ నిర్ణయం",
  decision_verified: "ధృవీకరించబడింది (సరిపోలింది)",
  decision_correction: "సవరణతో ధృవీకరించబడింది",
  decision_rejected: "తిరస్కరించబడింది (సరిపోలలేదు)",
  decision_reanalysis: "మళ్లీ విశ్లేషణ అవసరం",
  officer_remarks: "ఫీల్డ్ నోట్స్ / రిమార్కులు",
  submit_verification: "ధృవీకరణ సమర్పించండి",
  verification_history: "ధృవీకరణ చరిత్ర",
  no_verifications: "ఈ బ్లాక్‌కు భౌతిక ధృవీకరణ రికార్డులు అందుబాటులో లేవు.",
  view_3d_title: "ఇంటరాక్టివ్ 3D ఎవిడెన్స్ వీయర్",
  view_3d_point_cloud: "3D పాయింట్ క్లౌడ్",
  view_3d_bounding_box: "బౌండింగ్ బాక్స్",
  orbit_controls_hint: "తిప్పడానికి డ్రాగ్ చేయండి • జూమ్‌కు స్క్రోల్/పించ్ చేయండి",

  // Common
  loading: "లోడ్ అవుతోంది...",
  error: "లోపం",
  retry: "మళ్లీ ప్రయత్నించండి",
  refresh: "రిఫ్రెష్",
  save: "సేవ్ చేయండి",
  saving: "సేవ్ అవుతోంది...",
  cancel: "రద్దు చేయండి",
  delete: "తొలగించండి",
  clear: "క్లియర్ చేయండి",
  unknown: "తెలియదు",
  not_reported: "నివేదించబడలేదు",
  not_recorded: "నమోదు కాలేదు",
  status_operational: "కార్యాచరణలో ఉంది",
  status_degraded: "పరిమిత సామర్థ్యం",
  status_unavailable: "అందుబాటులో లేదు",
  status_pending: "పెండింగ్",
  status_synced: "సింక్ అయింది",
  status_failed: "విఫలమైంది",
  status_completed: "పూర్తయింది",
  status_analyzing: "విశ్లేషణ జరుగుతోంది",

  // Voice Assistant
  voice_assistant: 'వాయిస్ అసిస్టెంట్',
  voice_tap_to_speak: 'మాట్లాడటానికి నొక్కండి',
  voice_listening: 'వింటోంది...',
  voice_processing: 'ప్రాసెసింగ్...',
  voice_speaking: 'చెప్తోంది...',
  voice_stop: 'ఆపు',
  voice_retry: 'మళ్ళీ ప్రయత్నించు',
  voice_replay: 'మళ్ళీ వినండి',
  voice_cancel: 'రద్దు',
  voice_mic_permission: 'మైక్రోఫోన్ అనుమతి అవసరం',
  voice_unavailable: 'వాయిస్ అందుబాటులో లేదు',
  voice_language_auto: 'ఆటో',
  voice_language_en: 'English',
  voice_language_te: 'తెలుగు',
  voice_transcript: 'ట్రాన్స్క్రిప్ట్',
  voice_ask_about_block: 'ఈ బ్లాక్ గురించి అడగండి',
  voice_error_no_audio: 'ఆడియో గుర్తించలేదు',
  voice_error_transcription: 'ఆడియోను టెక్స్ట్గా మార్చలేకపోయాము',
  voice_tts_unavailable: 'ఈ భాషకు వాయిస్ ప్లేబ్యాక్ అందుబాటులో లేదు',
};

export const translations = { en, te } as const;

export type TranslationKey = keyof typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "te";
}

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLanguage(saved)) {
        setLanguageState(saved);
      }
    } catch {
      // Storage may be unavailable in private/restricted browser contexts.
    }
  }, []);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);

    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // Keep the in-memory language even when persistence is unavailable.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string =>
      translations[language][key] ?? translations.en[key] ?? key,
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextType {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useTranslation must be used inside LanguageProvider.");
  }

  return context;
}

export function useLanguage() {
  const context = useTranslation();

  return {
    lang: context.language,
    language: context.language,
    setLanguage: context.setLanguage,
    t: context.t,
  };
}

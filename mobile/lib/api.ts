import { Platform } from 'react-native';
import { AppStorage } from './storage';

const CUSTOM_API_URL_KEY = 'granitemeasure.custom-api-url';
const USER_KEY = 'granitemeasure.selected-user-id';
const PREFIX = '/api/v1';

/**
 * Dynamic default host calculation based on runtime platform:
 * - Desktop Web: http://127.0.0.1:8000 (or current host)
 * - Android Emulator: http://10.0.2.2:8000
 * - Physical Device on LAN: http://192.168.1.41:8000
 */
const DEFAULT_LAN_HOST = 'http://192.168.1.41:8000';

function getDefaultHost(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8000';
      }
      return `http://${hostname}:8000`;
    }
    return 'http://127.0.0.1:8000';
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return DEFAULT_LAN_HOST;
}

function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '');
}

async function getStoredValue(key: string): Promise<string | null> {
  return await AppStorage.getItem(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  await AppStorage.setItem(key, value);
}

async function deleteStoredValue(key: string): Promise<void> {
  await AppStorage.removeItem(key);
}

export let cachedApiBase: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiBase) {
    return cachedApiBase;
  }

  // 1. User-configured URL
  const custom = await getStoredValue(CUSTOM_API_URL_KEY);

  if (custom && custom.trim()) {
    cachedApiBase = normalizeBaseUrl(custom);
    return cachedApiBase;
  }

  // 2. Expo environment variable
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  if (envUrl && envUrl.trim()) {
    cachedApiBase = normalizeBaseUrl(envUrl);
    return cachedApiBase;
  }

  // 3. Platform fallback
  cachedApiBase = getDefaultHost();

  return cachedApiBase;
}

export async function setCustomApiUrl(
  url: string | null
): Promise<void> {
  if (!url || !url.trim()) {
    cachedApiBase = null;
    await deleteStoredValue(CUSTOM_API_URL_KEY);
    return;
  }

  const clean = normalizeBaseUrl(url);

  cachedApiBase = clean;

  await setStoredValue(CUSTOM_API_URL_KEY, clean);
}

/**
 * Synchronous API base used by code that needs a constant.
 */
export const API_BASE = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL || getDefaultHost()
);

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type User = {
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
  district: string;
  granite_category_id: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type Category = {
  id: string;
  code: string;
  name: string;
};

export type Block = {
  id: string;
  block_code: string;
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy_m?: number | null;
};

export type Session = {
  id: string;
  block_id: string;
  status: string;
  calibration_type?: string | null;
  known_reference_cm?: number | null;
  marker_size_cm?: number | null;
  calibration_confidence?: number | null;
};

export type ImageResult = {
  id: string;
  capture_session_id?: string;
  capture_side: string;
  image_url: string;
  accepted: boolean;
  rejected: boolean;
  sequence_number?: number | null;
  captured_at?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  quality_score?: number | null;
  validation?: {
    is_granite?: boolean | null;
    error_code?: string | null;
    error_message?: string | null;
    quality_score?: number | null;
    detection_confidence?: number | null;
    calibration_detected?: boolean;
    issues?: string[];
  } | null;
};

export type Job = {
  id: string;
  capture_session_id: string;
  block_id: string;
  state: string;
  current_stage?: string | null;
  progress_percent?: number;
  failure_reason?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  demo_simulated?: boolean;
  transitions?: Array<{
    from_state: string | null;
    to_state: string;
    timestamp: string;
    note: string | null;
  }>;
};

export type MeasurementRecord = {
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  length_uncertainty_cm?: number | null;
  breadth_uncertainty_cm?: number | null;
  height_uncertainty_cm?: number | null;
  volume_m3?: number | null;
  measurement_confidence?: number | null;
  confidence_grade?:
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW'
    | 'INSUFFICIENT'
    | null;
  confidence_factors?: Record<string, number> | null;
  analysis_method?: string;
  images_used?: number;
  calibration_method?: string | null;
  surfaces_analyzed?: string[];
  cm_per_pixel?: number | null;
};

export type GeometryRecord = {
  point_cloud_path?: string | null;
  mesh_path?: string | null;
  bounding_box_json?: Record<string, unknown> | null;
  oriented_bounding_box_json?: Record<string, unknown> | null;
  axis_aligned_bounding_box_json?: Record<string, unknown> | null;
  simplified_geometry_json?: Record<string, any> | null;
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

export type DefectFinding = {
  id?: string;
  kind: string;
  type?: string;
  severity: string;
  surface: string;
  bbox?: number[];
  confidence: number | null;
  visible_surface_defect?: boolean;
  internal_defect?: boolean;
  depth_status?: string;
  provenance?: string;
  cutting_impact?: string;
};

export type DefectRecord = {
  provider: string;
  status: string;
  visible_defects: DefectFinding[];
  bottom_surface: string;
  internal_defects_claimed: boolean;
  error_code?: string | null;
  error_message?: string | null;
};

export type CuttingRecord = {
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
  orientations: Array<Record<string, unknown>>;
  final_dressed_dimensions?: {
    length_m?: number;
    breadth_m?: number;
    height_m?: number;
    length_cm?: number;
    breadth_cm?: number;
    height_cm?: number;
  } | null;
  cutting_steps?: Array<{
    step_number: number;
    cut_name: string;
    plane_axis: string;
    position_m: number;
    position_cm: number;
    cut_area_m2: number;
    removed_volume_m3: number;
    waste_category: string;
    reason: string;
  }> | null;
  scenarios?: Record<string, unknown> | null;
  confirmed_case?: Record<string, unknown> | null;
  conservative_case?: Record<string, unknown> | null;
  maximum_recovery_case?: Record<string, unknown> | null;
  parameters?: Record<string, unknown> | null;
};

export type WastageRecord = {
  bounding_volume_cm3?: number | null;
  adjusted_geometry_volume_cm3?: number | null;
  bounding_method?: string;
  adjusted_method?: string | null;
  irregularity_ratio?: number | null;
  max_usable_cut_volume_cm3?: number | null;
  estimated_waste_volume_cm3?: number | null;
  waste_percentage?: number | null;
  defect_exclusion_volume_cm3?: number | null;
  shape_notes?: Record<string, unknown>;
};

export type SeigniorageRecord = {
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

export type ClassificationRecord = {
  classification?: string | null;
  variety_name?: string | null;
  confidence?: number | null;
  provider: string;
  status: string;
  error_message?: string | null;
};

export type AIExplanationRecord = {
  decision: string;
  summary: string;
  why: string[];
  tradeoffs: string[];
  confidence_grade: string;
  confidence_score: number;
  waste_percentage: number;
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
    estimated_geometry: string[];
    optimization_decisions: string[];
    ai_interpretations: string[];
  };
  orientations_comparison: Array<Record<string, unknown>>;
  limitations: string[];
};

export type PhotoEvidenceItem = {
  photo_id: string;
  photo_label: string;
  side: string;
  view_name: string;
  camera_angles?: { azimuth: number; elevation: number; distance_m: number };
  image_url?: string | null;
  is_provided?: boolean;
  is_observed?: boolean;
  silhouette_iou?: number;
  boundary_error_px?: number;
  feature_reprojection_error_px?: number;
  view_confidence?: "HIGH" | "MEDIUM" | "LOW" | "UNOBSERVED" | string;
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
    image_region: [number, number, number, number] | number[];
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
  calibration_status: "AVAILABLE" | "MISSING" | string;
  calibration_method: string;
  feature_match_quality: number;
  silhouette_consistency: number;
  overall_silhouette_iou?: number;
  mean_boundary_error_px?: number;
  mean_reprojection_error_px?: number;
  camera_coverage_percentage: number;
  missing_surfaces: string[];
  observed_surfaces: string[];
  reconstruction_confidence: number;
  metric_measurement_allowed: boolean;
  metric_measurement_status: "ALLOWED" | "NOT_ALLOWED" | string;
  status: string;
  provenance: string;
};

export type UnifiedAnalysis = {
  block_id: string;
  status: string;
  capabilities: Record<
    string,
    {
      status: string;
      provider: string;
      reason?: string | null;
    }
  >;
  job: Job | null;
  measurement: MeasurementRecord | null;
  geometry: GeometryRecord | null;
  defects: DefectRecord | null;
  classification: ClassificationRecord | null;
  cutting: CuttingRecord | null;
  wastage: WastageRecord | null;
  seigniorage: SeigniorageRecord | null;
  reconstruction_quality?: ReconstructionQualityReport | null;
  photo_evidence_matrix?: PhotoEvidenceItem[] | null;
  points_3d_url?: string | null;
  ai_explanation?: AIExplanationRecord | null;
};

/* -------------------------------------------------------------------------- */
/* User storage                                                               */
/* -------------------------------------------------------------------------- */

export async function selectedUserId(): Promise<string | null> {
  return getStoredValue(USER_KEY);
}

export async function saveSelectedUser(
  id: string
): Promise<void> {
  await setStoredValue(USER_KEY, id);
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = await getApiBaseUrl();
  const user = await selectedUserId();

  const headers = new Headers(options.headers);

  if (user) {
    headers.set('x-selected-user-id', user);
  }

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const cleanPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const fullUrl =
    `${base}${PREFIX}${cleanPath}`;

  console.log('[API]', options.method || 'GET', fullUrl);

  const isHealth = path.includes('health');
  const timeoutMs = isHealth ? 4000 : 30000;

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  let response: Response;

  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    console.error('[API] Network error:', error);

    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'The backend request timed out. Please try again.'
      );
    }

    throw new Error(
      `Unable to connect to GraniteMeasure AI backend at ${fullUrl}.`
    );
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();

  let body: unknown = null;

  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (!response.ok) {
    const detail =
      typeof body === 'object' &&
      body &&
      'detail' in body &&
      typeof body.detail === 'string'
        ? body.detail
        : typeof body === 'string' &&
          body.trim()
        ? body
        : `Request failed (HTTP ${response.status})`;

    throw new Error(detail);
  }

  if (!raw.trim()) {
    throw new Error(
      'The backend returned an empty response.'
    );
  }

  if (
    typeof body === 'string' &&
    body.trim().startsWith('<')
  ) {
    throw new Error(
      'The backend returned an invalid HTML response. Check the API address.'
    );
  }

  return body as T;
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

export const api = {
  health: async (): Promise<{ status: string }> => {
    try {
      const base = await getApiBaseUrl();

      console.log(
        '[API] Health check:',
        `${base}/health`
      );

      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        4000
      );

      try {
        const res = await fetch(
          `${base}/health`,
          {
            signal: controller.signal,
          }
        );

        if (res.ok) {
          return { status: 'operational' };
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      console.warn(
        '[API] Health check failed:',
        error
      );
    }

    return { status: 'unavailable' };
  },

  capabilities: () =>
    request<
      Record<
        string,
        {
          status: string;
          provider: string;
          reason?: string | null;
        }
      >
    >('/capabilities'),

  users: () =>
    request<User[]>('/demo-users'),

  quarries: () =>
    request<Quarry[]>('/quarries'),

  createQuarry: (payload: object) =>
    request<Quarry>('/quarries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchQuarries: (
    query?: string,
    lat?: number,
    lng?: number
  ) => {
    const params = new URLSearchParams();

    if (query) params.set('q', query);
    if (lat != null) params.set('lat', String(lat));
    if (lng != null) params.set('lng', String(lng));

    const qs = params.toString();

    return request<Quarry[]>(
      `/quarries/search${qs ? `?${qs}` : ''}`
    );
  },

  varieties: () =>
    request<
      Array<{
        id: string;
        name: string;
        code: string;
        category_id: string;
        category_name: string;
        description?: string;
      }>
    >('/granite-varieties'),

  categories: () =>
    request<Category[]>('/granite-categories'),

  blocks: () =>
    request<Block[]>('/granite-blocks'),

  createBlock: (payload: object) =>
    request<Block>('/granite-blocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createSession: (payload: object) =>
    request<Session>('/capture-sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upload: (
    sessionId: string,
    side: string,
    uri: string,
    metadata: {
      sequence_number?: number;
      captured_at?: string;
      gps_latitude?: number;
      gps_longitude?: number;
      gps_accuracy?: number;
      quality_score?: number;
      quality_warnings?: string[];
      idempotency_key?: string;
    } = {}
  ) => {
    const form = new FormData();

    form.append('capture_side', side);

    form.append(
      'file',
      {
        uri,
        name: `${side.toLowerCase()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob
    );

    if (metadata.sequence_number !== undefined) {
      form.append(
        'sequence_number',
        String(metadata.sequence_number)
      );
    }

    if (metadata.captured_at) {
      form.append(
        'captured_at',
        metadata.captured_at
      );
    }

    if (metadata.gps_latitude !== undefined) {
      form.append(
        'gps_latitude',
        String(metadata.gps_latitude)
      );
    }

    if (metadata.gps_longitude !== undefined) {
      form.append(
        'gps_longitude',
        String(metadata.gps_longitude)
      );
    }

    if (metadata.gps_accuracy !== undefined) {
      form.append(
        'gps_accuracy',
        String(metadata.gps_accuracy)
      );
    }

    if (metadata.quality_score !== undefined) {
      form.append(
        'quality_score',
        String(metadata.quality_score)
      );
    }

    if (metadata.quality_warnings) {
      form.append(
        'quality_warnings',
        JSON.stringify(
          metadata.quality_warnings
        )
      );
    }

    if (metadata.idempotency_key) {
      form.append(
        'idempotency_key',
        metadata.idempotency_key
      );
    }

    return request<ImageResult>(
      `/capture-sessions/${sessionId}/images`,
      {
        method: 'POST',
        body: form,
      }
    );
  },

  complete: (sessionId: string) =>
    request<{ status: string }>(
      `/capture-sessions/${sessionId}/complete`,
      {
        method: 'POST',
      }
    ),

  analyze: (sessionId: string) =>
    request<Job>('/analysis-jobs', {
      method: 'POST',
      body: JSON.stringify({
        capture_session_id: sessionId,
      }),
    }),

  analysisJob: (jobId: string) =>
    request<Job>(`/analysis-jobs/${jobId}`),

  analysis: (blockId: string, language?: string) => {
    const qs = language ? `?language=${language}` : '';
    return request<UnifiedAnalysis>(
      `/granite-blocks/${blockId}/analysis${qs}`
    );
  },

  capture: (blockId: string) =>
    request<{
      session: Session | null;
      images: ImageResult[];
    }>(
      `/granite-blocks/${blockId}/capture`
    ),

  verifyBlock: (
    blockId: string,
    payload: object
  ) =>
    request<any>(
      `/granite-blocks/${blockId}/verification`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getVerifications: (blockId: string) =>
    request<any[]>(
      `/granite-blocks/${blockId}/verification`
    ),

  aiExplanation: (blockId: string, language?: string) => {
    const qs = language ? `?language=${language}` : '';
    return request<AIExplanationRecord>(
      `/granite-blocks/${blockId}/ai-explanation${qs}`
    );
  },

  askAssistant: (
    blockId: string,
    question: string,
    language?: string
  ) => {
    const qs = language ? `?language=${language}` : '';
    return request<any>(
      `/granite-blocks/${blockId}/ai-assistant${qs}`,
      {
        method: 'POST',
        body: JSON.stringify({
          question,
        }),
      }
    );
  },
};
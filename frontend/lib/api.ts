import { getSelectedUserId } from "./storage";
import type {
  AIExplanationOut,
  AIAssistantResponse,
  AnalysisJob,
  BlockAnalysis,
  BlockOut,
  CapabilitiesOut,
  CaptureBundle,
  CaptureCompleteResult,
  CaptureGuidanceRecommendation,
  CaptureImageUploadResult,
  DemoUser,
  GuidedCaptureStatus,
  ManualVerificationOut,
  Quarry,
  SessionOut,
  SurfaceObservationUpdateResult,
} from "./types";

const DEFAULT_API_URL = "http://127.0.0.1:8000";
const API_PREFIX = "";  // Backend routes at root level, no /api/v1 prefix

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api\/v1$/i, "");

export class ApiError extends Error {
  status: number;
  url: string;
  detail?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      url: string;
      detail?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.url = options.url;
    this.detail = options.detail;
  }
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  includeSelectedUser?: boolean;
};

type AnalysisPollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onUpdate?: (job: AnalysisJob) => void;
};

export type SessionImageUploadMetadata = {
  sequence_number?: number;
  captured_at?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  gps_accuracy?: number;
  orientation?: string;
  quality_score?: number;
  quality_warnings?: string[];
  idempotency_key?: string;
  device_metadata?: Record<string, unknown>;
};

export type PointCloudPayload = {
  points: number[][];
  point_count: number;
  [key: string]: unknown;
};

export type PostAnalysisRecaptureGuidance =
  CaptureGuidanceRecommendation & {
    status?:
      | "POST_ANALYSIS_RECAPTURE_RECOMMENDED"
      | "RECAPTURE_EVIDENCE_ADDED_RERUN_ANALYSIS"
      | string;
    analysis_job_id?: string | null;
    capture_session_id?: string | null;
    recommended_capture_side?: string | null;
    recapture_view_id?: string | null;
    recapture_view_label?: string | null;
    reason?: string | null;
    instruction?: string | null;
    target_observed_shape_similarity?: number | null;
    target_is_validation_goal_not_guarantee?: boolean;
    target_met?: boolean;
    overall_silhouette_iou?: number | null;
    weak_view_ids?: string[];
    score_scope?: string | null;
    source?: string | null;
    geometry_adjusted_to_improve_score?: boolean;
    production_geometry_proven_by_this_score_alone?: boolean;
    existing_view_replacement_required?: boolean;
    existing_image_id?: string | null;
    existing_capture_side?: string | null;
    replacement_instruction?: string | null;
    satisfied_by_image_id?: string | null;
    satisfied_by_capture_side?: string | null;
    evidence_added_at?: string | null;
    rerun_analysis_required?: boolean;
    planned_capture_guidance?: Record<string, unknown>;
    [key: string]: unknown;
  };

export type CaptureGuidanceResponse =
  GuidedCaptureStatus &
  PostAnalysisRecaptureGuidance;

export type ReopenCaptureForRecaptureResult = {
  ok: boolean;
  session: SessionOut;
  guidance: CaptureGuidanceResponse;
  analysis_recapture_request: PostAnalysisRecaptureGuidance;
  production_geometry_proven: false;
};

export type DeletedCaptureImageSnapshot = {
  image_id: string;
  capture_session_id: string;
  capture_side: string;
  storage_path?: string | null;
  accepted?: boolean;
  rejected?: boolean;
};

export type CaptureImageStorageCleanup = {
  attempted: boolean;
  deleted: boolean;
  status:
    | "DELETED"
    | "ALREADY_MISSING"
    | "STORAGE_PROVIDER_DELETE_UNAVAILABLE"
    | "DELETE_FAILED_DATABASE_RECORD_REMOVED"
    | string;
  error?: string | null;
};

export type DeleteCaptureImageResult = {
  ok: boolean;
  deleted_image: DeletedCaptureImageSnapshot;
  validation_rows_deleted: number;
  storage_cleanup: CaptureImageStorageCleanup;
  analysis_recapture_request?: PostAnalysisRecaptureGuidance | null;
  guidance: CaptureGuidanceResponse;
  replacement_capture_side?: string | null;
  production_geometry_proven: false;
};

export type CaptureCompletionResponse =
  CaptureCompleteResult & {
    fresh_analysis_required?: boolean;
    analysis_recapture_evidence_added?: boolean;
  };

function getLanguage(): "en" | "te" {
  if (typeof window === "undefined") {
    return "en";
  }

  return localStorage.getItem("granitemeasure.lang") === "te"
    ? "te"
    : "en";
}

function languageHeader(language = getLanguage()): string {
  return language === "te"
    ? "te-IN, te;q=0.9, en;q=0.1"
    : "en-US, en;q=0.9";
}

function encodeQuery(
  values: Record<
    string,
    string | number | boolean | null | undefined
  >,
): string {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Convert backend-provided relative URLs, API routes, or absolute URLs into a
 * fetchable URL without ever duplicating /api/v1.
 */
export function apiAssetUrl(path: string): string {
  if (!path) {
    return "";
  }

  if (
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }

  if (isAbsoluteUrl(path)) {
    return path;
  }

  const normalized = path.startsWith("/")
    ? path
    : `/${path}`;

  return `${API_URL}${normalized}`;
}

function buildApiUrl(path: string): string {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  let cleanPath = path.trim();

  if (!cleanPath) {
    cleanPath = "/";
  }

  if (cleanPath.startsWith(API_PREFIX)) {
    cleanPath = cleanPath.slice(API_PREFIX.length);
  } else if (cleanPath.startsWith("api/v1")) {
    cleanPath = cleanPath.slice("api/v1".length);
  }

  if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`;
  }

  return `${API_URL}${API_PREFIX}${cleanPath}`;
}

async function readErrorBody(
  response: Response,
): Promise<{
  raw: string;
  detail?: unknown;
}> {
  const raw = await response.text().catch(() => "");

  if (!raw) {
    return { raw: "" };
  }

  try {
    const parsed = JSON.parse(raw) as {
      detail?: unknown;
    };

    return {
      raw,
      detail: parsed.detail,
    };
  } catch {
    return {
      raw,
      detail: undefined,
    };
  }
}

function errorMessageFromBody(
  response: Response,
  raw: string,
  detail: unknown,
): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "msg" in item &&
          typeof item.msg === "string"
        ) {
          return item.msg;
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (messages.length) {
      return messages.join("; ");
    }
  }

  if (raw.trim()) {
    return raw.trim();
  }

  return `Request failed with status ${response.status}`;
}

async function call<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const {
    timeoutMs = 30_000,
    includeSelectedUser = true,
    signal: callerSignal,
    ...requestInit
  } = opts;

  const fullUrl = buildApiUrl(path);

  const headers = new Headers(
    requestInit.headers,
  );

  if (!headers.has("Accept")) {
    headers.set(
      "Accept",
      "application/json",
    );
  }

  headers.set(
    "Accept-Language",
    languageHeader(),
  );

  if (includeSelectedUser) {
    const selected = getSelectedUserId();

    if (selected) {
      headers.set(
        "x-selected-user-id",
        selected,
      );
    }
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<
    typeof setTimeout
  > | null = null;

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener(
        "abort",
        onCallerAbort,
        { once: true },
      );
    }
  }

  if (
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
  ) {
    timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs,
    );
  }

  try {
    const response = await fetch(
      fullUrl,
      {
        ...requestInit,
        headers,
        signal: controller.signal,
      },
    );

if (!response.ok) {
      const { raw, detail } = await readErrorBody(response);
      const message = errorMessageFromBody(
        response,
        raw,
        detail,
      );

      throw new ApiError(
        message,
        {
          status: response.status,
          url: fullUrl,
          detail,
        },
      );
    }

    if (
      response.status === 204
    ) {
      return undefined as T;
    }

    const contentType =
      response.headers.get(
        "content-type",
      ) || "";

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      return await response.json() as T;
    }

    return await response.text() as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (
      controller.signal.aborted
    ) {
      if (callerSignal?.aborted) {
        throw new Error(
          "The request was cancelled.",
        );
      }

      throw new Error(
        "The backend request timed out. Please try again.",
      );
    }

    if (
      error instanceof TypeError
    ) {
      throw new Error(
        "Unable to connect to GraniteMeasure AI backend. Check that the backend is running and NEXT_PUBLIC_API_URL is correct.",
      );
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (callerSignal) {
      callerSignal.removeEventListener(
        "abort",
        onCallerAbort,
      );
    }
  }
}

function jsonRequest(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  payload?: unknown,
): RequestOptions {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body:
      payload === undefined
        ? undefined
        : JSON.stringify(payload),
  };
}

export async function listDemoUsers(): Promise<
  DemoUser[]
> {
  return call<DemoUser[]>(
    "/demo-users",
  );
}

export async function getQuarries(): Promise<
  Quarry[]
> {
  return call<Quarry[]>(
    "/quarries",
  );
}

export async function createQuarry(
  payload: {
    quarry_name: string;
    quarry_code?: string;
    lease_id?: string;
    district?: string;
    mandal?: string;
    village?: string;
    granite_category_id?: string;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<Quarry> {
  return call<Quarry>(
    "/quarries",
    jsonRequest(
      "POST",
      payload,
    ),
  );
}

export async function listCategories(): Promise<
  {
    id: string;
    code: string;
    name: string;
  }[]
> {
  return call(
    "/granite-categories",
  );
}

export async function listBlocks(): Promise<
  BlockOut[]
> {
  return call<BlockOut[]>(
    "/granite-blocks",
  );
}

export async function getBlock(
  id: string,
): Promise<BlockOut> {
  return call<BlockOut>(
    `/granite-blocks/${encodeURIComponent(id)}`,
  );
}

export async function createBlock(
  payload: {
    quarry_id: string;
    granite_category_id: string;
    capture_date: string;
    block_code?: string | null;
    notes?: string | null;
    gps?: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    } | null;
    skip_gps?: boolean;
  },
): Promise<BlockOut> {
  return call<BlockOut>(
    "/granite-blocks",
    jsonRequest(
      "POST",
      payload,
    ),
  );
}

export async function createCaptureSession(
  payload: {
    block_id: string;
    calibration_type: string;
    known_reference_cm?: number | null;
    marker_size_cm?: number | null;
    reference_pixels?: number | null;
    session_metadata?: {
      capture_mode?: "GUIDED" | "SEQUENTIAL" | "CANONICAL" | "AUTO" | string;
      inaccessible_surfaces?: Record<string, unknown>;
      target_observed_shape_similarity?: number;
      target_similarity_is_validation_goal_not_guarantee?: boolean;
      [key: string]: unknown;
    } | null;
  },
): Promise<SessionOut> {
  return call<SessionOut>(
    "/capture-sessions",
    jsonRequest(
      "POST",
      payload,
    ),
  );
}

export async function getBlockCapture(
  blockId: string,
): Promise<CaptureBundle> {
  return call<CaptureBundle>(
    `/granite-blocks/${encodeURIComponent(blockId)}/capture`,
  );
}

/**
 * Real backend capability registry.
 *
 * Important: this is /api/v1/capabilities, not a frontend hard-coded provider
 * table and not /analysis/capabilities.
 */
export async function getCapabilities(): Promise<
  CapabilitiesOut
> {
  return call<CapabilitiesOut>(
    "/capabilities",
  );
}

export async function uploadSessionImage(
  sessionId: string,
  file: File,
  captureSide = "PHOTO_001",
  metadata: SessionImageUploadMetadata = {},
): Promise<CaptureImageUploadResult> {
  const form = new FormData();

  form.append(
    "capture_side",
    captureSide,
  );
  form.append(
    "file",
    file,
    file.name || "capture.jpg",
  );

  if (
    metadata.sequence_number !== undefined
  ) {
    form.append(
      "sequence_number",
      String(metadata.sequence_number),
    );
  }

  if (metadata.captured_at) {
    form.append(
      "captured_at",
      metadata.captured_at,
    );
  }

  if (
    metadata.gps_latitude !== undefined
  ) {
    form.append(
      "gps_latitude",
      String(metadata.gps_latitude),
    );
  }

  if (
    metadata.gps_longitude !== undefined
  ) {
    form.append(
      "gps_longitude",
      String(metadata.gps_longitude),
    );
  }

  if (
    metadata.gps_accuracy !== undefined
  ) {
    form.append(
      "gps_accuracy",
      String(metadata.gps_accuracy),
    );
  }

  if (metadata.orientation) {
    form.append(
      "orientation",
      metadata.orientation,
    );
  }

  if (
    metadata.quality_score !== undefined
  ) {
    form.append(
      "quality_score",
      String(metadata.quality_score),
    );
  }

  if (metadata.quality_warnings) {
    form.append(
      "quality_warnings",
      JSON.stringify(
        metadata.quality_warnings,
      ),
    );
  }

  if (metadata.idempotency_key) {
    form.append(
      "idempotency_key",
      metadata.idempotency_key,
    );
  }

  if (metadata.device_metadata) {
    form.append(
      "device_metadata",
      JSON.stringify(
        metadata.device_metadata,
      ),
    );
  }

  return call<CaptureImageUploadResult>(
    `/capture-sessions/${encodeURIComponent(sessionId)}/images`,
    {
      method: "POST",
      body: form,
      timeoutMs: 60_000,
    },
  );
}

export async function completeCaptureSession(
  sessionId: string,
): Promise<CaptureCompletionResponse> {
  return call<CaptureCompletionResponse>(
    `/capture-sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
    },
  );
}

export async function getCaptureGuidance(
  sessionId: string,
): Promise<CaptureGuidanceResponse> {
  return call<CaptureGuidanceResponse>(
    `/capture-sessions/${encodeURIComponent(sessionId)}/guidance`,
  );
}

/**
 * Reopen an already-completed capture session only when the backend's latest
 * real-mesh observed-shape validation persisted an authoritative recapture
 * recommendation for that exact session.
 *
 * This does not create a new capture session and does not manufacture a weak
 * view on the client.
 */
export async function reopenCaptureSessionForRecapture(
  sessionId: string,
): Promise<ReopenCaptureForRecaptureResult> {
  return call<ReopenCaptureForRecaptureResult>(
    `/capture-sessions/${encodeURIComponent(sessionId)}/reopen-for-recapture`,
    {
      method: "POST",
    },
  );
}

export function isPostAnalysisRecaptureRecommended(
  guidance:
    | CaptureGuidanceResponse
    | null
    | undefined,
): boolean {
  return (
    guidance?.status ===
    "POST_ANALYSIS_RECAPTURE_RECOMMENDED"
  );
}

export function isRecaptureEvidenceAdded(
  guidance:
    | CaptureGuidanceResponse
    | null
    | undefined,
): boolean {
  return (
    guidance?.status ===
    "RECAPTURE_EVIDENCE_ADDED_RERUN_ANALYSIS"
  );
}

export function recaptureRequiresExistingViewReplacement(
  guidance:
    | CaptureGuidanceResponse
    | null
    | undefined,
): boolean {
  return Boolean(
    guidance?.existing_view_replacement_required &&
      guidance?.existing_image_id &&
      guidance?.recapture_view_label,
  );
}

export function canDeleteWeakRecaptureView(
  guidance:
    | CaptureGuidanceResponse
    | null
    | undefined,
): guidance is CaptureGuidanceResponse & {
  existing_image_id: string;
  recapture_view_label: string;
} {
  return Boolean(
    guidance?.status ===
      "POST_ANALYSIS_RECAPTURE_RECOMMENDED" &&
      guidance?.existing_view_replacement_required &&
      guidance?.existing_image_id &&
      guidance?.recapture_view_label,
  );
}

export async function markCaptureSurfaceInaccessible(
  sessionId: string,
  surface: string,
  reason?: string | null,
): Promise<SurfaceObservationUpdateResult> {
  const query = reason?.trim()
    ? `?reason=${encodeURIComponent(reason.trim())}`
    : "";

  return call<SurfaceObservationUpdateResult>(
    `/capture-sessions/${encodeURIComponent(sessionId)}/surfaces/${encodeURIComponent(surface)}/inaccessible${query}`,
    {
      method: "POST",
    },
  );
}

export async function clearCaptureSurfaceInaccessible(
  sessionId: string,
  surface: string,
): Promise<{
  ok: boolean;
  guidance?: CaptureGuidanceRecommendation | null;
}> {
  return call(
    `/capture-sessions/${encodeURIComponent(sessionId)}/surfaces/${encodeURIComponent(surface)}/inaccessible`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Delete one capture image from an OPEN capture session.
 *
 * A completed session must first be reopened through
 * reopenCaptureSessionForRecapture(). This keeps analysis evidence immutable
 * unless the backend explicitly authorized a post-analysis recapture.
 */
export async function deleteCaptureImage(
  imageId: string,
): Promise<DeleteCaptureImageResult> {
  return call<DeleteCaptureImageResult>(
    `/images/${encodeURIComponent(imageId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function validateCaptureImage(
  imageId: string,
): Promise<unknown> {
  return call(
    `/images/${encodeURIComponent(imageId)}/validate`,
    {
      method: "POST",
    },
  );
}

export async function createAnalysisJob(
  capture_session_id: string,
): Promise<AnalysisJob> {
  return call<AnalysisJob>(
    "/analysis-jobs",
    jsonRequest(
      "POST",
      {
        capture_session_id,
      },
    ),
  );
}

export async function getAnalysisJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<AnalysisJob> {
  return call<AnalysisJob>(
    `/analysis-jobs/${encodeURIComponent(jobId)}`,
    {
      signal,
    },
  );
}

export async function getAnalysisDemoReadiness(
  jobId: string,
): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>(
    `/analysis-jobs/${encodeURIComponent(jobId)}/demo-readiness`,
  );
}

function normalizedJobState(
  job: AnalysisJob,
): string {
  const candidate =
    (job as unknown as {
      state?: unknown;
      status?: unknown;
    }).state ??
    (job as unknown as {
      state?: unknown;
      status?: unknown;
    }).status;

  return typeof candidate === "string"
    ? candidate.toUpperCase()
    : "";
}

export function isAnalysisTerminal(
  job: AnalysisJob,
): boolean {
  const state =
    normalizedJobState(job);

  return (
    state === "COMPLETED" ||
    state === "FAILED" ||
    state === "CANCELLED"
  );
}

/**
 * Poll the real backend job resource. This does not manufacture progress on
 * the client. Whatever state/stage/progress the UI shows comes from the API.
 */
export async function pollAnalysisJob(
  jobId: string,
  options: AnalysisPollOptions = {},
): Promise<AnalysisJob> {
  const {
    intervalMs = 1_000,
    timeoutMs = 180_000,
    signal,
    onUpdate,
  } = options;

  const startedAt = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error(
        "Analysis polling was cancelled.",
      );
    }

    const job =
      await getAnalysisJob(
        jobId,
        signal,
      );

    onUpdate?.(job);

    if (isAnalysisTerminal(job)) {
      return job;
    }

    if (
      Date.now() - startedAt >=
      timeoutMs
    ) {
      throw new Error(
        "Analysis is still running. Polling stopped after the configured timeout; the backend job was not cancelled.",
      );
    }

    await new Promise<void>(
      (resolve, reject) => {
        const timer = setTimeout(
          resolve,
          intervalMs,
        );

        const abort = () => {
          clearTimeout(timer);
          reject(
            new Error(
              "Analysis polling was cancelled.",
            ),
          );
        };

        if (signal) {
          signal.addEventListener(
            "abort",
            abort,
            { once: true },
          );
        }
      },
    );
  }
}

export async function getBlockAnalysis(
  blockId: string,
  language?: string,
): Promise<BlockAnalysis> {
  const lang =
    language || getLanguage();

  return call<BlockAnalysis>(
    `/granite-blocks/${encodeURIComponent(blockId)}/analysis${encodeQuery(
      {
        language: lang,
      },
    )}`,
  );
}

export async function submitManualVerification(
  blockId: string,
  payload: {
    job_id: string;
    verified_length_cm: number;
    verified_breadth_cm: number;
    verified_height_cm: number;
    decision: string;
    remarks?: string;
  },
): Promise<unknown> {
  return call(
    `/granite-blocks/${encodeURIComponent(blockId)}/verification`,
    jsonRequest(
      "POST",
      payload,
    ),
  );
}

export async function listManualVerifications(
  blockId: string,
): Promise<ManualVerificationOut[]> {
  return call<ManualVerificationOut[]>(
    `/granite-blocks/${encodeURIComponent(blockId)}/verification`,
  );
}

/**
 * Fetch point-cloud evidence either from an API-provided URL or from a job id.
 *
 * We intentionally return null when no artifact is available. The UI must
 * render "unavailable / not reconstructed", never a synthetic cube.
 */
export async function getPointCloudData(
  urlOrJobId: string,
): Promise<PointCloudPayload | null> {
  if (!urlOrJobId) {
    return null;
  }

  const endpoint =
    urlOrJobId.startsWith("/") ||
    isAbsoluteUrl(urlOrJobId) ||
    urlOrJobId.includes(
      "point-cloud",
    )
      ? urlOrJobId
      : `/geometry/${encodeURIComponent(urlOrJobId)}/point-cloud`;

  try {
    if (isAbsoluteUrl(endpoint)) {
      const response = await fetch(
        endpoint,
        {
          headers: {
            "Accept": "application/json",
            "Accept-Language":
              languageHeader(),
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      return await response.json() as PointCloudPayload;
    }

    return await call<PointCloudPayload>(
      endpoint,
    );
  } catch {
    return null;
  }
}

export async function getAIExplanation(
  blockId: string,
  language?: string,
): Promise<AIExplanationOut> {
  const lang =
    language || getLanguage();

  return call<AIExplanationOut>(
    `/granite-blocks/${encodeURIComponent(blockId)}/ai-explanation${encodeQuery(
      {
        language: lang,
      },
    )}`,
  );
}

export async function askAIAssistant(
  blockId: string,
  question: string,
  language?: string,
): Promise<AIAssistantResponse> {
  const lang =
    language || getLanguage();

  return call<AIAssistantResponse>(
    `/granite-blocks/${encodeURIComponent(blockId)}/ai-assistant${encodeQuery(
      {
        language: lang,
      },
    )}`,
    jsonRequest(
      "POST",
      {
        question,
        language: lang,
      },
    ),
  );
}

export const askBlockAssistant =
  askAIAssistant;

export async function askGlobalAIAssistant(
  question: string,
  blockId?: string,
  language?: string,
): Promise<AIAssistantResponse> {
  const lang =
    language || getLanguage();

  return call<AIAssistantResponse>(
    `/ai-assistant/chat${encodeQuery(
      {
        language: lang,
      },
    )}`,
    jsonRequest(
      "POST",
      {
        question,
        block_id: blockId,
        language: lang,
      },
    ),
  );
}

export async function getVoiceCapabilities(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/api/v1/voice/capabilities`);
  if (!res.ok) throw new Error('Voice capabilities unavailable');
  return res.json();
}

export async function transcribeAudio(audio: Blob, language?: string): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append('audio', audio);
  const url = `${API_URL}/api/v1/voice/transcribe${language ? `?language=${language}` : ''}`;
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Transcription failed');
  return res.json();
}

export interface VoiceAssistantResult {
  transcript?: string;
  answer?: string;
  language?: string;
  audio_url?: string | null;
  [key: string]: unknown;
}

export async function blockVoiceAssistant(
  blockId: string,
  audio: Blob,
  options?: {
    language?: string;
    contextTab?: string;
    contextCutIndex?: number;
  }
): Promise<VoiceAssistantResult> {
  const formData = new FormData();
  formData.append('audio', audio);
  const params = new URLSearchParams();
  if (options?.language) params.set('language', options.language);
  if (options?.contextTab) params.set('context_tab', options.contextTab);
  if (options?.contextCutIndex !== undefined) params.set('context_cut_index', String(options.contextCutIndex));
  const url = `${API_URL}/api/v1/granite-blocks/${blockId}/voice-assistant?${params}`;
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Voice assistant failed');
  return res.json();
}

export async function synthesizeSpeech(text: string, language: string = 'en'): Promise<Blob | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/voice/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

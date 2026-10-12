import { getSelectedUserId } from "./storage";

const DEFAULT_API_URL = "http://127.0.0.1:8000";
const API_PREFIX = "/api/v1";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
)
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api\/v1$/i, "");

function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${API_PREFIX}${normalized}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const selectedUserId = getSelectedUserId();
  const headers = new Headers(init?.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (
    init?.body &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (selectedUserId) {
    headers.set("X-Demo-User-Id", selectedUserId);
  }

  const response = await fetch(
    apiUrl(path),
    {
      ...init,
      headers,
    },
  );

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw || `Request failed with status ${response.status}`;

    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      if (
        typeof parsed.detail === "string" &&
        parsed.detail.trim()
      ) {
        message = parsed.detail.trim();
      }
    } catch {
      // Keep raw response text.
    }

    throw new Error(message);
  }

  return await response.json() as T;
}

export type OperationsSummary = {
  block_id: string;
  block_status: string;
  raw_analysis_job?: Record<string, unknown> | null;
  raw_verification?: Record<string, unknown> | null;
  post_cut_analysis_job?: Record<string, unknown> | null;
  post_cut_measurement?: Record<string, unknown> | null;
  post_cut_verification?: Record<string, unknown> | null;
  latest_weighbridge?: WeighbridgeRecordOut | null;
  latest_dispatch?: DispatchRecordOut | null;
  dispatch_authorized: boolean;
  dispatch_gate: {
    post_cut_analysis_completed: boolean;
    post_cut_officer_approved: boolean;
    weighbridge_recorded: boolean;
  };
  truth_policy: string;
};

export type PostCutSessionCreate = {
  calibration_type?: string | null;
  known_reference_cm?: number | null;
  marker_size_cm?: number | null;
  reason?: string | null;
};

export type PostCutSessionCreateResult = {
  created: boolean;
  session: {
    id: string;
    block_id: string;
    status: string;
    calibration_type?: string | null;
    known_reference_cm?: number | null;
    marker_size_cm?: number | null;
    session_metadata?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  capture_phase: "POST_CUT";
};

export type WeighbridgeCreate = {
  vehicle_number?: string | null;
  gross_weight?: number | null;
  tare_weight?: number | null;
  net_weight?: number | null;
  weighment_time?: string | null;
  source_reference?: string | null;
  provider?: string;
  demo_simulated?: boolean;
};

export type WeighbridgeRecordOut = {
  id: string;
  block_id: string;
  vehicle_number?: string | null;
  gross_weight?: number | null;
  tare_weight?: number | null;
  net_weight?: number | null;
  weighment_time?: string | null;
  source_reference?: string | null;
  provider?: string | null;
  demo_simulated?: boolean;
  created_by_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type DispatchCreate = {
  destination: string;
  vehicle_number: string;
  status?: string;
  omeps_reference?: string | null;
  notes?: string | null;
};

export type DispatchRecordOut = {
  id: string;
  block_id: string;
  destination?: string | null;
  vehicle_number?: string | null;
  status: string;
  omeps_reference?: string | null;
  notes?: string | null;
  created_by_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export async function getOperationsSummary(
  blockId: string,
): Promise<OperationsSummary> {
  return request<OperationsSummary>(
    `/granite-blocks/${encodeURIComponent(blockId)}/operations-summary`,
  );
}

export async function createPostCutSession(
  blockId: string,
  payload: PostCutSessionCreate = {},
): Promise<PostCutSessionCreateResult> {
  return request<PostCutSessionCreateResult>(
    `/granite-blocks/${encodeURIComponent(blockId)}/post-cut-session`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listPostCutSessions(
  blockId: string,
): Promise<PostCutSessionCreateResult["session"][]> {
  return request<PostCutSessionCreateResult["session"][]>(
    `/granite-blocks/${encodeURIComponent(blockId)}/post-cut-sessions`,
  );
}

export async function createWeighbridgeRecord(
  blockId: string,
  payload: WeighbridgeCreate,
): Promise<WeighbridgeRecordOut> {
  return request<WeighbridgeRecordOut>(
    `/granite-blocks/${encodeURIComponent(blockId)}/weighbridge`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listWeighbridgeRecords(
  blockId: string,
): Promise<WeighbridgeRecordOut[]> {
  return request<WeighbridgeRecordOut[]>(
    `/granite-blocks/${encodeURIComponent(blockId)}/weighbridge`,
  );
}

export async function createDispatchRecord(
  blockId: string,
  payload: DispatchCreate,
): Promise<DispatchRecordOut> {
  return request<DispatchRecordOut>(
    `/granite-blocks/${encodeURIComponent(blockId)}/dispatch`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listDispatchRecords(
  blockId: string,
): Promise<DispatchRecordOut[]> {
  return request<DispatchRecordOut[]>(
    `/granite-blocks/${encodeURIComponent(blockId)}/dispatch`,
  );
}

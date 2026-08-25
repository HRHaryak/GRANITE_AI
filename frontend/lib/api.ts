import { getSelectedUserId } from "./storage";
import type { DemoUser, Quarry, BlockOut, SessionOut } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> | undefined),
  };
  const selected = getSelectedUserId();
  if (selected) headers["x-selected-user-id"] = selected;
  const res = await fetch(API_URL + path, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  // fallback
  return (await res.text()) as unknown as T;
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  return call<DemoUser[]>("/demo-users");
}

export async function getQuarries(): Promise<Quarry[]> {
  return call<Quarry[]>("/quarries");
}

export async function listBlocks(): Promise<BlockOut[]> {
  return call<BlockOut[]>("/granite-blocks");
}

export async function getBlock(id: string): Promise<BlockOut> {
  return call<BlockOut>(`/granite-blocks/${id}`);
}

export async function listCategories(): Promise<{ id: string; code: string; name: string }[]> {
  return call(`/granite-categories`);
}

export async function createBlock(payload: {
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  block_code?: string | null;
  notes?: string | null;
}): Promise<BlockOut> {
  return call<BlockOut>(`/granite-blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createCaptureSession(payload: {
  block_id: string;
  calibration_type: string;
  known_reference_cm?: number | null;
  marker_size_cm?: number | null;
  reference_pixels?: number | null;
}): Promise<SessionOut> {
  return call<SessionOut>(`/capture-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function uploadSessionImage(sessionId: string, file: File, capture_side = "FRONT") {
  const form = new FormData();
  form.append("capture_side", capture_side);
  form.append("file", file, file.name || "capture.jpg");
  const selected = getSelectedUserId();
  const headers: Record<string, string> = {};
  if (selected) headers["x-selected-user-id"] = selected;
  const res = await fetch(`${API_URL}/capture-sessions/${sessionId}/images`, { method: "POST", body: form, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return res.json();
}

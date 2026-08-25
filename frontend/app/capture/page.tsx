"use client";
import React, { useState, useEffect } from "react";
import CameraCapture from "../../components/capture/CameraCapture";
import { createBlock, createCaptureSession, uploadSessionImage, listCategories, getQuarries } from "../../lib/api";
import type { Quarry } from "../../lib/types";
import Button from "../../components/ui/Button";
import { useRouter } from "next/navigation";

type Side = "FRONT" | "RIGHT" | "BACK" | "LEFT" | "TOP" | "BOTTOM";
const SIDES: Side[] = ["FRONT", "RIGHT", "BACK", "LEFT", "TOP", "BOTTOM"];

export default function CapturePage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [quarries, setQuarries] = useState<Quarry[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; code: string; name: string }[] | null>(null);
  const [selectedQuarry, setSelectedQuarry] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Multi-side state
  const [activeSide, setActiveSide] = useState<Side | null>("FRONT");
  const [files, setFiles] = useState<Record<Side, File | null>>({ FRONT: null, RIGHT: null, BACK: null, LEFT: null, TOP: null, BOTTOM: null });
  const [previews, setPreviews] = useState<Record<Side, string | null>>({ FRONT: null, RIGHT: null, BACK: null, LEFT: null, TOP: null, BOTTOM: null });
  const [uploadStatus, setUploadStatus] = useState<Record<Side, string>>({ FRONT: "idle", RIGHT: "idle", BACK: "idle", LEFT: "idle", TOP: "idle", BOTTOM: "idle" });

  // Track created block/session so individual sides can be retried after a partial failure
  const [createdBlockId, setCreatedBlockId] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

  // Helper: simple sleep for backoff
  function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Upload a single side with retries and exponential backoff
  async function uploadSideWithRetries(sessionId: string, side: Side, file: File, maxAttempts = 3) {
    setUploadStatus((u) => ({ ...u, [side]: "uploading" }));
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await uploadSessionImage(sessionId, file, side);
        setUploadStatus((u) => ({ ...u, [side]: "uploaded" }));
        return;
      } catch (e) {
        console.error(`Attempt ${attempt} failed for ${side}:`, e);
        if (attempt >= maxAttempts) {
          setUploadStatus((u) => ({ ...u, [side]: "failed" }));
          return;
        }
        // exponential backoff
        const backoff = 500 * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  // UI-triggered per-side retry (creates session if needed)
  async function handleRetrySide(side: Side) {
    setError(null);
    const file = files[side];
    if (!file) return setError("No file to upload for this side.");

    try {
      let sessionId = createdSessionId;
      if (!sessionId) {
        // If block exists, create a new capture session for it; otherwise instruct user to run "Upload and Continue"
        if (!createdBlockId) return setError("No capture session exists. Please run Upload and Continue once to create the block and session first.");
        const session = await createCaptureSession({ block_id: createdBlockId, calibration_type: "MANUAL_REFERENCE", marker_size_cm: 1 });
        sessionId = session.id;
        setCreatedSessionId(sessionId);
      }

      await uploadSideWithRetries(sessionId, side, file);
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  // UI-triggered single-side upload (when user wants to upload one side without reuploading others)
  async function handleUploadSingleSide(side: Side) {
    setError(null);
    const file = files[side];
    if (!file) return setError("No file to upload for this side.");

    try {
      let sessionId = createdSessionId;
      if (!sessionId) {
        if (!createdBlockId) return setError("No capture session exists. Please run Upload and Continue once to create the block and session first.");
        const session = await createCaptureSession({ block_id: createdBlockId, calibration_type: "MANUAL_REFERENCE", marker_size_cm: 1 });
        sessionId = session.id;
        setCreatedSessionId(sessionId);
      }
      await uploadSideWithRetries(sessionId, side, file);
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  useEffect(() => {
    setLoadingMeta(true);
    Promise.all([getQuarries(), listCategories()])
      .then(([qs, cs]) => {
        setQuarries(qs);
        setCategories(cs);
        if (qs.length === 1) setSelectedQuarry(qs[0].id);
        if (cs.length === 1) setSelectedCategory(cs[0].id);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingMeta(false));
  }, []);

  function handleCapturedImage(side: Side, file: File) {
    setFiles((s) => ({ ...s, [side]: file }));
    const url = URL.createObjectURL(file);
    setPreviews((p) => {
      // revoke previous if any
      if (p[side]) URL.revokeObjectURL(p[side] as string);
      return { ...p, [side]: url };
    });
  }

  function removeCaptured(side: Side) {
    setFiles((s) => ({ ...s, [side]: null }));
    setPreviews((p) => {
      if (p[side]) {
        URL.revokeObjectURL(p[side] as string);
      }
      return { ...p, [side]: null };
    });
    setUploadStatus((u) => ({ ...u, [side]: "idle" }));
  }

  async function onUploadAll() {
    setError(null);
    // require at least one captured image
    const capturedSides = SIDES.filter((s) => files[s]);
    if (capturedSides.length === 0) return setError("Capture at least one side before continuing.");
    if (!selectedQuarry || !selectedCategory) return setError("Please select a quarry and a granite category before continuing.");

    setStatus("Preparing block…");
    try {
      const captureDate = new Date().toISOString();
      const block = await createBlock({ quarry_id: selectedQuarry, granite_category_id: selectedCategory, capture_date: captureDate });
      setCreatedBlockId(block.id);
      setStatus("Creating capture session…");
      const session = await createCaptureSession({ block_id: block.id, calibration_type: "MANUAL_REFERENCE", marker_size_cm: 1 });
      setCreatedSessionId(session.id);

      // Upload each captured side sequentially with retries
      for (const side of capturedSides) {
        const file = files[side] as File;
        if (!file) continue;
        await uploadSideWithRetries(session.id, side, file, 3);
      }

      // Decide whether to navigate: only navigate if no failed uploads
      const failedSides = SIDES.filter((s) => files[s] && uploadStatus[s] === "failed");
      if (failedSides.length === 0) {
        setStatus("Uploads finished. Redirecting to block details…");
        router.push(`/blocks/${block.id}`);
      } else {
        setStatus("Some uploads failed. You can retry individual sides from the list below.");
      }
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  return (
    <div className="py-6">
      <div className="text-lg font-semibold mb-4">Capture Granite Block</div>
      <div className="space-y-4">
        <div className="bg-white/5 p-3 rounded-lg">
          <div className="text-sm font-medium mb-2">Select Quarry</div>
          {loadingMeta && <div className="text-sm">Loading quarries and categories…</div>}
          {!loadingMeta && quarries && quarries.length === 0 && <div className="text-sm">No quarries available. Please configure quarries on the server.</div>}
          {!loadingMeta && quarries && quarries.length > 0 && (
            <select className="w-full bg-transparent p-2 border border-white/6 rounded" value={selectedQuarry ?? ""} onChange={(e) => setSelectedQuarry(e.target.value)}>
              <option value="">Select quarry</option>
              {quarries.map((q) => (
                <option key={q.id} value={q.id}>{q.quarry_name} ({q.quarry_code})</option>
              ))}
            </select>
          )}

          <div className="mt-3 text-sm font-medium mb-2">Select Granite Category</div>
          {!loadingMeta && categories && categories.length === 0 && <div className="text-sm">No categories available. Please configure granite categories on the server.</div>}
          {!loadingMeta && categories && categories.length > 0 && (
            <select className="w-full bg-transparent p-2 border border-white/6 rounded" value={selectedCategory ?? ""} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white/5 p-3 rounded-lg">
          <div className="text-sm font-medium mb-2">Capture Sides</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {SIDES.map((s) => (
              <button key={s} onClick={() => setActiveSide(s)} className={`p-2 rounded border ${activeSide === s ? "border-sky-500 bg-white/6" : "border-white/6"}`}>
                <div className="font-medium">{s}</div>
                <div className="text-xs text-white/70 mt-1">{files[s] ? "Captured" : "Not captured"}</div>
              </button>
            ))}
          </div>

          <div className="mb-3">
            <div className="text-sm mb-2">Active side: {activeSide}</div>
            {activeSide && (
              <div>
                <CameraCapture onImage={(f) => handleCapturedImage(activeSide as Side, f)} />
                <div className="mt-2">
                  {previews[activeSide] ? (
                    <div className="space-y-2">
                      <img src={previews[activeSide] as string} alt={`${activeSide} preview`} className="w-full rounded-lg" />
                      <div className="flex gap-2">
                        <Button onClick={() => removeCaptured(activeSide as Side)}>Retake</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">No image for this side yet.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Upload Status</div>
            <div className="space-y-2">
              {SIDES.map((s) => (
                <div key={s} className="flex items-center justify-between p-2 bg-black/10 rounded">
                  <div className="font-medium">{s}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm capitalize">{uploadStatus[s]}</div>
                    {files[s] && uploadStatus[s] === "failed" && (
                      <Button onClick={() => handleRetrySide(s)}>Retry</Button>
                    )}
                    {files[s] && uploadStatus[s] === "idle" && (
                      <Button onClick={() => handleUploadSingleSide(s)}>Upload</Button>
                    )}
                    {files[s] && uploadStatus[s] === "uploading" && (
                      <Button disabled>Uploading…</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}
        {status && <div className="text-sm text-white/70">{status}</div>}

        <div className="flex gap-3">
          <Button onClick={onUploadAll} disabled={SIDES.every((s) => !files[s]) || !selectedQuarry || !selectedCategory}>Upload and Continue</Button>
        </div>
      </div>
    </div>
  );
}

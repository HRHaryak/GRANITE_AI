"use client";
import React, { useState } from "react";
import CameraCapture from "../../components/capture/CameraCapture";
import { createBlock, createCaptureSession, uploadSessionImage, listCategories, getQuarries } from "../../lib/api";
import Button from "../../components/ui/Button";

export default function CapturePage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImage(f: File) {
    setFile(f);
  }

  async function onContinue() {
    if (!file) return alert("Capture or upload an image first");
    setStatus("Preparing block…");
    try {
      const quarries = await getQuarries();
      const categories = await listCategories();
      if (!quarries.length || !categories.length) {
        setError("No quarries or categories configured on the server. Capture unavailable.");
        return;
      }
      // create a block using first quarry and category (minimal)
      const captureDate = new Date().toISOString();
      const block = await createBlock({ quarry_id: quarries[0].id, granite_category_id: categories[0].id, capture_date: captureDate });
      setStatus("Creating capture session…");
      const session = await createCaptureSession({ block_id: block.id, calibration_type: "MANUAL_REFERENCE", marker_size_cm: 1 });
      setStatus("Uploading image…");
      await uploadSessionImage(session.id, file, "FRONT");
      setStatus("Image uploaded — processing started");
      // navigate to block detail or results if desired
      // For now show success
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  return (
    <div className="py-6">
      <div className="text-lg font-semibold mb-4">Capture Granite Block</div>
      <div className="space-y-4">
        <CameraCapture onImage={onImage} />

        <div>
          <div className="text-sm">Preview</div>
          {file ? <div className="text-sm">{file.name} — {Math.round(file.size / 1024)} KB</div> : <div className="text-sm text-white/60">No image selected</div>}
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}
        {status && <div className="text-sm text-white/70">{status}</div>}

        <div className="flex gap-3">
          <Button onClick={onContinue} disabled={!file}>Continue / Analyze</Button>
        </div>
      </div>
    </div>
  );
}

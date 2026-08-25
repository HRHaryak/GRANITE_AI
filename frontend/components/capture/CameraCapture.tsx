"use client";
import React, { useRef, useState, useEffect } from "react";
import Button from "../ui/Button";

export default function CameraCapture({ onImage }: { onImage: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function openCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setStarted(true);
    } catch (err) {
      console.error(err);
      alert("Unable to access camera. Please use Upload Image.");
    }
  }

  function capture() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 1280;
    c.height = video.videoHeight || 720;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      setCapturedUrl(URL.createObjectURL(blob));
      stopStream();
      setStarted(false);
      onImage(file);
    }, "image/jpeg", 0.92);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (f) {
      setCapturedUrl(URL.createObjectURL(f));
      onImage(f);
    }
  }

  return (
    <div>
      {!capturedUrl && (
        <div className="space-y-4">
          {!started && (
            <div className="text-center">
              <img src="/camera-icon.svg" alt="camera" className="w-24 mx-auto opacity-90" />
              <p className="mt-2 text-sm text-white/80">Prepare your phone and the block. Use a marker if required.</p>
            </div>
          )}

          {started ? (
            <div className="space-y-3">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black/40" />
              <div className="flex gap-3">
                <Button onClick={capture}>Capture Photo</Button>
                <Button onClick={() => { stopStream(); setStarted(false); }}>Close</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 items-center">
              <Button onClick={openCamera}>Open Camera</Button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
                <span className="inline-flex items-center justify-center rounded-lg px-4 py-2 bg-gradient-to-r from-sky-600 to-teal-500 text-white font-semibold shadow-md">Upload Image</span>
              </label>
            </div>
          )}
        </div>
      )}

      {capturedUrl && (
        <div className="space-y-3">
          <img src={capturedUrl} alt="preview" className="w-full rounded-lg" />
          <div className="flex gap-3">
            <Button onClick={() => { setCapturedUrl(null); }}>Retake</Button>
          </div>
        </div>
      )}
    </div>
  );
}

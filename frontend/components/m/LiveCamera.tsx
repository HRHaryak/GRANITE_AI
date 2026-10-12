"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { detectInCanvas, type MarkerHit } from "../../lib/m/marker";

const HINT: Record<string, string> = {
  FRONT: "Longest side. Marker flat on the face.",
  BACK: "Opposite of the front. Marker flat on the face.",
  LEFT: "Left end of the block. Marker flat on the face.",
  RIGHT: "Right end of the block. Marker flat on the face.",
  TOP: "From above. Marker flat on the top.",
  EXTRA: "Close-up of a crack or hole.",
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function LiveCamera({
  face,
  onCapture,
  onClose,
}: {
  face: string;
  onCapture: (f: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState("");
  const [ratio, setRatio] = useState(4 / 3);
  const [hit, setHit] = useState<{ m: MarkerHit; fullSide: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 4096 },
            height: { ideal: 3072 },
          },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
      } catch (e) {
        setErr(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in the browser settings, or choose a photo from the gallery."
            : "Live camera is not available here (it needs HTTPS or localhost). Choose a photo from the gallery instead.",
        );
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live marker check on a downscaled frame, about twice a second.
  useEffect(() => {
    let running = false;
    const id = window.setInterval(async () => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || running) return;
      running = true;
      try {
        setRatio(v.videoWidth / v.videoHeight);
        const k = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * k);
        c.height = Math.round(v.videoHeight * k);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const m = await detectInCanvas(c);
        setHit(m ? { m, fullSide: m.sidePx / k } : null);
      } finally {
        running = false;
      }
    }, 600);
    return () => window.clearInterval(id);
  }, []);

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      const track = streamRef.current?.getVideoTracks()[0];
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
      if (track && IC) {
        try {
          blob = await new IC(track).takePhoto();
        } catch {
          blob = null;
        }
      }
      if (!blob) {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")!.drawImage(v, 0, 0);
        blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
      }
      if (blob) {
        onCapture(new File([blob], `${face}-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" }));
      }
    } finally {
      setBusy(false);
    }
  }

  const c = hit?.m.corners;
  const tilt = c
    ? Math.max(
        dist(c[0], c[1]) / Math.max(1e-6, dist(c[3], c[2])),
        dist(c[3], c[2]) / Math.max(1e-6, dist(c[0], c[1])),
        dist(c[0], c[3]) / Math.max(1e-6, dist(c[1], c[2])),
        dist(c[1], c[2]) / Math.max(1e-6, dist(c[0], c[3])),
      )
    : 1;
  const small = hit ? hit.fullSide < 140 : false;
  const status = !hit
    ? { t: "No marker in view — size will be estimated (less accurate)", c: "bg-black/60 text-white" }
    : small
      ? { t: `Marker found but small (${Math.round(hit.fullSide)} px). Move closer.`, c: "bg-amber-500 text-black" }
      : tilt > 1.25
        ? { t: "Marker found. Hold the camera more square-on.", c: "bg-amber-500 text-black" }
        : { t: `Marker ✓  ${Math.round(hit.fullSide)} px — good for measuring`, c: "bg-emerald-500 text-white" };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div>
          <p className="text-sm font-semibold">{face} photo</p>
          <p className="text-[11px] text-white/70">{HINT[face]}</p>
        </div>
        <button onClick={onClose} aria-label="Close camera" className="rounded-full bg-white/15 p-2">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {err ? (
          <p className="max-w-xs px-6 text-center text-sm text-white/80">{err}</p>
        ) : (
          <div className="relative w-full" style={{ aspectRatio: String(ratio), maxHeight: "100%" }}>
            <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
            {c && (
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={c.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(16,185,129,0.25)"
                  stroke="#10b981"
                  strokeWidth="0.006"
                />
              </svg>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {!err && (
          <p className={`rounded-full px-3 py-1.5 text-center text-xs font-semibold ${status.c}`}>{status.t}</p>
        )}
        <div className="flex items-center justify-center">
          <button
            onClick={capture}
            disabled={!!err || busy}
            aria-label="Take photo"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-white/40 active:scale-95 disabled:opacity-40"
          >
            <Camera className="text-slate-800" />
          </button>
        </div>
      </div>
    </div>
  );
}

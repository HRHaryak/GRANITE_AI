"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ImagePlus,
  RotateCcw,
  Upload,
} from "lucide-react";
import Button from "../ui/Button";
import { captureNativePhoto, isNativeApp } from "../../lib/native";

type CameraCaptureProps = {
  onImage: (file: File) => void | Promise<void>;
  disabled?: boolean;
};

type CameraState =
  | "idle"
  | "requesting"
  | "streaming"
  | "capturing"
  | "error";

export default function CameraCapture({
  onImage,
  disabled = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  function stopStream() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function deliverImage(file: File) {
    try {
      await onImage(file);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The captured image could not be added.",
      );
    }
  }

  async function openCamera() {
    if (disabled || cameraState === "requesting") return;

    setError(null);

    if (isNativeApp()) {
      setCameraState("requesting");

      try {
        const file = await captureNativePhoto();
        await deliverImage(file);
        setCameraState("idle");
      } catch (err) {
        setCameraState("error");
        setError(
          err instanceof Error
            ? err.message
            : "Unable to access the device camera.",
        );
      }

      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraState("error");
      setError(
        "Live camera access is not available in this browser. Use image upload instead.",
      );
      return;
    }

    setCameraState("requesting");

    try {
      stopStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        await videoRef.current.play().catch(() => undefined);
      }

      setCameraState("streaming");
    } catch (err) {
      stopStream();
      setCameraState("error");

      setError(
        err instanceof Error
          ? err.message
          : "Camera permission was denied or the camera is unavailable.",
      );
    }
  }

  function closeCamera() {
    stopStream();
    setCameraState("idle");
    setError(null);
  }

  async function captureFrame() {
    const video = videoRef.current;

    if (
      disabled ||
      cameraState !== "streaming" ||
      !video ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return;
    }

    setCameraState("capturing");
    setError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Unable to prepare the camera frame.");
      }

      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else reject(new Error("Unable to encode the captured image."));
          },
          "image/jpeg",
          0.94,
        );
      });

      const file = new File(
        [blob],
        `granite-capture-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
          lastModified: Date.now(),
        },
      );

      await deliverImage(file);
      setCameraState("streaming");
    } catch (err) {
      setCameraState("streaming");
      setError(
        err instanceof Error
          ? err.message
          : "Unable to capture the current frame.",
      );
    }
  }

  async function handleUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.currentTarget.value = "";

    if (!file || disabled) return;

    if (!file.type.startsWith("image/")) {
      setError("Select a valid image file.");
      return;
    }

    setError(null);
    await deliverImage(file);
  }

  const streaming =
    cameraState === "streaming" ||
    cameraState === "capturing";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="data-label">Phone camera</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Capture a new overlapping viewpoint or add an existing image.
            </p>
          </div>

          <span
            className={[
              "grid h-9 w-9 place-items-center rounded-xl border",
              streaming
                ? "border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[var(--success-muted)] text-[var(--success)]"
                : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--accent)]",
            ].join(" ")}
          >
            {streaming ? (
              <Camera size={17} />
            ) : (
              <CameraOff size={17} />
            )}
          </span>
        </div>
      </div>

      <div className="p-4">
        {streaming ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/3] w-full object-cover sm:aspect-video"
              />

              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-4 rounded-xl border border-white/20" />
                <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 border-l border-t border-white/45" />
              </div>

              <div className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-white/85">
                Keep neighboring views overlapped
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button
                onClick={captureFrame}
                disabled={disabled || cameraState === "capturing"}
                loading={cameraState === "capturing"}
                loadingLabel="Capturing"
                fullWidth
              >
                <Camera size={16} />
                Capture image
              </Button>

              <Button
                variant="secondary"
                onClick={closeCamera}
                disabled={disabled || cameraState === "capturing"}
                aria-label="Close camera"
              >
                <CameraOff size={16} />
              </Button>
            </div>

            <p className="text-[9px] leading-4 text-[var(--text-muted)]">
              The live preview is only a framing aid. Image quality,
              duplicate detection, granite presence, calibration evidence,
              and reconstruction suitability are determined later by the
              validation pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex min-h-[148px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-6 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--accent)]">
                <Camera size={20} />
              </span>

              <p className="mt-3 text-xs font-extrabold text-[var(--text-primary)]">
                Capture another viewpoint
              </p>

              <p className="mt-1 max-w-sm text-[10px] leading-4 text-[var(--text-muted)]">
                Move around the granite, maintain overlap, and keep the
                selected calibration reference visible when required.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={openCamera}
                disabled={disabled}
                loading={cameraState === "requesting"}
                loadingLabel="Opening camera"
                fullWidth
              >
                <Camera size={16} />
                Open camera
              </Button>

              <Button
                variant="secondary"
                onClick={() => uploadInputRef.current?.click()}
                disabled={disabled}
                fullWidth
              >
                <Upload size={16} />
                Upload image
              </Button>
            </div>

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              disabled={disabled}
              className="hidden"
            />

            {cameraState === "error" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={openCamera}
                disabled={disabled}
              >
                <RotateCcw size={13} />
                Retry camera
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[var(--danger-muted)] p-3 text-[10px] leading-4 text-[var(--danger)]">
            <ImagePlus size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Compass,
  Eye,
  EyeOff,
  FileImage,
  Focus,
  Layers3,
  Loader2,
  MapPin,
  Orbit,
  RefreshCcw,
  Ruler,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";

import {
  ApiError,
  clearCaptureSurfaceInaccessible,
  completeCaptureSession,
  createAnalysisJob,
  createBlock,
  createCaptureSession,
  getBlockCapture,
  getCaptureGuidance,
  getQuarries,
  isPostAnalysisRecaptureRecommended,
  isRecaptureEvidenceAdded,
  listCategories,
  markCaptureSurfaceInaccessible,
  reopenCaptureSessionForRecapture,
  deleteCaptureImage,
  uploadSessionImage,
  type CaptureGuidanceResponse,
} from "../../lib/api";
import type {
  CaptureImageUploadResult,
  CaptureSessionMetadata,
  GuidedCaptureView,
  Quarry,
  SessionOut,
} from "../../lib/types";
import { getFieldLocation } from "../../lib/native";

type CalibrationType =
  | "MANUAL_REFERENCE"
  | "ARUCO"
  | "MEASUREMENT_BOARD";

type CaptureGps = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type ExistingImage = {
  id: string;
  capture_side?: string | null;
  image_url?: string | null;
  accepted?: boolean | null;
  rejected?: boolean | null;
};

const CAPTURE_POSITIONS: GuidedCaptureView[] = [
  "FRONT",
  "BACK",
  "LEFT",
  "RIGHT",
  "FRONT_LEFT",
  "FRONT_RIGHT",
  "BACK_LEFT",
  "BACK_RIGHT",
  "TOP",
  "BOTTOM",
];

const RECOMMENDED_MINIMUM_EVIDENCE = 5;

const VIEW_COPY: Record<
  string,
  { title: string; hint: string; badge: string }
> = {
  FRONT: {
    title: "Front face",
    hint: "Stand square to the main visible face. Keep the full granite boundary and natural irregular edges in frame.",
    badge: "Start here",
  },
  FRONT_RIGHT: {
    title: "Front-right oblique",
    hint: "Move roughly 30–45° clockwise while keeping strong overlap with the front texture and corner.",
    badge: "Bridge view",
  },
  RIGHT: {
    title: "Right face",
    hint: "Capture the complete right side with the full irregular outline visible. If overlap is weak, AI will request a bridge view after the five core views.",
    badge: "Side evidence",
  },
  BACK_RIGHT: {
    title: "Back-right oblique",
    hint: "Move around the rear corner without jumping viewpoints. Preserve distinctive granite texture.",
    badge: "Bridge view",
  },
  BACK: {
    title: "Back face",
    hint: "Capture the rear surface fully. Keep cavities, fractures, protrusions and broken edges visible.",
    badge: "Rear evidence",
  },
  BACK_LEFT: {
    title: "Back-left oblique",
    hint: "Continue the orbit with overlapping rear-left evidence. Avoid repeated near-identical frames.",
    badge: "Bridge view",
  },
  LEFT: {
    title: "Left face",
    hint: "Capture the complete left side with natural texture and irregular edges visible. AI can request an oblique bridge view if camera connectivity is weak.",
    badge: "Side evidence",
  },
  FRONT_LEFT: {
    title: "Front-left oblique",
    hint: "Close the orbit by linking the left side back toward the original front view.",
    badge: "Closure view",
  },
  TOP: {
    title: "Top / elevated view",
    hint: "Capture a safe elevated/top view showing the upper irregular surface. Never climb or take an unsafe position; if a true top view is unsafe, use the safest elevated angle available.",
    badge: "Core view · safety first",
  },
  BOTTOM: {
    title: "Bottom surface",
    hint: "Usually inaccessible for large quarry blocks. Keep it explicitly unobserved unless direct photographic evidence exists.",
    badge: "Optional · only if directly visible",
  },
};


function viewIndex(view?: string | null) {
  if (!view) return 0;
  const index = CAPTURE_POSITIONS.indexOf(view as GuidedCaptureView);
  return index >= 0 ? index : 0;
}

function normalizeGuidance(
  value: CaptureGuidanceResponse | null | undefined,
): CaptureGuidanceResponse {
  return (value ?? {}) as CaptureGuidanceResponse;
}

function surfaceTitle(view?: string | null) {
  return VIEW_COPY[view || ""]?.title || view?.replaceAll("_", " ") || "Next granite view";
}

function friendlyCaptureValidationMessage(message: string): string {
  const value = String(message || "").trim();
  const normalized = value.toUpperCase();

  if (normalized.includes("DUPLICATE IMAGE") || normalized.includes("IDENTICAL FILE")) {
    const assigned = value.match(/assigned to\s+([A-Z_]+)/i)?.[1];
    return assigned
      ? `Duplicate photo detected. This image is already assigned to ${surfaceTitle(assigned)}. Capture or upload a different view.`
      : "Duplicate photo detected. This image was already used. Capture or upload a different view.";
  }

  if (
    normalized.includes("NOT_GRANITE") ||
    normalized.includes("NOT GRANITE") ||
    normalized.includes("GRANITE BLOCK NOT DETECTED")
  ) {
    return "Granite block not detected. Upload a clear photograph containing the complete granite block.";
  }

  if (normalized.includes("NEAR_DUPLICATE")) {
    return "This photo is too similar to an existing view. Move to the requested side and capture a meaningfully different angle.";
  }

  if (normalized.includes("VIEW_MISMATCH")) {
    return "The uploaded image does not match the requested granite view closely enough. Retake the requested side with the complete block visible.";
  }

  if (normalized.includes("BLUR")) {
    return "The image is too blurry for reliable reconstruction. Hold the phone steady, keep the granite sharp, and capture again.";
  }

  if (normalized.includes("EXPOS")) {
    return "The image exposure is not suitable for reconstruction. Avoid deep shadow or glare and capture the granite again.";
  }

  if (normalized.includes("OVERLAP")) {
    return "Feature overlap is too weak for reliable reconstruction. Capture the requested view with more shared granite texture, or follow the AI bridge-view guidance.";
  }

  return value || "This image could not be accepted as reconstruction evidence. Please capture the requested granite view again.";
}

function signalTone(status?: string | null) {
  const normalized = String(status || "").toUpperCase();

  if (
    normalized.includes("STRONG") ||
    normalized.includes("GOOD") ||
    normalized.includes("READY") ||
    normalized.includes("CONNECTED")
  ) {
    return "good";
  }

  if (
    normalized.includes("LOW") ||
    normalized.includes("INSUFFICIENT") ||
    normalized.includes("WEAK") ||
    normalized.includes("DISCONNECTED")
  ) {
    return "warn";
  }

  return "neutral";
}

function inaccessibleSurfaceKeys(
  value:
    | CaptureSessionMetadata["inaccessible_surfaces"]
    | string[]
    | null
    | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, details]) => {
        if (!details || typeof details !== "object") {
          return true;
        }

        const record = details as Record<string, unknown>;
        return (
          record.declared !== false &&
          String(record.surface_status || "")
            .toUpperCase() !== "OBSERVED"
        );
      })
      .map(([surface]) =>
        String(surface || "").trim().toUpperCase(),
      )
      .filter(Boolean);
  }

  return [];
}

function toneClasses(tone: "good" | "warn" | "neutral") {
  if (tone === "good") {
    return "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300";
  }

  if (tone === "warn") {
    return "border-amber-500/30 bg-amber-500/[0.08] text-amber-800 dark:text-amber-300";
  }

  return "border-black/10 bg-black/[0.03] text-black/65 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65";
}

export default function CapturePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [quarries, setQuarries] = useState<Quarry[]>([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);

  const [selectedQuarry, setSelectedQuarry] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [blockCode, setBlockCode] = useState("");

  const [calibrationType, setCalibrationType] =
    useState<CalibrationType>("MANUAL_REFERENCE");
  const [referenceCm, setReferenceCm] = useState("10");
  const [referencePixels, setReferencePixels] = useState("100");

  const [gps, setGps] = useState<CaptureGps | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [blockId, setBlockId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionOut | null>(null);
  const [guidance, setGuidance] = useState<CaptureGuidanceResponse>(
    {} as CaptureGuidanceResponse,
  );
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] =
    useState<CaptureImageUploadResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Ready for guided evidence capture");
  const [error, setError] = useState<string | null>(null);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [surfaceReason, setSurfaceReason] = useState("");
  const [showInaccessiblePanel, setShowInaccessiblePanel] = useState(false);
  const [selectedCaptureView, setSelectedCaptureView] = useState<GuidedCaptureView>("FRONT");

  const sessionStatus = String(session?.status || "").toUpperCase();
  const sessionClosed = [
    "COMPLETE",
    "COMPLETED",
    "CANCELLED",
    "CLOSED",
  ].includes(sessionStatus);

  const recaptureRecommended =
    isPostAnalysisRecaptureRecommended(guidance);
  const recaptureEvidenceAdded =
    isRecaptureEvidenceAdded(guidance);
  const postAnalysisRecaptureActive =
    recaptureRecommended || recaptureEvidenceAdded;

  const capturedLabels = useMemo(
    () =>
      new Set(
        existingImages
          .filter((image) => image.accepted && !image.rejected)
          .map((image) => String(image.capture_side || "").toUpperCase()),
      ),
    [existingImages],
  );

  const inaccessible = useMemo(() => {
    const metadata =
      session?.session_metadata as CaptureSessionMetadata | null;

    return new Set(
      [
        ...inaccessibleSurfaceKeys(
          metadata?.inaccessible_surfaces,
        ),
        ...inaccessibleSurfaceKeys(
          guidance.inaccessible_surfaces,
        ),
      ],
    );
  }, [
    guidance.inaccessible_surfaces,
    session?.session_metadata,
  ]);

  const currentView =
    postAnalysisRecaptureActive
      ? guidance.recapture_view_label ||
        guidance.recommended_capture_side ||
        guidance.next_recommended_view ||
        guidance.requested_view ||
        selectedCaptureView
      : selectedCaptureView;

  const acceptedEvidenceCount = existingImages.filter(
    (image) => image.accepted && !image.rejected,
  ).length;

  const selectedPositionIndex = CAPTURE_POSITIONS.indexOf(
    currentView as GuidedCaptureView,
  );

  const reconstructionMinimumReady =
    acceptedEvidenceCount >= RECOMMENDED_MINIMUM_EVIDENCE;

  const weakRecaptureImage = useMemo(() => {
    const weakId = String(guidance.existing_image_id || "");
    if (!weakId) return null;

    return (
      existingImages.find(
        (image) => String(image.id) === weakId,
      ) || null
    );
  }, [existingImages, guidance.existing_image_id]);

  const recaptureReplacementRequired = Boolean(
    recaptureRecommended &&
      guidance.existing_view_replacement_required &&
      guidance.existing_image_id,
  );

  const analysisActionEnabled = Boolean(
    session?.id &&
      !busy &&
      (postAnalysisRecaptureActive
        ? !recaptureRecommended || recaptureEvidenceAdded
        : reconstructionMinimumReady),
  );

  const orbitProgress = Math.min(
    100,
    Math.round(
      (acceptedEvidenceCount / RECOMMENDED_MINIMUM_EVIDENCE) * 100,
    ),
  );

  const currentViewCopy = VIEW_COPY[currentView || "FRONT"] || {
    title: surfaceTitle(currentView),
    hint: guidance.instruction || guidance.reason || "Capture the requested overlapping granite view.",
    badge: "AI requested view",
  };

  useEffect(() => {
    let active = true;

    void Promise.allSettled([getQuarries(), listCategories()]).then(
      ([quarryResult, categoryResult]) => {
        if (!active) return;

        if (quarryResult.status === "fulfilled") {
          setQuarries(quarryResult.value);
          if (quarryResult.value[0]) {
            setSelectedQuarry(quarryResult.value[0].id);
          }
        }

        if (categoryResult.status === "fulfilled") {
          setCategories(categoryResult.value);
          if (categoryResult.value[0]) {
            setSelectedCategory(categoryResult.value[0].id);
          }
        }
      },
    );

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const resumeBlockId = params.get("blockId");
      const resumeSessionId = params.get("sessionId");

      if (resumeBlockId && resumeSessionId) {
        setBlockId(resumeBlockId);

        void Promise.all([
          getBlockCapture(resumeBlockId),
          getCaptureGuidance(resumeSessionId),
        ])
          .then(([bundle, guidancePayload]) => {
            if (!active) return;

            setSession(bundle.session);
            setExistingImages(
              Array.isArray(bundle.images)
                ? (bundle.images as ExistingImage[])
                : [],
            );
            setGuidance(normalizeGuidance(guidancePayload));
            setStage("Existing capture restored");
          })
          .catch((cause) => {
            if (!active) return;
            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to restore the existing capture session.",
            );
          });
      }
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function refreshCaptureState(
    activeBlockId: string,
    activeSessionId: string,
  ) {
    const [bundle, guidancePayload] = await Promise.all([
      getBlockCapture(activeBlockId),
      getCaptureGuidance(activeSessionId),
    ]);

    setSession(bundle.session);
    setExistingImages(
      Array.isArray(bundle.images)
        ? (bundle.images as ExistingImage[])
        : [],
    );
    setGuidance(normalizeGuidance(guidancePayload));
  }

  async function ensureGuidedSession() {
    if (blockId && session?.id) {
      return {
        blockId,
        sessionId: session.id,
      };
    }

    if (!selectedQuarry || !selectedCategory) {
      throw new Error("Select a quarry and granite category first.");
    }

    const referenceSize = Number(referenceCm);
    const referencePixelValue = Number(referencePixels);

    if (!Number.isFinite(referenceSize) || referenceSize <= 0) {
      throw new Error("Enter a valid physical reference size.");
    }

    if (
      calibrationType === "MANUAL_REFERENCE" &&
      (!Number.isFinite(referencePixelValue) || referencePixelValue <= 0)
    ) {
      throw new Error("Enter a valid manual-reference pixel length.");
    }

    setStage("Creating granite record");

    const block = await createBlock({
      block_code: blockCode.trim() || undefined,
      quarry_id: selectedQuarry,
      granite_category_id: selectedCategory,
      capture_date: new Date().toISOString(),
      gps: gps ?? undefined,
      skip_gps: !gps,
    });

    setStage("Opening guided capture session");

    const createdSession = await createCaptureSession({
      block_id: block.id,
      calibration_type: calibrationType,
      known_reference_cm: referenceSize,
      reference_pixels:
        calibrationType === "MANUAL_REFERENCE"
          ? referencePixelValue
          : undefined,
      marker_size_cm:
        calibrationType === "ARUCO"
          ? referenceSize
          : undefined,
      session_metadata: {
        capture_mode: "FLEXIBLE_POSITIONAL",
        capture_strategy: "USER_SELECTED_CAPTURE_POSITIONS",
        available_capture_views: [
          "FRONT",
          "BACK",
          "LEFT",
          "RIGHT",
          "FRONT_LEFT",
          "FRONT_RIGHT",
          "BACK_LEFT",
          "BACK_RIGHT",
          "TOP",
          "BOTTOM",
        ],
        recommended_minimum_evidence: RECOMMENDED_MINIMUM_EVIDENCE,
        user_can_choose_capture_order: true,
        allow_ai_requested_extra_views: true,
        target_observed_shape_similarity: 0.9,
        target_similarity_is_validation_goal_not_guarantee: true,
        inaccessible_surfaces: {},
        ui_experience: "LUXURY_FLEXIBLE_CAPTURE_V3",
      },
    });

    setBlockId(block.id);
    setSession(createdSession);

    const firstGuidance = await getCaptureGuidance(createdSession.id);
    setGuidance(normalizeGuidance(firstGuidance));

    return {
      blockId: block.id,
      sessionId: createdSession.id,
    };
  }

  async function handleGps() {
    setGpsLoading(true);
    setError(null);

    try {
      const location = await getFieldLocation();
      setGps(location || null);
    } catch {
      setGps(null);
    } finally {
      setGpsLoading(false);
    }
  }

  function selectFile(file?: File | null) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSelectedFile(null);
      setUploadResult(null);
      setError(null);
      setValidationNotice(
        "Unsupported file. Choose a JPEG, PNG or WebP photograph of the granite block.",
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadResult(null);
    setError(null);
    setValidationNotice(null);
  }

  async function reopenRequestedRecapture() {
    if (!session?.id || !blockId) {
      setError("The completed capture session could not be identified.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      setStage(
        `Opening AI-requested ${surfaceTitle(
          guidance.recapture_view_label ||
            guidance.recommended_capture_side,
        )} recapture`,
      );

      const result =
        await reopenCaptureSessionForRecapture(session.id);

      setSession(result.session);
      setGuidance(normalizeGuidance(result.guidance));

      await refreshCaptureState(blockId, session.id);

      setStage(
        result.guidance.existing_view_replacement_required
          ? "Weak evidence identified — replace the requested view"
          : "AI-requested recapture is ready",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reopen the capture session for recapture.",
      );
      setStage("Recapture needs attention");
    } finally {
      setBusy(false);
    }
  }

  async function removeWeakRecaptureEvidence() {
    const imageId = String(guidance.existing_image_id || "");

    if (!imageId || !session?.id || !blockId) {
      setError("The weak evidence image is no longer available.");
      return;
    }

    if (sessionClosed) {
      setError(
        "Reopen the completed session for recapture before replacing evidence.",
      );
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? false
        : window.confirm(
            `Replace the weak ${surfaceTitle(
              guidance.recapture_view_label ||
                guidance.recommended_capture_side,
            )} evidence? The existing image will be removed from this open recapture session.`,
          );

    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      setStage("Removing weak photographic evidence");

      const result = await deleteCaptureImage(imageId);

      setGuidance(normalizeGuidance(result.guidance));
      await refreshCaptureState(blockId, session.id);

      if (
        weakRecaptureImage &&
        previewUrl &&
        selectedFile === null
      ) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      setStage(
        `Capture a better ${surfaceTitle(
          result.replacement_capture_side ||
            guidance.recapture_view_label ||
            guidance.recommended_capture_side,
        )}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to remove the weak recapture evidence.",
      );
      setStage("Evidence replacement needs attention");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCurrentView() {
    if (!selectedFile) {
      setError("Capture or choose the requested granite view first.");
      return;
    }

    if (postAnalysisRecaptureActive && sessionClosed) {
      setError(
        "Open the AI-requested recapture session before uploading replacement evidence.",
      );
      return;
    }

    if (
      recaptureReplacementRequired &&
      guidance.existing_image_id
    ) {
      setError(
        "Remove the weak existing view before uploading its replacement with the same canonical label.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setValidationNotice(null);

    try {
      const ids = await ensureGuidedSession();

      setStage(`Uploading ${surfaceTitle(currentView)}`);

      const result = await uploadSessionImage(
        ids.sessionId,
        selectedFile,
        String(currentView || "FRONT"),
        {
          gps_latitude: gps?.latitude,
          gps_longitude: gps?.longitude,
          gps_accuracy: gps?.accuracy,
          captured_at: new Date().toISOString(),
          device_metadata: {
            capture_mode: "GUIDED",
            ui_requested_view: currentView,
            evidence_policy:
              "Observed photographic evidence only. No fabricated surfaces.",
          },
        },
      );

      setUploadResult(result);
      setStage("Validating overlap and evidence quality");

      await refreshCaptureState(ids.blockId, ids.sessionId);

      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      setStage(
        postAnalysisRecaptureActive
          ? "Replacement evidence accepted — fresh analysis required"
          : "Next evidence view ready",
      );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 409, 422].includes(cause.status)
      ) {
        setError(null);
        setValidationNotice(friendlyCaptureValidationMessage(cause.message));
        setStage("Capture needs attention");
      } else {
        setValidationNotice(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to upload the granite view.",
        );
        setStage("Upload failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function markCurrentViewInaccessible() {
    const view = String(currentView || "");

    if (!session?.id || !view) {
      setError("Create the guided capture session before marking a surface inaccessible.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      setStage(`Marking ${surfaceTitle(view)} as unobserved`);
      await markCaptureSurfaceInaccessible(
        session.id,
        view,
        surfaceReason.trim() ||
          "Not safely accessible / not directly observable from the mobile capture position.",
      );

      if (!blockId) throw new Error("Capture block is unavailable.");

      await refreshCaptureState(blockId, session.id);
      setSurfaceReason("");
      setShowInaccessiblePanel(false);
      setStage("Unobserved surface recorded");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update the surface state.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreSurface(view: string) {
    if (!session?.id || !blockId) return;

    setBusy(true);
    setError(null);

    try {
      await clearCaptureSurfaceInaccessible(session.id, view);
      await refreshCaptureState(blockId, session.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to restore the surface.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finalizeCapture() {
    if (!session?.id || !blockId) {
      setError("Start the guided capture before requesting analysis.");
      return;
    }

    if (acceptedEvidenceCount < RECOMMENDED_MINIMUM_EVIDENCE) {
      setError(null);
      setValidationNotice(
        `Add at least ${RECOMMENDED_MINIMUM_EVIDENCE} accepted granite photos before starting 3D reconstruction.`,
      );
      setStage(
        `${acceptedEvidenceCount}/${RECOMMENDED_MINIMUM_EVIDENCE} accepted — minimum not reached`,
      );
      return;
    }

    setBusy(true);
    setError(null);
    setValidationNotice(null);

    try {
      if (recaptureRecommended && !recaptureEvidenceAdded) {
        throw new Error(
          "The AI-requested replacement view must be captured and accepted before a fresh analysis can start.",
        );
      }

      setStage(
        postAnalysisRecaptureActive
          ? "Checking corrected evidence set"
          : "Checking capture completeness",
      );

      const completion = await completeCaptureSession(
        session.id,
      );

      setStage(
        completion.fresh_analysis_required
          ? "Rebuilding 3D from the corrected evidence set"
          : `Minimum ${RECOMMENDED_MINIMUM_EVIDENCE} views accepted — starting 3D reconstruction`,
      );

      const createdJob = await createAnalysisJob(
        session.id,
      );

      setStage(
        completion.fresh_analysis_required
          ? "Fresh analysis started"
          : "Analysis started",
      );

      router.push(
        `/blocks/${blockId}?analysisJobId=${encodeURIComponent(createdJob.id)}`,
      );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 409, 422].includes(cause.status)
      ) {
        setError(null);
        setValidationNotice(friendlyCaptureValidationMessage(cause.message));
        setStage("Capture is not ready yet");
      } else {
        setValidationNotice(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "The capture is not ready for analysis yet.",
        );
      }

      try {
        await refreshCaptureState(blockId, session.id);
      } catch {
        // Keep the original error as the primary user message.
      }
    } finally {
      setBusy(false);
    }
  }

  const overlapTone = signalTone(
    uploadResult?.capture_overlap_preflight?.status ||
      guidance.overlap_status,
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f7f6] text-[#073b46] dark:bg-[#062f38] dark:text-[#effaf8]">
      <LuxuryBackground />

      <div className="relative mx-auto w-full max-w-[1720px] px-3 pb-28 pt-3 sm:px-5 lg:px-6 lg:pt-5">
        <motion.header
          initial={{
            opacity: 0,
            y: -8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.45,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="relative overflow-hidden rounded-[24px] border border-teal-200/90 bg-white/88 px-4 py-4 shadow-[0_18px_50px_rgba(7,59,70,.06)] backdrop-blur-2xl dark:border-teal-300/15 dark:bg-[#0b3e47]/94 sm:px-5"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-500 via-cyan-400 to-teal-400" />

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.13em] text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200">
                  <ScanLine size={9} />
                  NEW ANALYSIS
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200">
                  <ShieldCheck size={9} />
                  EVIDENCE-FIRST
                </span>

                <span className="rounded-full border border-[#d4e7e4] bg-[#f1faf8] px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.11em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
                  FLEXIBLE 10-VIEW CAPTURE
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                <h1 className="text-[28px] font-black leading-none tracking-[-0.05em] text-[#073b46] sm:text-[34px] dark:text-white">
                  Field Capture Mission Control
                </h1>

                <p className="pb-0.5 text-[8px] font-semibold text-[#718b91] dark:text-[#729996]">
                  Build photographic evidence first. Reconstruction starts only from accepted views.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
              <MissionMetric
                label="Accepted"
                value={`${acceptedEvidenceCount}`}
                detail={`${Math.max(0, RECOMMENDED_MINIMUM_EVIDENCE - acceptedEvidenceCount)} to minimum`}
                tone={acceptedEvidenceCount > 0 ? "cyan" : "neutral"}
              />

              <MissionMetric
                label="3D gate"
                value={reconstructionMinimumReady ? "READY" : `${orbitProgress}%`}
                detail="5 accepted views"
                tone={reconstructionMinimumReady ? "good" : "cyan"}
              />

              <MissionMetric
                label="Metric scale"
                value={session ? "SET" : "PENDING"}
                detail={calibrationType.replaceAll("_", " ")}
                tone={session ? "good" : "neutral"}
              />

              <MissionMetric
                label="Field GPS"
                value={gps ? "LOCKED" : "OPTIONAL"}
                detail={gps ? "Location attached" : "No fabricated location"}
                tone={gps ? "good" : "neutral"}
              />
            </div>
          </div>
        </motion.header>

        <MissionWorkflowRail
          acceptedEvidenceCount={acceptedEvidenceCount}
          selectedFile={Boolean(selectedFile)}
          reconstructionReady={reconstructionMinimumReady}
          busy={busy}
        />

        {(validationNotice || error) && (
          <div className="mt-3 grid gap-2">
            {validationNotice ? (
              <motion.div
                initial={{
                  opacity: 0,
                  y: -5,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="flex items-start gap-3 rounded-[16px] border border-amber-300/50 bg-amber-50/86 px-3.5 py-3 text-[10px] text-amber-900 shadow-sm backdrop-blur dark:border-amber-300/15 dark:bg-amber-300/[0.06] dark:text-amber-100"
                role="status"
                aria-live="polite"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-black">Capture needs attention</p>
                  <p className="mt-0.5 leading-5 opacity-80">{validationNotice}</p>
                </div>
              </motion.div>
            ) : null}

            {error ? (
              <motion.div
                initial={{
                  opacity: 0,
                  y: -5,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="flex items-start gap-3 rounded-[16px] border border-rose-300/50 bg-rose-50/86 px-3.5 py-3 text-[10px] text-rose-800 shadow-sm backdrop-blur dark:border-rose-300/15 dark:bg-rose-300/[0.06] dark:text-rose-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-5">{error}</span>
              </motion.div>
            ) : null}
          </div>
        )}

        {postAnalysisRecaptureActive ? (
          <motion.section
            initial={{
              opacity: 0,
              y: 8,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="mt-3 overflow-hidden rounded-[20px] border border-amber-300/50 bg-[linear-gradient(110deg,rgba(255,251,235,.95),rgba(240,249,255,.92))] shadow-[0_14px_38px_rgba(120,81,20,.06)] dark:border-amber-300/15 dark:bg-[linear-gradient(110deg,rgba(53,43,24,.62),rgba(8,58,68,.86))]"
          >
            <div className="grid gap-3 p-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/15 dark:bg-amber-300/[0.06] dark:text-amber-200">
                  <RefreshCcw size={15} />
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[7px] font-black uppercase tracking-[0.13em] text-amber-700 dark:text-amber-200">
                      RECONSTRUCTION FEEDBACK
                    </p>

                    <span className="rounded-full border border-[#d4e7e4] bg-white/70 px-2 py-1 text-[5px] font-black uppercase tracking-[0.09em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
                      OBSERVED VIEWS ONLY
                    </span>
                  </div>

                  <p className="mt-1 text-[12px] font-black text-[#174851] dark:text-[#effaf8]">
                    {recaptureEvidenceAdded
                      ? "Corrected evidence is ready for a fresh reconstruction."
                      : `AI requests a stronger ${surfaceTitle(
                          guidance.recapture_view_label ||
                            guidance.recommended_capture_side,
                        )} view.`}
                  </p>

                  <p className="mt-1 max-w-5xl text-[8px] leading-4 text-[#5f7c82] dark:text-[#8eb5b2]">
                    {recaptureEvidenceAdded
                      ? "The replacement photo was accepted. The old reconstruction is stale until a new analysis job rebuilds it."
                      : guidance.replacement_instruction ||
                        guidance.instruction ||
                        guidance.reason ||
                        "Replace only the requested weak evidence. Hidden or missing surfaces will not be fabricated."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {recaptureEvidenceAdded ? (
                  <button
                    type="button"
                    onClick={finalizeCapture}
                    disabled={busy || !session?.id}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-teal-600 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-white shadow-[0_8px_22px_rgba(8,127,130,.2)] transition hover:bg-teal-700 disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCcw size={12} />
                    )}
                    RUN FRESH RECONSTRUCTION
                  </button>
                ) : sessionClosed ? (
                  <button
                    type="button"
                    onClick={reopenRequestedRecapture}
                    disabled={busy || !session?.id}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-teal-600 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-teal-700 disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCcw size={12} />
                    )}
                    OPEN REQUESTED RECAPTURE
                  </button>
                ) : recaptureReplacementRequired ? (
                  <button
                    type="button"
                    onClick={removeWeakRecaptureEvidence}
                    disabled={busy}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-rose-300 bg-rose-50 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-40 dark:border-rose-300/15 dark:bg-rose-300/[0.06] dark:text-rose-200"
                  >
                    {busy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    REMOVE WEAK VIEW
                  </button>
                ) : (
                  <span className="rounded-[12px] border border-amber-200 bg-white/70 px-3 py-2 text-[6px] font-black uppercase tracking-[0.09em] text-amber-700 dark:border-amber-300/15 dark:bg-teal-950/22 dark:text-amber-200">
                    CAPTURE REQUESTED VIEW BELOW
                  </span>
                )}
              </div>
            </div>
          </motion.section>
        ) : null}

        <motion.section
          initial={{
            opacity: 0,
            y: 12,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.06,
            duration: 0.5,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="relative mt-4 overflow-hidden rounded-[28px] border border-teal-200/90 bg-white/88 shadow-[0_24px_70px_rgba(7,59,70,.075)] backdrop-blur-2xl dark:border-teal-300/15 dark:bg-[#0b3e47]/94"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-500 via-cyan-400 to-teal-400" />

          <div className="border-b border-[#d4e7e4]/80 px-4 py-3.5 dark:border-teal-200/10 sm:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[6px] font-black uppercase tracking-[0.15em] text-cyan-700 dark:text-cyan-300">
                  CAPTURE COCKPIT
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-black tracking-[-0.035em] text-[#073b46] dark:text-white">
                    {surfaceTitle(currentView)}
                  </h2>

                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[5px] font-black uppercase tracking-[0.09em] text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200">
                    {postAnalysisRecaptureActive
                      ? "AI REQUEST"
                      : selectedPositionIndex >= 0
                        ? `VIEW ${selectedPositionIndex + 1} / ${CAPTURE_POSITIONS.length}`
                        : "SELECT VIEW"}
                  </span>

                  {capturedLabels.has(String(currentView).toUpperCase()) ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[5px] font-black uppercase tracking-[0.09em] text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200">
                      <Check size={8} />
                      ACCEPTED
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#d4e7e4] bg-[#f1faf8] px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.09em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
                  {stage}
                </span>

                <span
                  className={[
                    "rounded-full border px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.09em]",
                    reconstructionMinimumReady
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
                      : "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05] dark:text-cyan-200",
                  ].join(" ")}
                >
                  {acceptedEvidenceCount}/{RECOMMENDED_MINIMUM_EVIDENCE} MINIMUM
                </span>
              </div>
            </div>

            <div className="border-t border-teal-100/80 bg-teal-50/45 px-4 py-2.5 dark:border-teal-200/10 dark:bg-teal-300/[0.025] sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] border border-cyan-200 bg-white text-cyan-600 shadow-sm dark:border-cyan-300/15 dark:bg-teal-950/30 dark:text-cyan-300">
                    {busy ? <Loader2 size={10} className="animate-spin" /> : <WandSparkles size={10} />}
                  </span>
                  <p className="truncate text-[6px] font-black uppercase tracking-[0.11em] text-[#42666d] dark:text-[#b7d8d4]">
                    {postAnalysisRecaptureActive
                      ? `AI priority · capture ${surfaceTitle(currentView)}`
                      : selectedFile
                        ? `Ready to validate · ${surfaceTitle(currentView)}`
                        : `Next action · capture ${surfaceTitle(currentView)}`}
                  </p>
                </div>

                <span className="rounded-full border border-teal-200/80 bg-white/70 px-2 py-1 text-[5px] font-black uppercase tracking-[0.08em] text-teal-700 dark:border-teal-300/10 dark:bg-teal-950/30 dark:text-teal-200">
                  {reconstructionMinimumReady ? "RECONSTRUCTION UNLOCKED" : `${acceptedEvidenceCount}/5 ACCEPTED`}
                </span>
              </div>
            </div>
          </div>

          <div className="grid min-h-[590px] xl:grid-cols-[230px_minmax(0,1fr)_300px]">
            <aside className="border-b border-[#d4e7e4]/80 bg-[linear-gradient(180deg,#f5fbf9,#eaf5f2)] p-3 dark:border-teal-200/10 dark:bg-[linear-gradient(180deg,#0d414a,#0a3942)] xl:border-b-0 xl:border-r">
              <div className="flex items-center justify-between gap-2 px-1">
                <div>
                  <p className="text-[5.5px] font-black uppercase tracking-[0.14em] text-[#718b91] dark:text-[#729996]">
                    EVIDENCE ORBIT
                  </p>
                  <p className="mt-0.5 text-[8px] font-black text-[#244e56] dark:text-[#d9efec]">
                    Choose any angle
                  </p>
                </div>

                <div className="grid h-9 w-9 place-items-center rounded-[11px] border border-cyan-200 bg-white/80 text-cyan-700 shadow-sm dark:border-cyan-300/15 dark:bg-teal-950/22 dark:text-cyan-200">
                  <Orbit size={14} />
                </div>
              </div>

              <div className="relative mx-auto mt-3 h-[170px] w-[170px]">
                <motion.div
                  animate={{
                    rotate: 360,
                  }}
                  transition={{
                    duration: 28,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-[8px] rounded-full border border-dashed border-teal-300/60 dark:border-teal-300/15"
                />

                <motion.div
                  animate={{
                    rotate: -360,
                  }}
                  transition={{
                    duration: 42,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-[30px] rounded-full border border-dotted border-cyan-300/60 dark:border-cyan-300/15"
                />

                <div className="absolute left-1/2 top-1/2 h-[72px] w-[92px] -translate-x-1/2 -translate-y-1/2">
                  <svg
                    viewBox="0 0 100 76"
                    aria-hidden="true"
                    className="h-full w-full"
                  >
                    <path
                      d="M15 24 L36 10 L71 13 L88 27 L84 56 L62 69 L30 65 L10 49 Z"
                      fill="#d7e9e6"
                      stroke="#169f9e"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15 24 L36 10 L71 13 L52 27 L27 31 Z"
                      fill="#eef9f7"
                      stroke="#42c9dd"
                      strokeWidth="1"
                    />
                    <path
                      d="M52 27 L71 13 L88 27 L84 56 L62 69 L58 40 Z"
                      fill="#abcac6"
                      stroke="#0e8587"
                      strokeWidth="1"
                    />
                    <motion.line
                      x1="8"
                      x2="90"
                      y1="20"
                      y2="20"
                      stroke="#42c9dd"
                      strokeWidth="1.5"
                      animate={{
                        translateY: [
                          0,
                          36,
                          0,
                        ],
                        opacity: [
                          0.25,
                          0.95,
                          0.25,
                        ],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </svg>
                </div>

                {CAPTURE_POSITIONS.slice(0, 8).map((view, index) => {
                  const angle =
                    (index / 8) *
                      Math.PI *
                      2 -
                    Math.PI / 2;

                  const x =
                    Math.cos(angle) *
                      66 +
                    66;

                  const y =
                    Math.sin(angle) *
                      66 +
                    66;

                  const accepted =
                    capturedLabels.has(view);

                  const selected =
                    currentView === view;

                  return (
                    <motion.button
                      key={view}
                      type="button"
                      disabled={postAnalysisRecaptureActive}
                      onClick={() =>
                        setSelectedCaptureView(
                          view,
                        )
                      }
                      title={surfaceTitle(view)}
                      className={[
                        "absolute grid h-8 w-8 place-items-center rounded-[10px] border text-[5px] font-black shadow-sm backdrop-blur transition",
                        accepted
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.07] dark:text-emerald-200"
                          : selected
                            ? "border-cyan-300 bg-cyan-50 text-cyan-700 shadow-[0_0_20px_rgba(31,181,174,.18)] dark:border-cyan-300/20 dark:bg-cyan-300/[0.07] dark:text-cyan-200"
                            : "border-[#d4e7e4] bg-white/88 text-[#718b91] hover:border-teal-200 hover:text-teal-700 dark:border-teal-200/10 dark:bg-teal-950/25 dark:text-[#729996]",
                      ].join(" ")}
                      style={{
                        left: x,
                        top: y,
                      }}
                      animate={
                        selected
                          ? {
                              scale: [
                                1,
                                1.12,
                                1,
                              ],
                            }
                          : undefined
                      }
                      transition={{
                        duration: 1.7,
                        repeat: selected
                          ? Infinity
                          : 0,
                      }}
                    >
                      {accepted ? (
                        <Check size={10} />
                      ) : (
                        index + 1
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {CAPTURE_POSITIONS.map((view, index) => {
                  const accepted =
                    capturedLabels.has(view);

                  const selected =
                    currentView === view;

                  const unavailable =
                    inaccessible.has(view);

                  return (
                    <button
                      key={view}
                      type="button"
                      disabled={postAnalysisRecaptureActive}
                      onClick={() =>
                        setSelectedCaptureView(
                          view,
                        )
                      }
                      className={[
                        "relative overflow-hidden rounded-[11px] border px-2 py-2 text-left transition",
                        accepted
                          ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05]"
                          : selected
                            ? "border-cyan-300 bg-cyan-50 shadow-[0_7px_18px_rgba(31,181,174,.09)] dark:border-cyan-300/20 dark:bg-cyan-300/[0.06]"
                            : unavailable
                              ? "border-amber-200 bg-amber-50/70 dark:border-amber-300/15 dark:bg-amber-300/[0.05]"
                              : "border-[#d4e7e4] bg-white/58 hover:border-teal-200 hover:bg-teal-50/70 dark:border-teal-200/10 dark:bg-teal-950/18",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[5px] font-black text-[#91a8ab] dark:text-[#5f8582]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        {accepted ? (
                          <Check size={9} className="text-emerald-600" />
                        ) : unavailable ? (
                          <EyeOff size={9} className="text-amber-600" />
                        ) : selected ? (
                          <CircleDot size={9} className="text-cyan-600" />
                        ) : null}
                      </div>

                      <p
                        className={[
                          "mt-1 truncate text-[6px] font-black",
                          accepted
                            ? "text-emerald-700 dark:text-emerald-200"
                            : selected
                              ? "text-cyan-700 dark:text-cyan-200"
                              : "text-[#42666d] dark:text-[#b7d8d4]",
                        ].join(" ")}
                      >
                        {surfaceTitle(view)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="capture-main-compact relative min-w-0 bg-[linear-gradient(145deg,#f8fcfb,#edf8f5)] p-3 dark:bg-[linear-gradient(145deg,#0b4149,#083640)] sm:p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) =>
                  selectFile(
                    event.target.files?.[0],
                  )
                }
              />

              <div className="relative h-full min-h-[558px] overflow-hidden rounded-[22px] border border-teal-200/85 bg-white/70 shadow-[inset_0_0_75px_rgba(22,159,158,.06)] dark:border-teal-300/15 dark:bg-teal-950/[0.16]">
                <div className="pointer-events-none absolute inset-0">
                  <motion.div
                    animate={{
                      backgroundPosition: [
                        "0px 0px",
                        "36px 36px",
                      ],
                    }}
                    transition={{
                      duration: 13,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(22,159,158,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(22,159,158,.07)_1px,transparent_1px)] [background-size:36px_36px] dark:opacity-[0.08]"
                  />

                  <motion.div
                    animate={{
                      x: [
                        "-18%",
                        "118%",
                      ],
                    }}
                    transition={{
                      duration: 6.8,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute inset-y-0 w-[16%] bg-gradient-to-r from-transparent via-cyan-100/70 to-transparent blur-2xl dark:via-cyan-100/[0.035]"
                  />
                </div>

                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-200 bg-white/90 px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.1em] text-cyan-700 shadow-sm backdrop-blur dark:border-cyan-300/15 dark:bg-[#0d4650]/92 dark:text-cyan-200">
                    ACTIVE LENS · {surfaceTitle(currentView)}
                  </span>

                  <span className="rounded-full border border-[#d4e7e4] bg-white/82 px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.09em] text-[#718b91] shadow-sm backdrop-blur dark:border-teal-200/10 dark:bg-teal-950/25 dark:text-[#729996]">
                    {currentViewCopy.badge}
                  </span>
                </div>

                <div className="absolute right-3 top-3 z-20">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.09em] backdrop-blur",
                      selectedFile
                        ? "border-emerald-200 bg-emerald-50/92 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.06] dark:text-emerald-200"
                        : "border-[#d4e7e4] bg-white/84 text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/25 dark:text-[#729996]",
                    ].join(" ")}
                  >
                    {selectedFile ? (
                      <Check size={8} />
                    ) : (
                      <Camera size={8} />
                    )}
                    {selectedFile ? "PHOTO READY" : "AWAITING PHOTO"}
                  </span>
                </div>

                <div className="absolute inset-0">
                  <AnimatePresence mode="wait">
                    {previewUrl ? (
                      <motion.div
                        key="preview"
                        initial={{
                          opacity: 0,
                          scale: 1.025,
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                        }}
                        exit={{
                          opacity: 0,
                        }}
                        transition={{
                          duration: 0.3,
                        }}
                        className="absolute inset-0"
                      >
                        <Image
                          src={previewUrl}
                          alt={`${surfaceTitle(currentView)} granite preview`}
                          fill
                          unoptimized
                          className="object-contain"
                        />

                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,59,70,.06),transparent_22%,transparent_72%,rgba(7,59,70,.16))]" />

                        <CornerGuides />

                        <motion.div
                          animate={{
                            y: [
                              70,
                              410,
                              70,
                            ],
                            opacity: [
                              0.18,
                              0.75,
                              0.18,
                            ],
                          }}
                          transition={{
                            duration: 4.2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          className="pointer-events-none absolute left-[8%] right-[8%] top-0 h-px bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,.65)]"
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{
                          opacity: 0,
                        }}
                        animate={{
                          opacity: 1,
                        }}
                        exit={{
                          opacity: 0,
                        }}
                        className="absolute inset-0 grid place-items-center px-5"
                      >
                        <div className="relative w-full max-w-[520px] text-center">
                          <div className="relative mx-auto h-[230px] w-[300px] max-w-full">
                            <motion.div
                              animate={{
                                rotate: 360,
                              }}
                              transition={{
                                duration: 24,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                              className="absolute left-1/2 top-1/2 h-[205px] w-[205px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-teal-300/55 dark:border-teal-300/15"
                            />

                            <motion.div
                              animate={{
                                rotate: -360,
                              }}
                              transition={{
                                duration: 36,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                              className="absolute left-1/2 top-1/2 h-[150px] w-[245px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dotted border-cyan-300/55 dark:border-cyan-300/15"
                            />

                            <svg
                              viewBox="0 0 300 230"
                              aria-hidden="true"
                              className="absolute inset-0 h-full w-full"
                            >
                              <path
                                d="M60 76 L102 43 L193 50 L242 82 L252 148 L216 183 L119 190 L54 157 L42 112 Z"
                                fill="rgba(223,246,242,.58)"
                                stroke="#8eddd6"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                              />

                              <motion.path
                                d="M60 76 L144 114 L102 43 M193 50 L144 114 L242 82 M252 148 L144 114 L216 183 M119 190 L144 114 L54 157 M42 112 L144 114 L60 76"
                                fill="none"
                                stroke="#42c9dd"
                                strokeWidth="1"
                                strokeDasharray="260"
                                initial={{
                                  strokeDashoffset: 260,
                                }}
                                animate={{
                                  strokeDashoffset: [
                                    260,
                                    0,
                                    0,
                                  ],
                                  opacity: [
                                    0.16,
                                    0.7,
                                    0.28,
                                  ],
                                }}
                                transition={{
                                  duration: 4,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />

                              <motion.line
                                x1="45"
                                x2="252"
                                y1="70"
                                y2="70"
                                stroke="#42c9dd"
                                strokeWidth="1.8"
                                animate={{
                                  translateY: [
                                    0,
                                    105,
                                    0,
                                  ],
                                  opacity: [
                                    0.2,
                                    0.9,
                                    0.2,
                                  ],
                                }}
                                transition={{
                                  duration: 3.6,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            </svg>

                            <div className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[18px] border border-teal-200 bg-white/90 text-teal-700 shadow-[0_12px_32px_rgba(22,159,158,.14)] backdrop-blur dark:border-teal-300/15 dark:bg-[#0d4650]/92 dark:text-teal-200">
                              <Camera size={22} />
                            </div>
                          </div>

                          <p className="text-[16px] font-black tracking-[-0.035em] text-[#123f48] dark:text-white">
                            Capture {surfaceTitle(currentView)}
                          </p>

                          <p className="mx-auto mt-2 max-w-md text-[9px] leading-5 text-[#5f7c82] dark:text-[#8eb5b2]">
                            {currentViewCopy.hint}
                          </p>

                          <button
                            type="button"
                            onClick={() =>
                              fileInputRef.current?.click()
                            }
                            disabled={
                              busy ||
                              (postAnalysisRecaptureActive &&
                                sessionClosed)
                            }
                            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-teal-600 px-5 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_28px_rgba(8,127,130,.22)] transition hover:-translate-y-0.5 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Camera size={13} />
                            OPEN CAMERA / CHOOSE PHOTO
                          </button>

                          <div className="mx-auto mt-4 grid max-w-[430px] grid-cols-3 gap-1.5">
                            <OperatorHint
                              number="01"
                              title="Frame"
                              detail="Full stone outline"
                              active
                            />
                            <OperatorHint
                              number="02"
                              title="Overlap"
                              detail="Keep texture shared"
                            />
                            <OperatorHint
                              number="03"
                              title="Validate"
                              detail="AI checks evidence"
                            />
                          </div>

                          <p className="mt-2 text-[5.5px] font-bold uppercase tracking-[0.09em] text-[#91a8ab] dark:text-[#5f8582]">
                            JPEG · PNG · WEBP · EVIDENCE IS NEVER FABRICATED
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="absolute bottom-3 left-3 right-3 z-30">
                  <div className="rounded-[17px] border border-white/70 bg-white/82 p-2.5 shadow-[0_14px_38px_rgba(7,59,70,.1)] backdrop-blur-xl dark:border-teal-300/10 dark:bg-[#0b3f48]/88">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() =>
                          fileInputRef.current?.click()
                        }
                        disabled={
                          busy ||
                          (postAnalysisRecaptureActive &&
                            sessionClosed)
                        }
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-teal-200 bg-teal-50 px-3 text-[7px] font-black uppercase tracking-[0.09em] text-teal-700 transition hover:bg-teal-100 disabled:opacity-40 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200"
                      >
                        <Camera size={12} />
                        {selectedFile
                          ? "RETAKE / REPLACE"
                          : "CAPTURE / CHOOSE"}
                      </button>

                      <button
                        type="button"
                        onClick={uploadCurrentView}
                        disabled={
                          busy ||
                          !selectedFile ||
                          (postAnalysisRecaptureActive &&
                            sessionClosed)
                        }
                        className="inline-flex min-h-10 flex-[1.2] items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-teal-600 to-cyan-500 px-3 text-[7px] font-black uppercase tracking-[0.09em] text-white shadow-[0_8px_24px_rgba(31,181,174,.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <UploadCloud size={12} />
                        )}
                        VALIDATE & ADD EVIDENCE
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setShowInaccessiblePanel(
                            true,
                          )
                        }
                        disabled={
                          busy ||
                          !session?.id
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d4e7e4] bg-white px-3 text-[7px] font-black uppercase tracking-[0.09em] text-[#5f7c82] transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-35 dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#8eb5b2]"
                      >
                        <EyeOff size={12} />
                        UNOBSERVED
                      </button>
                    </div>

                    {selectedFile ? (
                      <p className="mt-2 truncate px-1 text-center text-[5.5px] font-semibold text-[#718b91] dark:text-[#729996]">
                        Ready: {selectedFile.name}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </main>

            <aside className="border-t border-[#d4e7e4]/80 bg-[linear-gradient(180deg,#f8fcfb,#edf8f5)] p-3 dark:border-teal-200/10 dark:bg-[linear-gradient(180deg,#0c4048,#083a44)] xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[5.5px] font-black uppercase tracking-[0.14em] text-[#718b91] dark:text-[#729996]">
                    AI CAPTURE DIRECTOR
                  </p>
                  <p className="mt-0.5 text-[8px] font-black text-[#244e56] dark:text-[#d9efec]">
                    Real-time evidence guidance
                  </p>
                </div>

                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                </span>
              </div>

              <div className="mt-3 space-y-2">
                <DirectorSignal
                  icon={<Focus size={13} />}
                  label="Current view"
                  value={surfaceTitle(currentView)}
                  detail={guidance.reason || currentViewCopy.hint}
                  tone="cyan"
                />

                <DirectorSignal
                  icon={<CircleDot size={13} />}
                  label="Overlap"
                  value={
                    uploadResult?.capture_overlap_preflight?.status ||
                    guidance.overlap_status ||
                    "Not evaluated"
                  }
                  detail={
                    uploadResult?.capture_overlap_preflight?.guidance ||
                    guidance.overlap_guidance ||
                    "Overlap is evaluated after an accepted upload."
                  }
                  tone={
                    overlapTone === "good"
                      ? "good"
                      : overlapTone === "warn"
                        ? "warn"
                        : "neutral"
                  }
                />

                <DirectorSignal
                  icon={<Ruler size={13} />}
                  label="Calibration"
                  value={
                    session
                      ? "Configured"
                      : calibrationType.replaceAll(
                          "_",
                          " ",
                        )
                  }
                  detail={
                    session
                      ? "Capture session scale metadata is locked."
                      : "Configure scale before the first upload."
                  }
                  tone={session ? "good" : "neutral"}
                />

                <DirectorSignal
                  icon={<MapPin size={13} />}
                  label="Location"
                  value={
                    gps
                      ? "GPS captured"
                      : "Optional"
                  }
                  detail={
                    gps
                      ? `${gps.latitude.toFixed(
                          5,
                        )}, ${gps.longitude.toFixed(
                          5,
                        )}`
                      : "No coordinates are invented."
                  }
                  tone={gps ? "good" : "neutral"}
                />
              </div>

              <button
                type="button"
                onClick={handleGps}
                disabled={
                  busy ||
                  gpsLoading
                }
                className="mt-2.5 flex min-h-10 w-full items-center justify-between rounded-[12px] border border-teal-200 bg-white/72 px-3 text-left text-[6.5px] font-black uppercase tracking-[0.08em] text-teal-700 transition hover:bg-teal-50 disabled:opacity-40 dark:border-teal-300/15 dark:bg-teal-950/20 dark:text-teal-200"
              >
                <span className="inline-flex items-center gap-2">
                  {gpsLoading ? (
                    <Loader2
                      size={11}
                      className="animate-spin"
                    />
                  ) : (
                    <Compass size={11} />
                  )}

                  {gps
                    ? "REFRESH GPS"
                    : "CAPTURE GPS"}
                </span>

                <ChevronRight size={11} />
              </button>

              <div className="mt-3 rounded-[15px] border border-[#d4e7e4] bg-white/62 p-3 dark:border-teal-200/10 dark:bg-teal-950/18">
                <p className="text-[5.5px] font-black uppercase tracking-[0.13em] text-[#718b91] dark:text-[#729996]">
                  EVIDENCE STANDARD
                </p>

                <div className="mt-2 grid gap-1.5">
                  <EvidenceRule
                    icon={<Focus size={13} />}
                    title="Full irregular outline"
                    text="Do not crop chipped corners, protrusions, slopes or cavities."
                  />
                  <EvidenceRule
                    icon={<Orbit size={13} />}
                    title="Keep texture overlap"
                    text="Neighbouring photos should retain recognizable stone texture."
                  />
                  <EvidenceRule
                    icon={<Ruler size={13} />}
                    title="Scale stays visible"
                    text="Keep the selected metric reference readable in useful views."
                  />
                  <EvidenceRule
                    icon={<ShieldCheck size={13} />}
                    title="No invented surfaces"
                    text="Unseen geometry remains unknown until observed."
                  />
                </div>
              </div>
            </aside>
          </div>

          <div className="border-t border-[#d4e7e4]/80 bg-[linear-gradient(180deg,#ffffff,#f3faf8)] p-3 dark:border-teal-200/10 dark:bg-[linear-gradient(180deg,#083a44,#083640)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[5.5px] font-black uppercase tracking-[0.14em] text-[#718b91] dark:text-[#729996]">
                  EVIDENCE FILMSTRIP
                </p>
                <p className="mt-0.5 text-[7px] font-black text-[#244e56] dark:text-[#d9efec]">
                  Every accepted view stays visible and revisitable
                </p>
              </div>

              <span className="rounded-full border border-[#d4e7e4] bg-white px-2.5 py-1 text-[5px] font-black uppercase tracking-[0.08em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
                NO FORCED ORDER
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
              {CAPTURE_POSITIONS.map((view, index) => {
                const evidence =
                  existingImages.find(
                    (image) =>
                      image.accepted &&
                      !image.rejected &&
                      String(
                        image.capture_side ||
                          "",
                      ).toUpperCase() ===
                        view,
                  );

                const accepted =
                  Boolean(evidence);

                const selected =
                  currentView === view;

                const unavailable =
                  inaccessible.has(view);

                return (
                  <button
                    key={view}
                    type="button"
                    disabled={postAnalysisRecaptureActive}
                    onClick={() =>
                      setSelectedCaptureView(
                        view,
                      )
                    }
                    className={[
                      "group relative min-h-[78px] overflow-hidden rounded-[13px] border text-left transition duration-200",
                      selected
                        ? "border-cyan-300 shadow-[0_8px_22px_rgba(31,181,174,.12)]"
                        : accepted
                          ? "border-emerald-200"
                          : unavailable
                            ? "border-amber-200"
                            : "border-[#d4e7e4] hover:border-teal-200",
                      "dark:border-teal-200/10",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-[1.025]",
                        evidence?.image_url
                          ? ""
                          : accepted
                            ? "bg-[linear-gradient(145deg,#ecfdf5,#f0fdfa)]"
                            : unavailable
                              ? "bg-[linear-gradient(145deg,#fffbeb,#fff7ed)]"
                              : "bg-[linear-gradient(145deg,#f8fafc,#eaf5f2)]",
                      ].join(" ")}
                      style={
                        evidence?.image_url
                          ? {
                              backgroundImage: `linear-gradient(rgba(7,59,70,.14),rgba(7,59,70,.42)),url("${evidence.image_url}")`,
                            }
                          : undefined
                      }
                    />

                    <div className="relative z-10 flex h-full min-h-[78px] flex-col justify-between p-2">
                      <div className="flex items-center justify-between">
                        <span
                          className={[
                            "grid h-6 w-6 place-items-center rounded-[8px] border text-[5px] font-black backdrop-blur",
                            evidence?.image_url
                              ? "border-white/45 bg-white/20 text-white"
                              : accepted
                                ? "border-emerald-200 bg-white/75 text-emerald-700"
                                : unavailable
                                  ? "border-amber-200 bg-white/75 text-amber-700"
                                  : "border-[#d4e7e4] bg-white/72 text-[#718b91]",
                          ].join(" ")}
                        >
                          {accepted ? (
                            <Check size={9} />
                          ) : unavailable ? (
                            <EyeOff size={9} />
                          ) : (
                            String(index + 1).padStart(
                              2,
                              "0",
                            )
                          )}
                        </span>

                        {selected ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,.75)]" />
                        ) : null}
                      </div>

                      <div>
                        <p
                          className={[
                            "truncate text-[5.8px] font-black",
                            evidence?.image_url
                              ? "text-white"
                              : accepted
                                ? "text-emerald-800"
                                : unavailable
                                  ? "text-amber-800"
                                  : "text-[#42666d]",
                          ].join(" ")}
                        >
                          {surfaceTitle(view)}
                        </p>

                        <p
                          className={[
                            "mt-0.5 text-[4.8px] font-bold uppercase tracking-[0.07em]",
                            evidence?.image_url
                              ? "text-white/65"
                              : "text-[#718b91]",
                          ].join(" ")}
                        >
                          {accepted
                            ? "ACCEPTED EVIDENCE"
                            : unavailable
                              ? "UNOBSERVED"
                              : "AVAILABLE"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.section>

        <MissionActionBar
          acceptedEvidenceCount={acceptedEvidenceCount}
          selectedFile={Boolean(selectedFile)}
          reconstructionReady={reconstructionMinimumReady}
          busy={busy}
          currentView={surfaceTitle(currentView)}
          postAnalysisRecaptureActive={postAnalysisRecaptureActive}
          recaptureEvidenceAdded={recaptureEvidenceAdded}
          analysisActionEnabled={analysisActionEnabled}
          onCapture={() => fileInputRef.current?.click()}
          onValidate={uploadCurrentView}
          onReconstruct={finalizeCapture}
        />

        <motion.section
          initial={{
            opacity: 0,
            y: 10,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.1,
            duration: 0.48,
          }}
          className="relative mt-4 overflow-hidden rounded-[24px] border border-cyan-200/90 bg-[linear-gradient(110deg,#f7fcfa,#ebf8f5_55%,#eff9f6)] p-4 shadow-[0_18px_50px_rgba(31,181,174,.08)] dark:border-cyan-300/15 dark:bg-[linear-gradient(110deg,#0c424a,#093b44_55%,#0b443f)] sm:p-5"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              animate={{
                x: [
                  "-20%",
                  "120%",
                ],
              }}
              transition={{
                duration: 7,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-y-0 w-[14%] bg-gradient-to-r from-transparent via-white/65 to-transparent blur-xl dark:via-cyan-100/[0.03]"
            />
          </div>

          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-center">
            <div>
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{
                    scale: [
                      1,
                      1.5,
                      1,
                    ],
                    opacity: [
                      0.5,
                      1,
                      0.5,
                    ],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_12px_rgba(31,181,174,.55)]"
                />

                <p className="text-[6px] font-black uppercase tracking-[0.15em] text-cyan-700 dark:text-cyan-300">
                  RECONSTRUCTION GATE
                </p>
              </div>

              <h3 className="mt-1 text-[19px] font-black tracking-[-0.035em] text-[#073b46] dark:text-white">
                {reconstructionMinimumReady
                  ? "Evidence minimum reached. The first 3D attempt can start."
                  : `Add ${Math.max(
                      0,
                      RECOMMENDED_MINIMUM_EVIDENCE -
                        acceptedEvidenceCount,
                    )} more accepted view${
                      Math.max(
                        0,
                        RECOMMENDED_MINIMUM_EVIDENCE -
                          acceptedEvidenceCount,
                      ) === 1
                        ? ""
                        : "s"
                    } to unlock reconstruction.`}
              </h3>

              <p className="mt-1.5 max-w-4xl text-[8px] leading-4 text-[#5f7c82] dark:text-[#8eb5b2]">
                The system will attempt the strongest evidence-supported reconstruction from accepted photographs. Additional useful views may improve overlap and observed-surface coverage. Bottom stays unobserved unless directly photographed.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {[
                  [
                    "01",
                    "EVIDENCE",
                    acceptedEvidenceCount >= 1,
                  ],
                  [
                    "02",
                    "CONNECT",
                    acceptedEvidenceCount >= 2,
                  ],
                  [
                    "03",
                    "POSE",
                    acceptedEvidenceCount >= 3,
                  ],
                  [
                    "04",
                    "SURFACE",
                    acceptedEvidenceCount >= 4,
                  ],
                  [
                    "05",
                    "3D ATTEMPT",
                    reconstructionMinimumReady,
                  ],
                ].map(
                  ([
                    number,
                    label,
                    ready,
                  ]) => (
                    <div
                      key={String(
                        number,
                      )}
                      className={[
                        "relative overflow-hidden rounded-[11px] border px-2.5 py-2",
                        ready
                          ? "border-emerald-200 bg-emerald-50/72 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05]"
                          : "border-[#d4e7e4] bg-white/60 dark:border-teal-200/10 dark:bg-teal-950/18",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[5px] font-black text-[#91a8ab] dark:text-[#5f8582]">
                          {String(
                            number,
                          )}
                        </span>

                        {ready ? (
                          <Check
                            size={9}
                            className="text-emerald-600"
                          />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#dcebe8] dark:bg-[#22545b]" />
                        )}
                      </div>

                      <p
                        className={[
                          "mt-1 text-[5.5px] font-black uppercase tracking-[0.07em]",
                          ready
                            ? "text-emerald-700 dark:text-emerald-200"
                            : "text-[#718b91] dark:text-[#729996]",
                        ].join(" ")}
                      >
                        {String(
                          label,
                        )}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/70 bg-white/72 p-3 shadow-[0_12px_36px_rgba(7,59,70,.07)] backdrop-blur dark:border-teal-300/10 dark:bg-teal-950/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[5.5px] font-black uppercase tracking-[0.12em] text-[#718b91] dark:text-[#729996]">
                    ANALYSIS LAUNCH
                  </p>

                  <p className="mt-1 text-[9px] font-black text-[#244e56] dark:text-[#d9efec]">
                    {acceptedEvidenceCount} accepted photographic views
                  </p>
                </div>

                <div className="relative grid h-12 w-12 place-items-center rounded-full border border-cyan-200 bg-cyan-50 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05]">
                  <svg
                    viewBox="0 0 48 48"
                    className="absolute inset-0 h-full w-full -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="24"
                      cy="24"
                      r="19"
                      fill="none"
                      stroke="rgba(148,163,184,.18)"
                      strokeWidth="3"
                    />
                    <motion.circle
                      cx="24"
                      cy="24"
                      r="19"
                      fill="none"
                      stroke="#1fb5ae"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={119.38}
                      initial={{
                        strokeDashoffset:
                          119.38,
                      }}
                      animate={{
                        strokeDashoffset:
                          119.38 *
                          (1 -
                            orbitProgress /
                              100),
                      }}
                      transition={{
                        duration: 0.7,
                      }}
                    />
                  </svg>

                  <span className="text-[7px] font-black text-cyan-700 dark:text-cyan-200">
                    {orbitProgress}%
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={finalizeCapture}
                disabled={!analysisActionEnabled}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-teal-600 via-cyan-500 to-teal-500 px-4 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-[0_12px_30px_rgba(31,181,174,.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-35"
              >
                {busy ? (
                  <Loader2
                    size={13}
                    className="animate-spin"
                  />
                ) : postAnalysisRecaptureActive ? (
                  <RefreshCcw
                    size={13}
                  />
                ) : (
                  <Sparkles
                    size={13}
                  />
                )}

                {postAnalysisRecaptureActive
                  ? recaptureEvidenceAdded
                    ? "START FRESH RECONSTRUCTION"
                    : recaptureRecommended
                      ? "REPLACEMENT EVIDENCE REQUIRED"
                      : "START FRESH RECONSTRUCTION"
                  : "START 3D RECONSTRUCTION"}

                <ArrowRight size={12} />
              </button>

              <p className="mt-2 text-center text-[5.5px] leading-3 text-[#718b91] dark:text-[#729996]">
                A new analysis job is created only after the evidence gate passes.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{
            opacity: 0,
            y: 10,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.14,
            duration: 0.48,
          }}
          className="mt-4 overflow-hidden rounded-[22px] border border-[#d4e7e4]/90 bg-white/80 shadow-[0_14px_38px_rgba(7,59,70,.05)] backdrop-blur-xl dark:border-teal-200/10 dark:bg-[#0b3e47]/82"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d4e7e4]/80 px-4 py-3 dark:border-teal-200/10">
            <div>
              <p className="text-[5.5px] font-black uppercase tracking-[0.14em] text-[#718b91] dark:text-[#729996]">
                SESSION SETUP
              </p>
              <p className="mt-0.5 text-[8px] font-black text-[#244e56] dark:text-[#d9efec]">
                Block identity, quarry and metric proof
              </p>
            </div>

            <span className="rounded-full border border-[#d4e7e4] bg-[#f1faf8] px-2.5 py-1 text-[5px] font-black uppercase tracking-[0.08em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
              {session ? "LOCKED AFTER FIRST UPLOAD" : "EDITABLE"}
            </span>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.2fr_1.4fr]">
            <LuxuryField label="Block code" optional>
              <input
                value={blockCode}
                onChange={(event) =>
                  setBlockCode(
                    event.target.value,
                  )
                }
                disabled={
                  Boolean(session) ||
                  busy
                }
                placeholder="Auto-generate if empty"
                className="luxury-field"
              />
            </LuxuryField>

            <LuxuryField label="Quarry">
              <select
                value={selectedQuarry}
                onChange={(event) =>
                  setSelectedQuarry(
                    event.target.value,
                  )
                }
                disabled={
                  Boolean(session) ||
                  busy
                }
                className="luxury-field"
              >
                {quarries.length ===
                0 ? (
                  <option value="">
                    No quarry available
                  </option>
                ) : null}

                {quarries.map(
                  (quarry) => (
                    <option
                      key={quarry.id}
                      value={quarry.id}
                    >
                      {quarry.quarry_name} ·{" "}
                      {quarry.quarry_code}
                    </option>
                  ),
                )}
              </select>
            </LuxuryField>

            <LuxuryField label="Granite category">
              <select
                value={
                  selectedCategory
                }
                onChange={(event) =>
                  setSelectedCategory(
                    event.target.value,
                  )
                }
                disabled={
                  Boolean(session) ||
                  busy
                }
                className="luxury-field"
              >
                {categories.length ===
                0 ? (
                  <option value="">
                    No category available
                  </option>
                ) : null}

                {categories.map(
                  (category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name} ·{" "}
                      {category.code}
                    </option>
                  ),
                )}
              </select>
            </LuxuryField>

            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-[#5f7c82] dark:text-[#8eb5b2]">
                Calibration
              </p>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    [
                      "MANUAL_REFERENCE",
                      "Manual",
                    ],
                    [
                      "ARUCO",
                      "ArUco",
                    ],
                    [
                      "MEASUREMENT_BOARD",
                      "Board",
                    ],
                  ] as const
                ).map(
                  ([
                    value,
                    label,
                  ]) => {
                    const active =
                      calibrationType ===
                      value;

                    return (
                      <button
                        type="button"
                        key={value}
                        disabled={
                          Boolean(
                            session,
                          ) ||
                          busy
                        }
                        onClick={() =>
                          setCalibrationType(
                            value,
                          )
                        }
                        className={[
                          "rounded-[11px] border px-2 py-2.5 text-[6px] font-black uppercase tracking-[0.08em] transition",
                          active
                            ? "border-cyan-300 bg-cyan-50 text-cyan-700 shadow-sm dark:border-cyan-300/20 dark:bg-cyan-300/[0.06] dark:text-cyan-200"
                            : "border-[#d4e7e4] bg-[#f1faf8] text-[#718b91] hover:border-teal-200 dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]",
                        ].join(
                          " ",
                        )}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={referenceCm}
                  onChange={(event) =>
                    setReferenceCm(
                      event.target.value,
                    )
                  }
                  disabled={
                    Boolean(session) ||
                    busy
                  }
                  aria-label="Reference centimetres"
                  placeholder="Reference cm"
                  className="luxury-field"
                />

                {calibrationType ===
                "MANUAL_REFERENCE" ? (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={
                      referencePixels
                    }
                    onChange={(event) =>
                      setReferencePixels(
                        event.target.value,
                      )
                    }
                    disabled={
                      Boolean(session) ||
                      busy
                    }
                    aria-label="Reference pixels"
                    placeholder="Reference px"
                    className="luxury-field"
                  />
                ) : (
                  <div className="grid min-h-11 place-items-center rounded-[15px] border border-[#d4e7e4] bg-[#f1faf8] px-2 text-[5.5px] font-black uppercase tracking-[0.08em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#729996]">
                    SIZE IN CM
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      <AnimatePresence>
        {showInaccessiblePanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) {
                setShowInaccessiblePanel(false);
              }
            }}
          >
            <motion.div
              initial={{ y: 26, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.24 }}
              className="w-full max-w-lg rounded-[30px] border border-[#1fb5ae]/20 bg-[#f3f8f7] p-5 shadow-[0_30px_100px_rgba(0,0,0,.32)] dark:bg-[#062b32] sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#0b6f73] dark:text-[#1fb5ae]">
                    Evidence state
                  </p>
                  <h3 className="mt-1 text-lg font-black tracking-[-0.025em]">
                    Mark {surfaceTitle(currentView)} unobserved
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInaccessiblePanel(false)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 text-black/45 dark:border-white/10 dark:text-white/45"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="mt-4 rounded-[20px] border border-amber-500/20 bg-amber-500/[0.07] p-3.5">
                <div className="flex gap-3">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                  <p className="text-[10px] leading-5 text-amber-900/72 dark:text-amber-100/65">
                    This does not create geometry. It records that the requested surface or viewpoint could not be safely observed and must remain unknown in the Digital Twin.
                  </p>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-black/45 dark:text-white/45">
                  Reason
                </span>
                <textarea
                  value={surfaceReason}
                  onChange={(event) => setSurfaceReason(event.target.value)}
                  rows={4}
                  placeholder="Example: top surface unsafe to access because block is too high."
                  className="mt-2 w-full resize-none rounded-[18px] border border-black/10 bg-white/70 px-3.5 py-3 text-sm outline-none transition focus:border-[#169f9e]/45 focus:ring-4 focus:ring-[#1fb5ae]/10 dark:border-white/10 dark:bg-white/[0.04]"
                />
              </label>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={markCurrentViewInaccessible}
                  disabled={busy}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#073640] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[#dff6f2] dark:bg-[#1fb5ae] dark:text-[#073640]"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
                  Confirm unobserved
                </button>
                <button
                  type="button"
                  onClick={() => setShowInaccessiblePanel(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-black/10 px-4 text-[10px] font-black uppercase tracking-[0.11em] dark:border-white/10"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media (max-width: 767px) {
          .capture-mobile-safe {
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }

          .capture-main-compact {
            /* Visual scale: 70% smaller while preserving the original layout box and all interactions. */
            transform: scale(0.7);
            transform-origin: center center;
          }
        }

        .luxury-field {
          width: 100%;
          min-height: 44px;
          border-radius: 15px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(255, 255, 255, 0.68);
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          outline: none;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background 160ms ease;
        }

        .luxury-field:focus {
          border-color: rgba(6, 182, 212, 0.55);
          box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.10);
          background: rgba(255, 255, 255, 0.9);
        }

        .luxury-field:disabled {
          opacity: 0.52;
          cursor: not-allowed;
        }

        @media (prefers-color-scheme: dark) {
          .luxury-field {
            border-color: rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.035);
            color: rgba(255, 249, 236, 0.94);
          }

          .luxury-field:focus {
            border-color: rgba(34, 211, 238, 0.42);
            background: rgba(255, 255, 255, 0.055);
          }

          .luxury-field option {
            background: #093640;
            color: #f8fafc;
          }
        }
      `}</style>
    </div>
  );
}


function MissionWorkflowRail({
  acceptedEvidenceCount,
  selectedFile,
  reconstructionReady,
  busy,
}: {
  acceptedEvidenceCount: number;
  selectedFile: boolean;
  reconstructionReady: boolean;
  busy: boolean;
}) {
  const stages = [
    {
      key: "capture",
      number: "01",
      label: "Capture evidence",
      detail: acceptedEvidenceCount > 0 ? `${acceptedEvidenceCount} accepted view${acceptedEvidenceCount === 1 ? "" : "s"}` : "Choose a useful angle",
      ready: acceptedEvidenceCount > 0,
      active: !selectedFile && !reconstructionReady,
      icon: Camera,
    },
    {
      key: "validate",
      number: "02",
      label: "Validate evidence",
      detail: selectedFile ? "Photo ready for AI checks" : "Add a photo to validate",
      ready: selectedFile,
      active: selectedFile && !reconstructionReady,
      icon: ShieldCheck,
    },
    {
      key: "reconstruct",
      number: "03",
      label: "Launch reconstruction",
      detail: reconstructionReady ? "Minimum evidence reached" : `${Math.max(0, 5 - acceptedEvidenceCount)} more accepted view${Math.max(0, 5 - acceptedEvidenceCount) === 1 ? "" : "s"}`,
      ready: reconstructionReady,
      active: reconstructionReady,
      icon: Layers3,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, duration: 0.35 }}
      className="mt-3 overflow-hidden rounded-[18px] border border-teal-200/80 bg-white/72 shadow-[0_12px_34px_rgba(7,59,70,.045)] backdrop-blur-xl dark:border-teal-300/10 dark:bg-[#0b3e47]/72"
    >
      <div className="grid divide-y divide-teal-100/80 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-teal-200/10">
        {stages.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="relative flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4"
            >
              {item.active ? (
                <motion.span
                  animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.25, 1] }}
                  transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute left-0 top-0 h-full w-[2px] bg-cyan-400"
                />
              ) : null}

              <span
                className={[
                  "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border",
                  item.ready
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-300"
                    : item.active
                      ? "border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05] dark:text-cyan-300"
                      : "border-[#d4e7e4] bg-[#f1faf8] text-[#91a8ab] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#5f8582]",
                ].join(" ")}
              >
                {item.ready ? <Check size={12} /> : busy && item.active ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[5px] font-black tracking-[0.08em] text-[#91a8ab] dark:text-[#5f8582]">{item.number}</span>
                  <p className="truncate text-[7px] font-black uppercase tracking-[0.06em] text-[#244e56] dark:text-[#d9efec]">{item.label}</p>
                </div>
                <p className="mt-0.5 truncate text-[5.5px] text-[#718b91] dark:text-[#729996]">{item.detail}</p>
              </div>

              {index < stages.length - 1 ? (
                <ChevronRight size={11} className="hidden shrink-0 text-teal-300 sm:block dark:text-teal-700" />
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function OperatorHint({
  number,
  title,
  detail,
  active = false,
}: {
  number: string;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[11px] border px-2 py-2 text-left",
        active
          ? "border-cyan-200 bg-cyan-50/75 dark:border-cyan-300/15 dark:bg-cyan-300/[0.045]"
          : "border-[#d4e7e4] bg-white/55 dark:border-teal-200/10 dark:bg-teal-950/16",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[5px] font-black text-[#91a8ab] dark:text-[#5f8582]">{number}</span>
        {active ? <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.65)]" /> : null}
      </div>
      <p className="mt-1 text-[5.5px] font-black uppercase tracking-[0.06em] text-[#42666d] dark:text-[#b7d8d4]">{title}</p>
      <p className="mt-0.5 truncate text-[4.8px] text-[#718b91] dark:text-[#729996]">{detail}</p>
    </div>
  );
}

function MissionActionBar({
  acceptedEvidenceCount,
  selectedFile,
  reconstructionReady,
  busy,
  currentView,
  postAnalysisRecaptureActive,
  recaptureEvidenceAdded,
  analysisActionEnabled,
  onCapture,
  onValidate,
  onReconstruct,
}: {
  acceptedEvidenceCount: number;
  selectedFile: boolean;
  reconstructionReady: boolean;
  busy: boolean;
  currentView: string;
  postAnalysisRecaptureActive: boolean;
  recaptureEvidenceAdded: boolean;
  analysisActionEnabled: boolean;
  onCapture: () => void;
  onValidate: () => void;
  onReconstruct: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09, duration: 0.42 }}
      className="sticky bottom-3 z-30 mt-4 overflow-hidden rounded-[18px] border border-teal-200/90 bg-white/92 p-2.5 shadow-[0_18px_55px_rgba(7,59,70,.14)] backdrop-blur-2xl dark:border-teal-300/12 dark:bg-[#0b3e47]/94"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 px-1">
          <p className="text-[5.5px] font-black uppercase tracking-[0.12em] text-[#718b91] dark:text-[#729996]">FIELD ACTION</p>
          <p className="mt-0.5 truncate text-[7px] font-black text-[#244e56] dark:text-[#d9efec]">
            {postAnalysisRecaptureActive
              ? `AI correction · ${currentView}`
              : reconstructionReady
                ? "Evidence minimum reached · reconstruction is ready"
                : selectedFile
                  ? `Photo ready · validate ${currentView}`
                  : `Capture ${currentView} · ${Math.max(0, 5 - acceptedEvidenceCount)} view${Math.max(0, 5 - acceptedEvidenceCount) === 1 ? "" : "s"} to minimum`}
          </p>
        </div>

        <button
          type="button"
          onClick={onCapture}
          disabled={busy}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-teal-200 bg-teal-50 px-3.5 text-[6.5px] font-black uppercase tracking-[0.08em] text-teal-700 transition hover:bg-teal-100 disabled:opacity-35 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200"
        >
          <Camera size={11} />
          {selectedFile ? "Replace photo" : "Capture photo"}
        </button>

        <button
          type="button"
          onClick={onValidate}
          disabled={busy || !selectedFile}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-teal-600 to-cyan-500 px-4 text-[6.5px] font-black uppercase tracking-[0.08em] text-white shadow-[0_8px_22px_rgba(31,181,174,.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
          Validate & add
        </button>

        <button
          type="button"
          onClick={onReconstruct}
          disabled={busy || !analysisActionEnabled}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[#073b46] px-4 text-[6.5px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#0a4a56] disabled:cursor-not-allowed disabled:opacity-30 dark:bg-cyan-400 dark:text-[#073b46] dark:hover:bg-cyan-300"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : postAnalysisRecaptureActive && recaptureEvidenceAdded ? <RefreshCcw size={11} /> : <Layers3 size={11} />}
          {postAnalysisRecaptureActive ? (recaptureEvidenceAdded ? "Fresh reconstruction" : "Recapture required") : "Start 3D"}
          <ArrowRight size={10} />
        </button>
      </div>
    </motion.section>
  );
}

function MissionMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone:
    | "good"
    | "cyan"
    | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/78 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
      : tone === "cyan"
        ? "border-cyan-200 bg-cyan-50/78 text-cyan-700 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05] dark:text-cyan-200"
        : "border-[#d4e7e4] bg-[#f1faf8]/78 text-[#42666d] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#b7d8d4]";

  return (
    <div
      className={`min-w-0 rounded-[13px] border px-2.5 py-2 ${toneClass}`}
    >
      <p className="truncate text-[4.8px] font-black uppercase tracking-[0.1em] opacity-65">
        {label}
      </p>

      <p className="mt-0.5 truncate text-[9px] font-black tracking-[-0.025em]">
        {value}
      </p>

      <p className="mt-0.5 truncate text-[4.8px] font-semibold opacity-55">
        {detail}
      </p>
    </div>
  );
}

function DirectorSignal({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone:
    | "good"
    | "cyan"
    | "warn"
    | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/72 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05]"
      : tone === "cyan"
        ? "border-cyan-200 bg-cyan-50/72 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05]"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50/72 dark:border-amber-300/15 dark:bg-amber-300/[0.05]"
          : "border-[#d4e7e4] bg-white/62 dark:border-teal-200/10 dark:bg-teal-950/18";

  const iconClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "cyan"
        ? "text-cyan-600 dark:text-cyan-300"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-300"
          : "text-[#718b91] dark:text-[#729996]";

  return (
    <div
      className={`rounded-[13px] border p-2.5 ${toneClass}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border border-white/70 bg-white/75 shadow-sm dark:border-white/[0.06] dark:bg-teal-950/22 ${iconClass}`}
        >
          {icon}
        </span>

        <div className="min-w-0">
          <p className="text-[4.8px] font-black uppercase tracking-[0.1em] text-[#718b91] dark:text-[#729996]">
            {label}
          </p>

          <p className="mt-0.5 truncate text-[7px] font-black text-[#244e56] dark:text-[#d9efec]">
            {value}
          </p>

          <p className="mt-1 line-clamp-3 text-[5.4px] leading-3 text-[#718b91] dark:text-[#729996]">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}


function EvidenceFusionStage({
  capturedLabels,
  currentView,
  progress,
  coreComplete,
  busy,
}: {
  capturedLabels: Set<string>;
  currentView: string;
  progress: number;
  coreComplete: boolean;
  busy: boolean;
}) {
  const capturedCount = CAPTURE_POSITIONS.filter(
    (view) =>
      capturedLabels.has(
        view,
      ),
  ).length;

  const stages = [
    {
      key: "evidence",
      label: "Evidence accepted",
      threshold: 1,
      icon: FileImage,
    },
    {
      key: "connect",
      label: "View connectivity",
      threshold: 2,
      icon: Orbit,
    },
    {
      key: "pose",
      label: "Camera recovery gate",
      threshold: 3,
      icon: Compass,
    },
    {
      key: "shape",
      label: "Observed shape input",
      threshold: 4,
      icon: Layers3,
    },
    {
      key: "launch",
      label: "3D attempt unlocked",
      threshold: 5,
      icon: Sparkles,
    },
  ];

  const acceptedViews =
    CAPTURE_POSITIONS.filter(
      (view) =>
        capturedLabels.has(
          view,
        ),
    );

  const lockedViews =
    CAPTURE_POSITIONS.filter(
      (view) =>
        !capturedLabels.has(
          view,
        ),
    );

  const ringProgress =
    Math.max(
      0,
      Math.min(
        100,
        progress,
      ),
    );

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 14,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        delay: 0.16,
        duration: 0.5,
        ease: [
          0.16,
          1,
          0.3,
          1,
        ],
      }}
      className="relative mt-5 overflow-hidden rounded-[28px] border border-teal-200/90 bg-[linear-gradient(145deg,#fbfefd_0%,#eef9f6_52%,#f4fbf9_100%)] shadow-[0_22px_60px_rgba(14,116,144,.09)] dark:border-teal-300/15 dark:bg-[linear-gradient(145deg,#0c4048_0%,#08363f_56%,#0a3b43_100%)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            backgroundPosition: [
              "0px 0px",
              "42px 42px",
            ],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 opacity-[0.42] [background-image:linear-gradient(rgba(22,159,158,.075)_1px,transparent_1px),linear-gradient(90deg,rgba(22,159,158,.075)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-[0.10]"
        />

        <motion.div
          animate={{
            x: [
              "-18%",
              "118%",
            ],
          }}
          transition={{
            duration: 7.5,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-y-0 w-[16%] bg-gradient-to-r from-transparent via-white/70 to-transparent blur-2xl dark:via-cyan-100/[0.035]"
        />

        <motion.div
          animate={{
            scale: [
              0.88,
              1.1,
              0.88,
            ],
            opacity: [
              0.18,
              0.45,
              0.18,
            ],
          }}
          transition={{
            duration: 4.8,
            repeat: Infinity,
            ease:
              "easeInOut",
          }}
          className="absolute left-[43%] top-[52%] h-[300px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200/38 blur-[95px] dark:bg-cyan-400/[0.04]"
        />
      </div>

      <div className="relative border-b border-teal-200/75 px-4 py-4 sm:px-5 dark:border-teal-300/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <motion.span
                animate={{
                  scale: [
                    1,
                    1.45,
                    1,
                  ],
                  opacity: [
                    0.5,
                    1,
                    0.5,
                  ],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease:
                    "easeInOut",
                }}
                className="h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_12px_rgba(31,181,174,.55)]"
              />

              <p className="text-[7px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                RECONSTRUCTION LAUNCHPAD
              </p>
            </div>

            <h3 className="mt-1 text-lg font-black tracking-[-0.035em] text-[#073b46] dark:text-white">
              Build enough evidence to unlock the first 3D attempt.
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={[
                "rounded-full border px-2.5 py-1.5 text-[6px] font-black uppercase tracking-[0.1em]",
                coreComplete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
                  : "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200",
              ].join(" ")}
            >
              {coreComplete
                ? "3D ATTEMPT UNLOCKED"
                : `${capturedCount}/5 MINIMUM`}
            </span>

            <span className="rounded-full border border-[#d4e7e4] bg-white/80 px-2.5 py-1.5 text-[6px] font-black uppercase tracking-[0.1em] text-[#718b91] dark:border-teal-200/10 dark:bg-teal-950/20 dark:text-[#729996]">
              Evidence only
            </span>
          </div>
        </div>
      </div>

      <div className="relative grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="relative min-h-[300px] overflow-hidden rounded-[22px] border border-teal-200/80 bg-white/58 shadow-[inset_0_0_55px_rgba(22,159,158,.06)] backdrop-blur dark:border-teal-300/12 dark:bg-teal-950/[0.16]">
          <div className="absolute left-3 top-3 z-20 rounded-full border border-teal-200 bg-white/88 px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.1em] text-teal-700 shadow-sm backdrop-blur dark:border-teal-300/15 dark:bg-[#0d4650]/92 dark:text-teal-200">
            Live evidence constellation
          </div>

          <div className="absolute right-3 top-3 z-20 text-right">
            <p className="text-[24px] font-black leading-none tracking-[-0.055em] text-[#073b46] dark:text-white">
              {ringProgress}%
            </p>
            <p className="mt-1 text-[5px] font-black uppercase tracking-[0.1em] text-[#718b91] dark:text-[#729996]">
              reconstruction readiness
            </p>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-[242px] w-[242px]">
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 24,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-0 rounded-full border border-dashed border-teal-300/65 dark:border-teal-300/15"
              />

              <motion.div
                animate={{
                  rotate: -360,
                }}
                transition={{
                  duration: 34,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-[22px] rounded-full border border-dotted border-cyan-300/70 dark:border-cyan-300/15"
              />

              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 48,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-[47px] rounded-full border border-teal-300/50 dark:border-teal-300/10"
              />

              <svg
                viewBox="0 0 242 242"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
              >
                <defs>
                  <linearGradient
                    id="captureEvidenceShape"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#e4f6f3"
                      stopOpacity="0.9"
                    />
                    <stop
                      offset="55%"
                      stopColor="#dff6f2"
                      stopOpacity="0.72"
                    />
                    <stop
                      offset="100%"
                      stopColor="#d9f5ef"
                      stopOpacity="0.62"
                    />
                  </linearGradient>
                </defs>

                <motion.path
                  d="M76 82 L107 61 L148 69 L171 94 L166 142 L139 169 L95 174 L64 151 L57 111 Z"
                  fill="url(#captureEvidenceShape)"
                  stroke="#169f9e"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  animate={{
                    opacity:
                      capturedCount > 0
                        ? [
                            0.55,
                            0.92,
                            0.55,
                          ]
                        : 0.28,
                  }}
                  transition={{
                    duration: 3.6,
                    repeat:
                      capturedCount > 0
                        ? Infinity
                        : 0,
                    ease:
                      "easeInOut",
                  }}
                />

                {[
                  "M76 82 L119 117 L107 61",
                  "M107 61 L119 117 L148 69",
                  "M148 69 L119 117 L171 94",
                  "M171 94 L119 117 L166 142",
                  "M166 142 L119 117 L139 169",
                  "M139 169 L119 117 L95 174",
                  "M95 174 L119 117 L64 151",
                  "M64 151 L119 117 L57 111",
                  "M57 111 L119 117 L76 82",
                ].map(
                  (
                    d,
                    index,
                  ) => (
                    <motion.path
                      key={
                        index
                      }
                      d={d}
                      fill="none"
                      stroke={
                        index % 2 === 0
                          ? "#169f9e"
                          : "#42c9dd"
                      }
                      strokeWidth="1"
                      strokeDasharray="130"
                      initial={{
                        strokeDashoffset:
                          130,
                        opacity:
                          0.08,
                      }}
                      animate={{
                        strokeDashoffset:
                          capturedCount >
                          index / 2
                            ? [
                                130,
                                0,
                                0,
                              ]
                            : 130,
                        opacity:
                          capturedCount >
                          index / 2
                            ? [
                                0.12,
                                0.75,
                                0.32,
                              ]
                            : 0.08,
                      }}
                      transition={{
                        duration: 2.8,
                        repeat:
                          capturedCount >
                          index / 2
                            ? Infinity
                            : 0,
                        delay:
                          index *
                          0.08,
                        ease:
                          "easeInOut",
                      }}
                    />
                  ),
                )}

                <motion.line
                  x1="57"
                  x2="171"
                  y1="84"
                  y2="84"
                  stroke="#42c9dd"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  animate={{
                    translateY: [
                      0,
                      76,
                      0,
                    ],
                    opacity: [
                      0.2,
                      0.9,
                      0.2,
                    ],
                  }}
                  transition={{
                    duration: 3.5,
                    repeat: Infinity,
                    ease:
                      "easeInOut",
                  }}
                />
              </svg>

              {CAPTURE_POSITIONS.map(
                (
                  view,
                  index,
                ) => {
                  const angle =
                    (index /
                      CAPTURE_POSITIONS.length) *
                      Math.PI *
                      2 -
                    Math.PI /
                      2;

                  const x =
                    Math.cos(
                      angle,
                    ) *
                      104 +
                    104;

                  const y =
                    Math.sin(
                      angle,
                    ) *
                      104 +
                    104;

                  const accepted =
                    capturedLabels.has(
                      view,
                    );

                  const selected =
                    view ===
                    currentView;

                  return (
                    <motion.span
                      key={view}
                      title={
                        surfaceTitle(
                          view,
                        )
                      }
                      className={[
                        "absolute grid h-8 w-8 place-items-center rounded-[10px] border text-[6px] font-black shadow-sm backdrop-blur",
                        accepted
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.07] dark:text-emerald-200"
                          : selected
                            ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-300/[0.07] dark:text-cyan-200"
                            : "border-[#d4e7e4] bg-white/82 text-[#91a8ab] dark:border-teal-200/10 dark:bg-teal-950/25 dark:text-[#5f8582]",
                      ].join(
                        " ",
                      )}
                      style={{
                        left: x,
                        top: y,
                      }}
                      animate={
                        selected
                          ? {
                              scale: [
                                1,
                                1.12,
                                1,
                              ],
                              boxShadow: [
                                "0 0 0 rgba(31,181,174,0)",
                                "0 0 18px rgba(31,181,174,.26)",
                                "0 0 0 rgba(31,181,174,0)",
                              ],
                            }
                          : accepted
                            ? {
                                y: [
                                  0,
                                  -2,
                                  0,
                                ],
                              }
                            : undefined
                      }
                      transition={{
                        duration:
                          selected
                            ? 1.7
                            : 2.6,
                        repeat:
                          selected ||
                          accepted
                            ? Infinity
                            : 0,
                        delay:
                          index *
                          0.05,
                        ease:
                          "easeInOut",
                      }}
                    >
                      {accepted ? (
                        <Check
                          size={11}
                        />
                      ) : (
                        index +
                        1
                      )}
                    </motion.span>
                  );
                },
              )}

              <div className="absolute left-1/2 top-1/2 w-[108px] -translate-x-1/2 -translate-y-1/2 text-center">
                <Layers3
                  size={20}
                  className="mx-auto text-teal-600 dark:text-teal-300"
                />

                <p className="mt-2 text-[6px] font-black uppercase tracking-[0.11em] text-[#244e56] dark:text-[#d9efec]">
                  {coreComplete
                    ? "READY TO RECONSTRUCT"
                    : "EVIDENCE FORMING"}
                </p>

                <p className="mt-1 text-[5px] leading-3 text-[#718b91] dark:text-[#729996]">
                  No synthetic surface is treated as a real result here.
                </p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-3 left-3 right-3 z-20 grid grid-cols-3 gap-2">
            <CaptureSignal
              label="ACCEPTED"
              value={`${capturedCount}`}
              tone="good"
            />

            <CaptureSignal
              label="MINIMUM"
              value="5"
              tone={
                coreComplete
                  ? "good"
                  : "active"
              }
            />

            <CaptureSignal
              label="REMAINING"
              value={`${Math.max(
                0,
                RECOMMENDED_MINIMUM_EVIDENCE -
                  capturedCount,
              )}`}
              tone={
                coreComplete
                  ? "good"
                  : "neutral"
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          {stages.map(
            (
              item,
              index,
            ) => {
              const Icon =
                item.icon;

              const ready =
                capturedCount >=
                item.threshold;

              const active =
                !ready &&
                capturedCount +
                  1 ===
                  item.threshold;

              return (
                <motion.div
                  key={
                    item.key
                  }
                  animate={
                    active
                      ? {
                          x: [
                            0,
                            2,
                            0,
                          ],
                          borderColor: [
                            "rgba(167,230,223,.75)",
                            "rgba(34,211,238,.9)",
                            "rgba(167,230,223,.75)",
                          ],
                        }
                      : undefined
                  }
                  transition={{
                    duration: 2.3,
                    repeat:
                      active
                        ? Infinity
                        : 0,
                    delay:
                      index *
                      0.08,
                    ease:
                      "easeInOut",
                  }}
                  className={[
                    "relative overflow-hidden rounded-[15px] border px-3 py-2.5",
                    ready
                      ? "border-emerald-200 bg-emerald-50/72 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05]"
                      : active
                        ? "border-cyan-200 bg-cyan-50/72 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05]"
                        : "border-[#d4e7e4] bg-white/58 dark:border-teal-200/10 dark:bg-teal-950/18",
                  ].join(
                    " ",
                  )}
                >
                  {active ? (
                    <motion.div
                      animate={{
                        x: [
                          "-120%",
                          "340%",
                        ],
                      }}
                      transition={{
                        duration: 2.8,
                        repeat:
                          Infinity,
                        ease:
                          "linear",
                      }}
                      className="pointer-events-none absolute inset-y-0 w-[25%] bg-gradient-to-r from-transparent via-cyan-100/80 to-transparent blur-xl dark:via-cyan-100/[0.035]"
                    />
                  ) : null}

                  <div className="relative flex items-center gap-3">
                    <span
                      className={[
                        "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border",
                        ready
                          ? "border-emerald-200 bg-white text-emerald-600 dark:border-emerald-300/15 dark:bg-teal-950/22 dark:text-emerald-300"
                          : active
                            ? "border-cyan-200 bg-white text-cyan-600 dark:border-cyan-300/15 dark:bg-teal-950/22 dark:text-cyan-300"
                            : "border-[#d4e7e4] bg-[#f1faf8] text-[#91a8ab] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#5f8582]",
                      ].join(
                        " ",
                      )}
                    >
                      {ready ? (
                        <Check
                          size={12}
                        />
                      ) : active &&
                        busy ? (
                        <Loader2
                          size={12}
                          className="animate-spin"
                        />
                      ) : (
                        <Icon
                          size={12}
                        />
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-[7.5px] font-black text-[#244e56] dark:text-[#d9efec]">
                        {
                          item.label
                        }
                      </p>

                      <p className="mt-0.5 text-[5.8px] text-[#718b91] dark:text-[#729996]">
                        {ready
                          ? "Evidence gate ready"
                          : active
                            ? "Current evidence target"
                            : "Awaiting accepted view"}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            },
          )}

          <div className="rounded-[15px] border border-teal-200/80 bg-teal-50/72 p-3 dark:border-teal-300/15 dark:bg-teal-300/[0.045]">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={12}
                className="text-teal-600 dark:text-teal-300"
              />

              <p className="text-[6px] font-black uppercase tracking-[0.11em] text-teal-700 dark:text-teal-200">
                Evidence-honest reconstruction
              </p>
            </div>

            <p className="mt-1.5 text-[5.8px] leading-3 text-[#5f7c82] dark:text-[#8eb5b2]">
              Five accepted views unlock the first attempt. Additional useful angles can improve connectivity and observed surface coverage. Unseen surfaces remain unobserved.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function CaptureSignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone:
    | "good"
    | "active"
    | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/78 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.055] dark:text-emerald-200"
      : tone === "active"
        ? "border-cyan-200 bg-cyan-50/78 text-cyan-700 dark:border-cyan-300/15 dark:bg-cyan-300/[0.055] dark:text-cyan-200"
        : "border-[#d4e7e4] bg-white/78 text-[#42666d] dark:border-teal-200/10 dark:bg-teal-950/22 dark:text-[#b7d8d4]";

  return (
    <div
      className={`rounded-[11px] border px-2 py-2 text-center shadow-sm backdrop-blur ${toneClass}`}
    >
      <p className="text-[4.7px] font-black uppercase tracking-[0.08em] opacity-65">
        {label}
      </p>

      <p className="mt-0.5 text-[10px] font-black tracking-[-0.03em]">
        {value}
      </p>
    </div>
  );
}


function RecaptureMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[17px] border border-black/[0.07] bg-white/45 p-3 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <p className="text-[8px] font-black uppercase tracking-[0.15em] text-black/38 dark:text-white/36">
        {label}
      </p>
      <p className="mt-1.5 text-[11px] font-black text-black/72 dark:text-white/72">
        {value}
      </p>
    </div>
  );
}

function LuxuryBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <motion.div
        animate={{
          x: [
            0,
            34,
            -12,
            0,
          ],
          y: [
            0,
            18,
            42,
            0,
          ],
          scale: [
            1,
            1.08,
            0.97,
            1,
          ],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease:
            "easeInOut",
        }}
        className="absolute -left-28 -top-28 h-[520px] w-[520px] rounded-full bg-teal-200/28 blur-[120px] dark:bg-teal-400/[0.04]"
      />

      <motion.div
        animate={{
          x: [
            0,
            -42,
            20,
            0,
          ],
          y: [
            0,
            48,
            -8,
            0,
          ],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease:
            "easeInOut",
        }}
        className="absolute -right-40 top-[22%] h-[620px] w-[620px] rounded-full bg-cyan-200/24 blur-[140px] dark:bg-cyan-400/[0.035]"
      />

      <motion.div
        animate={{
          x: [
            0,
            28,
            -32,
            0,
          ],
          scale: [
            1,
            0.96,
            1.06,
            1,
          ],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease:
            "easeInOut",
        }}
        className="absolute bottom-[-20%] left-[26%] h-[640px] w-[640px] rounded-full bg-teal-200/20 blur-[150px] dark:bg-teal-400/[0.03]"
      />

      <motion.div
        animate={{
          backgroundPosition: [
            "0px 0px",
            "64px 64px",
          ],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(22,159,158,.075)_1px,transparent_1px),linear-gradient(90deg,rgba(22,159,158,.075)_1px,transparent_1px)] [background-size:64px_64px] dark:opacity-[0.07]"
      />
    </div>
  );
}


function LuxuryPill({
  icon,
  text,
  subdued = false,
}: {
  icon: React.ReactNode;
  text: string;
  subdued?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.15em]",
        subdued
          ? "border-black/10 bg-black/[0.03] text-black/45 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/45"
          : "border-[#087f82]/25 bg-[#1fb5ae]/10 text-[#0f766e] dark:text-[#bce8e2]",
      ].join(" ")}
    >
      {icon}
      {text}
    </span>
  );
}

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-2xl border border-black/[0.07] bg-white/45 px-3 py-2 backdrop-blur-xl dark:border-white/[0.07] dark:bg-white/[0.025]">
      <span className="text-[#087f82] dark:text-[#79dcd7]">{icon}</span>
      <span>
        <span className="block text-[8px] font-black uppercase tracking-[0.13em] text-black/35 dark:text-white/35">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] font-black text-black/72 dark:text-white/72">
          {value}
        </span>
      </span>
    </div>
  );
}

function LuxurySignal({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-[20px] border border-black/[0.07] bg-white/40 p-3.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1fb5ae]/10 text-[#9a7128] dark:text-[#79dcd7]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.15em] text-black/35 dark:text-white/35">
            {label}
          </p>
          <p className="mt-1 truncate text-[10px] font-black">{value}</p>
          <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-black/40 dark:text-white/40">
            {detail}
          </p>
          <span
            className={[
              "mt-2 inline-block h-1.5 w-8 rounded-full",
              tone === "good"
                ? "bg-emerald-500"
                : tone === "warn"
                  ? "bg-amber-500"
                  : "bg-[#087f82]",
            ].join(" ")}
          />
        </div>
      </div>
    </div>
  );
}

function LuxuryCard({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#8eddd6]/16 bg-white/68 shadow-[0_18px_55px_rgba(69,47,7,.075)] backdrop-blur-2xl dark:border-[#1fb5ae]/12 dark:bg-[#0b0e12]/76 dark:shadow-[0_22px_60px_rgba(0,0,0,.32)]">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-4 dark:border-white/[0.06]">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.20em] text-[#0b6f73] dark:text-[#1fb5ae]">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-sm font-black tracking-[-0.015em]">{title}</h3>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#087f82]/18 bg-[#1fb5ae]/10 text-[#9a7128] dark:text-[#79dcd7]">
          {icon}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LuxuryField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-black/42 dark:text-white/42">
        {label}
        {optional && <span className="font-semibold normal-case tracking-normal opacity-55">optional</span>}
      </span>
      {children}
    </label>
  );
}

function EvidenceRule({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-[18px] border border-black/[0.06] bg-white/44 p-3 dark:border-white/[0.06] dark:bg-white/[0.025]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#1fb5ae]/10 text-[#0e7979] dark:text-[#79dcd7]">
        {icon}
      </span>
      <div>
        <p className="text-[9px] font-black">{title}</p>
        <p className="mt-1 text-[8.5px] leading-4 text-black/40 dark:text-white/40">
          {text}
        </p>
      </div>
    </div>
  );
}

function DarkTag({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/24 px-2.5 py-1.5 text-[8px] font-bold text-white/58 backdrop-blur-md">
      {icon}
      {text}
    </span>
  );
}

function CornerGuides() {
  return (
    <>
      <span className="absolute left-5 top-5 h-10 w-10 border-l border-t border-[#a7e6df]/70" />
      <span className="absolute right-5 top-5 h-10 w-10 border-r border-t border-[#a7e6df]/70" />
      <span className="absolute bottom-5 left-5 h-10 w-10 border-b border-l border-[#a7e6df]/70" />
      <span className="absolute bottom-5 right-5 h-10 w-10 border-b border-r border-[#a7e6df]/70" />
    </>
  );
}

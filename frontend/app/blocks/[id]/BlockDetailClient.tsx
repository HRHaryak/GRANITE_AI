"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleDot,
  Download,
  Eye,
  FileCheck,
  FileText,
  Images,
  Layers3,
  Loader2,
  PackageCheck,
  RefreshCw,
  Ruler,
  ScanLine,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Truck,
  WandSparkles,
} from "lucide-react";

import StatusBadge from "../../../components/ui/StatusBadge";

const PointCloud3DViewer = dynamic(
  () => import("../../../components/analysis/PointCloud3DViewer"),
  {
    ssr: false,
    loading: () => <ViewerSkeleton label="Loading evidence-based Digital Twin…" />,
  },
);

const Cutting3DViewer = dynamic(
  () => import("../../../components/analysis/Cutting3DViewer"),
  {
    ssr: false,
    loading: () => <ViewerSkeleton label="Loading cut simulation…" />,
  },
);

const AIAssistantChat = dynamic(
  () => import("../../../components/analysis/AIAssistantChat"),
  { ssr: false },
);

import {
  apiAssetUrl,
  createAnalysisJob,
  getBlock,
  getBlockAnalysis,
  getBlockCapture,
  listManualVerifications,
  submitManualVerification,
} from "../../../lib/api";

import type {
  BlockAnalysis,
  BlockOut,
  DefectFinding,
  ImageOut,
  ManualVerificationOut,
  PhysicalCavityRecord,
  PhysicalCavitySummary,
  SessionOut,
} from "../../../lib/types";

import { useTranslation } from "../../../lib/i18n";

type AnalysisTab =
  | "overview"
  | "reconstruction"
  | "measurements"
  | "defects"
  | "cutting"
  | "recovery"
  | "evidence"
  | "report";


type ValidatedAccuracySummary = {
  available: boolean;
  status: string | null;
  targetPct: number | null;
  targetMet: boolean | null;
  lengthPct: number | null;
  breadthPct: number | null;
  heightPct: number | null;
  meanAxisPct: number | null;
  worstAxisPct: number | null;
  meanAbsoluteErrorCm: number | null;
  mapePct: number | null;
};

function getDefectLabel(defect: DefectFinding, index: number, isTe: boolean): string {
  const value = defect as unknown as Record<string, unknown>;
  const label = value.kind ?? value.type ?? value.category;
  return typeof label === "string" && label.trim()
    ? label
    : isTe
      ? `లోపం ${index + 1}`
      : `Finding ${index + 1}`;
}

function numberFromRecord(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return null;
}


function booleanFromRecord(source: unknown, keys: string[]): boolean | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }

  return null;
}

function stringFromRecord(source: unknown, keys: string[]): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function recordFromUnknown(source: unknown): Record<string, unknown> {
  return source && typeof source === "object"
    ? (source as Record<string, unknown>)
    : {};
}

function stringArrayFromRecord(source: unknown, keys: string[]): string[] {
  if (!source || typeof source !== "object") return [];
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      );
    }
  }

  return [];
}

function percentText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function formatCm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)} cm`
    : "—";
}

function formatM3(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(4)} m³`
    : "—";
}

function formatM2(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} m²`
    : "—";
}

function isLikelyCavity(defect: DefectFinding) {
  const label = `${defect.kind || ""} ${defect.type || ""} ${defect.category || ""}`.toLowerCase();
  return ["hole", "pit", "cavity", "void", "depression"].some((token) =>
    label.includes(token),
  );
}

export default function BlockDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useTranslation();
  const isTe = language === "te";

  const [block, setBlock] = useState<BlockOut | null>(null);
  const [images, setImages] = useState<ImageOut[]>([]);
  const [captureSession, setCaptureSession] = useState<SessionOut | null>(null);
  const [analysis, setAnalysis] = useState<BlockAnalysis | null>(null);
  const [verifications, setVerifications] = useState<ManualVerificationOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const launchedAnalysisJobId =
    searchParams.get("analysisJobId");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("reconstruction");
  const [selectedOrientationIdx, setSelectedOrientationIdx] = useState(0);

  const [physL, setPhysL] = useState("");
  const [physB, setPhysB] = useState("");
  const [physH, setPhysH] = useState("");
  const [decision, setDecision] = useState("VERIFIED");
  const [remarks, setRemarks] = useState("");
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    if (!id) return;

    try {
      const [record, capture, result, vList] = await Promise.all([
        getBlock(id),
        getBlockCapture(id),
        getBlockAnalysis(id, language),
        listManualVerifications(id).catch(() => []),
      ]);

      setBlock(record);
      setImages(Array.isArray(capture.images) ? capture.images : []);
      setCaptureSession(capture.session ?? null);
      setAnalysis(result);
      setVerifications(Array.isArray(vList) ? vList : []);
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : isTe
            ? "బ్లాక్ ఫలితాలను లోడ్ చేయలేకపోయాం."
            : "Unable to load block results.",
      );
    }
  }, [id, language, isTe]);

  const refreshAnalysisOnly = useCallback(async () => {
    if (!id) return;

    try {
      const result = await getBlockAnalysis(id, language);
      setAnalysis(result);
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : isTe
            ? "విశ్లేషణ స్థితిని నవీకరించలేకపోయాం."
            : "Unable to refresh analysis status.",
      );
    }
  }, [id, language, isTe]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    // Remove the old boolean launch marker if an older URL is opened.
    // Only an exact analysisJobId can activate the full reconstruction process.
    if (searchParams.get("analysis") === "started" && id) {
      router.replace(`/blocks/${id}`, { scroll: false });
    }
  }, [id, router, searchParams]);

  useEffect(() => {
    if (!id) return;

    const currentJobId = analysis?.job?.id ?? null;
    const currentState = String(
      analysis?.job?.state || "",
    ).toUpperCase();

    const waitingForLaunchedJob = Boolean(
      launchedAnalysisJobId &&
        currentJobId !== launchedAnalysisJobId,
    );

    const currentJobRunning = Boolean(
      currentJobId &&
        currentState &&
        !["COMPLETED", "FAILED", "CANCELLED"].includes(currentState),
    );

    if (!waitingForLaunchedJob && !currentJobRunning) return;

    const poll = window.setInterval(() => {
      void refreshAnalysisOnly();
    }, waitingForLaunchedJob ? 1500 : 3500);

    return () => window.clearInterval(poll);
  }, [
    id,
    launchedAnalysisJobId,
    analysis?.job?.id,
    analysis?.job?.state,
    refreshAnalysisOnly,
  ]);

  useEffect(() => {
    if (!id || !launchedAnalysisJobId) return;

    const currentJobId = analysis?.job?.id ?? null;
    const currentState = String(
      analysis?.job?.state || "",
    ).toUpperCase();

    if (
      currentJobId === launchedAnalysisJobId &&
      ["COMPLETED", "FAILED", "CANCELLED"].includes(currentState)
    ) {
      router.replace(`/blocks/${id}`, { scroll: false });
    }
  }, [
    id,
    launchedAnalysisJobId,
    analysis?.job?.id,
    analysis?.job?.state,
    router,
  ]);

  const job = analysis?.job;
  const measurement = analysis?.measurement;
  const geometry = analysis?.geometry;
  const defects = analysis?.defects;
  const cutting = analysis?.cutting;
  const classification = analysis?.classification;
  const wastage = analysis?.wastage;
  const seigniorage = analysis?.seigniorage;
  const aiExplanation = analysis?.ai_explanation;
  const reconstructionQuality = analysis?.reconstruction_quality;
  const digitalTwin = analysis?.digital_twin;

  const analysisRecord = recordFromUnknown(analysis);
  const observedShapeValidation = recordFromUnknown(
    analysisRecord.observed_shape_validation,
  );
  const shapeValidationStatus =
    stringFromRecord(observedShapeValidation, ["status"]) || "NOT_AVAILABLE";
  const shapeTargetIou =
    numberFromRecord(observedShapeValidation, ["target_iou"]) ?? 0.9;
  const shapeTargetMet =
    observedShapeValidation.target_met === true;
  const shapeValidViewCount =
    numberFromRecord(observedShapeValidation, ["valid_view_count"]) ?? 0;
  const recaptureRecommended =
    observedShapeValidation.recapture_recommended === true;
  const recaptureViewLabel =
    stringFromRecord(observedShapeValidation, ["recapture_view_label"]);
  const recaptureReason =
    stringFromRecord(observedShapeValidation, ["recapture_reason"]);
  const weakViewIds =
    stringArrayFromRecord(observedShapeValidation, ["weak_view_ids"]);

  const canOpenGuidedRecapture = Boolean(
    recaptureRecommended &&
      id &&
      captureSession?.id,
  );

  const openGuidedRecapture = useCallback(() => {
    if (!id || !captureSession?.id) {
      setError(
        isTe
          ? "రీక్యాప్చర్ కోసం క్యాప్చర్ సెషన్ కనబడలేదు."
          : "The capture session required for guided recapture is unavailable.",
      );
      return;
    }

    const params = new URLSearchParams({
      blockId: id,
      sessionId: captureSession.id,
    });

    router.push(`/capture?${params.toString()}`);
  }, [captureSession?.id, id, isTe, router]);

  const isAnalyzing = Boolean(
    job && job.state !== "COMPLETED" && job.state !== "FAILED",
  );

  const progress =
    typeof job?.progress_percent === "number"
      ? Math.max(0, Math.min(100, job.progress_percent))
      : null;

  const lengthCm = measurement?.length_cm;
  const breadthCm = measurement?.breadth_cm;
  const heightCm = measurement?.height_cm;
  const volumeM3 = measurement?.volume_m3 ?? null;

  // Pipeline confidence is an analysis/evidence-quality signal.
  // It is NOT physical measurement accuracy.
  const confidence = measurement?.measurement_confidence ?? null;

  // Real physical accuracy exists only after an officer/tape verification
  // record has supplied ground-truth Length, Breadth and Height.
  const latestVerification = verifications[0] || null;
  const accuracyRecord =
    latestVerification?.dimension_variance_json &&
    typeof latestVerification.dimension_variance_json === "object"
      ? latestVerification.dimension_variance_json
      : null;

  const accuracySummary: ValidatedAccuracySummary = {
    available:
      numberFromRecord(accuracyRecord, ["length_accuracy_pct"]) !== null &&
      numberFromRecord(accuracyRecord, ["breadth_accuracy_pct"]) !== null &&
      numberFromRecord(accuracyRecord, ["height_accuracy_pct"]) !== null,
    status: stringFromRecord(accuracyRecord, ["accuracy_status"]),
    targetPct: numberFromRecord(accuracyRecord, ["accuracy_target_pct"]),
    targetMet: booleanFromRecord(accuracyRecord, ["accuracy_target_met"]),
    lengthPct: numberFromRecord(accuracyRecord, ["length_accuracy_pct"]),
    breadthPct: numberFromRecord(accuracyRecord, ["breadth_accuracy_pct"]),
    heightPct: numberFromRecord(accuracyRecord, ["height_accuracy_pct"]),
    meanAxisPct: numberFromRecord(accuracyRecord, ["mean_axis_accuracy_pct"]),
    worstAxisPct: numberFromRecord(accuracyRecord, ["worst_axis_accuracy_pct"]),
    meanAbsoluteErrorCm: numberFromRecord(accuracyRecord, [
      "mean_absolute_error_cm",
    ]),
    mapePct: numberFromRecord(accuracyRecord, [
      "mean_absolute_percentage_error_pct",
    ]),
  };

  const surfaceAreaM2 = numberFromRecord(geometry, ["surface_area_m2"]);

  const visibleDefects: DefectFinding[] = defects?.visible_defects || [];

  const physicalCavities: PhysicalCavitySummary | null =
    analysis?.physical_cavities ?? null;

  const physicalCavityRecords: PhysicalCavityRecord[] =
    physicalCavities?.records ?? [];

  const dressedDimensions =
    typeof cutting?.final_dressed_dimensions?.length_cm === "number" &&
    typeof cutting?.final_dressed_dimensions?.breadth_cm === "number" &&
    typeof cutting?.final_dressed_dimensions?.height_cm === "number"
      ? {
          length_cm: cutting.final_dressed_dimensions.length_cm,
          breadth_cm: cutting.final_dressed_dimensions.breadth_cm,
          height_cm: cutting.final_dressed_dimensions.height_cm,
        }
      : null;

  const usableVolume = numberFromRecord(cutting, [
    "max_usable_volume_m3",
    "usable_volume_m3",
    "recovered_volume_m3",
  ]);

  const cuttingWastePct = numberFromRecord(cutting, [
    "waste_percentage",
    "wastage_percentage",
    "waste_ratio",
  ]);

  const cuttingRecoveryPct = numberFromRecord(cutting, [
    "recovery_percentage",
    "recovery_pct",
    "recovery_yield",
  ]);

  const wastagePct = numberFromRecord(wastage, [
    "waste_percentage",
    "wastage_percentage",
  ]);

  const recoveryPct = numberFromRecord(wastage, [
    "recovery_percentage",
    "recovery_pct",
  ]);

  const irregularityRatio = numberFromRecord(wastage, ["irregularity_ratio"]);

  const observedSurfaces = useMemo(() => {
    const fromQuality = stringArrayFromRecord(reconstructionQuality, [
      "observed_surfaces",
    ]);
    const fromTwin = stringArrayFromRecord(digitalTwin, ["observed_surfaces"]);
    return [...new Set([...fromQuality, ...fromTwin])];
  }, [reconstructionQuality, digitalTwin]);

  const missingSurfaces = useMemo(() => {
    const fromQuality = stringArrayFromRecord(reconstructionQuality, [
      "missing_surfaces",
    ]);
    const fromTwin = stringArrayFromRecord(digitalTwin, [
      "missing_surfaces",
      "unobserved_surfaces",
    ]);
    return [...new Set([...fromQuality, ...fromTwin])];
  }, [reconstructionQuality, digitalTwin]);

  const silhouetteIou =
    numberFromRecord(observedShapeValidation, ["overall_silhouette_iou"]) ??
    numberFromRecord(reconstructionQuality, [
      "overall_silhouette_iou",
      "silhouette_consistency",
    ]);

  const boundaryError =
    numberFromRecord(observedShapeValidation, ["mean_boundary_error_px"]) ??
    numberFromRecord(reconstructionQuality, ["mean_boundary_error_px"]);

  const reprojectionError = numberFromRecord(reconstructionQuality, [
    "mean_reprojection_error_px",
  ]);

  const coveragePct = numberFromRecord(reconstructionQuality, [
    "camera_coverage_percentage",
  ]);

  const hasMetricMeasurement =
    measurement?.length_cm != null &&
    measurement?.breadth_cm != null &&
    measurement?.height_cm != null;

  const measurementAllowed =
    reconstructionQuality?.metric_measurement_allowed === true ||
    hasMetricMeasurement;

  const twinProductionAuthorized =
    digitalTwin?.production_authorized === true ||
    (measurementAllowed && Boolean(analysis?.mesh_3d_url));

  const tabs = [
    {
      id: "overview" as const,
      label: isTe ? "సారాంశం" : "Overview",
      icon: Sparkles,
    },
    {
      id: "reconstruction" as const,
      label: isTe ? "రీకన్స్ట్రక్షన్" : "Reconstruction",
      icon: Layers3,
    },
    {
      id: "measurements" as const,
      label: isTe ? "కొలతలు" : "Measurements",
      icon: Ruler,
    },
    {
      id: "defects" as const,
      label: isTe ? "లోపాలు" : "Defects",
      icon: ShieldAlert,
    },
    {
      id: "cutting" as const,
      label: isTe ? "కట్టింగ్" : "Cutting",
      icon: Scissors,
    },
    {
      id: "recovery" as const,
      label: isTe ? "రికవరీ" : "Recovery",
      icon: PackageCheck,
    },
    {
      id: "evidence" as const,
      label: isTe ? "ఆధారాలు" : "Evidence",
      icon: Images,
    },
    {
      id: "report" as const,
      label: isTe ? "రిపోర్ట్" : "Report",
      icon: FileText,
    },
  ];

  const numPhysL = parseFloat(physL) || 0;
  const numPhysB = parseFloat(physB) || 0;
  const numPhysH = parseFloat(physH) || 0;

  const physVolM3 =
    numPhysL > 0 && numPhysB > 0 && numPhysH > 0
      ? (numPhysL * numPhysB * numPhysH) / 1_000_000
      : 0;

  const aiEnvelopeVolM3 =
    typeof lengthCm === "number" &&
    lengthCm > 0 &&
    typeof breadthCm === "number" &&
    breadthCm > 0 &&
    typeof heightCm === "number" &&
    heightCm > 0
      ? (lengthCm * breadthCm * heightCm) / 1_000_000
      : null;

  const envelopePreviewAccuracy =
    aiEnvelopeVolM3 !== null && aiEnvelopeVolM3 > 0 && physVolM3 > 0
      ? Math.max(
          0,
          100 -
            (Math.abs(aiEnvelopeVolM3 - physVolM3) / physVolM3) * 100,
        )
      : null;

  const handleRetryAnalysis = async () => {
    if (!analysis?.job?.capture_session_id || !id) return;

    setRetrying(true);

    try {
      const createdJob = await createAnalysisJob(
        analysis.job.capture_session_id,
      );

      router.replace(
        `/blocks/${id}?analysisJobId=${encodeURIComponent(createdJob.id)}`,
        { scroll: false },
      );

      await refreshAnalysisOnly();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRetrying(false);
    }
  };

  const handleSubmitVerification = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!job?.id || !numPhysL || !numPhysB || !numPhysH) {
      setVerificationFeedback(
        isTe
          ? "సరైన పొడవు, వెడల్పు మరియు ఎత్తు నమోదు చేయండి."
          : "Enter valid physical length, breadth and height.",
      );
      return;
    }

    setSubmittingVerification(true);
    setVerificationFeedback(null);

    try {
      await submitManualVerification(id, {
        job_id: job.id,
        verified_length_cm: numPhysL,
        verified_breadth_cm: numPhysB,
        verified_height_cm: numPhysH,
        decision,
        remarks: remarks.trim() || undefined,
      });

      setVerificationFeedback(
        isTe ? "ఫిజికల్ చెక్ సేవ్ అయింది." : "Physical check saved.",
      );

      setPhysL("");
      setPhysB("");
      setPhysH("");
      setRemarks("");

      const refreshedVerifications = await listManualVerifications(id).catch(
        () => [],
      );
      setVerifications(
        Array.isArray(refreshedVerifications) ? refreshedVerifications : [],
      );

      await refreshAnalysisOnly();
    } catch (reason) {
      setVerificationFeedback(
        reason instanceof Error ? reason.message : String(reason),
      );
    } finally {
      setSubmittingVerification(false);
    }
  };

  if (!id) {
    return <div className="page-wrap">{t("error")}</div>;
  }

  const launchedJobMatchesCurrent =
    Boolean(
      launchedAnalysisJobId &&
        job?.id === launchedAnalysisJobId,
    );

  const waitingForExactLaunchedJob =
    Boolean(
      block &&
        launchedAnalysisJobId &&
        job?.id !== launchedAnalysisJobId,
    );

  if (
    block &&
    launchedAnalysisJobId &&
    (waitingForExactLaunchedJob ||
      (launchedJobMatchesCurrent && isAnalyzing))
  ) {
    return (
      <AnalysisProcessExperience
        images={images}
        analysis={
          launchedJobMatchesCurrent
            ? analysis
            : null
        }
        isTe={isTe}
        blockCode={block.block_code || undefined}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e8edf4] text-[#11151b] dark:bg-[#07101c] dark:text-[#f4f7fb]">
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-24 pt-3 sm:px-5 lg:px-7 lg:pt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-xs font-black uppercase tracking-[0.1em] text-black/45 transition hover:text-black/75 dark:text-white/45 dark:hover:text-white/75"
          >
            <ArrowLeft size={15} />
            {isTe ? "బ్లాక్‌లకు తిరిగి" : "Back to blocks"}
          </button>

          {block ? <StatusBadge status={block.status} /> : null}
        </div>

        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-start gap-3 rounded-[22px] border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-800 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        ) : null}

        {block ? (
          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden rounded-[16px] border border-slate-200/75 bg-white/78 shadow-[0_8px_24px_rgba(15,23,42,.04)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0a1422]/84 dark:shadow-none"
            >
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-white/45">
                      {isTe ? "గ్రానైట్ బ్లాక్" : "Granite block"}
                    </span>
                    <StatusBadge status={block.status} />
                    {job?.state === "COMPLETED" ? (
                      <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.07] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                        {isTe ? "విశ్లేషణ పూర్తైంది" : "Analysis complete"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
                    <h1 className="truncate text-[28px] font-black leading-none tracking-[-0.045em] sm:text-[34px]">
                      {block.block_code || block.id}
                    </h1>
                    <p className="pb-0.5 text-[9px] font-bold text-slate-400 dark:text-white/30">
                      {isTe
                        ? "ఫోటో ఆధారాల నుండి డిజిటల్ ట్విన్ వర్క్‌స్పేస్"
                        : "Evidence-to-digital-twin engineering workspace"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CompactTopMetric
                    label={isTe ? "ఫోటోలు" : "Photos"}
                    value={String(images.length)}
                    icon={<Camera size={12} />}
                  />
                  <CompactTopMetric
                    label={isTe ? "మెట్రిక్" : "Metric"}
                    value={measurementAllowed ? (isTe ? "READY" : "READY") : (isTe ? "LOCKED" : "LOCKED")}
                    icon={<Ruler size={12} />}
                  />
                  <CompactTopMetric
                    label={isTe ? "సిమిలారిటీ" : "Similarity"}
                    value={silhouetteIou !== null ? percentText(silhouetteIou) : "—"}
                    icon={<Target size={12} />}
                  />
                  <CompactTopMetric
                    label={isTe ? "ఖచ్చితత్వం" : "Accuracy"}
                    value={
                      accuracySummary.available
                        ? percentText(accuracySummary.meanAxisPct)
                        : isTe
                          ? "UNVERIFIED"
                          : "UNVERIFIED"
                    }
                    icon={<ShieldCheck size={12} />}
                  />
                  <Link
                    href={`/ai-assistant?block_id=${block.id}`}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-slate-200 bg-slate-950 px-3.5 text-[8px] font-black uppercase tracking-[0.11em] text-white transition hover:-translate-y-0.5 dark:border-[#67e8f9]/18 dark:bg-[#67e8f9] dark:text-[#06101b]"
                  >
                    <Sparkles size={12} />
                    {isTe ? "AI సహాయకుడు" : "AI assistant"}
                  </Link>
                </div>
              </div>

              <div className="grid border-t border-slate-200/75 bg-slate-50/70 sm:grid-cols-2 lg:grid-cols-5 dark:border-white/[0.06] dark:bg-white/[0.018]">
                <WorkspaceSignal
                  label={isTe ? "రీకన్స్ట్రక్షన్" : "Reconstruction"}
                  value={
                    analysis?.mesh_3d_url
                      ? isTe ? "మెష్ సిద్ధం" : "Mesh available"
                      : analysis?.points_3d_url
                        ? isTe ? "పాయింట్ క్లౌడ్" : "Point cloud available"
                        : isTe ? "పెండింగ్" : "Pending"
                  }
                  tone={analysis?.mesh_3d_url ? "good" : analysis?.points_3d_url ? "active" : "neutral"}
                />
                <WorkspaceSignal
                  label={isTe ? "కొలత" : "Measurement"}
                  value={
                    measurementAllowed && typeof lengthCm === "number"
                      ? `${formatCm(lengthCm)} × ${formatCm(breadthCm)} × ${formatCm(heightCm)}`
                      : isTe ? "ధృవీకరణ కోసం వేచి ఉంది" : "Awaiting validated geometry"
                  }
                  tone={measurementAllowed ? "good" : "neutral"}
                />
                <WorkspaceSignal
                  label={isTe ? "భౌతిక ఖచ్చితత్వం" : "Physical accuracy"}
                  value={
                    accuracySummary.available
                      ? `${percentText(accuracySummary.meanAxisPct)} mean · ${percentText(accuracySummary.worstAxisPct)} worst`
                      : isTe
                        ? "అధికారి ధృవీకరణ అవసరం"
                        : "Officer verification required"
                  }
                  tone={
                    accuracySummary.available
                      ? accuracySummary.targetMet === true
                        ? "good"
                        : "warn"
                      : "neutral"
                  }
                />
                <WorkspaceSignal
                  label={isTe ? "ఆబ్జర్వ్డ్ వ్యూస్" : "Observed views"}
                  value={
                    observedSurfaces.length
                      ? observedSurfaces.join(" · ")
                      : isTe ? "ఇంకా నివేదించలేదు" : "Not reported"
                  }
                  tone="neutral"
                />
                <WorkspaceSignal
                  label={isTe ? "తదుపరి చర్య" : "Next action"}
                  value={
                    recaptureRecommended
                      ? `${recaptureViewLabel || "Weak view"} — ${isTe ? "రీక్యాప్చర్" : "recapture"}`
                      : measurementAllowed
                        ? isTe ? "కొలత / పరిశీలన" : "Measure / inspect"
                        : isTe ? "రీకన్స్ట్రక్షన్ ధృవీకరణ" : "Validate reconstruction"
                  }
                  tone={recaptureRecommended ? "warn" : measurementAllowed ? "good" : "active"}
                />
              </div>
            </motion.section>

            <nav className="sticky top-2 z-40 overflow-x-auto rounded-[18px] border border-slate-200/85 bg-white/90 p-1.5 shadow-[0_10px_28px_rgba(15,23,42,.06)] backdrop-blur-2xl dark:border-white/[0.07] dark:bg-[#0c1016]/92">
              <div className="grid min-w-[1010px] grid-cols-8 gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const selected = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={[
                        "relative flex min-h-11 items-center justify-center gap-2 rounded-[13px] px-3 text-[9px] font-black uppercase tracking-[0.07em] transition",
                        selected
                          ? "bg-slate-950 text-white shadow-[0_8px_22px_rgba(15,23,42,.18)] dark:bg-[#67e8f9] dark:text-[#18120a]"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/42 dark:hover:bg-white/[0.045] dark:hover:text-white/80",
                      ].join(" ")}
                    >
                      <Icon size={13} />
                      {tab.label}
                      {selected ? (
                        <span className="absolute inset-x-5 -bottom-1 h-0.5 rounded-full bg-[#38bdf8] dark:bg-[#1b140a]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </nav>

            {(recaptureRecommended || !shapeTargetMet) ? (
              <section className="flex flex-col gap-3 rounded-[16px] border border-slate-200/80 bg-white/82 px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,.04)] sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:bg-[#0c1016]/78">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={[
                    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border",
                    recaptureRecommended
                      ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-600 dark:text-amber-300"
                      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.025] dark:text-white/45",
                  ].join(" ")}>
                    <Target size={13} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
                      {isTe ? "రీకన్స్ట్రక్షన్ క్వాలిటీ" : "Reconstruction quality"}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-black">
                      {recaptureRecommended
                        ? `${recaptureViewLabel || (isTe ? "బలహీన వ్యూ" : "Weak view")} · ${recaptureReason || (isTe ? "అదనపు ఫోటో అవసరం" : "Additional evidence recommended")}`
                        : `${isTe ? "Observed similarity" : "Observed similarity"} ${silhouetteIou !== null ? percentText(silhouetteIou) : "—"} · ${isTe ? "లక్ష్యం" : "target"} ≥ ${percentText(shapeTargetIou)}`}
                    </p>
                  </div>
                </div>

                {recaptureRecommended ? (
                  <button
                    type="button"
                    onClick={openGuidedRecapture}
                    disabled={!canOpenGuidedRecapture}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-amber-500/18 bg-amber-500/[0.07] px-3 text-[8px] font-black uppercase tracking-[0.1em] text-amber-700 disabled:opacity-40 dark:text-amber-200"
                  >
                    <Camera size={11} />
                    {isTe ? "రీక్యాప్చర్" : "Open recapture"}
                  </button>
                ) : null}
              </section>
            ) : null}

            {job?.state === "FAILED" ? (
              <section className="flex flex-col gap-3 rounded-[22px] border border-red-500/25 bg-red-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 text-red-600 dark:text-red-300" size={18} />
                  <div>
                    <p className="text-sm font-black">
                      {isTe ? "విశ్లేషణ విఫలమైంది" : "Analysis failed"}
                    </p>
                    <p className="mt-1 text-xs text-black/48 dark:text-white/48">
                      {job.failure_reason ||
                        (isTe
                          ? "ఫోటోలను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి."
                          : "Check the capture evidence and retry.")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRetryAnalysis}
                  disabled={retrying}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1a150d] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-[#f0d79b] disabled:opacity-50 dark:bg-[#67e8f9] dark:text-[#1a1308]"
                >
                  <RefreshCw size={13} className={retrying ? "animate-spin" : ""} />
                  {retrying
                    ? isTe
                      ? "మళ్లీ ప్రారంభిస్తోంది..."
                      : "Restarting…"
                    : isTe
                      ? "మళ్లీ విశ్లేషించండి"
                      : "Retry analysis"}
                </button>
              </section>
            ) : null}

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                {activeTab === "overview" ? (
                  <OverviewTab
                    isTe={isTe}
                    analysis={analysis}
                    images={images}
                    visibleDefects={visibleDefects}
                    measurementAllowed={measurementAllowed}
                    lengthCm={lengthCm}
                    breadthCm={breadthCm}
                    heightCm={heightCm}
                    volumeM3={volumeM3}
                    classification={classification?.classification || null}
                    confidence={confidence}
                    accuracySummary={accuracySummary}
                    silhouetteIou={silhouetteIou}
                    missingSurfaces={missingSurfaces}
                    observedSurfaces={observedSurfaces}
                    cuttingRecoveryPct={cuttingRecoveryPct}
                    cuttingWastePct={cuttingWastePct}
                    onNavigate={setActiveTab}
                  />
                ) : null}

                {activeTab === "reconstruction" ? (
                  <ReconstructionTab
                    isTe={isTe}
                    images={images}
                    analysis={analysis}
                    geometry={geometry ?? null}
                    job={job ?? null}
                    isAnalyzing={isAnalyzing}
                    progress={progress}
                    lengthCm={lengthCm}
                    breadthCm={breadthCm}
                    heightCm={heightCm}
                    dressedDimensions={dressedDimensions}
                    visibleDefects={visibleDefects}
                    cutting={cutting ?? null}
                    silhouetteIou={silhouetteIou}
                    boundaryError={boundaryError}
                    reprojectionError={reprojectionError}
                    coveragePct={coveragePct}
                    observedSurfaces={observedSurfaces}
                    missingSurfaces={missingSurfaces}
                    measurementAllowed={measurementAllowed}
                    shapeTargetIou={shapeTargetIou}
                    shapeTargetMet={shapeTargetMet}
                    shapeValidationStatus={shapeValidationStatus}
                    shapeValidViewCount={shapeValidViewCount}
                    recaptureRecommended={recaptureRecommended}
                    recaptureViewLabel={recaptureViewLabel}
                    recaptureReason={recaptureReason}
                    canOpenGuidedRecapture={canOpenGuidedRecapture}
                    onOpenGuidedRecapture={openGuidedRecapture}
                  />
                ) : null}

                {activeTab === "measurements" ? (
                  <MeasurementsTab
                    isTe={isTe}
                    analysis={analysis}
                    job={job ?? null}
                    isAnalyzing={isAnalyzing}
                    progress={progress}
                    dressedDimensions={dressedDimensions}
                    visibleDefects={visibleDefects}
                    cutting={cutting ?? null}
                    lengthCm={lengthCm}
                    breadthCm={breadthCm}
                    heightCm={heightCm}
                    volumeM3={volumeM3}
                    surfaceAreaM2={surfaceAreaM2}
                    confidence={confidence}
                    accuracySummary={accuracySummary}
                    measurementAllowed={measurementAllowed}
                    geometry={geometry ?? null}
                    physL={physL}
                    physB={physB}
                    physH={physH}
                    setPhysL={setPhysL}
                    setPhysB={setPhysB}
                    setPhysH={setPhysH}
                    decision={decision}
                    setDecision={setDecision}
                    remarks={remarks}
                    setRemarks={setRemarks}
                    submittingVerification={submittingVerification}
                    verificationFeedback={verificationFeedback}
                    handleSubmitVerification={handleSubmitVerification}
                    verifications={verifications}
                    physVolM3={physVolM3}
                    envelopePreviewAccuracy={envelopePreviewAccuracy}
                  />
                ) : null}

                {activeTab === "defects" ? (
                  <DefectsTab
                    isTe={isTe}
                    images={images}
                    defects={defects ?? null}
                    visibleDefects={visibleDefects}
                    physicalCavities={physicalCavities}
                    physicalCavityRecords={physicalCavityRecords}
                    classification={classification ?? null}
                    onOpenPhoto={setActivePhoto}
                  />
                ) : null}

                {activeTab === "cutting" ? (
                  <CuttingTab
                    isTe={isTe}
                    job={job ?? null}
                    analysis={analysis}
                    cutting={cutting ?? null}
                    lengthCm={lengthCm}
                    breadthCm={breadthCm}
                    heightCm={heightCm}
                    selectedOrientationIdx={selectedOrientationIdx}
                    setSelectedOrientationIdx={setSelectedOrientationIdx}
                    usableVolume={usableVolume}
                    cuttingRecoveryPct={cuttingRecoveryPct}
                    cuttingWastePct={cuttingWastePct}
                  />
                ) : null}

                {activeTab === "recovery" ? (
                  <RecoveryTab
                    isTe={isTe}
                    rawVolume={volumeM3}
                    usableVolume={usableVolume}
                    recoveryPct={recoveryPct ?? cuttingRecoveryPct}
                    wastagePct={wastagePct ?? cuttingWastePct}
                    irregularityRatio={irregularityRatio}
                    seigniorage={seigniorage ?? null}
                  />
                ) : null}

                {activeTab === "evidence" ? (
                  <EvidenceTab
                    isTe={isTe}
                    images={images}
                    analysis={analysis}
                    physicalCavities={physicalCavities}
                    observedSurfaces={observedSurfaces}
                    missingSurfaces={missingSurfaces}
                    onOpenPhoto={setActivePhoto}
                  />
                ) : null}

                {activeTab === "report" ? (
                  <ReportTab
                    isTe={isTe}
                    block={block}
                    analysis={analysis}
                    images={images}
                    visibleDefects={visibleDefects}
                    measurementAllowed={measurementAllowed}
                    lengthCm={lengthCm}
                    breadthCm={breadthCm}
                    heightCm={heightCm}
                    volumeM3={volumeM3}
                    accuracySummary={accuracySummary}
                    observedSurfaces={observedSurfaces}
                    missingSurfaces={missingSurfaces}
                    aiExplanation={aiExplanation}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {activePhoto ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setActivePhoto(null)}
          aria-label={isTe ? "ఫోటో మూసివేయండి" : "Close photo"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activePhoto}
            alt=""
            className="max-h-[90vh] max-w-[95vw] rounded-[24px] border border-white/10 object-contain shadow-2xl"
          />
        </button>
      ) : null}
    </div>
  );
}


function CompactTopMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-[13px] border border-slate-200 bg-slate-50/80 px-3 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <span className="text-slate-400 dark:text-white/32">{icon}</span>
      <div>
        <p className="text-[6.5px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/28">
          {label}
        </p>
        <p className="mt-0.5 text-[8.5px] font-black text-slate-800 dark:text-white/72">
          {value}
        </p>
      </div>
    </div>
  );
}

function WorkspaceSignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "active" | "warn" | "neutral";
}) {
  const dotClass =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "active"
        ? "bg-sky-500"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-slate-300 dark:bg-white/20";

  return (
    <div className="min-w-0 border-b border-slate-200/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-white/[0.055]">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <p className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/28">
          {label}
        </p>
      </div>
      <p className="mt-1 truncate text-[9px] font-black text-slate-700 dark:text-white/62">
        {value}
      </p>
    </div>
  );
}


function OverviewTab({
  isTe,
  analysis,
  images,
  visibleDefects,
  measurementAllowed,
  lengthCm,
  breadthCm,
  heightCm,
  volumeM3,
  classification,
  confidence,
  accuracySummary,
  silhouetteIou,
  missingSurfaces,
  observedSurfaces,
  cuttingRecoveryPct,
  cuttingWastePct,
  onNavigate,
}: {
  isTe: boolean;
  analysis: BlockAnalysis | null;
  images: ImageOut[];
  visibleDefects: DefectFinding[];
  measurementAllowed: boolean;
  lengthCm?: number | null;
  breadthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;
  classification: string | null;
  confidence?: number | null;
  accuracySummary: ValidatedAccuracySummary;
  silhouetteIou: number | null;
  missingSurfaces: string[];
  observedSurfaces: string[];
  cuttingRecoveryPct: number | null;
  cuttingWastePct: number | null;
  onNavigate: (tab: AnalysisTab) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="space-y-5">
        <LuxurySection
          eyebrow={isTe ? "ఎగ్జిక్యూటివ్ వ్యూ" : "Executive view"}
          title={isTe ? "గ్రానైట్ బ్లాక్ సారాంశం" : "Granite block summary"}
          icon={<Sparkles size={17} />}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <LargeMetric
              label={isTe ? "పొడవు" : "Length"}
              value={measurementAllowed ? formatCm(lengthCm) : "Awaiting validated geometry"}
            />
            <LargeMetric
              label={isTe ? "వెడల్పు" : "Breadth"}
              value={measurementAllowed ? formatCm(breadthCm) : "Awaiting validated geometry"}
            />
            <LargeMetric
              label={isTe ? "ఎత్తు" : "Height"}
              value={measurementAllowed ? formatCm(heightCm) : "Awaiting validated geometry"}
            />
            <LargeMetric
              label={isTe ? "వాల్యూమ్" : "Volume"}
              value={measurementAllowed ? formatM3(volumeM3) : "Awaiting validated geometry"}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InsightCard
              label={isTe ? "గ్రానైట్ రకం" : "Granite classification"}
              value={classification || "Not confirmed"}
              detail={isTe ? "మోడల్ ఆధారిత వర్గీకరణ" : "Evidence-backed model output only"}
            />
            <InsightCard
              label={isTe ? "కనిపించే లోపాలు" : "Visible findings"}
              value={String(visibleDefects.length)}
              detail={isTe ? "RGB ఫోటోల్లో కనిపించినవి మాత్రమే" : "Visible photographic findings only"}
            />
            <InsightCard
              label={isTe ? "పైప్‌లైన్ నమ్మకం" : "Pipeline confidence"}
              value={measurementAllowed ? percentText(confidence) : "Locked"}
              detail={
                isTe
                  ? "ఇది భౌతిక కొలత ఖచ్చితత్వం కాదు"
                  : "Analysis/evidence quality — not physical accuracy"
              }
            />
            <InsightCard
              label={isTe ? "ధృవీకరించిన ఖచ్చితత్వం" : "Validated measurement accuracy"}
              value={
                accuracySummary.available
                  ? `${percentText(accuracySummary.meanAxisPct)} mean`
                  : isTe
                    ? "భౌతిక ధృవీకరణ లేదు"
                    : "Not physically validated"
              }
              detail={
                accuracySummary.available
                  ? `${percentText(accuracySummary.worstAxisPct)} worst axis · ${
                      accuracySummary.targetMet === true
                        ? "80% target met"
                        : "80% target not met"
                    }`
                  : isTe
                    ? "అధికారి / టేప్ L/B/H నమోదు చేసిన తర్వాత మాత్రమే లెక్కించబడుతుంది"
                    : "Calculated only after officer/tape L/B/H ground truth"
              }
            />
          </div>
        </LuxurySection>

        <LuxurySection
          eyebrow={isTe ? "వర్క్‌ఫ్లో" : "Analysis journey"}
          title={isTe ? "ఆధారం నుంచి నిర్ణయం వరకు" : "From evidence to decision"}
          icon={<ScanLine size={17} />}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <JourneyStep number="01" label="Evidence" ready={images.length > 0} />
            <JourneyStep
              number="02"
              label="Reconstruction"
              ready={Boolean(analysis?.mesh_3d_url || analysis?.points_3d_url)}
            />
            <JourneyStep number="03" label="Measure & inspect" ready={Boolean(analysis?.measurement)} />
            <JourneyStep number="04" label="Dress & assess" ready={Boolean(analysis?.cutting)} />
          </div>
        </LuxurySection>

        <LuxurySection
          eyebrow={isTe ? "రికవరీ" : "Material outcome"}
          title={isTe ? "కట్టింగ్ & రికవరీ అవుట్‌లుక్" : "Cutting & recovery outlook"}
          icon={<PackageCheck size={17} />}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <LargeMetric
              label={isTe ? "రికవరీ" : "Recovery"}
              value={percentText(cuttingRecoveryPct)}
            />
            <LargeMetric
              label={isTe ? "వేస్ట్" : "Waste"}
              value={percentText(cuttingWastePct)}
            />
          </div>

          <button
            type="button"
            onClick={() => onNavigate("recovery")}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[16px] border border-[#b98b38]/20 bg-[#67e8f9]/10 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-[#7c581e] dark:text-[#edd29a]"
          >
            <PackageCheck size={14} />
            {isTe ? "రికవరీ వివరాలు" : "Open recovery analysis"}
          </button>
        </LuxurySection>
      </div>

      <aside className="space-y-5">
        <LuxurySection
          eyebrow={isTe ? "3D నాణ్యత" : "Shape validation"}
          title={isTe ? "రీకన్స్ట్రక్షన్ నమ్మకం" : "Reconstruction confidence"}
          icon={<Target size={17} />}
        >
          <RingMetric
            value={silhouetteIou !== null ? (silhouetteIou <= 1 ? silhouetteIou * 100 : silhouetteIou) : null}
            label={isTe ? "సిల్హౌట్ IoU" : "Silhouette IoU"}
          />

          <p className="mt-3 text-[10px] leading-5 text-black/45 dark:text-white/45">
            {isTe
              ? "≥90% అనేది కనిపించిన వ్యూస్‌పై ధృవీకరణ లక్ష్యం మాత్రమే; UI దానిని హామీ ఇవ్వదు."
              : "≥90% is a validation target on observed views only. The UI never guarantees it."}
          </p>
        </LuxurySection>

        <LuxurySection
          eyebrow={isTe ? "సర్ఫేస్ కవరేజ్" : "Surface evidence"}
          title={isTe ? "కనిపించిన / కనిపించని" : "Observed / unobserved"}
          icon={<Eye size={17} />}
        >
          <SurfaceList title="Observed" values={observedSurfaces} tone="good" />
          <div className="mt-3" />
          <SurfaceList title="Unobserved" values={missingSurfaces} tone="warn" />
        </LuxurySection>

        <button
          type="button"
          onClick={() => onNavigate("reconstruction")}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#0b1420] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-[#f1d89d] shadow-[0_14px_34px_rgba(44,28,3,.15)] dark:bg-gradient-to-r dark:from-[#67e8f9] dark:to-[#ad7a2c] dark:text-[#06101b]"
        >
          <Layers3 size={14} />
          {isTe ? "డిజిటల్ ట్విన్ తెరవండి" : "Open Digital Twin"}
        </button>
      </aside>
    </div>
  );
}

function ReconstructionTab({
  isTe,
  images,
  analysis,
  geometry,
  job,
  isAnalyzing,
  progress,
  lengthCm,
  breadthCm,
  heightCm,
  dressedDimensions,
  visibleDefects,
  cutting,
  silhouetteIou,
  boundaryError,
  reprojectionError,
  coveragePct,
  observedSurfaces,
  missingSurfaces,
  measurementAllowed,
  shapeTargetIou,
  shapeTargetMet,
  shapeValidationStatus,
  shapeValidViewCount,
  recaptureRecommended,
  recaptureViewLabel,
  recaptureReason,
  canOpenGuidedRecapture,
  onOpenGuidedRecapture,
}: {
  isTe: boolean;
  images: ImageOut[];
  analysis: BlockAnalysis | null;
  geometry: BlockAnalysis["geometry"];
  job: BlockAnalysis["job"];
  isAnalyzing: boolean;
  progress: number | null;
  lengthCm?: number | null;
  breadthCm?: number | null;
  heightCm?: number | null;
  dressedDimensions: { length_cm: number; breadth_cm: number; height_cm: number } | null;
  visibleDefects: DefectFinding[];
  cutting: BlockAnalysis["cutting"];
  silhouetteIou: number | null;
  boundaryError: number | null;
  reprojectionError: number | null;
  coveragePct: number | null;
  observedSurfaces: string[];
  missingSurfaces: string[];
  measurementAllowed: boolean;
  shapeTargetIou: number;
  shapeTargetMet: boolean;
  shapeValidationStatus: string;
  shapeValidViewCount: number;
  recaptureRecommended: boolean;
  recaptureViewLabel: string | null;
  recaptureReason: string | null;
  canOpenGuidedRecapture: boolean;
  onOpenGuidedRecapture: () => void;
}) {
  const acceptedImages = images.filter((image) => {
    const record = image as unknown as Record<string, unknown>;
    return record.rejected !== true;
  });

  const dimensionsReady =
    measurementAllowed &&
    typeof lengthCm === "number" &&
    typeof breadthCm === "number" &&
    typeof heightCm === "number";

  const effectiveMeshUrl =
    analysis?.mesh_3d_url ||
    (
      job?.id &&
      stringFromRecord(geometry, ["mesh_path"])
        ? `/api/v1/geometry/${job.id}/mesh`
        : null
    );

  const effectivePointsUrl =
    analysis?.points_3d_url ||
    (
      job?.id &&
      stringFromRecord(geometry, ["point_cloud_path"])
        ? `/api/v1/geometry/${job.id}/point-cloud`
        : null
    );

  const meshReady = Boolean(effectiveMeshUrl);
  const pointCloudReady = Boolean(effectivePointsUrl);

  const similarityPercent =
    silhouetteIou === null
      ? null
      : silhouetteIou <= 1
        ? silhouetteIou * 100
        : silhouetteIou;

  const targetPercent =
    shapeTargetIou <= 1
      ? shapeTargetIou * 100
      : shapeTargetIou;

  return (
    <div className="space-y-3">
      {/* Completely new reconstruction shell:
          one command bar + one immersive viewer.
          No left photo rail, no right pipeline rail, no duplicate evidence strip. */}
      <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,.07)] dark:border-slate-200 dark:bg-[#f7fafc] dark:shadow-[0_18px_48px_rgba(15,23,42,.08)]">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-200 dark:bg-white/95">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.13em] text-cyan-800 dark:border-cyan-300/15 dark:bg-cyan-300/[0.06] dark:text-cyan-200">
                {isTe ? "డిజిటల్ ట్విన్" : "Digital Twin"}
              </span>

              {job?.demo_simulated ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.13em] text-teal-800 dark:border-teal-300/15 dark:bg-teal-300/[0.06] dark:text-teal-200">
                  <ShieldCheck size={9} />
                  {isTe ? "ధృవీకరించిన డెమో రీప్లే" : "Verified demo replay"}
                </span>
              ) : null}

              <span
                className={[
                  "rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.13em]",
                  meshReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.06] dark:text-emerald-200"
                    : pointCloudReady
                      ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/15 dark:bg-sky-300/[0.06] dark:text-sky-200"
                      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.025] dark:text-slate-500",
                ].join(" ")}
              >
                {meshReady
                  ? isTe ? "మెష్ అందుబాటులో ఉంది" : "Mesh available"
                  : pointCloudReady
                    ? isTe ? "పాయింట్ క్లౌడ్ అందుబాటులో ఉంది" : "Point cloud available"
                    : isTe ? "3D పెండింగ్" : "3D pending"}
              </span>

              {isAnalyzing ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.13em] text-sky-700 dark:border-sky-300/15 dark:bg-sky-300/[0.06] dark:text-sky-200">
                  <Loader2 size={9} className="animate-spin" />
                  {progress !== null ? `${Math.round(progress)}%` : isTe ? "విశ్లేషణ" : "Analyzing"}
                </span>
              ) : null}
            </div>

            <h2 className="mt-2 text-[20px] font-black tracking-[-0.035em] text-slate-950 sm:text-[24px] dark:text-white">
              {isTe ? "గ్రానైట్ రీకన్స్ట్రక్షన్ వర్క్‌స్పేస్" : "Granite Reconstruction Workspace"}
            </h2>

            <p className="mt-1 max-w-3xl text-[8.5px] leading-4 text-slate-500 dark:text-slate-500">
              {isTe
                ? "ఫోటో ఆధారాల నుండి వచ్చిన నిజమైన 3D డేటానే ఇక్కడ చూపబడుతుంది. కనిపించని ఉపరితలాలు ఊహించి పూర్తి చేయబడవు."
                : "Only reconstruction data supported by this block's photo evidence is shown. Missing surfaces stay unobserved rather than being invented."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            <ReconstructionMiniStat
              label={isTe ? "ఫోటోలు" : "Evidence"}
              value={`${acceptedImages.length} ${isTe ? "ఫోటోలు" : "photos"}`}
              tone="neutral"
            />
            <ReconstructionMiniStat
              label={isTe ? "మెట్రిక్" : "Metric"}
              value={measurementAllowed ? "READY" : "LOCKED"}
              tone={measurementAllowed ? "good" : "neutral"}
            />
            <ReconstructionMiniStat
              label={isTe ? "సిమిలారిటీ" : "Similarity"}
              value={similarityPercent !== null ? `${similarityPercent.toFixed(1)}%` : "—"}
              tone={shapeTargetMet ? "good" : "neutral"}
            />
            <ReconstructionMiniStat
              label={isTe ? "వ్యూ చెక్" : "Views"}
              value={shapeValidViewCount > 0 ? String(shapeValidViewCount) : "—"}
              tone="neutral"
            />
          </div>
        </div>

        {/* The actual viewer now owns the visual hierarchy. */}
        <div className="relative min-h-[760px] bg-[#eef5fa] sm:min-h-[820px] lg:min-h-[880px]">
          <PointCloud3DViewer
            jobId={job?.id}
            pointsUrl={effectivePointsUrl}
            meshUrl={effectiveMeshUrl}
            analysisRunning={isAnalyzing}
            analysisProgress={progress}
            analysisStage={job?.current_stage || null}
            dimensions={
              dimensionsReady
                ? {
                    length_cm: lengthCm!,
                    breadth_cm: breadthCm!,
                    height_cm: heightCm!,
                  }
                : null
            }
            dressedDimensions={dressedDimensions}
            defects={visibleDefects.map((defect) => ({
              ...defect,
              depth_status: defect.depth_status ?? undefined,
              measurement_provenance:
                defect.measurement_provenance ?? undefined,
              cutting_impact: defect.cutting_impact ?? undefined,
              geometry_region: defect.geometry_region ?? undefined,
            }))}
            cuttingSteps={cutting?.cutting_steps}
            orientations={cutting?.orientations}
            isDemo={job?.demo_simulated ?? false}
            provider={geometry?.reconstruction_provider}
            scenarios={cutting?.scenarios}
            photoEvidenceMatrix={analysis?.photo_evidence_matrix}
            reconstructionQuality={analysis?.reconstruction_quality}
          />
        </div>

        {/* Compact factual footer only. No duplicate pipeline or photo rail. */}
        <div className="grid border-t border-slate-200/80 bg-slate-50/75 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/[0.06] dark:bg-[#0a1421]">
          <ReconstructionFooterSignal
            label={isTe ? "అబ్జర్వ్డ్ సర్ఫేసులు" : "Observed surfaces"}
            value={
              observedSurfaces.length
                ? observedSurfaces.join(" · ")
                : isTe ? "నివేదించలేదు" : "Not reported"
            }
          />
          <ReconstructionFooterSignal
            label={isTe ? "అన్‌అబ్జర్వ్డ్" : "Unobserved"}
            value={
              missingSurfaces.length
                ? missingSurfaces.join(" · ")
                : isTe ? "ఏవి నివేదించలేదు" : "None reported"
            }
          />
          <ReconstructionFooterSignal
            label={isTe ? "బౌండరీ / రీప్రొజెక్షన్" : "Boundary / reprojection"}
            value={`${boundaryError !== null ? `${boundaryError.toFixed(2)} px` : "—"} / ${reprojectionError !== null ? `${reprojectionError.toFixed(2)} px` : "—"}`}
          />
          <ReconstructionFooterSignal
            label={isTe ? "కవరేజ్" : "Coverage"}
            value={coveragePct !== null ? percentText(coveragePct) : "—"}
          />
        </div>
      </section>

      {recaptureRecommended ? (
        <section className="flex flex-col gap-3 rounded-[16px] border border-amber-200/90 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-300/10 dark:bg-amber-300/[0.035]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Camera size={13} className="shrink-0 text-amber-600 dark:text-amber-300" />
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
                {isTe ? "అదనపు ఫోటో ఆధారం అవసరం" : "Additional photo evidence recommended"}
              </p>
            </div>
            <p className="mt-1 text-[10px] font-black text-slate-800 dark:text-slate-200">
              {recaptureViewLabel || (isTe ? "బలహీనమైన వ్యూ" : "Weakest observed view")}
            </p>
            <p className="mt-1 max-w-4xl text-[8px] leading-4 text-slate-500 dark:text-slate-500">
              {recaptureReason ||
                (isTe
                  ? "కెమెరా కనెక్టివిటీ మరియు ఆకార ధృవీకరణను బలపరచడానికి సూచించిన కోణాన్ని మళ్లీ క్యాప్చర్ చేయండి."
                  : "Recapture the requested angle to strengthen camera connectivity and observed-shape validation.")}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenGuidedRecapture}
            disabled={!canOpenGuidedRecapture}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-amber-600 px-4 text-[8px] font-black uppercase tracking-[0.11em] text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-300 dark:text-[#241803]"
          >
            <Camera size={11} />
            {isTe ? "రీక్యాప్చర్ తెరవండి" : "Open recapture"}
          </button>
        </section>
      ) : null}

      {!shapeTargetMet && similarityPercent !== null ? (
        <p className="px-1 text-[7.5px] leading-4 text-slate-400 dark:text-slate-600">
          {isTe
            ? `Observed-view similarity ${similarityPercent.toFixed(1)}%. లక్ష్యం ≥ ${targetPercent.toFixed(0)}%. ఇది ధృవీకరణ లక్ష్యం మాత్రమే, హామీ కాదు.`
            : `Observed-view similarity ${similarityPercent.toFixed(1)}%. Target ≥ ${targetPercent.toFixed(0)}%. This is a validation target, not a guaranteed accuracy claim.`}
        </p>
      ) : null}
    </div>
  );
}

function ReconstructionMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "neutral";
}) {
  return (
    <div
      className={[
        "min-w-[112px] rounded-[12px] border px-3 py-2",
        tone === "good"
          ? "border-emerald-200/90 bg-emerald-50/70 dark:border-emerald-300/10 dark:bg-emerald-300/[0.035]"
          : "border-slate-200/90 bg-slate-50/75 dark:border-white/[0.06] dark:bg-white/[0.02]",
      ].join(" ")}
    >
      <p className="text-[6.5px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600">
        {label}
      </p>
      <p
        className={[
          "mt-0.5 truncate text-[8.5px] font-black",
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-slate-700 dark:text-slate-300",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function ReconstructionFooterSignal({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-b border-slate-200/80 px-4 py-3 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0 dark:border-white/[0.055]">
      <p className="text-[6.5px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600">
        {label}
      </p>
      <p className="mt-1 truncate text-[8.5px] font-black text-slate-700 dark:text-slate-300">
        {value}
      </p>
    </div>
  );
}

function MeasurementsTab({
  isTe,
  analysis,
  job,
  isAnalyzing,
  progress,
  dressedDimensions,
  visibleDefects,
  cutting,
  lengthCm,
  breadthCm,
  heightCm,
  volumeM3,
  surfaceAreaM2,
  confidence,
  accuracySummary,
  measurementAllowed,
  geometry,
  physL,
  physB,
  physH,
  setPhysL,
  setPhysB,
  setPhysH,
  decision,
  setDecision,
  remarks,
  setRemarks,
  submittingVerification,
  verificationFeedback,
  handleSubmitVerification,
  verifications,
  physVolM3,
  envelopePreviewAccuracy,
}: {
  isTe: boolean;
  analysis: BlockAnalysis | null;
  job: BlockAnalysis["job"];
  isAnalyzing: boolean;
  progress: number | null;
  dressedDimensions: { length_cm: number; breadth_cm: number; height_cm: number } | null;
  visibleDefects: DefectFinding[];
  cutting: BlockAnalysis["cutting"];
  lengthCm?: number | null;
  breadthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;
  surfaceAreaM2: number | null;
  confidence?: number | null;
  accuracySummary: ValidatedAccuracySummary;
  measurementAllowed: boolean;
  geometry: BlockAnalysis["geometry"];
  physL: string;
  physB: string;
  physH: string;
  setPhysL: (value: string) => void;
  setPhysB: (value: string) => void;
  setPhysH: (value: string) => void;
  decision: string;
  setDecision: (value: string) => void;
  remarks: string;
  setRemarks: (value: string) => void;
  submittingVerification: boolean;
  verificationFeedback: string | null;
  handleSubmitVerification: (event: React.FormEvent) => Promise<void>;
  verifications: ManualVerificationOut[];
  physVolM3: number;
  envelopePreviewAccuracy: number | null;
}) {
  const dimensionsReady =
    measurementAllowed &&
    typeof lengthCm === "number" &&
    typeof breadthCm === "number" &&
    typeof heightCm === "number";

  const effectiveMeshUrl =
    analysis?.mesh_3d_url ||
    (
      job?.id &&
      stringFromRecord(geometry, ["mesh_path"])
        ? `/api/v1/geometry/${job.id}/mesh`
        : null
    );

  const effectivePointsUrl =
    analysis?.points_3d_url ||
    (
      job?.id &&
      stringFromRecord(geometry, ["point_cloud_path"])
        ? `/api/v1/geometry/${job.id}/point-cloud`
        : null
    );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-black/[0.07] bg-[#090c10] shadow-[0_28px_80px_rgba(0,0,0,.16)] dark:border-white/[0.07]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#67e8f9]">
              {isTe ? "మెజర్‌మెంట్ 3D వ్యూ" : "Measurement 3D View"}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">
              {isTe ? "మొదట గ్రానైట్. తరువాత సంఖ్యలు." : "Granite first. Numbers second."}
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-white/35">
              {isTe
                ? "కొలతల ట్యాబ్ తెరిచిన వెంటనే నిజమైన రీకన్స్ట్రక్షన్ పైభాగంలో కనిపిస్తుంది. ధృవీకరించబడిన కొలతలే ప్రదర్శించబడతాయి."
                : "The real reconstruction stays at the top of Measurements. Dimension overlays appear only when metric geometry is validated."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={[
              "rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.11em]",
              measurementAllowed
                ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
                : "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
            ].join(" ")}>
              {measurementAllowed
                ? isTe ? "మెట్రిక్ గేట్ ఓపెన్" : "Metric gate open"
                : isTe ? "మెట్రిక్ గేట్ లాక్" : "Metric gate locked"}
            </span>
          </div>
        </div>

        <div className="relative min-h-[620px]">
          <PointCloud3DViewer
            jobId={job?.id}
            pointsUrl={effectivePointsUrl}
            meshUrl={effectiveMeshUrl}
            analysisRunning={isAnalyzing}
            analysisProgress={progress}
            analysisStage={job?.current_stage || null}
            dimensions={
              dimensionsReady
                ? {
                    length_cm: lengthCm!,
                    breadth_cm: breadthCm!,
                    height_cm: heightCm!,
                  }
                : null
            }
            dressedDimensions={dressedDimensions}
            defects={visibleDefects.map((defect) => ({
              ...defect,
              depth_status: defect.depth_status ?? undefined,
              measurement_provenance:
                defect.measurement_provenance ?? undefined,
              cutting_impact: defect.cutting_impact ?? undefined,
              geometry_region: defect.geometry_region ?? undefined,
            }))}
            cuttingSteps={cutting?.cutting_steps}
            orientations={cutting?.orientations}
            isDemo={job?.demo_simulated ?? false}
            provider={geometry?.reconstruction_provider}
            scenarios={cutting?.scenarios}
            photoEvidenceMatrix={analysis?.photo_evidence_matrix}
            reconstructionQuality={analysis?.reconstruction_quality}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <LuxurySection
            eyebrow={isTe ? "కొలతల ఓవerview" : "Measurement overview"}
            title={isTe ? "ధృవీకరించిన కొలతల సారాంశం" : "Validated measurement summary"}
            icon={<Ruler size={17} />}
          >
            {!measurementAllowed ? (
              <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/[0.055] p-3 text-[10px] leading-5 text-amber-900/70 dark:text-amber-100/60">
                {isTe
                  ? "మెట్రిక్ కొలతలకు రీకన్స్ట్రక్షన్ క్వాలిటీ గేట్ ఇంకా అనుమతి ఇవ్వలేదు. విలువలు ఊహించబడవు."
                  : "Metric measurement is not yet authorized by reconstruction quality. Values remain unavailable rather than guessed."}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LargeMetric
                label={isTe ? "పొడవు" : "Length"}
                value={measurementAllowed ? formatCm(lengthCm) : "—"}
              />
              <LargeMetric
                label={isTe ? "వెడల్పు" : "Breadth"}
                value={measurementAllowed ? formatCm(breadthCm) : "—"}
              />
              <LargeMetric
                label={isTe ? "ఎత్తు" : "Height"}
                value={measurementAllowed ? formatCm(heightCm) : "—"}
              />
              <LargeMetric
                label={isTe ? "వాల్యూమ్" : "Volume"}
                value={measurementAllowed ? formatM3(volumeM3) : "—"}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <OrthographicPanel
                title="FRONT"
                primary={
                  measurementAllowed
                    ? formatCm(lengthCm)
                    : "Awaiting metric geometry"
                }
                secondary={measurementAllowed ? formatCm(heightCm) : "—"}
              />
              <OrthographicPanel
                title="SIDE"
                primary={
                  measurementAllowed
                    ? formatCm(breadthCm)
                    : "Awaiting metric geometry"
                }
                secondary={measurementAllowed ? formatCm(heightCm) : "—"}
              />
              <OrthographicPanel
                title="TOP"
                primary={
                  measurementAllowed
                    ? formatCm(lengthCm)
                    : "Awaiting metric geometry"
                }
                secondary={measurementAllowed ? formatCm(breadthCm) : "—"}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InsightCard
                label="Surface area"
                value={formatM2(surfaceAreaM2)}
                detail="Observed geometry only where backend supports it"
              />
              <InsightCard
                label={isTe ? "పైప్‌లైన్ నమ్మకం" : "Pipeline confidence"}
                value={measurementAllowed ? percentText(confidence) : "Locked"}
                detail={
                  isTe
                    ? "విశ్లేషణ నాణ్యత మాత్రమే — భౌతిక ఖచ్చితత్వం కాదు"
                    : "Analysis quality only — not physical measurement accuracy"
                }
              />
              <InsightCard
                label="Geometry method"
                value={
                  stringFromRecord(geometry, [
                    "measurement_method",
                    "geometry_method",
                    "reconstruction_provider",
                  ]) || "Not reported"
                }
                detail="No UI-inferred method"
              />
            </div>
          </LuxurySection>

          <LuxurySection
            eyebrow={isTe ? "గ్రౌండ్ ట్రూత్" : "Physical ground truth"}
            title={isTe ? "నిజమైన కొలత ఖచ్చితత్వం" : "Validated measurement accuracy"}
            icon={<Target size={17} />}
          >
            {accuracySummary.available ? (
              <>
                <div
                  className={[
                    "rounded-[18px] border p-4",
                    accuracySummary.targetMet === true
                      ? "border-emerald-500/20 bg-emerald-500/[0.065]"
                      : "border-red-500/20 bg-red-500/[0.055]",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.13em] text-black/38 dark:text-white/38">
                        {isTe ? "80% ప్రతి అక్ష లక్ష్యం" : "80% per-axis target"}
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {accuracySummary.targetMet === true
                          ? isTe
                            ? "లక్ష్యం చేరింది"
                            : "Target met"
                          : isTe
                            ? "లక్ష్యం చేరలేదు"
                            : "Target not met"}
                      </p>
                    </div>

                    <span
                      className={[
                        "rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.09em]",
                        accuracySummary.targetMet === true
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-500/10 text-red-700 dark:text-red-300",
                      ].join(" ")}
                    >
                      Worst axis {percentText(accuracySummary.worstAxisPct)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LargeMetric
                    label={isTe ? "పొడవు ఖచ్చితత్వం" : "Length accuracy"}
                    value={percentText(accuracySummary.lengthPct)}
                  />
                  <LargeMetric
                    label={isTe ? "వెడల్పు ఖచ్చితత్వం" : "Breadth accuracy"}
                    value={percentText(accuracySummary.breadthPct)}
                  />
                  <LargeMetric
                    label={isTe ? "ఎత్తు ఖచ్చితత్వం" : "Height accuracy"}
                    value={percentText(accuracySummary.heightPct)}
                  />
                  <LargeMetric
                    label={isTe ? "సగటు అక్ష ఖచ్చితత్వం" : "Mean axis accuracy"}
                    value={percentText(accuracySummary.meanAxisPct)}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <InsightCard
                    label="Worst-axis accuracy"
                    value={percentText(accuracySummary.worstAxisPct)}
                    detail="One weak dimension cannot be hidden by a high average."
                  />
                  <InsightCard
                    label="Mean absolute error"
                    value={
                      accuracySummary.meanAbsoluteErrorCm !== null
                        ? `${accuracySummary.meanAbsoluteErrorCm.toFixed(2)} cm`
                        : "—"
                    }
                    detail="Average absolute L/B/H error against physical ground truth."
                  />
                  <InsightCard
                    label="MAPE"
                    value={percentText(accuracySummary.mapePct)}
                    detail="Mean absolute percentage error using verified physical dimensions."
                  />
                </div>

                <p className="mt-4 text-[9px] leading-5 text-black/42 dark:text-white/42">
                  {isTe
                    ? "ఈ accuracy అధికారి / టేప్ ద్వారా నమోదు చేసిన భౌతిక L/B/H తో పోల్చిన తర్వాత మాత్రమే లెక్కించబడుతుంది. Pipeline confidence మరియు silhouette IoU వేరు."
                    : "This accuracy is calculated only after comparison with officer/tape physical L/B/H. Pipeline confidence and silhouette IoU remain separate validation signals."}
                </p>
              </>
            ) : (
              <div className="rounded-[20px] border border-dashed border-black/10 p-5 dark:border-white/10">
                <p className="text-sm font-black">
                  {isTe
                    ? "భౌతిక కొలత ఖచ్చితత్వం ఇంకా ధృవీకరించలేదు"
                    : "Physical measurement accuracy is not validated yet"}
                </p>
                <p className="mt-2 text-[10px] leading-5 text-black/45 dark:text-white/45">
                  {isTe
                    ? "కుడి వైపు అధికారి / టేప్ Length, Breadth, Height నమోదు చేసిన తర్వాత మాత్రమే నిజమైన per-axis accuracy లెక్కించబడుతుంది."
                    : "Enter officer/tape Length, Breadth and Height in the verification panel. Only then will real per-axis accuracy be calculated."}
                </p>
              </div>
            )}
          </LuxurySection>
        </div>

        <LuxurySection
          eyebrow={isTe ? "అధికారిక చెక్" : "Officer verification"}
          title={isTe ? "ఫిజికల్ కొలతల ధృవీకరణ" : "Physical verification"}
          icon={<FileCheck size={17} />}
        >
          {verificationFeedback ? (
            <div className="mb-4 rounded-[17px] border border-black/[0.07] bg-black/[0.025] p-3 text-[10px] dark:border-white/[0.07] dark:bg-white/[0.025]">
              {verificationFeedback}
            </div>
          ) : null}

          <form onSubmit={handleSubmitVerification} className="space-y-3">
            <MeasurementInput label="Length (cm)" value={physL} onChange={setPhysL} />
            <MeasurementInput label="Breadth (cm)" value={physB} onChange={setPhysB} />
            <MeasurementInput label="Height (cm)" value={physH} onChange={setPhysH} />

            {physVolM3 > 0 ? (
              <div className="rounded-[17px] border border-[#0ea5e9]/16 bg-[#67e8f9]/[0.07] p-3 text-[10px] leading-5">
                Physical L×B×H envelope: <strong>{physVolM3.toFixed(4)} m³</strong>
                {envelopePreviewAccuracy !== null ? (
                  <span>
                    {" "}
                    · Preview envelope accuracy: {envelopePreviewAccuracy.toFixed(2)}%
                  </span>
                ) : null}
                <span className="mt-1 block text-[8px] text-black/42 dark:text-white/42">
                  This compares dimensional envelopes only. It is not true irregular RAW
                  granite mesh-volume accuracy.
                </span>
              </div>
            ) : null}

            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              className="w-full min-h-11 rounded-[15px] border border-black/10 bg-white/70 px-3 text-xs font-bold outline-none transition focus:border-[#0ea5e9]/45 focus:ring-4 focus:ring-[#67e8f9]/10 dark:border-white/10 dark:bg-white/[0.035] dark:text-[#fff9ec]"
            >
              <option value="VERIFIED">Verified</option>
              <option value="VERIFIED_WITH_CORRECTION">Verified with correction</option>
              <option value="REJECTED">Rejected</option>
              <option value="REQUIRES_REANALYSIS">Requires reanalysis</option>
            </select>

            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={4}
              placeholder="Officer remarks (optional)"
              className="w-full min-h-11 rounded-[15px] border border-black/10 bg-white/70 px-3 py-3 text-xs font-bold outline-none transition focus:border-[#0ea5e9]/45 focus:ring-4 focus:ring-[#67e8f9]/10 dark:border-white/10 dark:bg-white/[0.035] dark:text-[#fff9ec]"
            />

            <button
              type="submit"
              disabled={
                submittingVerification ||
                !parseFloat(physL) ||
                !parseFloat(physB) ||
                !parseFloat(physH)
              }
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[17px] bg-[#0b1420] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[#f0d89e] disabled:opacity-40 dark:bg-[#67e8f9] dark:text-[#06101b]"
            >
              {submittingVerification ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileCheck size={14} />
              )}
              {submittingVerification ? "Saving…" : "Save physical check"}
            </button>
          </form>

          {verifications.length > 0 ? (
            <div className="mt-4 rounded-[17px] border border-black/[0.07] bg-black/[0.022] p-3 dark:border-white/[0.07] dark:bg-white/[0.025]">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/36 dark:text-white/36">
                {isTe ? "తాజా భౌతిక వాలిడేషన్" : "Latest physical validation"}
              </p>
              <p className="mt-1 text-[10px] font-black">
                {accuracySummary.available
                  ? `${percentText(accuracySummary.meanAxisPct)} mean · ${percentText(accuracySummary.worstAxisPct)} worst axis`
                  : isTe
                    ? "ఈ పాత verification recordలో accuracy metrics లేవు."
                    : "This older verification record does not contain accuracy metrics."}
              </p>
              <p className="mt-1 text-[8px] text-black/38 dark:text-white/38">
                {isTe ? "మొత్తం verification records" : "Total verification records"}:{" "}
                {verifications.length}
              </p>
            </div>
          ) : null}
        </LuxurySection>
      </div>
    </div>
  );
}

function DefectsTab({
  isTe,
  images,
  defects,
  visibleDefects,
  physicalCavities,
  physicalCavityRecords,
  classification,
  onOpenPhoto,
}: {
  isTe: boolean;
  images: ImageOut[];
  defects: BlockAnalysis["defects"];
  visibleDefects: DefectFinding[];
  physicalCavities: PhysicalCavitySummary | null;
  physicalCavityRecords: PhysicalCavityRecord[];
  classification: BlockAnalysis["classification"];
  onOpenPhoto: (url: string) => void;
}) {
  const ordinaryFindings = visibleDefects.filter(
    (finding) => !finding.physical_cavity_id && !isLikelyCavity(finding),
  );

  const evidenceImagesForCavity = (cavity: PhysicalCavityRecord) => {
    const sourceIds = new Set((cavity.source_image_ids || []).map(String));
    const viewLabels = new Set(
      (cavity.evidence_views || []).map((value) => value.toUpperCase()),
    );

    return images.filter((image) => {
      if (sourceIds.has(String(image.id))) {
        return true;
      }

      const orientation = stringFromRecord(image, [
        "capture_side",
        "orientation",
        "side",
        "view_label",
      ]);

      return orientation
        ? viewLabels.has(orientation.toUpperCase())
        : false;
    });
  };

  return (
    <div className="space-y-5">
      {physicalCavities && physicalCavityRecords.length > 0 ? (
        <LuxurySection
          eyebrow={isTe ? "భౌతిక క్యావిటీలు" : "Physical cavity intelligence"}
          title={
            isTe
              ? "ఒకే రంధ్రాన్ని పలు ఫోటోలలో ఒకే భౌతిక రికార్డుగా చూపిస్తుంది"
              : "One physical cavity, all supporting views"
          }
          icon={<CircleDot size={17} />}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CommandMetric
              label={isTe ? "భౌతిక క్యావిటీలు" : "Physical cavities"}
              value={String(physicalCavities.physical_cavity_count)}
              detail="Worker-persisted physical records"
            />
            <CommandMetric
              label={isTe ? "మల్టీ-వ్యూ" : "Multi-view associated"}
              value={String(physicalCavities.multi_view_physical_cavity_count)}
              detail="Metric 3D evidence association"
            />
            <CommandMetric
              label={isTe ? "మెట్రిక్ కొలత" : "Metric measured"}
              value={String(
                physicalCavities.metric_measured_physical_cavity_count,
              )}
              detail="Observed geometry only"
            />
            <CommandMetric
              label={isTe ? "2D బలవంతపు విలీనాలు" : "Forced 2D merges"}
              value={String(physicalCavities.forced_2d_only_merges)}
              detail="Must remain 0"
            />
          </div>

          <div className="mt-5 space-y-4">
            {physicalCavityRecords.map((cavity, cavityIndex) => {
              const cavityImages = evidenceImagesForCavity(cavity);
              const multiView =
                cavity.association_status === "MULTIVIEW_ASSOCIATED";
              const openingWidth = cavity.opening_width_cm;
              const openingHeight = cavity.opening_height_cm;
              const openingArea = cavity.opening_area_cm2;
              const maxDepth = cavity.max_observed_depth_cm;
              const meanDepth = cavity.mean_observed_depth_cm;
              const visibleVolume = cavity.visible_cavity_volume_cm3;
              const cavityId =
                cavity.physical_cavity_id ||
                `CAVITY-${String(cavityIndex + 1).padStart(3, "0")}`;

              return (
                <motion.article
                  key={cavityId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: cavityIndex * 0.05 }}
                  className="overflow-hidden rounded-[24px] border border-[#0ea5e9]/16 bg-gradient-to-br from-[#0ea5e9]/[0.055] via-black/[0.015] to-transparent dark:from-[#d8b56b]/[0.055] dark:via-white/[0.018]"
                >
                  <div className="flex flex-col gap-4 border-b border-black/[0.06] p-4 dark:border-white/[0.06] lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black tracking-[-0.02em]">
                          {cavityId}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em]",
                            multiView
                              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300"
                              : "border-amber-500/20 bg-amber-500/[0.07] text-amber-700 dark:text-amber-300",
                          ].join(" ")}
                        >
                          {multiView ? "MULTI-VIEW ASSOCIATED" : "SINGLE VIEW"}
                        </span>
                        <span className="rounded-full border border-[#0ea5e9]/20 bg-[#0ea5e9]/[0.06] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#8a6525] dark:text-[#e4c57f]">
                          {cavity.association_confidence || "UNCONFIRMED"}
                        </span>
                      </div>

                      <p className="mt-2 max-w-3xl text-[9px] leading-4 text-black/45 dark:text-white/45">
                        {multiView
                          ? `${cavity.evidence_view_count ?? cavity.evidence_views.length} photographic views were associated using persisted metric 3D evidence.`
                          : "This cavity currently has one supporting photographic view. It is not promoted to multi-view evidence."}
                      </p>
                    </div>

                    <div className="text-left lg:text-right">
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
                        Internal continuation
                      </p>
                      <p className="mt-1 text-[10px] font-black text-amber-700 dark:text-amber-300">
                        {cavity.internal_continuation_status || "UNOBSERVED"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <MiniMetric
                          label="Opening width"
                          value={
                            typeof openingWidth === "number"
                              ? `${openingWidth.toFixed(2)} cm`
                              : "Unmeasured"
                          }
                        />
                        <MiniMetric
                          label="Opening height"
                          value={
                            typeof openingHeight === "number"
                              ? `${openingHeight.toFixed(2)} cm`
                              : "Unmeasured"
                          }
                        />
                        <MiniMetric
                          label="Opening area"
                          value={
                            typeof openingArea === "number"
                              ? `${openingArea.toFixed(2)} cm²`
                              : "Unmeasured"
                          }
                        />
                        <MiniMetric
                          label="Maximum observed depth"
                          value={
                            typeof maxDepth === "number"
                              ? `${maxDepth.toFixed(2)} cm`
                              : "UNOBSERVED"
                          }
                        />
                        <MiniMetric
                          label="Mean observed depth"
                          value={
                            typeof meanDepth === "number"
                              ? `${meanDepth.toFixed(2)} cm`
                              : "UNOBSERVED"
                          }
                        />
                        <MiniMetric
                          label="Visible cavity volume"
                          value={
                            typeof visibleVolume === "number"
                              ? `${visibleVolume.toFixed(2)} cm³`
                              : "Unmeasured"
                          }
                        />
                      </div>

                      <div className="mt-3 rounded-[16px] border border-amber-500/15 bg-amber-500/[0.045] p-3">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">
                          Evidence boundary
                        </p>
                        <p className="mt-1 text-[9px] leading-4 text-black/48 dark:text-white/48">
                          {cavity.true_maximum_depth_status ||
                            "UNKNOWN_UNLESS_CAVITY_BOTTOM_IS_FULLY_OBSERVED"}
                          . Visible cavity volume is an observed-volume approximation,
                          not a hidden or watertight internal volume.
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
                        Supporting views
                      </p>

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {cavityImages.length > 0 ? (
                          cavityImages.slice(0, 6).map((image) => {
                            const source = image.image_url
                              ? apiAssetUrl(image.image_url)
                              : null;
                            const side =
                              stringFromRecord(image, [
                                "capture_side",
                                "orientation",
                                "side",
                                "view_label",
                              ]) || "PHOTO";

                            return (
                              <button
                                key={image.id}
                                type="button"
                                onClick={() => source && onOpenPhoto(source)}
                                className="overflow-hidden rounded-[14px] border border-black/[0.07] bg-black/[0.025] text-left transition hover:border-[#0ea5e9]/35 dark:border-white/[0.07] dark:bg-white/[0.025]"
                              >
                                <div className="aspect-square bg-black/5 p-1 dark:bg-black/20">
                                  {source ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={source}
                                      alt=""
                                      className="h-full w-full rounded-[10px] object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center">
                                      <Camera
                                        size={15}
                                        className="text-black/25 dark:text-white/25"
                                      />
                                    </div>
                                  )}
                                </div>
                                <p className="truncate px-2 py-1.5 text-[7px] font-black uppercase tracking-[0.08em]">
                                  {side}
                                </p>
                              </button>
                            );
                          })
                        ) : (
                          <div className="col-span-3 rounded-[14px] border border-dashed border-black/10 p-3 text-[8px] text-black/40 dark:border-white/10 dark:text-white/40">
                            Evidence view identifiers are preserved, but matching
                            local image cards are unavailable.
                          </div>
                        )}
                      </div>

                      {cavity.evidence_views.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {cavity.evidence_views.map((view) => (
                            <span
                              key={`${cavityId}-${view}`}
                              className="rounded-full border border-black/[0.07] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-black/45 dark:border-white/[0.07] dark:text-white/45"
                            >
                              {view}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </LuxurySection>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <LuxurySection
          eyebrow={isTe ? "ఫోటో ఆధారాలు" : "Photo-first inspection"}
          title={isTe ? "కనిపించే లోపాల ఆధారాలు" : "Visible defect evidence"}
          icon={<ShieldAlert size={17} />}
        >
          <p className="text-xs leading-5 text-black/48 dark:text-white/48">
            {isTe
              ? "లోపాల ట్యాబ్‌లో ఫోటో ఆధారం మొదట. ఒకే భౌతిక క్యావిటీ పలు ఫోటోలలో కనిపించినా ఒక్క రికార్డుగా చూపబడుతుంది."
              : "Defects remain photo-first. Repeated views of one worker-associated physical cavity are grouped above instead of appearing as duplicate defect cards."}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {images.slice(0, 9).map((image, index) => {
              const source = image.image_url ? apiAssetUrl(image.image_url) : null;
              const orientation = stringFromRecord(image, [
                "capture_side",
                "orientation",
                "side",
                "view_label",
              ]);

              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => source && onOpenPhoto(source)}
                  className="group overflow-hidden rounded-[20px] border border-black/[0.07] bg-black/[0.025] text-left transition hover:border-[#0ea5e9]/28 dark:border-white/[0.07] dark:bg-white/[0.025]"
                >
                  <div className="aspect-[4/3] bg-black/5 p-1.5 dark:bg-black/20">
                    {source ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={source}
                        alt=""
                        className="h-full w-full rounded-[15px] object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Camera
                          size={20}
                          className="text-black/25 dark:text-white/25"
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em]">
                      {orientation ||
                        `PHOTO_${String(index + 1).padStart(3, "0")}`}
                    </p>
                    <p className="mt-1 text-[8px] text-black/38 dark:text-white/38">
                      Original visual evidence
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </LuxurySection>

        <aside className="space-y-5">
          <LuxurySection
            eyebrow={isTe ? "ఇతర ఫైండింగ్స్" : "Other findings"}
            title={isTe ? "ఇతర కనిపించిన లోపాలు" : "Other visible findings"}
            icon={<ShieldAlert size={17} />}
          >
            {defects ? (
              ordinaryFindings.length > 0 ? (
                <div className="space-y-3">
                  {ordinaryFindings.slice(0, 12).map((defect, index) => (
                    <div
                      key={`${getDefectLabel(defect, index, isTe)}-${index}`}
                      className="rounded-[18px] border border-black/[0.07] bg-black/[0.02] p-3 dark:border-white/[0.07] dark:bg-white/[0.025]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black">
                          {getDefectLabel(defect, index, isTe)}
                        </p>
                        <span className="rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-red-700 dark:text-red-300">
                          {defect.severity || "VISIBLE"}
                        </span>
                      </div>
                      <p className="mt-2 text-[8.5px] leading-4 text-black/40 dark:text-white/40">
                        Visible photographic finding only. Hidden continuation is
                        not inferred.
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No additional visible findings were reported." />
              )
            ) : (
              <EmptyState text="Defect analysis is unavailable." />
            )}
          </LuxurySection>

          <LuxurySection
            eyebrow="Classification"
            title={isTe ? "గ్రానైట్ వర్గీకరణ" : "Granite classification"}
            icon={<Target size={17} />}
          >
            <p className="text-xl font-black">
              {classification?.classification || "Not confirmed"}
            </p>
            <p className="mt-1 text-[10px] text-black/42 dark:text-white/42">
              Confidence: {percentText(classification?.confidence)}
            </p>
          </LuxurySection>
        </aside>
      </div>
    </div>
  );
}

function CuttingTab({
  isTe,
  job,
  analysis,
  cutting,
  lengthCm,
  breadthCm,
  heightCm,
  selectedOrientationIdx,
  setSelectedOrientationIdx,
  usableVolume,
  cuttingRecoveryPct,
  cuttingWastePct,
}: {
  isTe: boolean;
  job: BlockAnalysis["job"];
  analysis: BlockAnalysis | null;
  cutting: BlockAnalysis["cutting"];
  lengthCm?: number | null;
  breadthCm?: number | null;
  heightCm?: number | null;
  selectedOrientationIdx: number;
  setSelectedOrientationIdx: (value: number) => void;
  usableVolume: number | null;
  cuttingRecoveryPct: number | null;
  cuttingWastePct: number | null;
}) {
  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <LuxurySection
        eyebrow={isTe ? "కట్టింగ్ సిమ్యులేషన్" : "Cutting simulation"}
        title={isTe ? "ప్రతిపాదిత డ్రెస్సింగ్ & కట్టింగ్" : "Proposed dressing & cutting"}
        icon={<Scissors size={17} />}
        flush
      >
        <div className="border-b border-black/[0.06] px-5 py-4 text-xs leading-5 text-black/48 dark:border-white/[0.06] dark:text-white/48">
          {isTe
            ? "ఇది సిమ్యులేషన్. పోస్ట్-కట్ ఫోటో ఆధారం లేకుండా భౌతికంగా కట్ అయిందని చూపించవద్దు."
            : "This is a proposed/simulated cutting plan. It must not be presented as physically executed until post-cut photographic evidence verifies it."}
        </div>

        <div className="p-2 sm:p-3">
          <Cutting3DViewer
            jobId={job?.id}
            meshUrl={
              analysis?.mesh_3d_url ||
              (
                analysis?.job?.id &&
                stringFromRecord(analysis?.geometry, ["mesh_path"])
                  ? `/api/v1/geometry/${analysis.job.id}/mesh`
                  : null
              )
            }
            dimensions={
              typeof lengthCm === "number" &&
              typeof breadthCm === "number" &&
              typeof heightCm === "number"
                ? {
                    length_cm: lengthCm,
                    breadth_cm: breadthCm,
                    height_cm: heightCm,
                  }
                : null
            }
            cutting={cutting}
            selectedOrientationIndex={selectedOrientationIdx}
            onSelectOrientation={setSelectedOrientationIdx}
          />
        </div>
      </LuxurySection>

      <aside className="space-y-5">
        <LuxurySection
          eyebrow="Yield"
          title={isTe ? "కట్టింగ్ సారాంశం" : "Cutting summary"}
          icon={<Scissors size={17} />}
        >
          <DataRow label="Usable volume" value={usableVolume !== null ? `${usableVolume.toFixed(4)} m³` : "—"} />
          <DataRow label="Recovery" value={percentText(cuttingRecoveryPct)} />
          <DataRow label="Waste" value={percentText(cuttingWastePct)} />
          <DataRow
            label="Scenario"
            value={
              Array.isArray(cutting?.orientations)
                ? `${selectedOrientationIdx + 1}/${cutting.orientations.length}`
                : "—"
            }
          />
        </LuxurySection>

        <LuxurySection
          eyebrow="Truth state"
          title={isTe ? "కట్టింగ్ ప్రొవెనెన్స్" : "Cut provenance"}
          icon={<ShieldCheck size={17} />}
        >
          <p className="text-[10px] leading-5 text-black/45 dark:text-white/45">
            Proposed cut planes, removed regions and yield changes should come from the backend cutting result. Post-cut geometry requires a new photographic capture and reconstruction.
          </p>
        </LuxurySection>
      </aside>
    </div>
  );
}

function RecoveryTab({
  isTe,
  rawVolume,
  usableVolume,
  recoveryPct,
  wastagePct,
  irregularityRatio,
  seigniorage,
}: {
  isTe: boolean;
  rawVolume?: number | null;
  usableVolume: number | null;
  recoveryPct: number | null;
  wastagePct: number | null;
  irregularityRatio: number | null;
  seigniorage: BlockAnalysis["seigniorage"];
}) {
  const removedVolume =
    typeof rawVolume === "number" &&
    rawVolume > 0 &&
    typeof usableVolume === "number" &&
    usableVolume >= 0
      ? Math.max(0, rawVolume - usableVolume)
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <LuxurySection
          eyebrow={isTe ? "మెటీరియల్ ఫ్లో" : "Material flow"}
          title={isTe ? "రా → డ్రెస్సింగ్ → రికవరీ" : "Raw → dressing → recoverable"}
          icon={<PackageCheck size={17} />}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <FlowMetric title="Raw volume" value={formatM3(rawVolume)} status="Observed / measured" />
            <FlowMetric title="Recoverable" value={usableVolume !== null ? `${usableVolume.toFixed(4)} m³` : "Awaiting validated cut geometry"} status="Proposed result" />
            <FlowMetric title="Removed" value={removedVolume !== null ? `${removedVolume.toFixed(4)} m³` : "Unresolved"} status="Derived only when both volumes exist" />
            <FlowMetric title="Unknown" value="Not fabricated" status="Unobserved material stays unknown" />
          </div>
        </LuxurySection>

        <LuxurySection
          eyebrow={isTe ? "వేస్టేజ్" : "Waste analysis"}
          title={isTe ? "రికవరీ & వేస్ట్" : "Recovery & wastage"}
          icon={<ScanLine size={17} />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <LargeMetric label="Recovery" value={percentText(recoveryPct)} />
            <LargeMetric label="Waste" value={percentText(wastagePct)} />
            <LargeMetric label="Irregularity" value={percentText(irregularityRatio)} />
          </div>

          <p className="mt-4 text-[10px] leading-5 text-black/44 dark:text-white/44">
            Recovery and waste remain unavailable until the backend has validated raw geometry and cut outputs. The UI does not manufacture percentages.
          </p>
        </LuxurySection>
      </div>

      <aside className="space-y-5">
        <LuxurySection
          eyebrow={isTe ? "అంచనా" : "Assessment"}
          title={isTe ? "సెయినియరేజ్" : "Seigniorage"}
          icon={<FileCheck size={17} />}
        >
          <DataRow
            label="Assessment"
            value={stringFromRecord(seigniorage, ["assessment_kind", "status"]) || "Not reported"}
          />
          <DataRow
            label="Indicative amount"
            value={
              numberFromRecord(seigniorage, ["indicative_amount", "amount"]) !== null
                ? String(numberFromRecord(seigniorage, ["indicative_amount", "amount"]))
                : "—"
            }
          />
          <DataRow
            label="Rate"
            value={
              numberFromRecord(seigniorage, ["rate_per_tonne", "rate"]) !== null
                ? String(numberFromRecord(seigniorage, ["rate_per_tonne", "rate"]))
                : "—"
            }
          />

          <p className="mt-3 text-[9px] leading-4 text-black/42 dark:text-white/42">
            AI-assisted indicative assessment only. Official verification remains separate.
          </p>
        </LuxurySection>

        <LuxurySection
          eyebrow="Dispatch"
          title={isTe ? "తదుపరి దశ" : "Next physical stage"}
          icon={<Truck size={17} />}
        >
          <p className="text-[10px] leading-5 text-black/45 dark:text-white/45">
            Dispatch should only follow the verified record, post-cut evidence where required, and authoritative assessment workflow.
          </p>
        </LuxurySection>
      </aside>
    </div>
  );
}

function EvidenceTab({
  isTe,
  images,
  analysis,
  physicalCavities,
  observedSurfaces,
  missingSurfaces,
  onOpenPhoto,
}: {
  isTe: boolean;
  images: ImageOut[];
  analysis: BlockAnalysis | null;
  physicalCavities: PhysicalCavitySummary | null;
  observedSurfaces: string[];
  missingSurfaces: string[];
  onOpenPhoto: (url: string) => void;
}) {
  return (
    <div className="space-y-5">
      {physicalCavities && physicalCavities.physical_cavity_count > 0 ? (
        <LuxurySection
          eyebrow={isTe ? "క్యావిటీ ఆధార మ్యాప్" : "Cavity evidence map"}
          title={
            isTe
              ? "భౌతిక క్యావిటీ ↔ ఫోటో ఆధారాలు"
              : "Physical cavity ↔ photographic evidence"
          }
          icon={<CircleDot size={17} />}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {physicalCavities.records.map((cavity, index) => (
              <div
                key={
                  cavity.physical_cavity_id ||
                  `physical-cavity-${index}`
                }
                className="rounded-[20px] border border-black/[0.07] bg-black/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.025]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-black">
                    {cavity.physical_cavity_id ||
                      `CAVITY-${String(index + 1).padStart(3, "0")}`}
                  </p>
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-[7px] font-black uppercase tracking-[0.09em]",
                      cavity.association_status === "MULTIVIEW_ASSOCIATED"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    ].join(" ")}
                  >
                    {cavity.association_status || "SINGLE_VIEW_ONLY"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(cavity.evidence_views || []).map((view) => (
                    <span
                      key={`${cavity.physical_cavity_id}-${view}`}
                      className="rounded-full border border-[#0ea5e9]/18 bg-[#0ea5e9]/[0.045] px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-[#86601f] dark:text-[#e2c27b]"
                    >
                      {view}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-[8.5px] leading-4 text-black/42 dark:text-white/42">
                  {cavity.evidence_view_count ?? cavity.evidence_views.length} evidence
                  view(s) · Internal continuation{" "}
                  {cavity.internal_continuation_status || "UNOBSERVED"}.
                </p>
              </div>
            ))}
          </div>
        </LuxurySection>
      ) : null}

      <LuxurySection
        eyebrow={isTe ? "కాంటాక్ట్ షీట్" : "Contact sheet"}
        title={isTe ? "అసలు ఫోటో ఆధారాలు" : "Original photographic evidence"}
        icon={<Images size={17} />}
      >
        {images.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {images.map((image, index) => {
              const source = image.image_url ? apiAssetUrl(image.image_url) : null;
              const side =
                stringFromRecord(image, [
                  "capture_side",
                  "orientation",
                  "side",
                  "view_label",
                ]) || `PHOTO_${String(index + 1).padStart(3, "0")}`;

              const quality = numberFromRecord(image, ["quality_score"]);
              const accepted =
                (image as unknown as Record<string, unknown>).accepted !== false;

              const evidenceRow = (analysis?.photo_evidence_matrix || []).find((row) => {
                const record = recordFromUnknown(row);
                const evidencePhotoId = String(
                  record.photo_id ?? record.observation_id ?? "",
                );
                return evidencePhotoId === String(image.id);
              });
              const evidenceRecord = recordFromUnknown(evidenceRow);
              const viewIou = numberFromRecord(evidenceRecord, ["silhouette_iou"]);
              const viewBoundary = numberFromRecord(evidenceRecord, ["boundary_error_px"]);
              const weakView = evidenceRecord.weak_view === true;
              const shapeSource = stringFromRecord(evidenceRecord, ["shape_validation_source"]);

              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => source && onOpenPhoto(source)}
                  className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-black/[0.02] text-left transition hover:border-[#b98b37]/25 dark:border-white/[0.07] dark:bg-white/[0.025]"
                >
                  <div className="aspect-[4/3] bg-black/5 p-1.5 dark:bg-black/20">
                    {source ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={source}
                        alt=""
                        className="h-full w-full rounded-[16px] object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Camera size={22} className="text-black/25 dark:text-white/25" />
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[10px] font-black">{side}</p>
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em]",
                          accepted
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-red-500/10 text-red-700 dark:text-red-300",
                        ].join(" ")}
                      >
                        {accepted ? "Accepted" : "Rejected"}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <MiniMetric
                        label="Capture quality"
                        value={quality !== null ? percentText(quality) : "—"}
                      />
                      <MiniMetric
                        label="Shape IoU"
                        value={viewIou !== null ? percentText(viewIou) : "—"}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-black/38 dark:text-white/38">
                      <span>
                        Boundary: {viewBoundary !== null ? `${viewBoundary.toFixed(2)} px` : "—"}
                      </span>
                      <span className={weakView ? "font-black text-amber-700 dark:text-amber-300" : ""}>
                        {weakView ? "Weak view" : shapeSource === "PERSISTED_REAL_MESH_RENDER_BACK" ? "Mesh validated" : "Evidence"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState text="No photo evidence is available." />
        )}
      </LuxurySection>

      <div className="grid gap-5 xl:grid-cols-3">
        <LuxurySection
          eyebrow="Observed"
          title={isTe ? "కనిపించిన సర్ఫేసెస్" : "Observed surfaces"}
          icon={<Eye size={17} />}
        >
          <SurfaceList title="Observed" values={observedSurfaces} tone="good" />
        </LuxurySection>

        <LuxurySection
          eyebrow="Unknown"
          title={isTe ? "కనిపించని సర్ఫేసెస్" : "Unobserved surfaces"}
          icon={<ShieldAlert size={17} />}
        >
          <SurfaceList title="Unobserved" values={missingSurfaces} tone="warn" />
        </LuxurySection>

        <LuxurySection
          eyebrow="Provenance"
          title={isTe ? "AI ఆధారాల స్థితి" : "AI evidence state"}
          icon={<ShieldCheck size={17} />}
        >
          <DataRow
            label="Photo matrix"
            value={analysis?.photo_evidence_matrix?.length ? `${analysis.photo_evidence_matrix.length} entries` : "Unavailable"}
          />
          <DataRow label="Point artifact" value={analysis?.points_3d_url ? "Available" : "Unavailable"} />
          <DataRow label="Mesh artifact" value={analysis?.mesh_3d_url ? "Available" : "Unavailable"} />
        </LuxurySection>
      </div>
    </div>
  );
}

function ReportTab({
  isTe,
  block,
  analysis,
  images,
  visibleDefects,
  measurementAllowed,
  lengthCm,
  breadthCm,
  heightCm,
  volumeM3,
  accuracySummary,
  observedSurfaces,
  missingSurfaces,
  aiExplanation,
}: {
  isTe: boolean;
  block: BlockOut;
  analysis: BlockAnalysis | null;
  images: ImageOut[];
  visibleDefects: DefectFinding[];
  measurementAllowed: boolean;
  lengthCm?: number | null;
  breadthCm?: number | null;
  heightCm?: number | null;
  volumeM3?: number | null;
  accuracySummary: ValidatedAccuracySummary;
  observedSurfaces: string[];
  missingSurfaces: string[];
  aiExplanation: BlockAnalysis["ai_explanation"];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="rounded-[30px] border border-[#b98b38]/16 bg-[#fffdf7] p-5 shadow-[0_24px_80px_rgba(66,43,4,.09)] dark:border-[#67e8f9]/12 dark:bg-[#f8f2e5] dark:text-[#0b1420] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[#9e7a36]/16 pb-5">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#9a7128]">
              GraniteMeasure AI
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em]">
              Block Analysis Report
            </h2>
            <p className="mt-1 text-xs text-black/45">
              {block.block_code || block.id}
            </p>
          </div>

          <span className="rounded-full border border-amber-700/15 bg-amber-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">
            AI-Assisted Indicative Analysis
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PaperMetric label="Length" value={measurementAllowed ? formatCm(lengthCm) : "Unavailable"} />
          <PaperMetric label="Breadth" value={measurementAllowed ? formatCm(breadthCm) : "Unavailable"} />
          <PaperMetric label="Height" value={measurementAllowed ? formatCm(heightCm) : "Unavailable"} />
          <PaperMetric label="Volume" value={measurementAllowed ? formatM3(volumeM3) : "Unavailable"} />
        </div>

        <div className="mt-7 grid gap-6 md:grid-cols-2">
          <PaperSection title="Evidence">
            <PaperRow label="Photos" value={String(images.length)} />
            <PaperRow label="Observed surfaces" value={observedSurfaces.length ? observedSurfaces.join(", ") : "Not reported"} />
            <PaperRow label="Unobserved surfaces" value={missingSurfaces.length ? missingSurfaces.join(", ") : "None reported"} />
          </PaperSection>

          <PaperSection title="Inspection">
            <PaperRow label="Visible findings" value={String(visibleDefects.length)} />
            <PaperRow label="Reconstruction" value={analysis?.mesh_3d_url ? "Mesh artifact available" : analysis?.points_3d_url ? "Sparse evidence only" : "Unavailable"} />
            <PaperRow label="Metric gate" value={measurementAllowed ? "Authorized" : "Not authorized"} />
            <PaperRow
              label="Pipeline confidence"
              value={measurementAllowed ? percentText(analysis?.measurement?.measurement_confidence) : "Locked"}
            />
            <PaperRow
              label="Physical measurement accuracy"
              value={
                accuracySummary.available
                  ? `${percentText(accuracySummary.meanAxisPct)} mean · ${percentText(accuracySummary.worstAxisPct)} worst axis`
                  : "Not physically validated"
              }
            />
            <PaperRow
              label="80% per-axis target"
              value={
                accuracySummary.available
                  ? accuracySummary.targetMet === true
                    ? "Met"
                    : "Not met"
                  : "Not evaluated"
              }
            />
          </PaperSection>
        </div>

        {aiExplanation?.summary ? (
          <div className="mt-7 rounded-[18px] border border-[#9f7934]/14 bg-[#9f7934]/[0.04] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8d6724]">
              Analysis summary
            </p>
            <p className="mt-2 text-xs leading-6 text-black/65">
              {aiExplanation.summary}
            </p>
          </div>
        ) : null}

        <div className="mt-7 border-t border-[#9e7934]/15 pt-5 text-[9px] leading-5 text-black/42">
          This report is based on available photographic evidence and persisted AI analysis results. Pipeline confidence and reconstruction IoU are not physical measurement accuracy. Physical accuracy is shown only after officer/tape L/B/H ground truth is recorded. Unobserved surfaces and hidden internal conditions are not inferred.
        </div>
      </div>

      <aside className="space-y-5">
        <LuxurySection
          eyebrow="Assistant"
          title={isTe ? "రిపోర్ట్ వివరణ" : "Report explanation"}
          icon={<Sparkles size={17} />}
        >
          <AIAssistantChat blockId={block.id} initialSummary={aiExplanation?.summary} />
        </LuxurySection>

        <LuxurySection
          eyebrow="Export"
          title={isTe ? "రిపోర్ట్ అవుట్‌పుట్స్" : "Report outputs"}
          icon={<Download size={17} />}
        >
          <p className="text-[10px] leading-5 text-black/45 dark:text-white/45">
            Export actions should only be enabled where a real backend artifact exists. This redesign does not create fake PDF, PLY or DXF downloads.
          </p>
        </LuxurySection>
      </aside>
    </div>
  );
}



function AnalysisProcessExperience({
  images,
  analysis,
  isTe,
  blockCode,
}: {
  images: ImageOut[];
  analysis: BlockAnalysis | null;
  isTe: boolean;
  blockCode?: string;
}) {
  const job = analysis?.job;
  const geometry = analysis?.geometry;
  const measurement = analysis?.measurement;

  const acceptedImages = images.filter((image) => {
    const record = image as unknown as Record<string, unknown>;
    return record.rejected !== true;
  });

  const imageCount = acceptedImages.length;
  const minimumReady = imageCount >= 5;

  const geometryRecord = recordFromUnknown(geometry);
  const qualityRecord = recordFromUnknown(analysis?.reconstruction_quality);

  const registeredCameras =
    numberFromRecord(qualityRecord, [
      "registered_camera_count",
      "registered_cameras",
      "camera_count",
    ]) ?? 0;

  const featureMatches =
    numberFromRecord(qualityRecord, [
      "feature_match_count",
      "matched_feature_count",
      "total_feature_matches",
    ]) ?? 0;

  const pointCount =
    numberFromRecord(qualityRecord, [
      "dense_point_count",
      "point_count",
      "reconstructed_point_count",
    ]) ??
    numberFromRecord(geometryRecord, [
      "point_count",
      "observed_point_count",
    ]) ??
    0;

  const hasPoints = Boolean(
    analysis?.points_3d_url ||
      stringFromRecord(geometry, [
        "point_cloud_path",
        "point_cloud_url",
        "dense_point_cloud_path",
      ]),
  );

  const hasMesh = Boolean(
    analysis?.mesh_3d_url ||
      stringFromRecord(geometry, [
        "mesh_path",
        "mesh_url",
        "textured_mesh_path",
      ]),
  );

  const measurementReady = Boolean(
    measurement?.length_cm != null &&
      measurement?.breadth_cm != null &&
      measurement?.height_cm != null,
  );

  const backendStage = String(job?.current_stage || "").toLowerCase();
  const backendProgress =
    typeof job?.progress_percent === "number"
      ? Math.max(0, Math.min(100, job.progress_percent))
      : null;

  const stageSignals = [
    {
      id: "photos",
      icon: Images,
      title: isTe ? "ఫోటోలు స్వీకరించాం" : "Photos received",
      detail: minimumReady
        ? `${imageCount} ${isTe ? "ఫోటోలు — 3D ప్రయత్నం ప్రారంభించడానికి సరిపోతాయి" : "photos — minimum reconstruction gate passed"}`
        : `${imageCount}/5 ${isTe ? "ఫోటోలు" : "photos"}`,
      ready: minimumReady,
      active: !minimumReady,
    },
    {
      id: "features",
      icon: Sparkles,
      title: job?.demo_simulated
        ? isTe ? "ధృవీకరించిన ఆధారాల మ్యాచ్" : "Verified evidence match"
        : isTe ? "ఫీచర్ కనెక్షన్లు" : "Feature connections",
      detail:
        job?.demo_simulated
          ? isTe
            ? "అదే ఫోటోలు, అదే క్యాప్చర్ సైడ్లు మరియు అదే కాలిబ్రేషన్‌ను ధృవీకరిస్తున్నాం"
            : "Verifying the exact photos, capture-side labels and calibration context"
          : featureMatches > 0
          ? `${Math.round(featureMatches).toLocaleString()} ${isTe ? "మ్యాచులు" : "matches"}`
          : isTe
            ? "ఒకే గ్రానైట్‌పై ఉన్న సహజ నమూనాలను ఫోటోల మధ్య కలుపుతున్నాం"
            : "Linking natural granite patterns across the uploaded views",
      ready: featureMatches > 0 || hasPoints || hasMesh,
      active:
        backendStage.includes("match") ||
        backendStage.includes("feature") ||
        (!hasPoints && minimumReady),
    },
    {
      id: "camera",
      icon: Camera,
      title: job?.demo_simulated
        ? isTe ? "ధృవీకరించిన కెమెరా పరిష్కారం" : "Verified camera solution"
        : isTe ? "కెమెరా సంబంధాలు" : "Camera relationships",
      detail:
        job?.demo_simulated
          ? isTe
            ? "అసలు పూర్తి విశ్లేషణలో నమోదైన కెమెరా సంబంధాలను లోడ్ చేస్తున్నాం"
            : "Loading the registered camera solution from the original full analysis"
          : registeredCameras > 0
          ? `${Math.round(registeredCameras)} ${isTe ? "వ్యూలు రిజిస్టర్ అయ్యాయి" : "views registered"}`
          : isTe
            ? "వేర్వేరు కోణాలను ఒకే 3D స్థలంలో అమర్చుతున్నాం"
            : "Aligning the different sides into one shared 3D space",
      ready: registeredCameras >= 2 || hasPoints || hasMesh,
      active:
        backendStage.includes("camera") ||
        backendStage.includes("pose"),
    },
    {
      id: "shape",
      icon: ScanLine,
      title: job?.demo_simulated
        ? isTe ? "ధృవీకరించిన 3D డిజిటల్ ట్విన్" : "Verified 3D Digital Twin"
        : isTe ? "3D ఆకారం నిర్మాణం" : "3D shape formation",
      detail: job?.demo_simulated && !hasMesh
        ? isTe
          ? "ఈ ఖచ్చితమైన ఫోటోలతో ముందుగా రూపొందించిన అబ్జర్వ్డ్ మెష్‌ను లోడ్ చేస్తున్నాం"
          : "Restoring the observed irregular mesh previously computed from these exact photos"
        : hasMesh
        ? isTe
          ? "అబ్జర్వ్డ్ ఉపరితల మెష్ సిద్ధంగా ఉంది"
          : "Observed-surface mesh is available"
        : hasPoints
          ? `${Math.round(pointCount).toLocaleString()} ${isTe ? "3D పాయింట్లతో ఆకారం నిర్మిస్తున్నాం" : "3D points feeding surface reconstruction"}`
          : isTe
            ? "5+ ఫోటోల సిల్హౌట్ మరియు మల్టీ-వ్యూ ఆధారాలతో ఆకారాన్ని నిర్మిస్తున్నాం"
            : "Forming the best evidence-supported shape from 5+ multi-side photos",
      ready: hasMesh,
      active:
        backendStage.includes("reconstruct") ||
        backendStage.includes("mesh") ||
        backendStage.includes("point") ||
        (minimumReady && !hasMesh),
    },
    {
      id: "metric",
      icon: Ruler,
      title: job?.demo_simulated
        ? isTe ? "ధృవీకరించిన మెట్రిక్ ఫలితాలు" : "Verified metric results"
        : isTe ? "మెట్రిక్ చెక్" : "Metric check",
      detail: measurementReady
        ? `${measurement?.length_cm?.toFixed(1)} × ${measurement?.breadth_cm?.toFixed(1)} × ${measurement?.height_cm?.toFixed(1)} cm`
        : isTe
          ? "3D ఆకారం ఏర్పడిన తర్వాత స్కేల్ మరియు కొలతను ధృవీకరిస్తాం"
          : "Scale and dimensions are validated after geometry is formed",
      ready: measurementReady,
      active:
        backendStage.includes("metric") ||
        backendStage.includes("measure"),
    },
    {
      id: "finish",
      icon: CheckCircle2,
      title: isTe ? "డిజిటల్ ట్విన్ సిద్ధం" : "Digital Twin ready",
      detail: hasMesh
        ? isTe
          ? "రీకన్స్ట్రక్షన్ ఫలితం బ్లాక్ వర్క్‌స్పేస్‌కు పంపబడుతుంది"
          : "The reconstructed result will open in the block workspace"
        : isTe
          ? "అందుబాటులో ఉన్న 5+ ఫోటోలతో ఉత్తమ 3D ఫలితాన్ని నిర్మిస్తున్నాం"
          : "Building the strongest 3D result supported by the available 5+ images",
      ready: hasMesh && String(job?.state || "").toUpperCase() === "COMPLETED",
      active: hasMesh,
    },
  ];

  const activeIndex = Math.max(
    0,
    stageSignals.findIndex((stage) => !stage.ready && stage.active),
  );

  const visiblePhotos = acceptedImages.slice(0, 8);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eef6fa] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-44 -top-44 h-[560px] w-[560px] rounded-full bg-sky-200/50 blur-[150px]" />
        <div className="absolute -right-36 top-[20%] h-[520px] w-[520px] rounded-full bg-teal-100/70 blur-[160px]" />
        <div className="absolute inset-0 opacity-[0.32] [background-image:linear-gradient(rgba(100,116,139,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,.08)_1px,transparent_1px)] [background-size:54px_54px]" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-sky-700">
                {job?.demo_simulated
                  ? isTe ? "ధృవీకరించిన రీప్లే" : "Verified reconstruction replay"
                  : isTe ? "AI రీకన్స్ట్రక్షన్" : "AI Reconstruction"}
              </span>
              {blockCode ? (
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {blockCode}
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] sm:text-5xl">
              {job?.demo_simulated
                ? isTe
                  ? "ధృవీకరించిన 3D ఫలితం లోడ్ అవుతోంది"
                  : "Loading the verified 3D result"
                : isTe
                  ? "ఫోటోల నుండి 3D ఆకారం తయారవుతోంది"
                  : "Your granite is becoming 3D"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {job?.demo_simulated
                ? isTe
                  ? "ఇమేజ్ వాలిడేషన్, గ్రానైట్ డిటెక్షన్, సెగ్మెంటేషన్ మరియు కాలిబ్రేషన్ ప్రత్యక్షంగా జరుగుతున్నాయి. తరువాత ఈ ఖచ్చితమైన ఫోటోలతో ముందుగా పూర్తి చేసిన ధృవీకరించిన 3D విశ్లేషణను లోడ్ చేస్తాం."
                  : "Image validation, granite detection, segmentation and calibration are running live. The expensive 3D stage then restores the verified full analysis previously computed from these exact photographs."
                : isTe
                  ? "కనీసం 5 అంగీకరించిన ఫోటోలు ఉన్న వెంటనే రీకన్స్ట్రక్షన్ ప్రయత్నం ప్రారంభమవుతుంది. ఎక్కువ వైపులు ఉంటే వాటిని కూడా ఉపయోగిస్తాం."
                  : "Once 5 accepted photos are available, reconstruction starts with the best evidence-supported 3D attempt. Every additional covered side is also used."}
            </p>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-white/88 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-[7px] font-black uppercase tracking-[0.13em] text-slate-400">
              {isTe ? "బ్యాక్‌ఎండ్ ప్రోగ్రెస్" : "Backend progress"}
            </p>
            <p className="mt-1 text-xl font-black text-slate-900">
              {backendProgress !== null ? `${Math.round(backendProgress)}%` : "Stage-based"}
            </p>
          </div>
        </div>

        {job?.demo_simulated ? (
          <div className="mt-5 flex items-start gap-3 rounded-[18px] border border-teal-200 bg-teal-50/90 px-4 py-3 shadow-sm">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.13em] text-teal-800">
                {isTe ? "ధృవీకరించిన డెమో రీప్లే" : "Verified Demo Replay"}
              </p>
              <p className="mt-1 max-w-4xl text-[10px] leading-5 text-teal-700">
                {isTe
                  ? "కొలతలు, మెష్, లోపాలు, కట్టింగ్ మరియు వేస్టేజ్ విలువలు ఈ ఖచ్చితమైన ఫోటోలతో ముందుగా పూర్తిగా నడిపిన అసలు విశ్లేషణ నుంచే వస్తాయి. కొత్త/కనిపించని ఉపరితలాలు లేదా లోతులు సృష్టించబడవు."
                  : "Measurements, mesh, defects, cutting and wastage are restored only from the original full analysis of these exact photographs. No new hidden surfaces, dimensions or cavity depths are invented."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="relative min-h-[620px] overflow-hidden rounded-[30px] border border-slate-200 bg-white/90 shadow-[0_28px_80px_rgba(15,23,42,.10)] backdrop-blur-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-sky-700">
                {isTe ? "ప్రాసెస్ విజువలైజేషన్" : "Reconstruction process"}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {isTe
                  ? "ఫోటోలు ఒక్కొక్కటిగా కనెక్ట్ అయి ఒకే గ్రానైట్ ఆకారంగా ఫ్యూజ్ అవుతాయి."
                  : "Uploaded views connect step-by-step and fuse into one granite reconstruction."}
              </p>
            </div>

            <div className="relative flex min-h-[540px] items-center justify-center overflow-hidden p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,.09),transparent_34%)]" />

              {/* actual uploaded photos orbit into the reconstruction */}
              <div className="absolute inset-0">
                {visiblePhotos.map((image, index) => {
                  const angle =
                    (index / Math.max(visiblePhotos.length, 1)) * Math.PI * 2 -
                    Math.PI / 2;
                  const radiusX = 38;
                  const radiusY = 34;
                  const left = 50 + Math.cos(angle) * radiusX;
                  const top = 50 + Math.sin(angle) * radiusY;
                  const source = image.image_url
                    ? apiAssetUrl(image.image_url)
                    : null;
                  const label = String(
                    (image as unknown as Record<string, unknown>).capture_side ||
                      `VIEW ${index + 1}`,
                  ).replaceAll("_", " ");

                  return (
                    <motion.div
                      key={image.id || `${label}-${index}`}
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: index * 0.16,
                        duration: 0.55,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="absolute z-10 h-[82px] w-[108px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,.13)]"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      {source ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={source}
                          alt={`${label} granite evidence`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center bg-slate-100">
                          <Camera size={16} className="text-slate-400" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-white/88 px-2 py-1 backdrop-blur">
                        <p className="truncate text-[6px] font-black uppercase tracking-[0.08em] text-slate-700">
                          {label}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* connecting lines */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                className="absolute h-[330px] w-[330px] rounded-full border border-dashed border-sky-300/60"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute h-[250px] w-[250px] rounded-full border border-dashed border-teal-300/50"
              />

              {/* central shape formation */}
              <motion.div
                animate={{
                  scale: [0.96, 1.03, 0.96],
                  boxShadow: [
                    "0 18px 50px rgba(14,165,233,.10)",
                    "0 22px 70px rgba(14,165,233,.22)",
                    "0 18px 50px rgba(14,165,233,.10)",
                  ],
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-20 flex h-[220px] w-[300px] items-center justify-center overflow-hidden rounded-[46%_42%_44%_40%/38%_46%_40%_48%] border border-sky-300 bg-gradient-to-br from-sky-100 via-white to-teal-100"
              >
                <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_25%_30%,rgba(71,85,105,.3)_0_2px,transparent_3px),radial-gradient(circle_at_60%_55%,rgba(14,165,233,.24)_0_2px,transparent_3px)] [background-size:22px_22px,31px_31px]" />
                <div className="relative text-center">
                  <ScanLine size={30} className="mx-auto text-sky-600" />
                  <p className="mt-3 text-[9px] font-black uppercase tracking-[0.14em] text-sky-800">
                    {hasMesh
                      ? isTe ? "3D మెష్ ఏర్పడింది" : "3D mesh formed"
                      : hasPoints
                        ? isTe ? "ఉపరితలం నిర్మిస్తోంది" : "Forming surface"
                        : isTe ? "ఎవిడెన్స్ ఫ్యూజన్" : "Evidence fusion"}
                  </p>
                  <p className="mt-1 text-[8px] text-slate-500">
                    {minimumReady
                      ? `${imageCount} ${isTe ? "వ్యూలు ఉపయోగంలో ఉన్నాయి" : "views in reconstruction"}`
                      : `${imageCount}/5`}
                  </p>
                </div>
              </motion.div>

              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-[16px] border border-slate-200 bg-white/88 px-4 py-3 shadow-sm backdrop-blur">
                <div className="min-w-0">
                  <p className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {isTe ? "ప్రస్తుత పని" : "Current operation"}
                  </p>
                  <p className="mt-1 truncate text-[9px] font-black text-slate-700">
                    {stageSignals[activeIndex]?.title}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-sky-600" />
                  <span className="text-[8px] font-black uppercase tracking-[0.1em] text-sky-700">
                    {isTe ? "ప్రాసెసింగ్" : "Processing"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[30px] border border-slate-200 bg-white/90 p-4 shadow-[0_28px_80px_rgba(15,23,42,.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-sky-700">
                  {isTe ? "లైవ్ ప్రాసెస్" : "Live process"}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
                  {isTe ? "3D నిర్మాణ దశలు" : "3D build stages"}
                </h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[7px] font-black text-slate-500">
                {imageCount} PHOTOS
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {stageSignals.map((stage, index) => {
                const Icon = stage.icon;
                const active = index === activeIndex && !stage.ready;

                return (
                  <motion.div
                    key={stage.id}
                    animate={
                      active
                        ? { y: [0, -2, 0] }
                        : undefined
                    }
                    transition={{
                      duration: 1.3,
                      repeat: active ? Infinity : 0,
                    }}
                    className={[
                      "relative flex gap-3 rounded-[17px] border p-3 transition",
                      stage.ready
                        ? "border-emerald-200 bg-emerald-50/70"
                        : active
                          ? "border-sky-300 bg-sky-50 shadow-[0_10px_28px_rgba(14,165,233,.10)]"
                          : "border-slate-200 bg-slate-50/70",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border",
                        stage.ready
                          ? "border-emerald-200 bg-white text-emerald-600"
                          : active
                            ? "border-sky-200 bg-white text-sky-600"
                            : "border-slate-200 bg-white text-slate-400",
                      ].join(" ")}
                    >
                      {stage.ready ? <CheckCircle2 size={15} /> : active ? <Loader2 size={15} className="animate-spin" /> : <Icon size={14} />}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[7px] font-black text-slate-400">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[9px] font-black text-slate-800">
                          {stage.title}
                        </p>
                      </div>
                      <p className="mt-1 text-[7.5px] leading-4 text-slate-500">
                        {stage.detail}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-4 rounded-[18px] border border-cyan-200 bg-cyan-50/75 p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-cyan-800">
                {isTe ? "5 ఫోటో రూల్" : "5-photo reconstruction rule"}
              </p>
              <p className="mt-2 text-[9px] leading-5 text-slate-600">
                {isTe
                  ? "5 అంగీకరించిన ఫోటోలు ఉంటే సిస్టమ్ 3D నిర్మాణాన్ని ప్రయత్నిస్తుంది. అందుబాటులో ఉన్న అన్ని వైపులను ఉపయోగిస్తుంది; అదనపు ఫోటోలు ఫలితాన్ని మెరుగుపరుస్తాయి."
                  : "With 5 accepted photos, the system attempts reconstruction using every covered side. More useful views improve the result, but the first 3D attempt is not blocked beyond the 5-photo minimum."}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}


function LuxuryBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-28 -top-28 h-[540px] w-[540px] rounded-full bg-[#67e8f9]/10 blur-[130px] dark:bg-[#67e8f9]/[0.065]" />
      <div className="absolute -right-44 top-[28%] h-[660px] w-[660px] rounded-full bg-emerald-500/[0.045] blur-[150px]" />
      <div className="absolute bottom-[-18%] left-[28%] h-[660px] w-[660px] rounded-full bg-[#9c6c29]/[0.055] blur-[155px]" />
      <div className="absolute left-[8%] top-[16%] h-[420px] w-[420px] rounded-full bg-cyan-400/[0.028] blur-[145px] dark:bg-cyan-300/[0.035]" />
      <motion.div
        className="absolute left-[-12%] top-[44%] h-px w-[124%] bg-gradient-to-r from-transparent via-[#67e8f9]/25 to-transparent"
        animate={{ x: ["-5%", "5%", "-5%"], opacity: [0.22, 0.55, 0.22] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[7%] top-[10%] h-44 w-44 rounded-full border border-[#67e8f9]/10"
        animate={{ scale: [1, 1.12, 1], rotate: [0, 14, 0], opacity: [0.2, 0.42, 0.2] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(100,74,28,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(100,74,28,.08)_1px,transparent_1px)] [background-size:72px_72px] dark:opacity-[0.08] dark:[background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)]" />
    </div>
  );
}

function LuxurySection({
  eyebrow,
  title,
  icon,
  children,
  flush = false,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#b99145]/15 bg-white/70 shadow-[0_18px_58px_rgba(67,44,5,.075)] backdrop-blur-2xl dark:border-[#67e8f9]/11 dark:bg-[#0b0e12]/78 dark:shadow-[0_24px_70px_rgba(0,0,0,.34)]">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-4 dark:border-white/[0.06] sm:px-5">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#98702a] dark:text-[#67e8f9]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-sm font-black tracking-[-0.015em] sm:text-base">
            {title}
          </h2>
        </div>

        <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#b98a35]/18 bg-[#67e8f9]/10 text-[#946b26] dark:text-[#e4c47d]">
          {icon}
        </span>
      </div>

      {flush ? children : <div className="p-4 sm:p-5">{children}</div>}
    </section>
  );
}

function LuxuryPill({
  icon,
  text,
  muted = false,
}: {
  icon: React.ReactNode;
  text: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em]",
        muted
          ? "border-black/10 bg-black/[0.025] text-black/42 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/42"
          : "border-[#b98b38]/22 bg-[#67e8f9]/10 text-[#7b571e] dark:text-[#ecd298]",
      ].join(" ")}
    >
      {icon}
      {text}
    </span>
  );
}

function MetricPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-[17px] border border-black/[0.07] bg-white/42 px-3 py-2 backdrop-blur-xl dark:border-white/[0.07] dark:bg-white/[0.025]">
      <span className="text-[#986e27] dark:text-[#dfbe75]">{icon}</span>
      <span>
        <span className="block text-[7px] font-black uppercase tracking-[0.13em] text-black/34 dark:text-white/34">
          {label}
        </span>
        <span className="mt-0.5 block text-[9px] font-black text-black/70 dark:text-white/70">
          {value}
        </span>
      </span>
    </div>
  );
}

function SignalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "active" | "warn" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[17px] border border-black/[0.06] bg-white/35 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="min-w-0">
        <p className="text-[7px] font-black uppercase tracking-[0.13em] text-black/34 dark:text-white/34">
          {label}
        </p>
        <p className="mt-1 truncate text-[9px] font-black">{value}</p>
      </div>

      <span
        className={[
          "h-2 w-2 shrink-0 rounded-full",
          tone === "good"
            ? "bg-emerald-500"
            : tone === "active"
              ? "animate-pulse bg-[#67e8f9]"
              : tone === "warn"
                ? "bg-red-500"
                : "bg-black/20 dark:bg-white/20",
        ].join(" ")}
      />
    </div>
  );
}

function LargeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-black/[0.07] bg-black/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-black/36 dark:text-white/36">
        {label}
      </p>
      <p className="mt-2 text-lg font-black tracking-[-0.025em]">{value}</p>
    </div>
  );
}

function InsightCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#0ea5e9]/12 bg-[#67e8f9]/[0.055] p-4">
      <p className="text-[8px] font-black uppercase tracking-[0.13em] text-[#8e6725] dark:text-[#67e8f9]">
        {label}
      </p>
      <p className="mt-2 text-sm font-black">{value}</p>
      <p className="mt-1.5 text-[8.5px] leading-4 text-black/40 dark:text-white/40">
        {detail}
      </p>
    </div>
  );
}

function JourneyStep({
  number,
  label,
  ready,
}: {
  number: string;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-black/[0.06] bg-black/[0.018] p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <span
        className={[
          "grid h-9 w-9 place-items-center rounded-xl border text-[9px] font-black",
          ready
            ? "border-emerald-500/22 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-black/10 bg-black/[0.025] text-black/35 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/35",
        ].join(" ")}
      >
        {ready ? <CheckCircle2 size={13} /> : number}
      </span>
      <div>
        <p className="text-[9px] font-black">{label}</p>
        <p className="mt-0.5 text-[7px] uppercase tracking-[0.11em] text-black/32 dark:text-white/32">
          {ready ? "Available" : "Waiting"}
        </p>
      </div>
    </div>
  );
}

function RingMetric({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const normalized =
    value !== null && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : null;

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full p-[7px]"
        style={{
          background:
            normalized !== null
              ? `conic-gradient(#67e8f9 ${normalized}%, rgba(120,95,46,.12) ${normalized}% 100%)`
              : "conic-gradient(rgba(120,95,46,.12) 0% 100%)",
        }}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-[#f8f4ea] dark:bg-[#0d1014]">
          <span className="text-xl font-black">
            {normalized !== null ? `${Math.round(normalized)}%` : "—"}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-black/35 dark:text-white/35">
          {label}
        </p>
        <p className="mt-1 text-[10px] leading-5 text-black/45 dark:text-white/45">
          Measured on observed photographic views when backend validation is available.
        </p>
      </div>
    </div>
  );
}

function SurfaceList({
  title,
  values,
  tone,
}: {
  title: string;
  values: string[];
  tone: "good" | "warn";
}) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.13em] text-black/35 dark:text-white/35">
        {title}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className={[
                "rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.08em]",
                tone === "good"
                  ? "border-emerald-500/18 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/20 bg-amber-500/[0.07] text-amber-800 dark:text-amber-300",
              ].join(" ")}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-[9px] text-black/35 dark:text-white/35">
            Not reported
          </span>
        )}
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/[0.06] py-2.5 last:border-0 dark:border-white/[0.06]">
      <span className="text-[9px] font-semibold text-black/42 dark:text-white/42">
        {label}
      </span>
      <strong className="max-w-[62%] truncate text-right text-[10px]">
        {value}
      </strong>
    </div>
  );
}

function PipelineLine({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={[
          "grid h-7 w-7 place-items-center rounded-lg border",
          ready
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-black/10 bg-black/[0.025] text-black/30 dark:border-white/10 dark:bg-white/[0.025] dark:text-white/30",
        ].join(" ")}
      >
        {ready ? <CheckCircle2 size={12} /> : <CircleDot size={10} />}
      </span>
      <span className="text-[9px] font-black">{label}</span>
    </div>
  );
}

function OrthographicPanel({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="relative min-h-[190px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-[#101216] p-4 text-white dark:border-white/[0.07]">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute inset-6 rounded-[18px] border border-[#67e8f9]/30" />
      <div className="absolute left-1/2 top-1/2 h-[54%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-[38%_42%_35%_46%] border border-[#e0c27a]/60 bg-[#67e8f9]/[0.06]" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e2c57f]">
          {title}
        </p>
        <div>
          <p className="text-sm font-black">{primary}</p>
          <p className="mt-1 text-[9px] text-white/48">{secondary}</p>
        </div>
      </div>
    </div>
  );
}

function CommandMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "gold";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-800 dark:text-amber-200"
        : tone === "gold"
          ? "text-[#8a6120] dark:text-[#e7c77f]"
          : "";

  return (
    <div className="rounded-[17px] border border-black/[0.06] bg-black/[0.018] px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.022]">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
        {label}
      </p>
      <p className={`mt-1 text-sm font-black ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[8px] text-black/35 dark:text-white/35">{detail}</p>
    </div>
  );
}

function ValidationHero({
  value,
  target,
  targetMet,
  status,
}: {
  value: number | null;
  target: number;
  targetMet: boolean;
  status: string;
}) {
  const normalized = value === null ? null : value <= 1 ? value * 100 : value;
  const targetPct = target <= 1 ? target * 100 : target;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#b98b38]/16 bg-gradient-to-br from-[#67e8f9]/10 via-transparent to-cyan-500/[0.035] p-4">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full border border-[#67e8f9]/10" />
      <div className="relative flex items-end justify-between gap-4">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#916823] dark:text-[#67e8f9]">
            Real-mesh render-back
          </p>
          <p className="mt-2 text-3xl font-black tracking-[-0.05em]">
            {normalized === null ? "—" : `${normalized.toFixed(1)}%`}
          </p>
          <p className="mt-1 text-[9px] text-black/40 dark:text-white/40">
            Target ≥ {targetPct.toFixed(0)}% · observed views only
          </p>
        </div>
        <span
          className={[
            "rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em]",
            targetMet
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-[#b98b38]/18 bg-[#67e8f9]/10 text-[#845d1f] dark:text-[#e4c47c]",
          ].join(" ")}
        >
          {targetMet ? "Target met" : status.replaceAll("_", " ")}
        </span>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[13px] border border-black/[0.06] bg-black/[0.018] p-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <p className="text-[7px] font-black uppercase tracking-[0.1em] text-black/32 dark:text-white/32">
        {label}
      </p>
      <p className="mt-1 text-[9px] font-black">{value}</p>
    </div>
  );
}

function FlowMetric({
  title,
  value,
  status,
}: {
  title: string;
  value: string;
  status: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/[0.07] bg-black/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <p className="text-[8px] font-black uppercase tracking-[0.13em] text-[#8f6724] dark:text-[#67e8f9]">
        {title}
      </p>
      <p className="mt-2 text-base font-black">{value}</p>
      <p className="mt-1.5 text-[8px] leading-4 text-black/38 dark:text-white/38">
        {status}
      </p>
    </div>
  );
}

function PaperMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#997128]/13 bg-[#9e7934]/[0.035] p-3">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/40">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-black">{value}</p>
    </div>
  );
}

function PaperSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8d6724]">
        {title}
      </p>
      <div className="mt-2 rounded-[16px] border border-[#9e7934]/12 px-3">
        {children}
      </div>
    </div>
  );
}

function PaperRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#9e7934]/10 py-2.5 last:border-0">
      <span className="text-[9px] text-black/45">{label}</span>
      <strong className="max-w-[62%] text-right text-[9px]">{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-black/10 p-5 text-center text-[10px] text-black/40 dark:border-white/10 dark:text-white/40">
      {text}
    </div>
  );
}

function ViewerSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-[460px] items-center justify-center rounded-[24px] bg-[#0d1014]">
      <div className="text-center">
        <RefreshCw className="mx-auto mb-3 animate-spin text-[#67e8f9]" size={21} />
        <p className="text-xs font-semibold text-white/48">{label}</p>
      </div>
    </div>
  );
}

function MeasurementInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-black/40 dark:text-white/40">
        {label}
      </span>
      <input
        type="number"
        step="any"
        min="0"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-h-11 rounded-[15px] border border-black/10 bg-white/70 px-3 text-xs font-bold outline-none transition focus:border-[#0ea5e9]/45 focus:ring-4 focus:ring-[#67e8f9]/10 dark:border-white/10 dark:bg-white/[0.035] dark:text-[#fff9ec] mt-1.5"
      />
    </label>
  );
}


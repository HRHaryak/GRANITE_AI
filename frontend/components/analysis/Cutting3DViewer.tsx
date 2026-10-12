"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Route,
  Scissors,
  Target,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { getPointCloudData } from "../../lib/api";
import { useTheme } from "../../lib/theme";
import type {
  CuttingOut,
  DressingCutStep,
  OrientationOption,
} from "../../lib/types";

interface Cutting3DViewerProps {
  jobId?: string;
  meshUrl?: string | null;
  dimensions?: {
    length_cm: number;
    breadth_cm: number;
    height_cm: number;
    length_m?: number;
    breadth_m?: number;
    height_m?: number;
  } | null;
  cutting?: CuttingOut | null;
  selectedOrientationIndex?: number;
  onSelectOrientation?: (index: number) => void;
}

type Axis = "X" | "Y" | "Z";

type CutAnimationPhase =
  | "SOURCE"
  | "ORIENT"
  | "RATIONALE"
  | "PLANE"
  | "CUTTING"
  | "SEPARATION"
  | "COMPLETE"
  | "RESULT";

const CUT_STAGE_DURATION_MS = 6800;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function cutAnimationPhase(progress: number): CutAnimationPhase {
  if (progress < 0.14) return "ORIENT";
  if (progress < 0.29) return "RATIONALE";
  if (progress < 0.45) return "PLANE";
  if (progress < 0.73) return "CUTTING";
  if (progress < 0.91) return "SEPARATION";
  return "COMPLETE";
}

function cutAnimationLabel(phase: CutAnimationPhase) {
  switch (phase) {
    case "SOURCE":
      return "RAW DIGITAL TWIN";
    case "ORIENT":
      return "ORIENTING TO CUT FACE";
    case "RATIONALE":
      return "WHY THIS CUT";
    case "PLANE":
      return "POSITIONING CUT PLANE";
    case "CUTTING":
      return "CUTTING IN PROGRESS";
    case "SEPARATION":
      return "MATERIAL SEPARATION";
    case "COMPLETE":
      return "CUT COMPLETE";
    case "RESULT":
      return "DRESSED RESULT";
  }
}


type BoxDimensions = {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

type SurfaceName = "FRONT" | "BACK" | "LEFT" | "RIGHT" | "TOP" | "BOTTOM";

function surfaceList(value: unknown): SurfaceName[] {
  if (!Array.isArray(value)) return [];

  const allowed = new Set<SurfaceName>([
    "FRONT",
    "BACK",
    "LEFT",
    "RIGHT",
    "TOP",
    "BOTTOM",
  ]);

  return value
    .map((item) => String(item).trim().toUpperCase())
    .filter((item): item is SurfaceName => allowed.has(item as SurfaceName));
}

function firstSurfaceList(...values: unknown[]): SurfaceName[] {
  for (const value of values) {
    const parsed = surfaceList(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

type ProjectedPoint = [number, number, number];

type RawMeshPayload = {
  vertices?: number[][];
  triangles?: number[][];
  mesh_status?: string | null;
  status?: string | null;
  mesh_method?: string | null;
  method?: string | null;
  units?: string | null;
};

type RawMeshState = {
  vertices: number[][];
  triangles: number[][];
  status: string;
  method: string | null;
  units: string | null;
};

const EMPTY_RAW_MESH: RawMeshState = {
  vertices: [],
  triangles: [],
  status: "NOT_AVAILABLE",
  method: null,
  units: null,
};

function finiteTriplet(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

function finiteTriangle(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every(
      (item) => Number.isInteger(item) && item >= 0,
    )
  );
}

function isValidatedIrregularRawMesh(mesh: RawMeshState): boolean {
  if (mesh.vertices.length < 24 || mesh.triangles.length < 30) {
    return false;
  }

  const status = mesh.status.trim().toUpperCase();
  const method = (mesh.method ?? "").trim().toUpperCase();

  const forbidden = [
    "SPARSE",
    "FALLBACK",
    "BOUNDING",
    "BBOX",
    "BOX",
    "CUBOID",
    "ENVELOPE",
    "AABB",
    "OBB",
    "CONVEX_HULL",
    "SILHOUETTE_HULL",
  ];

  return !forbidden.some(
    (token) => status.includes(token) || method.includes(token),
  );
}

function isVisualGraniteProxyMesh(mesh: RawMeshState): boolean {
  if (mesh.vertices.length < 24 || mesh.triangles.length < 30) {
    return false;
  }

  const status = mesh.status.trim().toUpperCase();
  const method = (mesh.method ?? "").trim().toUpperCase();
  const identity = `${status} ${method}`;

  return (
    identity.includes("CONNECTED_SILHOUETTE_DEPTH_GRANITE_PROXY_V19") ||
    identity.includes("CONNECTEDGRANITETOPOLOGYDEPTHPROXYV19") ||
    identity.includes("CONNECTED_GRANITE_TOPOLOGY") ||
    identity.includes("VISUAL_GRANITE_PROXY")
  );
}

function meshUnitToCmFactor(units?: string | null): number | null {
  const normalized = (units ?? "").trim().toLowerCase();

  if (
    normalized === "cm" ||
    normalized === "centimeter" ||
    normalized === "centimeters"
  ) {
    return 1;
  }

  if (
    normalized === "m" ||
    normalized === "meter" ||
    normalized === "meters"
  ) {
    return 100;
  }

  if (
    normalized === "mm" ||
    normalized === "millimeter" ||
    normalized === "millimeters"
  ) {
    return 0.1;
  }

  return null;
}

function meshBounds(vertices: number[][]) {
  if (vertices.length === 0) {
    return {
      center: [0, 0, 0] as [number, number, number],
      extent: [1, 1, 1] as [number, number, number],
      maxExtent: 1,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const extent: [number, number, number] = [
    Math.max(maxX - minX, 1e-6),
    Math.max(maxY - minY, 1e-6),
    Math.max(maxZ - minZ, 1e-6),
  ];

  return {
    center: [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ] as [number, number, number],
    extent,
    maxExtent: Math.max(...extent),
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function getAxis(value?: string | null): Axis | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();

  if (normalized.startsWith("X")) return "X";
  if (normalized.startsWith("Y")) return "Y";
  if (normalized.startsWith("Z")) return "Z";

  return null;
}

type EnhancedCutStep = DressingCutStep & {
  plane_origin?: number[];
  plane_origin_cm?: number[];
  plane_normal?: number[];
  plane_normal_world?: number[];
  removal_side?: string;
  plane_coordinate_frame?: string;
};

type MetricCutPlane = {
  originCm: [number, number, number];
  normal: [number, number, number];
  axis: Axis;
  source: "BACKEND_WORLD_PLANE" | "LEGACY_AXIS";
};

function normalizedVector3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const values = value.slice(0, 3).map(Number);
  if (!values.every(Number.isFinite)) return null;
  const length = Math.hypot(values[0], values[1], values[2]);
  if (length <= 1e-9) return null;
  return [values[0] / length, values[1] / length, values[2] / length];
}

function dominantAxis(normal: [number, number, number]): Axis {
  const values = normal.map(Math.abs);
  const index =
    values[0] >= values[1] && values[0] >= values[2]
      ? 0
      : values[1] >= values[2]
        ? 1
        : 2;
  return index === 0 ? "X" : index === 1 ? "Y" : "Z";
}

function resolveMetricCutPlane(
  step: DressingCutStep,
  meshCenterRaw: [number, number, number],
  meshMetricFactor: number | null,
): MetricCutPlane | null {
  const enhanced = step as EnhancedCutStep;
  const originRaw = enhanced.plane_origin_cm ?? enhanced.plane_origin;
  const normal = normalizedVector3(
    enhanced.plane_normal_world ?? enhanced.plane_normal,
  );

  if (
    meshMetricFactor != null &&
    Array.isArray(originRaw) &&
    originRaw.length >= 3 &&
    originRaw.slice(0, 3).map(Number).every(Number.isFinite) &&
    normal
  ) {
    const centerCm: [number, number, number] = [
      meshCenterRaw[0] * meshMetricFactor,
      meshCenterRaw[1] * meshMetricFactor,
      meshCenterRaw[2] * meshMetricFactor,
    ];
    return {
      originCm: [
        Number(originRaw[0]) - centerCm[0],
        Number(originRaw[1]) - centerCm[1],
        Number(originRaw[2]) - centerCm[2],
      ],
      normal,
      axis: dominantAxis(normal),
      source: "BACKEND_WORLD_PLANE",
    };
  }

  const axis = getAxis(step.plane_axis);
  const positionCm = finiteNumber(step.position_cm)
    ? step.position_cm
    : finiteNumber(step.position_m)
      ? step.position_m * 100
      : null;

  if (!axis || positionCm == null) return null;

  const label = `${String(step.cut_name || "")} ${String(step.reason || "")}`.toUpperCase();
  const minSide =
    label.includes("MIN") ||
    label.includes("LEFT") ||
    label.includes("BOTTOM");

  // Fallback only for legacy axis-aligned cut steps. Keep this name distinct
  // from the backend world-space `normal` declared earlier in this function.
  const fallbackNormal: [number, number, number] = [0, 0, 0];
  const index = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
  fallbackNormal[index] = minSide ? -1 : 1;

  const originCm: [number, number, number] = [0, 0, 0];
  originCm[index] = positionCm;

  return {
    originCm,
    normal: fallbackNormal,
    axis,
    source: "LEGACY_AXIS",
  };
}

function dimensionsFromCuttingResult(
  cutting: CuttingOut | null | undefined,
  orientation: OrientationOption | null,
): BoxDimensions | null {
  const fromOrientation = dimensionsFromOrientation(orientation);
  if (fromOrientation) return fromOrientation;

  const enriched = cutting as
    | (CuttingOut & {
        final_dressed_dimensions?: Record<string, unknown> | null;
        parameters?: Record<string, unknown> | null;
      })
    | null
    | undefined;

  const params =
    enriched?.parameters && typeof enriched.parameters === "object"
      ? enriched.parameters
      : null;

  const candidate =
    enriched?.final_dressed_dimensions ??
    (params?.final_dressed_dimensions as Record<string, unknown> | undefined) ??
    null;

  if (!candidate || typeof candidate !== "object") return null;

  const lengthCm = positiveNumber(candidate.length_cm)
    ? candidate.length_cm
    : positiveNumber(candidate.length_m)
      ? candidate.length_m * 100
      : null;
  const breadthCm = positiveNumber(candidate.breadth_cm)
    ? candidate.breadth_cm
    : positiveNumber(candidate.breadth_m)
      ? candidate.breadth_m * 100
      : null;
  const heightCm = positiveNumber(candidate.height_cm)
    ? candidate.height_cm
    : positiveNumber(candidate.height_m)
      ? candidate.height_m * 100
      : null;

  if (lengthCm == null || breadthCm == null || heightCm == null) return null;
  return { lengthCm, breadthCm, heightCm };
}

function formatNumber(value: unknown, digits = 2, suffix = "") {
  return finiteNumber(value) ? `${value.toFixed(digits)}${suffix}` : "Not reported";
}

function dimensionsFromOrientation(
  orientation: OrientationOption | null,
): BoxDimensions | null {
  if (!orientation) return null;

  const lengthCm =
    positiveNumber(orientation.usable_length_cm)
      ? orientation.usable_length_cm
      : positiveNumber(orientation.dressed_length_cm)
        ? orientation.dressed_length_cm
        : null;

  const breadthCm =
    positiveNumber(orientation.usable_breadth_cm)
      ? orientation.usable_breadth_cm
      : positiveNumber(orientation.dressed_breadth_cm)
        ? orientation.dressed_breadth_cm
        : null;

  const heightCm =
    positiveNumber(orientation.usable_height_cm)
      ? orientation.usable_height_cm
      : positiveNumber(orientation.dressed_height_cm)
        ? orientation.dressed_height_cm
        : null;

  if (lengthCm == null || breadthCm == null || heightCm == null) return null;

  return { lengthCm, breadthCm, heightCm };
}

function getRawDimensions(
  dimensions?: Cutting3DViewerProps["dimensions"],
): BoxDimensions | null {
  if (
    !dimensions ||
    !positiveNumber(dimensions.length_cm) ||
    !positiveNumber(dimensions.breadth_cm) ||
    !positiveNumber(dimensions.height_cm)
  ) {
    return null;
  }

  return {
    lengthCm: dimensions.length_cm,
    breadthCm: dimensions.breadth_cm,
    heightCm: dimensions.height_cm,
  };
}

function CutReadout({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  const valueClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "success"
        ? "text-[var(--success)]"
        : tone === "warning"
          ? "text-[var(--warning)]"
          : "text-[var(--text-primary)]";

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-1.5 break-words font-mono text-[10px] font-black ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}


function ProcedureSignal({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "accent";
}) {
  const valueClass =
    tone === "success"
      ? "text-[var(--success)]"
      : tone === "warning"
        ? "text-[var(--warning)]"
        : tone === "accent"
          ? "text-[var(--accent)]"
          : "text-[var(--text-primary)]";

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3.5">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-1.5 text-sm font-black ${valueClass}`}>{value}</p>
      <p className="mt-1 text-[9px] leading-4 text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

export default function Cutting3DViewer({
  jobId,
  meshUrl,
  dimensions,
  cutting,
  selectedOrientationIndex = 0,
  onSelectOrientation,
}: Cutting3DViewerProps) {
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [rawMesh, setRawMesh] = useState<RawMeshState>(EMPTY_RAW_MESH);
  const [meshLoading, setMeshLoading] = useState(false);
  const [meshError, setMeshError] = useState<string | null>(null);

  const [rotation, setRotation] = useState({ x: 26, y: -38 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeOrientationIndex, setActiveOrientationIndex] = useState(
    selectedOrientationIndex,
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cutProgress, setCutProgress] = useState(0);
  const cutAnimationFrameRef = useRef<number | null>(null);
  const cutAnimationStartRef = useRef<number | null>(null);

  useEffect(() => {
    const target =
      meshUrl ||
      (jobId ? `/geometry/${jobId}/mesh` : null);

    if (!target) {
      setRawMesh(EMPTY_RAW_MESH);
      setMeshError(null);
      setMeshLoading(false);
      return;
    }

    let cancelled = false;
    setMeshLoading(true);
    setMeshError(null);

    getPointCloudData(target)
      .then((response) => {
        if (cancelled) return;

        const payload = response as unknown as RawMeshPayload;

        const vertices = Array.isArray(payload?.vertices)
          ? payload.vertices.filter(finiteTriplet)
          : [];

        const triangles = Array.isArray(payload?.triangles)
          ? payload.triangles
              .filter(finiteTriangle)
              .filter(
                (triangle) =>
                  triangle[0] < vertices.length &&
                  triangle[1] < vertices.length &&
                  triangle[2] < vertices.length,
              )
          : [];

        setRawMesh({
          vertices,
          triangles,
          status: String(
            payload?.mesh_status ||
              payload?.status ||
              (vertices.length > 0 && triangles.length > 0
                ? "CALCULATED"
                : "NOT_AVAILABLE"),
          ),
          method: payload?.mesh_method ?? payload?.method ?? null,
          units: payload?.units ?? null,
        });
      })
      .catch((error) => {
        if (cancelled) return;

        setRawMesh(EMPTY_RAW_MESH);
        setMeshError(
          error instanceof Error
            ? error.message
            : "Irregular mesh could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setMeshLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, meshUrl]);

  const visualGraniteProxyAvailable = useMemo(
    () => isVisualGraniteProxyMesh(rawMesh),
    [rawMesh],
  );

  const irregularRawMeshAvailable = useMemo(
    () => isValidatedIrregularRawMesh(rawMesh) || visualGraniteProxyAvailable,
    [rawMesh, visualGraniteProxyAvailable],
  );

  const meshMetricFactor = useMemo(
    () => meshUnitToCmFactor(rawMesh.units),
    [rawMesh.units],
  );

  const rawMeshBounds = useMemo(
    () => meshBounds(rawMesh.vertices),
    [rawMesh.vertices],
  );

  const visualProxyScaleToCm = useMemo(() => {
    if (!visualGraniteProxyAvailable || !dimensions) return null;

    const ex = Math.max(rawMeshBounds.extent[0], 1e-6);
    const ey = Math.max(rawMeshBounds.extent[1], 1e-6);
    const ez = Math.max(rawMeshBounds.extent[2], 1e-6);

    return {
      x: dimensions.length_cm / ex,
      y: dimensions.height_cm / ey,
      z: dimensions.breadth_cm / ez,
    };
  }, [
    dimensions,
    rawMeshBounds.extent,
    visualGraniteProxyAvailable,
  ]);

  const visualCutAlignmentAvailable =
    meshMetricFactor != null || visualProxyScaleToCm != null;

  const orientations = useMemo(
    () =>
      (Array.isArray(cutting?.orientations)
        ? cutting.orientations
        : []) as OrientationOption[],
    [cutting?.orientations],
  );

  useEffect(() => {
    if (orientations.length === 0) {
      setActiveOrientationIndex(0);
      return;
    }

    setActiveOrientationIndex(
      Math.min(
        Math.max(selectedOrientationIndex, 0),
        orientations.length - 1,
      ),
    );
  }, [orientations.length, selectedOrientationIndex]);

  const selectedOrientation =
    orientations[activeOrientationIndex] ?? orientations[0] ?? null;

  /*
   * Evidence rule:
   * Never infer BOTTOM from a rectangular dressed envelope.
   * BOTTOM is considered observed only when the backend explicitly reports it.
   * If no surface metadata is present, we fail closed and keep BOTTOM unobserved.
   */
  const observedSurfaces = useMemo<SurfaceName[]>(() => {
    const root = (cutting ?? {}) as unknown as Record<string, unknown>;
    const orientation =
      (selectedOrientation ?? {}) as unknown as Record<string, unknown>;
    const parameters =
      root.parameters && typeof root.parameters === "object"
        ? (root.parameters as Record<string, unknown>)
        : {};
    const meshEvidence =
      root.mesh_evidence && typeof root.mesh_evidence === "object"
        ? (root.mesh_evidence as Record<string, unknown>)
        : {};

    return firstSurfaceList(
      root.observed_surfaces,
      orientation.observed_surfaces,
      parameters.observed_surfaces,
      meshEvidence.observed_surfaces,
    );
  }, [cutting, selectedOrientation]);

  const missingSurfaces = useMemo<SurfaceName[]>(() => {
    const root = (cutting ?? {}) as unknown as Record<string, unknown>;
    const orientation =
      (selectedOrientation ?? {}) as unknown as Record<string, unknown>;
    const parameters =
      root.parameters && typeof root.parameters === "object"
        ? (root.parameters as Record<string, unknown>)
        : {};
    const meshEvidence =
      root.mesh_evidence && typeof root.mesh_evidence === "object"
        ? (root.mesh_evidence as Record<string, unknown>)
        : {};

    return firstSurfaceList(
      root.missing_surfaces,
      orientation.missing_surfaces,
      parameters.missing_surfaces,
      meshEvidence.missing_surfaces,
    );
  }, [cutting, selectedOrientation]);

  const bottomObserved =
    observedSurfaces.includes("BOTTOM") &&
    !missingSurfaces.includes("BOTTOM");

  const cuttingSteps = useMemo<DressingCutStep[]>(() => {
    if (
      Array.isArray(selectedOrientation?.cutting_steps) &&
      selectedOrientation.cutting_steps.length
    ) {
      return selectedOrientation.cutting_steps;
    }

    return Array.isArray(cutting?.cutting_steps) ? cutting.cutting_steps : [];
  }, [cutting?.cutting_steps, selectedOrientation?.cutting_steps]);

  const rawDimensions = useMemo(
    () => getRawDimensions(dimensions),
    [dimensions],
  );

  const dressedDimensions = useMemo(
    () => dimensionsFromCuttingResult(cutting, selectedOrientation),
    [cutting, selectedOrientation],
  );

  const timelineLength = cuttingSteps.length + 2;
  const maxTimelineIndex = Math.max(timelineLength - 1, 0);

  useEffect(() => {
    setCurrentStepIndex((value) => Math.min(value, maxTimelineIndex));
  }, [maxTimelineIndex]);

  useEffect(() => {
    if (!playing || maxTimelineIndex <= 0) {
      cutAnimationStartRef.current = null;
      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
        cutAnimationFrameRef.current = null;
      }
      return;
    }

    if (currentStepIndex === 0) {
      setCurrentStepIndex(1);
      setCutProgress(0);
      cutAnimationStartRef.current = null;
      return;
    }

    if (currentStepIndex >= maxTimelineIndex) {
      setCutProgress(1);
      setPlaying(false);
      return;
    }

    let disposed = false;

    const tick = (now: number) => {
      if (disposed) return;

      if (cutAnimationStartRef.current == null) {
        cutAnimationStartRef.current =
          now - cutProgress * CUT_STAGE_DURATION_MS;
      }

      const nextProgress = clamp01(
        (now - cutAnimationStartRef.current) / CUT_STAGE_DURATION_MS,
      );

      setCutProgress(nextProgress);

      if (nextProgress >= 1) {
        cutAnimationStartRef.current = null;

        setCurrentStepIndex((current) => {
          const next = Math.min(maxTimelineIndex, current + 1);
          if (next >= maxTimelineIndex) {
            setPlaying(false);
            setCutProgress(1);
          } else {
            setCutProgress(0);
          }
          return next;
        });

        return;
      }

      cutAnimationFrameRef.current = requestAnimationFrame(tick);
    };

    cutAnimationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
        cutAnimationFrameRef.current = null;
      }
    };
  }, [
    playing,
    currentStepIndex,
    maxTimelineIndex,
    cutProgress,
  ]);

  useEffect(() => {
    return () => {
      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
      }
    };
  }, []);

  const currentCut =
    currentStepIndex > 0 && currentStepIndex <= cuttingSteps.length
      ? cuttingSteps[currentStepIndex - 1]
      : null;

  const currentPhase =
    currentStepIndex === 0
      ? "SOURCE_ENVELOPE"
      : currentStepIndex === maxTimelineIndex
        ? "FINAL_DRESSED_BLOCK"
        : "CUT_STEP";

  const activeCutAnimationPhase: CutAnimationPhase =
    currentStepIndex === 0
      ? "SOURCE"
      : currentStepIndex === maxTimelineIndex
        ? "RESULT"
        : cutAnimationPhase(cutProgress);

  const selectOrientation = (index: number) => {
    setActiveOrientationIndex(index);
    setCurrentStepIndex(0);
    setCutProgress(0);
    cutAnimationStartRef.current = null;
    setPlaying(false);
    onSelectOrientation?.(index);
  };

  const previousStep = () => {
    setPlaying(false);
    setCutProgress(0);
    cutAnimationStartRef.current = null;
    setCurrentStepIndex((value) => Math.max(0, value - 1));
  };

  const nextStep = () => {
    setPlaying(false);
    cutAnimationStartRef.current = null;
    setCurrentStepIndex((value) => {
      const next = Math.min(maxTimelineIndex, value + 1);
      setCutProgress(next >= maxTimelineIndex ? 1 : 0);
      return next;
    });
  };

  const resetViewer = () => {
    setRotation({ x: 26, y: -38 });
    setZoom(1);
    setCurrentStepIndex(0);
    setCutProgress(0);
    cutAnimationStartRef.current = null;
    setPlaying(false);
  };

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, rect.width);
    const height = Math.max(360, Math.min(560, rect.width * 0.62));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isLight = resolvedTheme === "light";

    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, width, height);
    if (isLight) {
      background.addColorStop(0, "#fbfbfa");
      background.addColorStop(1, "#f0eee9");
    } else {
      background.addColorStop(0, "#0b0e12");
      background.addColorStop(1, "#05070a");
    }
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = isLight
      ? "rgba(71,85,105,0.08)"
      : "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!irregularRawMeshAvailable) {
      const panelWidth = Math.min(width - 48, 470);
      const panelX = (width - panelWidth) / 2;
      const panelY = height / 2 - 70;

      ctx.fillStyle = isLight
        ? "rgba(255,255,255,0.96)"
        : "rgba(12,15,20,0.96)";
      ctx.strokeStyle = isLight
        ? "rgba(180,83,9,0.28)"
        : "rgba(251,191,36,0.24)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelWidth, 140, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isLight ? "#9a651d" : "#e8b45e";
      ctx.font = "800 10px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText("GRANITE VISUAL MESH UNAVAILABLE", panelX + 18, panelY + 28);

      ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
      ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(
        meshLoading
          ? "Loading reconstructed granite surface..."
          : "A cuboid is intentionally not being used as raw granite.",
        panelX + 18,
        panelY + 55,
      );

      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(
        "Cut plan is preserved, but animation needs a reconstructed",
        panelX + 18,
        panelY + 82,
      );
      ctx.fillText(
        "granite mesh or connected visual proxy from reconstruction.",
        panelX + 18,
        panelY + 100,
      );

      if (meshError) {
        ctx.fillStyle = isLight ? "#b91c1c" : "#fca5a5";
        ctx.fillText(
          meshError.length > 58 ? `${meshError.slice(0, 55)}…` : meshError,
          panelX + 18,
          panelY + 122,
        );
      }

      return;
    }

    const maxDimension =
      meshMetricFactor != null
        ? rawMeshBounds.maxExtent * meshMetricFactor
        : visualProxyScaleToCm != null && rawDimensions
          ? Math.max(
              rawDimensions.lengthCm,
              rawDimensions.breadthCm,
              rawDimensions.heightCm,
            )
          : rawMeshBounds.maxExtent;

    const baseScale =
      (Math.min(width, height) * 0.56 * zoom) /
      Math.max(maxDimension, 1e-6);

    const activeCutAxis = currentCut ? getAxis(currentCut.plane_axis) : null;
    const orientProgress =
      currentPhase === "CUT_STEP"
        ? smoothstep(Math.min(cutProgress / 0.16, 1))
        : 0;

    const targetRotation =
      activeCutAxis === "X"
        ? { x: 18, y: -8 }
        : activeCutAxis === "Y"
          ? { x: 58, y: -34 }
          : activeCutAxis === "Z"
            ? { x: 18, y: -88 }
            : rotation;

    const effectiveRotation = {
      x: rotation.x + (targetRotation.x - rotation.x) * orientProgress,
      y: rotation.y + (targetRotation.y - rotation.y) * orientProgress,
    };

    const yaw = (effectiveRotation.y * Math.PI) / 180;
    const pitch = (effectiveRotation.x * Math.PI) / 180;

    const project = (x: number, y: number, z: number): ProjectedPoint => {
      const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
      const rz = x * Math.sin(yaw) + z * Math.cos(yaw);

      const ry = y * Math.cos(pitch) - rz * Math.sin(pitch);
      const rz2 = y * Math.sin(pitch) + rz * Math.cos(pitch);

      const perspective = 1 / Math.max(0.42, 1 + rz2 * 0.0019);

      return [
        width / 2 + rx * baseScale * perspective,
        height / 2 + ry * baseScale * perspective,
        rz2,
      ];
    };

    const drawIrregularMesh = () => {
      const modelVertices = rawMesh.vertices.map(([x, y, z]) => {
        const centeredX = x - rawMeshBounds.center[0];
        const centeredY = y - rawMeshBounds.center[1];
        const centeredZ = z - rawMeshBounds.center[2];

        if (meshMetricFactor != null) {
          return [
            centeredX * meshMetricFactor,
            centeredY * meshMetricFactor,
            centeredZ * meshMetricFactor,
          ] as [number, number, number];
        }

        if (visualProxyScaleToCm != null) {
          return [
            centeredX * visualProxyScaleToCm.x,
            centeredY * visualProxyScaleToCm.y,
            centeredZ * visualProxyScaleToCm.z,
          ] as [number, number, number];
        }

        return [centeredX, centeredY, centeredZ] as [number, number, number];
      });

      const projectedVertices = modelVertices.map(([x, y, z]) =>
        project(x, y, z),
      );

      const priorCompletedCuts =
        currentStepIndex <= 0
          ? 0
          : Math.min(currentStepIndex - 1, cuttingSteps.length);
      const activeCutIsSeparated =
        currentPhase === "CUT_STEP" && cutProgress >= 0.88;
      const appliedCutCount = Math.min(
        priorCompletedCuts + (activeCutIsSeparated ? 1 : 0),
        cuttingSteps.length,
      );

      const appliedMetricPlanes = cuttingSteps
        .slice(0, appliedCutCount)
        .map((step) =>
          resolveMetricCutPlane(
            step,
            rawMeshBounds.center,
            meshMetricFactor,
          ),
        )
        .filter(
          (plane): plane is MetricCutPlane =>
            plane != null && plane.source === "BACKEND_WORLD_PLANE",
        );

      const clip = rawDimensions
        ? {
            minX: -rawDimensions.lengthCm / 2,
            maxX: rawDimensions.lengthCm / 2,
            minY: -rawDimensions.heightCm / 2,
            maxY: rawDimensions.heightCm / 2,
            minZ: -rawDimensions.breadthCm / 2,
            maxZ: rawDimensions.breadthCm / 2,
          }
        : null;

      if (clip && visualCutAlignmentAvailable) {
        for (const step of cuttingSteps.slice(0, appliedCutCount)) {
          const axis = getAxis(step.plane_axis);
          const positionCm = finiteNumber(step.position_cm)
            ? step.position_cm
            : finiteNumber(step.position_m)
              ? step.position_m * 100
              : null;

          if (!axis || positionCm == null) continue;

          const label = String(step.cut_name || "").toUpperCase();
          const isMin = label.includes("MIN");
          const isMax = label.includes("MAX");

          if (axis === "X") {
            if (isMin) clip.minX = Math.max(clip.minX, positionCm);
            else if (isMax) clip.maxX = Math.min(clip.maxX, positionCm);
          } else if (axis === "Y") {
            if (isMin) clip.minY = Math.max(clip.minY, positionCm);
            else if (isMax) clip.maxY = Math.min(clip.maxY, positionCm);
          } else if (axis === "Z") {
            if (isMin) clip.minZ = Math.max(clip.minZ, positionCm);
            else if (isMax) clip.maxZ = Math.min(clip.maxZ, positionCm);
          }
        }
      }

      const faces = rawMesh.triangles
        .filter((triangle) => {
          if (!clip || !visualCutAlignmentAvailable) return true;

          const a = modelVertices[triangle[0]];
          const b = modelVertices[triangle[1]];
          const c = modelVertices[triangle[2]];
          const centroid: [number, number, number] = [
            (a[0] + b[0] + c[0]) / 3,
            (a[1] + b[1] + c[1]) / 3,
            (a[2] + b[2] + c[2]) / 3,
          ];

          const insideLegacyClip =
            centroid[0] >= clip.minX &&
            centroid[0] <= clip.maxX &&
            centroid[1] >= clip.minY &&
            centroid[1] <= clip.maxY &&
            centroid[2] >= clip.minZ &&
            centroid[2] <= clip.maxZ;

          const insideMetricPlanes = appliedMetricPlanes.every((plane) => {
            const signedDistance =
              (centroid[0] - plane.originCm[0]) * plane.normal[0] +
              (centroid[1] - plane.originCm[1]) * plane.normal[1] +
              (centroid[2] - plane.originCm[2]) * plane.normal[2];
            return signedDistance <= 1e-7;
          });

          return insideLegacyClip && insideMetricPlanes;
        })
        .map((triangle) => ({
          triangle,
          depth:
            (
              projectedVertices[triangle[0]][2] +
              projectedVertices[triangle[1]][2] +
              projectedVertices[triangle[2]][2]
            ) / 3,
        }))
        .sort((a, b) => a.depth - b.depth);

      for (const { triangle } of faces) {
        const a = projectedVertices[triangle[0]];
        const b = projectedVertices[triangle[1]];
        const c = projectedVertices[triangle[2]];

        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.closePath();

        ctx.fillStyle = isLight
          ? "rgba(120,86,55,0.76)"
          : "rgba(151,108,70,0.82)";
        ctx.fill();

        ctx.strokeStyle = isLight
          ? "rgba(71,50,34,0.22)"
          : "rgba(247,208,153,0.17)";
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
    };

    const drawBox = (
      box: BoxDimensions,
      stroke: string,
      fill: string,
      lineWidth: number,
      dashed = false,
      options: {
        openBottom?: boolean;
        labelUnobservedBottom?: boolean;
      } = {},
    ) => {
      const halfX = box.lengthCm / 2;
      const halfY = box.heightCm / 2;
      const halfZ = box.breadthCm / 2;

      const vertices: Array<[number, number, number]> = [
        [-halfX, -halfY, -halfZ],
        [halfX, -halfY, -halfZ],
        [halfX, halfY, -halfZ],
        [-halfX, halfY, -halfZ],
        [-halfX, -halfY, halfZ],
        [halfX, -halfY, halfZ],
        [halfX, halfY, halfZ],
        [-halfX, halfY, halfZ],
      ];

      const projected = vertices.map(([x, y, z]) => project(x, y, z));

      const faces: Array<{
        indices: number[];
        surface: SurfaceName;
      }> = [
        { indices: [0, 1, 2, 3], surface: "FRONT" },
        { indices: [4, 5, 6, 7], surface: "BACK" },
        // Y is the viewer's vertical axis: -Y is BOTTOM, +Y is TOP.
        { indices: [0, 1, 5, 4], surface: "BOTTOM" },
        { indices: [2, 3, 7, 6], surface: "TOP" },
        { indices: [1, 2, 6, 5], surface: "RIGHT" },
        { indices: [0, 3, 7, 4], surface: "LEFT" },
      ];

      const sortedFaces = faces
        .filter(
          (face) =>
            !(options.openBottom === true && face.surface === "BOTTOM"),
        )
        .map((face) => ({
          ...face,
          depth:
            face.indices.reduce(
              (sum, index) => sum + projected[index][2],
              0,
            ) / face.indices.length,
        }))
        .sort((a, b) => a.depth - b.depth);

      for (const face of sortedFaces) {
        ctx.beginPath();
        face.indices.forEach((index, position) => {
          const [px, py] = projected[index];
          if (position === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }

      const bottomEdges = new Set(["0-1", "4-5", "0-4", "1-5"]);
      const edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ];

      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashed ? [6, 5] : []);

      for (const [a, b] of edges) {
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        if (options.openBottom === true && bottomEdges.has(key)) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(projected[a][0], projected[a][1]);
        ctx.lineTo(projected[b][0], projected[b][1]);
        ctx.stroke();
      }

      ctx.setLineDash([]);

      if (options.openBottom === true && options.labelUnobservedBottom === true) {
        // Draw only a warning guide around the missing underside.
        // This is deliberately dashed and unfilled so it cannot be mistaken
        // for reconstructed granite.
        const bottomLoop = [0, 1, 5, 4];
        ctx.save();
        ctx.strokeStyle = isLight
          ? "rgba(185,28,28,0.58)"
          : "rgba(248,113,113,0.66)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        bottomLoop.forEach((index, position) => {
          const [px, py] = projected[index];
          if (position === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();

        const bottomCenter = project(0, -halfY, 0);
        const label = "BOTTOM UNOBSERVED · NOT CAPTURED";
        ctx.font = "800 9px ui-monospace, SFMono-Regular, monospace";
        const width = ctx.measureText(label).width + 18;
        const x = bottomCenter[0] - width / 2;
        const y = bottomCenter[1] + 16;

        ctx.fillStyle = isLight
          ? "rgba(255,255,255,0.94)"
          : "rgba(5,7,10,0.90)";
        ctx.strokeStyle = isLight
          ? "rgba(185,28,28,0.30)"
          : "rgba(248,113,113,0.38)";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.roundRect(x, y, width, 24, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isLight ? "#b91c1c" : "#fca5a5";
        ctx.textAlign = "center";
        ctx.fillText(label, bottomCenter[0], y + 15);
        ctx.textAlign = "start";
        ctx.restore();
      }
    };

    const drawCutPlane = (
      step: DressingCutStep,
      progress: number,
    ) => {
      if (!rawDimensions || !visualCutAlignmentAvailable) return;

      const plane = resolveMetricCutPlane(
        step,
        rawMeshBounds.center,
        meshMetricFactor,
      );
      if (!plane) return;

      const normal = plane.normal;
      const helper: [number, number, number] =
        Math.abs(normal[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];

      const cross = (
        a: [number, number, number],
        b: [number, number, number],
      ): [number, number, number] => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      const normalize = (
        value: [number, number, number],
      ): [number, number, number] => {
        const length = Math.max(Math.hypot(...value), 1e-9);
        return [value[0] / length, value[1] / length, value[2] / length];
      };

      const u = normalize(cross(helper, normal));
      const v = normalize(cross(normal, u));
      const half = Math.max(
        rawDimensions.lengthCm,
        rawDimensions.breadthCm,
        rawDimensions.heightCm,
      ) * 0.68;

      const point = (
        su: number,
        sv: number,
      ): [number, number, number] => [
        plane.originCm[0] + u[0] * su + v[0] * sv,
        plane.originCm[1] + u[1] * su + v[1] * sv,
        plane.originCm[2] + u[2] * su + v[2] * sv,
      ];

      const corners = [
        point(-half, -half),
        point(half, -half),
        point(half, half),
        point(-half, half),
      ];
      const projected = corners.map(([x, y, z]) => project(x, y, z));

      const planeAppear = smoothstep((progress - 0.27) / 0.17);
      const cuttingTravel = smoothstep((progress - 0.45) / 0.28);
      const separation = smoothstep((progress - 0.73) / 0.18);

      if (planeAppear <= 0) return;

      ctx.save();
      ctx.globalAlpha = planeAppear;

      ctx.beginPath();
      projected.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = isLight
        ? "rgba(22,159,158,0.12)"
        : "rgba(66,201,221,0.12)";
      ctx.strokeStyle = isLight ? "#087f82" : "#42c9dd";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      const scanA = project(...point(
        -half + cuttingTravel * half * 2,
        -half,
      ));
      const scanB = project(...point(
        -half + cuttingTravel * half * 2,
        half,
      ));

      if (cuttingTravel > 0) {
        ctx.beginPath();
        ctx.moveTo(scanA[0], scanA[1]);
        ctx.lineTo(scanB[0], scanB[1]);
        ctx.strokeStyle = isLight ? "#b45309" : "#fde68a";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      const centroid = project(...plane.originCm);
      if (separation > 0) {
        const badgeText = finiteNumber(step.removed_volume_m3)
          ? `REMOVED ${step.removed_volume_m3.toFixed(4)} m³`
          : "REMOVED VOLUME NOT REPORTED";
        const badgeX = centroid[0];
        const badgeY = centroid[1] + 40;

        ctx.fillStyle = isLight
          ? "rgba(255,255,255,0.94)"
          : "rgba(5,7,10,0.88)";
        ctx.strokeStyle = isLight
          ? "rgba(185,28,28,0.28)"
          : "rgba(248,113,113,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX - 88, badgeY - 15, 176, 30, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isLight ? "#b91c1c" : "#fca5a5";
        ctx.font = "800 9px ui-monospace, SFMono-Regular, monospace";
        ctx.textAlign = "center";
        ctx.fillText(badgeText, badgeX, badgeY + 3);
        ctx.textAlign = "start";
      }

      ctx.fillStyle = isLight ? "#087f82" : "#79dcd7";
      ctx.font = "800 10px ui-monospace, SFMono-Regular, monospace";
      ctx.fillText(
        plane.source === "BACKEND_WORLD_PLANE"
          ? "METRIC WORLD CUT PLANE"
          : `${plane.axis} AXIS CUT`,
        centroid[0] + 8,
        centroid[1] - 8,
      );

      ctx.restore();
    };

    // The reconstructed irregular mesh is the ONLY raw-stone geometry.
    drawIrregularMesh();

    // Rectangular dimensions are permitted only as a labelled engineering
    // overlay. They are never filled and never substitute for the stone.
    if (rawDimensions && visualCutAlignmentAvailable) {
      const rawStroke = isLight
        ? "rgba(71,85,105,0.48)"
        : "rgba(226,232,240,0.34)";
      const rawFill = "rgba(0,0,0,0)";

      drawBox(
        rawDimensions,
        rawStroke,
        rawFill,
        1.0,
        true,
        {
          openBottom: !bottomObserved,
          labelUnobservedBottom: false,
        },
      );
    }

    if (
      currentPhase === "CUT_STEP" &&
      currentCut &&
      visualCutAlignmentAvailable
    ) {
      drawCutPlane(currentCut, cutProgress);
    }

    if (
      dressedDimensions &&
      (currentPhase === "FINAL_DRESSED_BLOCK" ||
        currentStepIndex > cuttingSteps.length / 2)
    ) {
      drawBox(
        dressedDimensions,
        isLight ? "#9a651d" : "#e8b45e",
        isLight ? "rgba(154,101,29,0.09)" : "rgba(232,180,94,0.10)",
        2.2,
        false,
        {
          openBottom: !bottomObserved,
          labelUnobservedBottom: !bottomObserved,
        },
      );
    }

    const labelX = 18;
    const labelY = 18;
    const labelWidth = Math.min(372, width - 36);
    const labelHeight = 86;

    ctx.fillStyle = isLight
      ? "rgba(255,255,255,0.90)"
      : "rgba(10,13,17,0.88)";
    ctx.strokeStyle = isLight
      ? "rgba(100,116,139,0.24)"
      : "rgba(255,255,255,0.11)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLight ? "#9a651d" : "#e8b45e";
    ctx.font = "800 9px ui-monospace, SFMono-Regular, monospace";
    ctx.fillText("ENGINEERING CUT SIMULATION", labelX + 14, labelY + 21);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";

    const phaseText =
      currentPhase === "SOURCE_ENVELOPE"
        ? "Raw reconstructed Digital Twin"
        : currentPhase === "FINAL_DRESSED_BLOCK"
          ? bottomObserved
            ? "Final backend-reported dressed block"
            : "Planned dressed envelope · bottom unobserved"
          : `${cutAnimationLabel(activeCutAnimationPhase)} · ${
              currentCut?.cut_name || "Backend cut step"
            }`;

    ctx.fillText(
      phaseText.length > 48 ? `${phaseText.slice(0, 45)}…` : phaseText,
      labelX + 14,
      labelY + 44,
    );

    ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
    ctx.font = "500 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      !bottomObserved
        ? "BOTTOM was not captured: underside is left open and is not reconstructed or claimed."
        : meshMetricFactor != null
          ? "Irregular surface = reconstructed mesh; dashed box = engineering bounds."
          : visualProxyScaleToCm != null
            ? "Visual proxy aligned to reported extents for dressing animation; non-statutory visualization."
            : "Irregular surface = reconstructed mesh; cut overlay unavailable.",
      labelX + 14,
      labelY + 65,
    );
  }, [
    activeCutAnimationPhase,
    currentCut,
    currentPhase,
    currentStepIndex,
    bottomObserved,
    cutProgress,
    cuttingSteps,
    dressedDimensions,
    rawDimensions,
    irregularRawMeshAvailable,
    meshError,
    meshLoading,
    meshMetricFactor,
    visualCutAlignmentAvailable,
    visualProxyScaleToCm,
    rawMesh.vertices,
    rawMesh.triangles,
    rawMeshBounds.center,
    rawMeshBounds.maxExtent,
    resolvedTheme,
    rotation,
    zoom,
  ]);

  useEffect(() => {
    drawScene();

    const handleResize = () => drawScene();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [drawScene]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setDragging(true);
    setDragStart({
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;

    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;

    setRotation((current) => ({
      x: Math.max(-80, Math.min(80, current.x + deltaY * 0.35)),
      y: current.y + deltaX * 0.35,
    }));

    setDragStart({
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handlePointerUp = () => setDragging(false);

  const progressPercent =
    maxTimelineIndex > 0
      ? Math.round(
          clamp01(
            currentStepIndex >= maxTimelineIndex
              ? 1
              : (Math.max(currentStepIndex - 1, 0) + cutProgress) /
                  Math.max(cuttingSteps.length, 1),
          ) * 100,
        )
      : 0;

  const activeCutPercent =
    currentPhase === "CUT_STEP"
      ? Math.round(cutProgress * 100)
      : currentPhase === "FINAL_DRESSED_BLOCK"
        ? 100
        : 0;

  const sourceVolume =
    rawDimensions != null
      ? (rawDimensions.lengthCm *
          rawDimensions.breadthCm *
          rawDimensions.heightCm) /
        1_000_000
      : null;

  const recoveredVolume =
    finiteNumber(selectedOrientation?.usable_volume_m3)
      ? selectedOrientation.usable_volume_m3
      : null;

  const yieldPercentage =
    finiteNumber(selectedOrientation?.yield_percentage)
      ? selectedOrientation.yield_percentage
      : finiteNumber(cutting?.yield_percentage)
        ? cutting.yield_percentage
        : null;

  const wastePercentage =
    finiteNumber(selectedOrientation?.waste_percentage)
      ? selectedOrientation.waste_percentage
      : finiteNumber(cutting?.wastage_percentage)
        ? cutting.wastage_percentage
        : null;

  const completedCuts =
    currentStepIndex <= 0
      ? 0
      : currentStepIndex >= maxTimelineIndex
        ? cuttingSteps.length
        : Math.min(
            Math.max(currentStepIndex - 1, 0) +
              (cutProgress >= 0.88 ? 1 : 0),
            cuttingSteps.length,
          );

  const cumulativeRemovedVolume = cuttingSteps
    .slice(0, completedCuts)
    .reduce(
      (sum, step) =>
        sum +
        (finiteNumber(step.removed_volume_m3)
          ? Math.max(step.removed_volume_m3, 0)
          : 0),
      0,
    );

  const totalReportedRemovedVolume = cuttingSteps.reduce(
    (sum, step) =>
      sum +
      (finiteNumber(step.removed_volume_m3)
        ? Math.max(step.removed_volume_m3, 0)
        : 0),
    0,
  );

  const cutsWithRationale = cuttingSteps.filter(
    (step) => typeof step.reason === "string" && step.reason.trim().length > 0,
  ).length;

  const cutsWithReportedRemoval = cuttingSteps.filter(
    (step) =>
      finiteNumber(step.removed_volume_m3) &&
      step.removed_volume_m3 >= 0,
  ).length;

  const cutsWithUsablePlane = cuttingSteps.filter((step) => {
    const axis = getAxis(step.plane_axis);
    const hasPosition =
      finiteNumber(step.position_cm) ||
      finiteNumber(step.position_m);
    return axis != null && hasPosition;
  }).length;

  const procedureEvidenceScore =
    cuttingSteps.length > 0
      ? Math.round(
          ((cutsWithRationale +
            cutsWithReportedRemoval +
            cutsWithUsablePlane) /
            (cuttingSteps.length * 3)) *
            100,
        )
      : 0;

  const envelopeRemainingAfterReportedCuts =
    sourceVolume != null
      ? Math.max(sourceVolume - cumulativeRemovedVolume, 0)
      : null;

  const reportedRemovalPctOfEnvelope =
    sourceVolume != null && sourceVolume > 0
      ? (cumulativeRemovedVolume / sourceVolume) * 100
      : null;

  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-glass)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--text-primary)]">
                <Scissors className="h-3 w-3 text-[var(--accent-strong)]" />
                Dressing procedure simulator
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                Irregular reconstructed-mesh cutting
              </span>
            </div>

            <h3 className="mt-3 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">
              Irregular raw granite → evidence cut planes → recoverable dressed block
            </h3>

            <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">
              Raw granite is rendered only from the validated reconstructed
              irregular mesh. Length × breadth × height never creates the stone.
              A rectangular source box, when shown, is only a thin engineering
              bounds overlay.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
            <CutReadout
              label="Source envelope"
              value={
                rawDimensions
                  ? `${rawDimensions.lengthCm.toFixed(1)} × ${rawDimensions.breadthCm.toFixed(1)} × ${rawDimensions.heightCm.toFixed(1)} cm`
                  : "Not reported"
              }
            />
            <CutReadout
              label="Recoverable block"
              value={
                dressedDimensions
                  ? `${dressedDimensions.lengthCm.toFixed(1)} × ${dressedDimensions.breadthCm.toFixed(1)} × ${dressedDimensions.heightCm.toFixed(1)} cm`
                  : "Not reported"
              }
              tone="accent"
            />
            <CutReadout
              label="Yield"
              value={
                finiteNumber(yieldPercentage)
                  ? `${yieldPercentage.toFixed(1)}%`
                  : "Not reported"
              }
              tone="success"
            />
            <CutReadout
              label="Waste"
              value={
                finiteNumber(wastePercentage)
                  ? `${wastePercentage.toFixed(1)}%`
                  : "Not reported"
              }
              tone="warning"
            />
          </div>
        </div>
      </div>

      <div
        className={[
          "border-b px-4 py-3 text-[10px] font-semibold",
          irregularRawMeshAvailable
            ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
            : "border-amber-500/25 bg-amber-500/[0.08] text-amber-200",
        ].join(" ")}
      >
        {irregularRawMeshAvailable
          ? visualGraniteProxyAvailable && meshMetricFactor == null
            ? `VISUAL GRANITE PROXY ACTIVE — ${rawMesh.vertices.length.toLocaleString()} vertices / ${rawMesh.triangles.length.toLocaleString()} triangles · dressing animation aligned to reported extents · NON-STATUTORY`
            : `IRREGULAR RAW MESH ACTIVE — ${rawMesh.vertices.length.toLocaleString()} vertices / ${rawMesh.triangles.length.toLocaleString()} triangles${rawMesh.method ? ` · ${rawMesh.method}` : ""}`
          : meshLoading
            ? "LOADING GRANITE RECONSTRUCTION…"
            : "GRANITE VISUAL MESH UNAVAILABLE — cut sequence remains visible as plan data, but no fabricated raw stone is drawn."}
      </div>

      {orientations.length > 0 && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-3 sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Orientation alternatives
            </p>
            <span className="font-mono text-[9px] font-black text-[var(--accent)]">
              {activeOrientationIndex + 1}/{orientations.length}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {orientations.map((orientation, index) => {
              const active = index === activeOrientationIndex;

              return (
                <button
                  key={`${orientation.orientation}-${index}`}
                  type="button"
                  onClick={() => selectOrientation(index)}
                  className={[
                    "min-w-[190px] rounded-2xl border p-3 text-left transition",
                    active
                      ? "border-[var(--accent)]/45 bg-[var(--accent-soft)] shadow-[var(--shadow-soft)]"
                      : "border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-black text-[var(--text-primary)]">
                      {orientation.orientation || `Orientation ${index + 1}`}
                    </p>
                    {index === 0 && (
                      <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent-strong)]" />
                    )}
                  </div>

                  <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[var(--text-muted)]">
                    {orientation.description || "No orientation description reported."}
                  </p>

                  <div className="mt-2 flex items-center gap-3 font-mono text-[9px] font-black">
                    <span className="text-[var(--success)]">
                      Y{" "}
                      {finiteNumber(orientation.yield_percentage)
                        ? `${orientation.yield_percentage.toFixed(1)}%`
                        : "—"}
                    </span>
                    <span className="text-[var(--warning)]">
                      W{" "}
                      {finiteNumber(orientation.waste_percentage)
                        ? `${orientation.waste_percentage.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-glass)] p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4">
        <ProcedureSignal
          label="Cut-plane evidence"
          value={
            cuttingSteps.length > 0
              ? `${cutsWithUsablePlane}/${cuttingSteps.length}`
              : "No cuts"
          }
          detail="Cuts with a backend axis and coordinate that can be visualized."
          tone={cutsWithUsablePlane === cuttingSteps.length && cuttingSteps.length > 0 ? "success" : "warning"}
        />
        <ProcedureSignal
          label="Engineering rationale"
          value={
            cuttingSteps.length > 0
              ? `${cutsWithRationale}/${cuttingSteps.length}`
              : "No cuts"
          }
          detail="Cuts carrying a backend-reported reason instead of a generic label."
          tone={cutsWithRationale === cuttingSteps.length && cuttingSteps.length > 0 ? "success" : "warning"}
        />
        <ProcedureSignal
          label="Removal ledger"
          value={
            cuttingSteps.length > 0
              ? `${cutsWithReportedRemoval}/${cuttingSteps.length}`
              : "No cuts"
          }
          detail="Cuts with an explicit backend-reported removed volume."
          tone={cutsWithReportedRemoval === cuttingSteps.length && cuttingSteps.length > 0 ? "success" : "warning"}
        />
        <ProcedureSignal
          label="Procedure evidence"
          value={cuttingSteps.length > 0 ? `${procedureEvidenceScore}%` : "Not available"}
          detail="Completeness of coordinates, rationale and removal evidence; not an accuracy score."
          tone={procedureEvidenceScore >= 90 ? "success" : procedureEvidenceScore >= 60 ? "accent" : "warning"}
        />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="relative min-w-0 border-b border-[var(--border-subtle)] xl:border-b-0 xl:border-r">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="block w-full touch-none cursor-grab active:cursor-grabbing"
            aria-label="Irregular reconstructed granite cutting simulation"
          />

          <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(94%,620px)] -translate-x-1/2">
            <div className="rounded-2xl border border-white/10 bg-black/68 px-4 py-3 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-white/40">
                    Live dressing procedure
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-white">
                    {cutAnimationLabel(activeCutAnimationPhase)}
                  </p>
                </div>

                <div className="shrink-0 rounded-xl border border-[#e8b45e]/30 bg-[#e8b45e]/12 px-3 py-1.5 font-mono text-[10px] font-black text-[#f6d28b]">
                  {currentPhase === "SOURCE_ENVELOPE"
                    ? "SOURCE"
                    : currentPhase === "FINAL_DRESSED_BLOCK"
                      ? "RESULT"
                      : `CUT ${String(currentStepIndex).padStart(2, "0")} / ${String(cuttingSteps.length).padStart(2, "0")}`}
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#e8b45e] transition-[width] duration-75"
                  style={{ width: `${activeCutPercent}%` }}
                />
              </div>

              {currentCut ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-white/48">
                  <span>
                    Axis{" "}
                    <strong className="text-white/80">
                      {currentCut.plane_axis || "Not reported"}
                    </strong>
                  </span>
                  <span>
                    Position{" "}
                    <strong className="text-white/80">
                      {finiteNumber(currentCut.position_cm)
                        ? `${currentCut.position_cm.toFixed(2)} cm`
                        : finiteNumber(currentCut.position_m)
                          ? `${(currentCut.position_m * 100).toFixed(2)} cm`
                          : "Not reported"}
                    </strong>
                  </span>
                  <span>
                    Removal{" "}
                    <strong className="text-red-300">
                      {formatNumber(currentCut.removed_volume_m3, 4, " m³")}
                    </strong>
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(2.2, value + 0.12))}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:text-[var(--accent)]"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.12))}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:text-[var(--accent)]"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Reset viewer"
              onClick={resetViewer}
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-secondary)] shadow-[var(--shadow-soft)] backdrop-blur transition hover:text-[var(--accent)]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <aside className="min-w-0 bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Current procedure stage</p>
              <h4 className="mt-1 text-base font-black text-[var(--text-primary)]">
                {currentPhase === "SOURCE_ENVELOPE"
                  ? "Establish source extents"
                  : currentPhase === "FINAL_DRESSED_BLOCK"
                    ? "Final recoverable block"
                    : currentCut?.cut_name || "Backend cutting step"}
              </h4>
            </div>

            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-[9px] font-black text-[var(--accent)]">
              {currentStepIndex + 1}/{timelineLength}
            </span>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-4">
            {currentPhase === "SOURCE_ENVELOPE" && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center gap-2 text-[var(--info)]">
                  <Gauge className="h-4 w-4" />
                  <span className="text-[9px] font-black uppercase tracking-[0.14em]">
                    Datum preparation
                  </span>
                </div>
                <p className="mt-2 text-xs font-black text-[var(--text-primary)]">
                  Start from reconstructed irregular raw surface
                </p>
                <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-secondary)]">
                  No rectangular stone is invented. The reconstructed mesh is
                  the raw granite. Backend dimensions are used only as engineering
                  bounds when the mesh coordinate units are metric.
                </p>
              </div>
            )}

            {currentPhase === "CUT_STEP" && currentCut && (
              <div className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                  <Route className="h-4 w-4" />
                  <span className="text-[9px] font-black uppercase tracking-[0.14em]">
                    Backend cut #{currentCut.step_number}
                  </span>
                </div>

                <p className="mt-2 text-sm font-black text-[var(--text-primary)]">
                  {currentCut.cut_name || "Unnamed cut"}
                </p>

                <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                  {currentCut.reason || "No engineering rationale was reported."}
                </p>

                <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
                      {cutAnimationLabel(activeCutAnimationPhase)}
                    </span>
                    <span className="font-mono text-[9px] font-black text-[var(--text-muted)]">
                      {activeCutPercent}%
                    </span>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-[var(--text-secondary)]">
                    {activeCutAnimationPhase === "ORIENT"
                      ? "The Digital Twin rotates toward the backend-reported cut axis before the cut plane is introduced."
                      : activeCutAnimationPhase === "RATIONALE"
                        ? "The engineering rationale remains visible before any removal is represented."
                        : activeCutAnimationPhase === "PLANE"
                          ? "The backend cut coordinate is positioned against the metric-aligned irregular reconstruction."
                          : activeCutAnimationPhase === "CUTTING"
                            ? "The luminous travel line shows the cutting path progressing across the reported plane."
                            : activeCutAnimationPhase === "SEPARATION"
                              ? "The separation outline identifies the reported removal side. The irregular mesh is clipped only near completion of this phase."
                              : "This backend-reported cut has completed and the retained irregular mesh is ready for the next stage."}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <CutReadout
                    label="Plane axis"
                    value={currentCut.plane_axis || "Not reported"}
                    tone="accent"
                  />
                  <CutReadout
                    label="Plane position"
                    value={
                      finiteNumber(currentCut.position_cm)
                        ? `${currentCut.position_cm.toFixed(2)} cm`
                        : finiteNumber(currentCut.position_m)
                          ? `${(currentCut.position_m * 100).toFixed(2)} cm`
                          : "Not reported"
                    }
                  />
                  <CutReadout
                    label="Cut area"
                    value={formatNumber(currentCut.cut_area_m2, 4, " m²")}
                  />
                  <CutReadout
                    label="Removed volume"
                    value={formatNumber(currentCut.removed_volume_m3, 5, " m³")}
                    tone="warning"
                  />
                </div>

                <div className="mt-2">
                  <CutReadout
                    label="Waste classification"
                    value={currentCut.waste_category || "Not reported"}
                  />
                </div>

                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-3">
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <ClipboardCheck className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
                    <span className="text-[8px] font-black uppercase tracking-[0.14em]">
                      Cumulative optimizer ledger
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <CutReadout
                      label="Cuts completed"
                      value={`${completedCuts}/${cuttingSteps.length}`}
                    />
                    <CutReadout
                      label="Reported removal"
                      value={`${cumulativeRemovedVolume.toFixed(5)} m³`}
                      tone="warning"
                    />
                    <CutReadout
                      label="Envelope removal share"
                      value={
                        reportedRemovalPctOfEnvelope != null
                          ? `${reportedRemovalPctOfEnvelope.toFixed(2)}%`
                          : "Not available"
                      }
                    />
                    <CutReadout
                      label="Envelope balance"
                      value={
                        envelopeRemainingAfterReportedCuts != null
                          ? `${envelopeRemainingAfterReportedCuts.toFixed(5)} m³`
                          : "Not available"
                      }
                      tone="accent"
                    />
                  </div>
                  <p className="mt-2 text-[8px] leading-4 text-[var(--text-muted)]">
                    Envelope balance is bookkeeping against the rectangular source measurement envelope.
                    It is not a claim about irregular raw-stone volume unless the backend separately proves that volume.
                  </p>
                </div>
              </div>
            )}

            {currentPhase === "FINAL_DRESSED_BLOCK" && (
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[var(--success-muted)] p-4">
                <div className="flex items-center gap-2 text-[var(--success)]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-[9px] font-black uppercase tracking-[0.14em]">
                    Recoverable geometry
                  </span>
                </div>

                <p className="mt-2 text-sm font-black text-[var(--text-primary)]">
                  {dressedDimensions
                    ? bottomObserved
                      ? "Final dressed dimensions reported"
                      : "Planned dressed envelope — bottom unobserved"
                    : "Final dressed dimensions unavailable"}
                </p>

                <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-secondary)]">
                  {dressedDimensions
                    ? `${dressedDimensions.lengthCm.toFixed(2)} × ${dressedDimensions.breadthCm.toFixed(2)} × ${dressedDimensions.heightCm.toFixed(2)} cm${
                        bottomObserved
                          ? ""
                          : " · underside excluded from observed geometry"
                      }`
                    : "The viewer does not create a dressed cuboid when the backend has not reported all required dimensions."}
                </p>

                {!bottomObserved && (
                  <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/[0.06] px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
                      <p className="text-[9px] leading-4 text-[var(--text-secondary)]">
                        Bottom surface was not captured. The underside is intentionally
                        left open in the cutting result. No bottom face, bottom texture,
                        bottom defect state, or bottom cut is visually asserted.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CutReadout
                    label="Total reported cuts"
                    value={`${cuttingSteps.length}`}
                  />
                  <CutReadout
                    label="Total reported removal"
                    value={`${totalReportedRemovedVolume.toFixed(5)} m³`}
                    tone="warning"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <CutReadout
              label="Source envelope volume"
              value={
                finiteNumber(sourceVolume)
                  ? `${sourceVolume.toFixed(4)} m³`
                  : "Not reported"
              }
            />
            <CutReadout
              label="Recovered volume"
              value={
                finiteNumber(recoveredVolume)
                  ? `${recoveredVolume.toFixed(4)} m³`
                  : "Not reported"
              }
              tone="success"
            />
          </div>

          <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--warning-muted)] p-3.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
              <p className="text-[9px] leading-4 text-[var(--text-secondary)]">
                This cutting viewer now requires the same reconstructed
                irregular raw-mesh evidence used by the Digital Twin. It never
                manufactures raw granite from a rectangular dimension box. Cut
                planes are drawn only when backend coordinates can be aligned to
                metric mesh units. For the connected V19 visual proxy, the
                observed mesh is normalized to the reported extents only for the
                dressing animation and remains explicitly non-statutory.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-glass)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={previousStep}
              disabled={currentStepIndex <= 0}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Previous cutting stage"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentStepIndex >= maxTimelineIndex) {
                  setCurrentStepIndex(0);
                  setCutProgress(0);
                  cutAnimationStartRef.current = null;
                }
                setPlaying((value) => !value);
              }}
              disabled={maxTimelineIndex <= 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-[var(--accent-contrast)] shadow-[var(--shadow-accent)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {playing ? "Pause procedure" : "Play procedure"}
            </button>

            <button
              type="button"
              onClick={nextStep}
              disabled={currentStepIndex >= maxTimelineIndex}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next cutting stage"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="text-[9px] leading-4 text-[var(--text-muted)]">
            Drag to orbit · use zoom controls · every rendered cut plane comes from backend coordinates.
          </p>
        </div>

        {cuttingSteps.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCutProgress(0);
                cutAnimationStartRef.current = null;
                setCurrentStepIndex(0);
              }}
              className={[
                "min-w-[138px] rounded-xl border px-3 py-2 text-left transition",
                currentStepIndex === 0
                  ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--surface)]",
              ].join(" ")}
            >
              <p className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                Stage 00
              </p>
              <p className="mt-1 truncate text-[9px] font-black text-[var(--text-primary)]">
                Source envelope
              </p>
            </button>

            {cuttingSteps.map((step, index) => {
              const timelineIndex = index + 1;

              return (
                <button
                  key={`${step.step_number}-${step.cut_name}-${index}`}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setCutProgress(0);
                    cutAnimationStartRef.current = null;
                    setCurrentStepIndex(timelineIndex);
                  }}
                  className={[
                    "min-w-[180px] rounded-xl border px-3 py-2 text-left transition",
                    currentStepIndex === timelineIndex
                      ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  <p className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                    Cut {step.step_number ?? index + 1}
                  </p>
                  <p className="mt-1 truncate text-[9px] font-black text-[var(--text-primary)]">
                    {step.cut_name || "Unnamed cut"}
                  </p>
                  <p className="mt-1 font-mono text-[8px] text-[var(--warning)]">
                    {finiteNumber(step.removed_volume_m3)
                      ? `${step.removed_volume_m3.toFixed(5)} m³ removed`
                      : "Removal not reported"}
                  </p>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCutProgress(1);
                cutAnimationStartRef.current = null;
                setCurrentStepIndex(maxTimelineIndex);
              }}
              className={[
                "min-w-[150px] rounded-xl border px-3 py-2 text-left transition",
                currentStepIndex === maxTimelineIndex
                  ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[var(--success-muted)]"
                  : "border-[var(--border)] bg-[var(--surface)]",
              ].join(" ")}
            >
              <p className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                Final
              </p>
              <p className="mt-1 truncate text-[9px] font-black text-[var(--text-primary)]">
                Recoverable block
              </p>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

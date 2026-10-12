"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  Cpu,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Ruler,
  ScanSearch,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Triangle,
  ChevronDown,
  ScanLine,
  Loader2,
} from 'lucide-react';
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Html,
  Line,
  OrbitControls,
} from "@react-three/drei";

import { apiAssetUrl, getPointCloudData } from "../../lib/api";
import { useLanguage } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import type {
  DressingCutStep,
  OrientationOption,
  ReconstructionQualityReport,
} from "../../lib/types";

export type ViewerMode =
  | "REAL_PHOTO_3D"
  | "PHOTOGRAPHS"
  | "RAW_3D"
  | "RAW_BOUNDING_BOX"
  | "DEFECT_MAP"
  | "USABLE_ENVELOPE"
  | "DRESSING_PLAN"
  | "FINAL_DRESSED_BLOCK";

export type ScenarioMode =
  | "MAXIMUM_RECOVERY"
  | "CONFIRMED_DAMAGE"
  | "CONSERVATIVE";


type TwinCutPhase =
  | "READY"
  | "ORIENT"
  | "RATIONALE"
  | "PLANE"
  | "CUTTING"
  | "SEPARATION"
  | "COMPLETE";

const TWIN_CUT_DURATION_MS = 6600;

function twinClamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function twinSmoothstep(value: number) {
  const t = twinClamp01(value);
  return t * t * (3 - 2 * t);
}

function twinCutPhase(progress: number): TwinCutPhase {
  if (progress <= 0) return "READY";
  if (progress < 0.15) return "ORIENT";
  if (progress < 0.3) return "RATIONALE";
  if (progress < 0.46) return "PLANE";
  if (progress < 0.74) return "CUTTING";
  if (progress < 0.92) return "SEPARATION";
  return "COMPLETE";
}

function twinCutPhaseLabel(phase: TwinCutPhase) {
  switch (phase) {
    case "READY":
      return "READY TO INSPECT";
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
  }
}


type RemovalSide = "MIN" | "MAX" | "UNKNOWN";

function resolveRemovalSide(
  step: DressingCutStep | null,
): RemovalSide {
  if (!step) return "UNKNOWN";

  const axis = String(
    step.plane_axis || "",
  ).toUpperCase();

  const name = String(
    step.cut_name || "",
  ).toUpperCase();

  const reason = String(
    step.reason || "",
  ).toUpperCase();

  const combined = `${axis} ${name} ${reason}`;

  if (
    /\bMIN\b|LEFT|BOTTOM|LOWER|START|NEGATIVE|MINIMUM/.test(
      combined,
    )
  ) {
    return "MIN";
  }

  if (
    /\bMAX\b|RIGHT|TOP|UPPER|END|POSITIVE|MAXIMUM/.test(
      combined,
    )
  ) {
    return "MAX";
  }

  return "UNKNOWN";
}

function cutAxisKey(
  step: DressingCutStep | null,
): "X" | "Y" | "Z" | null {
  const axis = String(
    step?.plane_axis || "",
  ).toUpperCase();

  if (axis.includes("X")) return "X";
  if (axis.includes("Y")) return "Y";
  if (axis.includes("Z")) return "Z";
  return null;
}

export interface DefectItem {
  id?: string;
  kind?: string;
  type?: string;
  category?: string;
  surface?: string;
  severity?: string;
  confidence?: number | null;
  depth?: number | null;
  depth_mm?: number | null;
  depth_status?: string;
  provenance?: string;
  measurement_provenance?: string;
  cutting_impact?: string;
  bbox?: number[];
  polygon_xy?: number[][] | null;
  image_region?: number[];
  geometry_region?: Record<string, unknown>;
  point_3d_cm?: [number, number, number] | null;
  triangle_index?: number | null;
  opening_width_cm?: number | null;
  opening_height_cm?: number | null;
  opening_area_cm2?: number | null;
  max_observed_depth_cm?: number | null;
  mean_observed_depth_cm?: number | null;
  visible_cavity_volume_cm3?: number | null;
  cavity_measurement_status?: string | null;
  internal_continuation_status?: string | null;
  rim_points_3d_cm?: Array<[number, number, number]>;
  interior_points_3d_cm?: Array<[number, number, number]>;

  // Persisted multi-view physical-cavity identity from the backend worker/API.
  // The viewer never creates or upgrades associations.
  physical_cavity_id?: string | null;
  association_status?: string | null;
  association_confidence?: string | null;
  associated_observation_count?: number | null;
  associated_observations?: Array<Record<string, unknown>>;
  evidence_view_count?: number | null;
  evidence_views?: string[];
  source_image_ids?: string[];
  physical_center_cm?: [number, number, number] | null;
  association_policy?: string | null;
  true_maximum_depth_status?: string | null;

  metadata?: {
    cavity_geometry?: Record<string, unknown> | null;
    [key: string]: unknown;
  } | null;
}

export interface ScenarioDetail {
  name?: string;
  goal?: string;
  usable_volume_m3?: number;
  waste_volume_m3?: number;
  waste_percentage?: number;
  recovery_yield_percentage?: number;
  dressed_dimensions?: {
    length_m: number;
    breadth_m: number;
    height_m: number;
  };
  cuts_count?: number;
  risk_profile?: string;
  evidence_basis?: string;
}

export interface PhotoEvidenceView {
  photo_id?: string;
  photo_label: string;
  side: string;
  view_name: string;
  camera_angles?: {
    azimuth: number;
    elevation: number;
    distance_m: number;
  } | null;
  image_url?: string | null;
  is_provided?: boolean;
  is_observed?: boolean;
  silhouette_iou?: number | null;
  boundary_error_px?: number | null;
  feature_reprojection_error_px?: number | null;
  weak_view?: boolean;
  shape_validation_source?: string | null;
  shape_validation_status?: string | null;
  shape_target_iou?: number | null;
  shape_target_met?: boolean | null;
  shape_score_scope?: string | null;
  view_confidence?: string;
  view_confidence_score?: number | null;
  reconstruction_status?: string;
  confirmed_geometry: string[];
  unconfirmed_geometry: string[];
  reconstruction_confidence: number;
  calibration_status?: string;
  provenance?: string;
  defects_detected?: string[];
  detected_defects_details?: Array<{
    id: string;
    type: string;
    category: string;
    severity?: string;
    confidence: number;
    depth_status: string;
    measurement_provenance: string;
    cutting_impact: string;
    image_region: [number, number, number, number] | number[];
    geometry_region?: Record<string, unknown>;
  }>;
  validation_layers?: {
    has_original_image: boolean;
    has_granite_mask: boolean;
    has_boundary_overlay: boolean;
    has_defect_overlay: boolean;
    has_reprojected_3d: boolean;
    has_difference_map: boolean;
  };
}

interface PointCloud3DViewerProps {
  jobId?: string;
  pointsUrl?: string | null;
  meshUrl?: string | null;
  dimensions?: {
    length_cm: number;
    breadth_cm: number;
    height_cm: number;
    length_m?: number;
    breadth_m?: number;
    height_m?: number;
  } | null;
  dressedDimensions?: {
    length_cm?: number;
    breadth_cm?: number;
    height_cm?: number;
  } | null;
  defects?: DefectItem[];
  cuttingSteps?: DressingCutStep[];
  orientations?: OrientationOption[];
  isDemo?: boolean;
  provider?: string | null;
  initialMode?: ViewerMode;
  observedSurfaces?: string[];
  missingSurfaces?: string[];
  scenarios?: Record<string, unknown>;
  photoEvidenceMatrix?: PhotoEvidenceView[] | null;
  reconstructionQuality?: ReconstructionQualityReport | null;
  analysisRunning?: boolean;
  analysisProgress?: number | null;
  analysisStage?: string | null;
  referenceMode?: boolean;
}

type MeshPayload = {
  vertices?: number[][];
  triangles?: number[][];
  vertex_normals?: number[][];
  triangle_count?: number;
  surface_area_cm2?: number | null;
  volume_cm3?: number | null;
  mesh_volume_cm3?: number | null;
  is_watertight?: boolean | null;
  mesh_method?: string | null;
  method?: string | null;
  mesh_status?: string | null;
  status?: string | null;
  units?: string;
  provenance?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
};

type PointPayload = {
  points?: number[][];
  point_count?: number;
};

type GeometryState = {
  points: number[][];
  meshVertices: number[][];
  meshTriangles: number[][];
  meshNormals: number[][];
  meshStatus: string;
  meshMethod: string | null;
  isWatertight: boolean | null;
  meshSurfaceAreaCm2: number | null;
  meshVolumeCm3: number | null;
  meshIntegrity: MeshIntegrity;
};

const EMPTY_GEOMETRY: GeometryState = {
  points: [],
  meshVertices: [],
  meshTriangles: [],
  meshNormals: [],
  meshStatus: "NOT_AVAILABLE",
  meshMethod: null,
  isWatertight: null,
  meshSurfaceAreaCm2: null,
  meshVolumeCm3: null,
  meshIntegrity: {
    boundaryEdgeCount: 0,
    totalEdgeCount: 0,
    boundaryEdgeRatio: 0,
    nonManifoldEdgeCount: 0,
    severeSurfaceDropout: false,
  },
};


function isValidatedIrregularRawMesh(
  geometry: GeometryState,
): boolean {
  const vertexCount =
    geometry.meshVertices.length;
  const triangleCount =
    geometry.meshTriangles.length;
  const status =
    geometry.meshStatus
      .trim()
      .toUpperCase();
  const method =
    (geometry.meshMethod ?? "")
      .trim()
      .toUpperCase();

  // A raw granite digital twin must be a real observed-surface mesh.
  // Extremely small meshes (for example 8 box corners / 12 box triangles)
  // are engineering envelopes, not evidence of stone irregularity.
  if (
    vertexCount < 24 ||
    triangleCount < 30
  ) {
    return false;
  }

  const forbiddenEvidence = [
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

  if (geometry.meshIntegrity.severeSurfaceDropout) {
    return false;
  }

  if (
    forbiddenEvidence.some(
      (token) =>
        status.includes(token) ||
        method.includes(token),
    )
  ) {
    return false;
  }

  return true;
}


function isDisplayableObservedMesh(
  geometry: GeometryState,
): boolean {
  const vertexCount = geometry.meshVertices.length;
  const triangleCount = geometry.meshTriangles.length;
  const status = geometry.meshStatus.trim().toUpperCase();
  const method = (geometry.meshMethod ?? "").trim().toUpperCase();

  if (vertexCount < 12 || triangleCount < 10) {
    return false;
  }

  const forbiddenEvidence = [
    "FALLBACK",
    "BOUNDING",
    "BBOX",
    "BOX",
    "CUBOID",
    "ENVELOPE",
    "AABB",
    "OBB",
  ];

  return !forbiddenEvidence.some(
    (token) => status.includes(token) || method.includes(token),
  );
}

type MeshIntegrity = {
  boundaryEdgeCount: number;
  totalEdgeCount: number;
  boundaryEdgeRatio: number;
  nonManifoldEdgeCount: number;
  severeSurfaceDropout: boolean;
};

function computeMeshIntegrity(
  triangles: number[][],
): MeshIntegrity {
  const edgeUse = new Map<string, number>();

  for (const triangle of triangles) {
    if (triangle.length < 3) continue;
    const a = triangle[0];
    const b = triangle[1];
    const c = triangle[2];
    const edges: Array<[number, number]> = [
      [a, b],
      [b, c],
      [c, a],
    ];

    for (const [u, v] of edges) {
      const lo = Math.min(u, v);
      const hi = Math.max(u, v);
      const key = `${lo}:${hi}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    if (count > 2) nonManifoldEdgeCount += 1;
  }

  const totalEdgeCount = edgeUse.size;
  const boundaryEdgeRatio =
    totalEdgeCount > 0
      ? boundaryEdgeCount / totalEdgeCount
      : 1;

  // This is a display-quality gate, not a physical-hole detector. Large
  // boundary ratios usually indicate reconstruction dropout/tearing. We never
  // close those gaps synthetically; instead we avoid presenting the torn mesh
  // as a finished solid Digital Twin.
  const severeSurfaceDropout =
    triangles.length >= 30 &&
    (boundaryEdgeRatio > 0.10 ||
      nonManifoldEdgeCount > Math.max(4, totalEdgeCount * 0.01));

  return {
    boundaryEdgeCount,
    totalEdgeCount,
    boundaryEdgeRatio,
    nonManifoldEdgeCount,
    severeSurfaceDropout,
  };
}

function finiteTriplet(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value
      .slice(0, 3)
      .every(
        (item) =>
          typeof item === "number" &&
          Number.isFinite(item),
      )
  );
}

function finiteTriangle(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value
      .slice(0, 3)
      .every(
        (item) =>
          Number.isInteger(item) &&
          item >= 0,
      )
  );
}

function centerGeometry(
  points: number[][],
): {
  centered: number[][];
  center: [number, number, number];
  maxExtent: number;
} {
  if (points.length === 0) {
    return {
      centered: [],
      center: [0, 0, 0],
      maxExtent: 1,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    minZ = Math.min(minZ, point[2]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
    maxZ = Math.max(maxZ, point[2]);
  }

  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];

  const centered = points.map(
    ([x, y, z]) => [
      x - center[0],
      y - center[1],
      z - center[2],
    ],
  );

  const maxExtent = Math.max(
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
    1,
  );

  return {
    centered,
    center,
    maxExtent,
  };
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?:
    | "neutral"
    | "good"
    | "warn"
    | "danger"
    | "accent";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/25 bg-amber-500/10 text-sky-700"
        : tone === "danger"
          ? "border-red-500/25 bg-red-500/10 text-red-700"
          : tone === "accent"
            ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${toneClass}`}
    >
      {children}
    </span>
  );
}

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/90 p-3 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[13px] font-black text-[var(--text-primary)]">
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-[10px] font-medium text-[var(--text-muted)]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SceneLights({
  lightTheme,
}: {
  lightTheme: boolean;
}) {
  return (
    <>
      <hemisphereLight
        intensity={lightTheme ? 1.4 : 1.0}
        color={lightTheme ? "#fff7ed" : "#dbeafe"}
        groundColor={lightTheme ? "#6b7280" : "#111827"}
      />
      <directionalLight
        position={[4, 6, 5]}
        intensity={lightTheme ? 2.2 : 2.8}
      />
      <directionalLight
        position={[-5, 2, -3]}
        intensity={lightTheme ? 0.9 : 1.2}
      />
      <pointLight
        position={[0, -2, 4]}
        intensity={0.8}
      />
    </>
  );
}

function EngineeringGrid({
  size,
  lightTheme,
}: {
  size: number;
  lightTheme: boolean;
}) {
  return (
    <gridHelper
      args={[
        size,
        12,
        lightTheme ? "#94a3b8" : "#334155",
        lightTheme ? "#cbd5e1" : "#1f2937",
      ]}
      position={[0, -2.2, 0]}
    />
  );
}

function ObservedMesh({
  vertices,
  triangles,
  normals,
  scale,
  lightTheme,
  opacity = 1,
  wireframe = false,
}: {
  vertices: number[][];
  triangles: number[][];
  normals: number[][];
  scale: number;
  lightTheme: boolean;
  opacity?: number;
  wireframe?: boolean;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(
      vertices.flatMap(
        ([x, y, z]) => [
          x * scale,
          y * scale,
          z * scale,
        ],
      ),
    );

    const indexes = triangles.flatMap(
      (triangle) =>
        triangle.slice(0, 3),
    );

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        positions,
        3,
      ),
    );
    geo.setIndex(indexes);

    if (
      normals.length === vertices.length &&
      normals.every(finiteTriplet)
    ) {
      geo.setAttribute(
        "normal",
        new THREE.BufferAttribute(
          new Float32Array(
            normals.flatMap(
              ([x, y, z]) => [
                x,
                y,
                z,
              ],
            ),
          ),
          3,
        ),
      );
      geo.normalizeNormals();
    } else {
      geo.computeVertexNormals();
    }

    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return geo;
  }, [
    normals,
    scale,
    triangles,
    vertices,
  ]);

  useEffect(
    () => () => geometry.dispose(),
    [geometry],
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={
          lightTheme
            ? "#8a8d91"
            : "#777b80"
        }
        roughness={0.96}
        metalness={0.01}
        flatShading={false}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
      {wireframe ? (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={
              lightTheme
                ? "#4b5563"
                : "#cbd5e1"
            }
            wireframe
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </mesh>
  );
}


function IndexedGraniteMesh({
  vertices,
  triangles,
  normals,
  scale,
  lightTheme,
  opacity = 1,
  wireframe = false,
  emissive = false,
}: {
  vertices: number[][];
  triangles: number[][];
  normals: number[][];
  scale: number;
  lightTheme: boolean;
  opacity?: number;
  wireframe?: boolean;
  emissive?: boolean;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(
          vertices.flatMap(
            ([x, y, z]) => [
              x * scale,
              y * scale,
              z * scale,
            ],
          ),
        ),
        3,
      ),
    );

    geo.setIndex(
      triangles.flatMap(
        (triangle) =>
          triangle.slice(0, 3),
      ),
    );

    if (
      normals.length === vertices.length &&
      normals.every(finiteTriplet)
    ) {
      geo.setAttribute(
        "normal",
        new THREE.BufferAttribute(
          new Float32Array(
            normals.flatMap(
              ([x, y, z]) => [
                x,
                y,
                z,
              ],
            ),
          ),
          3,
        ),
      );
      geo.normalizeNormals();
    } else {
      geo.computeVertexNormals();
    }

    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    return geo;
  }, [
    normals,
    scale,
    triangles,
    vertices,
  ]);

  useEffect(
    () => () => geometry.dispose(),
    [geometry],
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={
          emissive
            ? lightTheme
              ? "#9a5b38"
              : "#a8734b"
            : lightTheme
              ? "#7c5a3d"
              : "#8f6847"
        }
        emissive={
          emissive
            ? lightTheme
              ? "#4a1f0f"
              : "#3f1d0e"
            : "#ffffff"
        }
        emissiveIntensity={
          emissive ? 0.18 : 0
        }
        roughness={0.88}
        metalness={0.04}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
      />

      {wireframe ? (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color={
              lightTheme
                ? "#4b5563"
                : "#cbd5e1"
            }
            wireframe
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </mesh>
  );
}

type EnhancedDressingCutStep = DressingCutStep & {
  plane_origin?: number[];
  plane_origin_cm?: number[];
  plane_normal?: number[];
  plane_normal_world?: number[];
  removal_side?: "MIN" | "MAX" | "UNKNOWN" | string;
  source_face_key?: string;
  plane_coordinate_frame?: string;
  slice_cap_status?: string;
};

type ResolvedWorldCutPlane = {
  resolved: boolean;
  origin: [number, number, number];
  normal: [number, number, number];
  axis: "X" | "Y" | "Z" | null;
  side: "MIN" | "MAX" | "UNKNOWN";
  positionCm: number | null;
  source: "BACKEND_WORLD_PLANE" | "LEGACY_AXIS_POSITION" | "UNRESOLVED";
};

function normalizedCutVector(
  value: unknown,
): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const candidate = value.slice(0, 3).map(Number);
  if (!candidate.every(Number.isFinite)) return null;
  const length = Math.hypot(candidate[0], candidate[1], candidate[2]);
  if (length <= 1e-9) return null;
  return [
    candidate[0] / length,
    candidate[1] / length,
    candidate[2] / length,
  ];
}

function dominantAxisFromNormal(
  normal: [number, number, number],
): "X" | "Y" | "Z" {
  const absolute = normal.map(Math.abs);
  const index =
    absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
      ? 0
      : absolute[1] >= absolute[2]
        ? 1
        : 2;
  return index === 0 ? "X" : index === 1 ? "Y" : "Z";
}

function resolveWorldCutPlane(
  step: DressingCutStep | null,
  centerOffset: [number, number, number] = [0, 0, 0],
): ResolvedWorldCutPlane {
  if (!step) {
    return {
      resolved: false,
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      axis: null,
      side: "UNKNOWN",
      positionCm: null,
      source: "UNRESOLVED",
    };
  }

  const enhanced = step as EnhancedDressingCutStep;
  const backendOriginRaw =
    enhanced.plane_origin_cm ?? enhanced.plane_origin ?? null;
  const backendNormal = normalizedCutVector(
    enhanced.plane_normal_world ?? enhanced.plane_normal,
  );

  if (
    Array.isArray(backendOriginRaw) &&
    backendOriginRaw.length >= 3 &&
    backendOriginRaw.slice(0, 3).map(Number).every(Number.isFinite) &&
    backendNormal
  ) {
    const worldOrigin = backendOriginRaw.slice(0, 3).map(Number) as [
      number,
      number,
      number,
    ];
    const axis = dominantAxisFromNormal(backendNormal);
    const axisIndex = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
    const explicitSide = String(enhanced.removal_side || "").toUpperCase();
    const side: "MIN" | "MAX" =
      explicitSide === "MIN"
        ? "MIN"
        : explicitSide === "MAX"
          ? "MAX"
          : backendNormal[axisIndex] >= 0
            ? "MAX"
            : "MIN";

    return {
      resolved: true,
      origin: [
        worldOrigin[0] - centerOffset[0],
        worldOrigin[1] - centerOffset[1],
        worldOrigin[2] - centerOffset[2],
      ],
      normal: backendNormal,
      axis,
      side,
      positionCm: worldOrigin[axisIndex],
      source: "BACKEND_WORLD_PLANE",
    };
  }

  const axis = cutAxisKey(step);
  const side = resolveRemovalSide(step);
  const position =
    typeof step.position_cm === "number" && Number.isFinite(step.position_cm)
      ? step.position_cm
      : typeof step.position_m === "number" && Number.isFinite(step.position_m)
        ? step.position_m * 100
        : null;

  if (!axis || position == null || side === "UNKNOWN") {
    return {
      resolved: false,
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      axis,
      side,
      positionCm: position,
      source: "UNRESOLVED",
    };
  }

  const axisIndex = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
  const worldOrigin: [number, number, number] = [...centerOffset];
  worldOrigin[axisIndex] = position;
  const normal: [number, number, number] = [0, 0, 0];
  normal[axisIndex] = side === "MAX" ? 1 : -1;

  return {
    resolved: true,
    origin: [
      worldOrigin[0] - centerOffset[0],
      worldOrigin[1] - centerOffset[1],
      worldOrigin[2] - centerOffset[2],
    ],
    normal,
    axis,
    side,
    positionCm: position,
    source: "LEGACY_AXIS_POSITION",
  };
}

type CutFragmentRecord = {
  cutIndex: number;
  step: DressingCutStep;
  triangles: number[][];
  axis: "X" | "Y" | "Z";
  side: "MIN" | "MAX";
};

function splitTrianglesForCut({
  vertices,
  triangles,
  step,
  centerOffset = [0, 0, 0],
}: {
  vertices: number[][];
  triangles: number[][];
  step: DressingCutStep;
  centerOffset?: [number, number, number];
}) {
  const plane = resolveWorldCutPlane(step, centerOffset);

  if (!plane.resolved || !plane.axis || plane.side === "UNKNOWN") {
    return {
      resolved: false as const,
      axis: plane.axis,
      side: plane.side,
      position: plane.positionCm,
      planeSource: plane.source,
      retained: triangles,
      removed: [] as number[][],
    };
  }

  const retained: number[][] = [];
  const removed: number[][] = [];

  for (const triangle of triangles) {
    const a = vertices[triangle[0]];
    const b = vertices[triangle[1]];
    const c = vertices[triangle[2]];
    if (!a || !b || !c) continue;

    const centroid: [number, number, number] = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];

    const signedDistance =
      (centroid[0] - plane.origin[0]) * plane.normal[0] +
      (centroid[1] - plane.origin[1]) * plane.normal[1] +
      (centroid[2] - plane.origin[2]) * plane.normal[2];

    if (signedDistance > 1e-7) {
      removed.push(triangle);
    } else {
      retained.push(triangle);
    }
  }

  return {
    resolved: true as const,
    axis: plane.axis as "X" | "Y" | "Z",
    side: plane.side as "MIN" | "MAX",
    position: plane.positionCm,
    planeSource: plane.source,
    retained,
    removed,
  };
}

type VisualRetainedMetrics = {
  originalTriangleCount: number;
  retainedTriangleCount: number;
  retainedTrianglePercentage: number | null;
  visualDimensionsCm: {
    length: number;
    breadth: number;
    height: number;
  } | null;
};

function boundsFromTriangleSubset({
  vertices,
  triangles,
}: {
  vertices: number[][];
  triangles: number[][];
}) {
  if (
    vertices.length === 0 ||
    triangles.length === 0
  ) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const visited =
    new Set<number>();

  for (const triangle of triangles) {
    for (const index of triangle) {
      if (visited.has(index)) continue;
      visited.add(index);

      const point = vertices[index];
      if (!point) continue;

      const [x, y, z] = point;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }

  if (
    ![
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    ].every(Number.isFinite)
  ) {
    return null;
  }

  return {
    min: [minX, minY, minZ] as [
      number,
      number,
      number,
    ],
    max: [maxX, maxY, maxZ] as [
      number,
      number,
      number,
    ],
    extent: [
      Math.max(maxX - minX, 0),
      Math.max(maxY - minY, 0),
      Math.max(maxZ - minZ, 0),
    ] as [number, number, number],
  };
}

function computeVisualRetainedMetrics({
  vertices,
  triangles,
  cuttingSteps,
  committedCutIndices,
  metricDimensions,
}: {
  vertices: number[][];
  triangles: number[][];
  cuttingSteps: DressingCutStep[];
  committedCutIndices: number[];
  metricDimensions: {
    length: number;
    breadth: number;
    height: number;
  } | null;
}): VisualRetainedMetrics {
  let retained = triangles;

  for (const cutIndex of [...committedCutIndices].sort((a, b) => a - b)) {
    const step = cuttingSteps[cutIndex];
    if (!step) continue;

    const split = splitTrianglesForCut({
      vertices,
      triangles: retained,
      step,
    });

    if (
      !split.resolved ||
      split.removed.length === 0
    ) {
      continue;
    }

    retained = split.retained;
  }

  const originalBounds =
    boundsFromTriangleSubset({
      vertices,
      triangles,
    });

  const retainedBounds =
    boundsFromTriangleSubset({
      vertices,
      triangles: retained,
    });

  let visualDimensionsCm:
    | {
        length: number;
        breadth: number;
        height: number;
      }
    | null = null;

  if (
    metricDimensions &&
    originalBounds &&
    retainedBounds &&
    originalBounds.extent.every(
      (value) => value > 1e-9,
    )
  ) {
    const [rawX, rawY, rawZ] =
      originalBounds.extent;

    const [retainedX, retainedY, retainedZ] =
      retainedBounds.extent;

    visualDimensionsCm = {
      length:
        metricDimensions.length *
        (retainedX / rawX),
      breadth:
        metricDimensions.breadth *
        (retainedZ / rawZ),
      height:
        metricDimensions.height *
        (retainedY / rawY),
    };
  }

  return {
    originalTriangleCount:
      triangles.length,
    retainedTriangleCount:
      retained.length,
    retainedTrianglePercentage:
      triangles.length > 0
        ? (retained.length /
            triangles.length) *
          100
        : null,
    visualDimensionsCm,
  };
}

function fragmentParkingTransform(
  fragment: CutFragmentRecord,
  order: number,
  animatedSeparation = 1,
) {
  const sign =
    fragment.side === "MIN" ? -1 : 1;

  const lane = 1 + order * 0.68;
  const separation =
    Math.max(0, Math.min(1, animatedSeparation));

  const position: [
    number,
    number,
    number,
  ] =
    fragment.axis === "X"
      ? [
          sign * lane * separation,
          (0.12 + order * 0.06) * separation,
          order * 0.16 * separation,
        ]
      : fragment.axis === "Y"
        ? [
            order * 0.18 * separation,
            sign * lane * 0.82 * separation,
            (0.12 + order * 0.08) * separation,
          ]
        : [
            order * 0.16 * separation,
            (0.14 + order * 0.06) * separation,
            sign * lane * separation,
          ];

  const rotation: [
    number,
    number,
    number,
  ] = [
    fragment.axis === "Y"
      ? 0.035 * sign * separation
      : 0.012 * order * separation,
    fragment.axis === "X"
      ? 0.045 * sign * separation
      : 0.02 * order * separation,
    fragment.axis === "Z"
      ? 0.038 * sign * separation
      : 0.012 * order * separation,
  ];

  return { position, rotation };
}

function CumulativeIrregularCutScene({
  vertices,
  triangles,
  normals,
  scale,
  cuttingSteps,
  committedCutIndices,
  activeCutIndex,
  activeProgress,
  centerOffset,
  lightTheme,
  wireframe,
}: {
  vertices: number[][];
  triangles: number[][];
  normals: number[][];
  scale: number;
  cuttingSteps: DressingCutStep[];
  committedCutIndices: number[];
  activeCutIndex: number;
  activeProgress: number;
  centerOffset: [number, number, number];
  lightTheme: boolean;
  wireframe: boolean;
}) {
  const cumulative = useMemo(() => {
    let retained = triangles;
    const fragments: CutFragmentRecord[] = [];

    const orderedCommitted =
      [...committedCutIndices]
        .filter(
          (index) =>
            index >= 0 &&
            index < cuttingSteps.length,
        )
        .sort((a, b) => a - b);

    for (const cutIndex of orderedCommitted) {
      const step = cuttingSteps[cutIndex];
      if (!step) continue;

      const split = splitTrianglesForCut({
        vertices,
        triangles: retained,
        step,
        centerOffset,
      });

      if (
        !split.resolved ||
        split.removed.length === 0
      ) {
        continue;
      }

      fragments.push({
        cutIndex,
        step,
        triangles: split.removed,
        axis: split.axis,
        side: split.side,
      });

      retained = split.retained;
    }

    return {
      retained,
      fragments,
    };
  }, [
    committedCutIndices,
    cuttingSteps,
    triangles,
    vertices,
    centerOffset,
  ]);

  const activeStep =
    cuttingSteps[activeCutIndex] ?? null;

  const activeAlreadyCommitted =
    committedCutIndices.includes(
      activeCutIndex,
    );

  const activeSplit = useMemo(() => {
    if (
      !activeStep ||
      activeAlreadyCommitted
    ) {
      return null;
    }

    return splitTrianglesForCut({
      vertices,
      triangles: cumulative.retained,
      step: activeStep,
      centerOffset,
    });
  }, [
    activeAlreadyCommitted,
    activeStep,
    cumulative.retained,
    vertices,
    centerOffset,
  ]);

  const activeSeparation =
    twinSmoothstep(
      (activeProgress - 0.74) /
        0.18,
    );

  const revealActiveFragment =
    activeSplit?.resolved === true &&
    activeSplit.removed.length > 0 &&
    activeProgress >= 0.82;

  const displayedRetained =
    revealActiveFragment &&
    activeSplit
      ? activeSplit.retained
      : cumulative.retained;

  const activeFragment:
    | CutFragmentRecord
    | null =
    revealActiveFragment &&
    activeSplit &&
    activeStep
      ? {
          cutIndex: activeCutIndex,
          step: activeStep,
          triangles:
            activeSplit.removed,
          axis: activeSplit.axis,
          side: activeSplit.side,
        }
      : null;

  return (
    <group>
      <IndexedGraniteMesh
        vertices={vertices}
        triangles={displayedRetained}
        normals={normals}
        scale={scale}
        lightTheme={lightTheme}
        opacity={0.86}
        wireframe={wireframe}
      />

      {cumulative.fragments.map(
        (fragment, order) => {
          const transform =
            fragmentParkingTransform(
              fragment,
              order,
              1,
            );

          return (
            <group
              key={`committed-fragment-${fragment.cutIndex}`}
              position={
                transform.position
              }
              rotation={
                transform.rotation
              }
            >
              <IndexedGraniteMesh
                vertices={vertices}
                triangles={
                  fragment.triangles
                }
                normals={normals}
                scale={scale}
                lightTheme={lightTheme}
                opacity={0.92}
                wireframe={wireframe}
                emissive
              />

              <Html
                position={[
                  0,
                  0.72 +
                    order * 0.08,
                  0,
                ]}
                center
                distanceFactor={8}
                style={{
                  pointerEvents:
                    "none",
                }}
              >
                <div className="min-w-[168px] rounded-xl border border-amber-300/25 bg-white/96 px-3 py-2 shadow-2xl backdrop-blur-xl">
                  <div className="text-[8px] font-black uppercase tracking-[0.14em] text-sky-700">
                    Cut{" "}
                    {fragment.cutIndex +
                      1}{" "}
                    removed fragment
                  </div>
                  <div className="mt-1 text-[9px] leading-4 text-slate-600">
                    {fragment.triangles.length.toLocaleString()} retained-source mesh triangles
                  </div>
                </div>
              </Html>
            </group>
          );
        },
      )}

      {activeFragment ? (
        (() => {
          const order =
            cumulative.fragments
              .length;

          const transform =
            fragmentParkingTransform(
              activeFragment,
              order,
              activeSeparation,
            );

          return (
            <group
              position={
                transform.position
              }
              rotation={
                transform.rotation
              }
            >
              <IndexedGraniteMesh
                vertices={vertices}
                triangles={
                  activeFragment.triangles
                }
                normals={normals}
                scale={scale}
                lightTheme={lightTheme}
                opacity={0.98}
                wireframe={wireframe}
                emissive
              />

              <Html
                position={[0, 0.8, 0]}
                center
                distanceFactor={8}
                style={{
                  pointerEvents:
                    "none",
                }}
              >
                <div className="min-w-[190px] rounded-xl border border-red-300/25 bg-white/96 px-3 py-2 shadow-2xl backdrop-blur-xl">
                  <div className="text-[8px] font-black uppercase tracking-[0.14em] text-red-700">
                    Separating Cut{" "}
                    {activeCutIndex +
                      1}
                  </div>
                  <div className="mt-1 text-[9px] leading-4 text-slate-600">
                    Actual irregular mesh region · {activeFragment.triangles.length.toLocaleString()} triangles
                  </div>
                </div>
              </Html>
            </group>
          );
        })()
      ) : null}
    </group>
  );
}


function SparsePoints({
  points,
  scale,
  lightTheme,
  opacity = 1,
}: {
  points: number[][];
  scale: number;
  lightTheme: boolean;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(
          points.flatMap(
            ([x, y, z]) => [
              x * scale,
              y * scale,
              z * scale,
            ],
          ),
        ),
        3,
      ),
    );
    geo.computeBoundingSphere();
    return geo;
  }, [points, scale]);

  useEffect(
    () => () => geometry.dispose(),
    [geometry],
  );

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#0284c7"
        size={0.045}
        sizeAttenuation
        transparent={opacity < 1}
        opacity={opacity}
      />
    </points>
  );
}

function BoundingOverlay({
  dimensions,
  scale,
  accent,
}: {
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  scale: number;
  accent: string;
}) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(
      dimensions.length * scale,
      dimensions.height * scale,
      dimensions.breadth * scale,
    );
    const edges = new THREE.EdgesGeometry(
      box,
    );
    box.dispose();
    return edges;
  }, [
    dimensions.breadth,
    dimensions.height,
    dimensions.length,
    scale,
  ]);

  useEffect(
    () => () => geometry.dispose(),
    [geometry],
  );

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={accent}
        transparent
        opacity={0.85}
      />
    </lineSegments>
  );
}

function DressedBlock({
  dimensions,
  scale,
  lightTheme,
  opacity = 0.23,
}: {
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  scale: number;
  lightTheme: boolean;
  opacity?: number;
}) {
  return (
    <mesh>
      <boxGeometry
        args={[
          dimensions.length * scale,
          dimensions.height * scale,
          dimensions.breadth * scale,
        ]}
      />
      <meshStandardMaterial
        color={
          lightTheme
            ? "#0f766e"
            : "#34d399"
        }
        transparent
        opacity={opacity}
        roughness={0.6}
        metalness={0.05}
      />
    </mesh>
  );
}

function CutPlane({
  step,
  selected,
  scale,
  rawDimensions,
  centerOffset,
  progress = 0,
  lightTheme,
}: {
  step: DressingCutStep;
  selected: boolean;
  scale: number;
  rawDimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  centerOffset: [number, number, number];
  progress?: number;
  lightTheme: boolean;
}) {
  const plane = resolveWorldCutPlane(step, centerOffset);
  if (!plane.resolved) return null;

  const planeAppear = selected
    ? twinSmoothstep((progress - 0.28) / 0.18)
    : 1;
  const cuttingTravel = selected
    ? twinSmoothstep((progress - 0.46) / 0.28)
    : 0;
  const separation = selected
    ? twinSmoothstep((progress - 0.74) / 0.18)
    : 0;

  const normal = new THREE.Vector3(...plane.normal).normalize();
  const helper =
    Math.abs(normal.y) < 0.88
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const tangentU = new THREE.Vector3()
    .crossVectors(helper, normal)
    .normalize();
  const tangentV = new THREE.Vector3()
    .crossVectors(normal, tangentU)
    .normalize();

  const maxDimension = Math.max(
    rawDimensions.length,
    rawDimensions.breadth,
    rawDimensions.height,
    1,
  );
  const planeSize = maxDimension * scale * 1.32;
  const position = new THREE.Vector3(
    plane.origin[0] * scale,
    plane.origin[1] * scale,
    plane.origin[2] * scale,
  );
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal,
  );

  const scanCenter = position
    .clone()
    .add(
      tangentU
        .clone()
        .multiplyScalar((-0.5 + cuttingTravel) * planeSize),
    );
  const scanA = scanCenter
    .clone()
    .add(tangentV.clone().multiplyScalar(-planeSize * 0.5))
    .toArray() as [number, number, number];
  const scanB = scanCenter
    .clone()
    .add(tangentV.clone().multiplyScalar(planeSize * 0.5))
    .toArray() as [number, number, number];
  const separationOffset = normal
    .clone()
    .multiplyScalar(separation * 0.7)
    .toArray() as [number, number, number];

  const reportedRemoval =
    typeof step.removed_volume_m3 === "number" &&
    Number.isFinite(step.removed_volume_m3)
      ? `${step.removed_volume_m3.toFixed(4)} m³`
      : "Not reported";

  return (
    <group>
      <mesh
        position={position}
        quaternion={quaternion}
        visible={!selected || planeAppear > 0}
      >
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color={selected ? "#fbbf24" : "#42c9dd"}
          transparent
          opacity={selected ? 0.08 + planeAppear * 0.32 : 0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {selected && cuttingTravel > 0 ? (
        <>
          <Line
            points={[scanA, scanB]}
            color={lightTheme ? "#b45309" : "#fde68a"}
            lineWidth={5}
            transparent
            opacity={0.96}
          />
          <mesh position={scanA}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshBasicMaterial
              color={lightTheme ? "#b45309" : "#fef3c7"}
            />
          </mesh>
        </>
      ) : null}

      {selected && separation > 0 ? (
        <group position={separationOffset}>
          <mesh position={position} quaternion={quaternion}>
            <planeGeometry args={[planeSize, planeSize]} />
            <meshBasicMaterial
              color="#ef4444"
              wireframe
              transparent
              opacity={0.18 + separation * 0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Html
            position={[position.x, position.y + 0.75, position.z]}
            center
            distanceFactor={8}
            style={{ pointerEvents: "none" }}
          >
            <div className="whitespace-nowrap rounded-xl border border-red-400/30 bg-white/96 px-3 py-2 shadow-2xl backdrop-blur-xl">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-red-700">
                Reported removal
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-black text-slate-900">
                {reportedRemoval}
              </div>
              <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500">
                {plane.source === "BACKEND_WORLD_PLANE"
                  ? "Metric world-plane"
                  : "Axis fallback"}
              </div>
            </div>
          </Html>
        </group>
      ) : null}
    </group>
  );
}

function CutProcedureCameraDirector({
  step,
  enabled,
  progress,
}: {
  step: DressingCutStep | null;
  enabled: boolean;
  progress: number;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3());

  useFrame((_state, delta) => {
    if (!enabled || !step) return;

    const axis = String(step.plane_axis || "").toUpperCase();
    const orient = twinSmoothstep(Math.min(progress / 0.17, 1));
    const enhanced = step as EnhancedDressingCutStep;
    const backendNormal = normalizedCutVector(
      enhanced.plane_normal_world ?? enhanced.plane_normal,
    );

    let desired = new THREE.Vector3(5.8, 4.4, 6.4);
    if (backendNormal) {
      desired = new THREE.Vector3(...backendNormal)
        .multiplyScalar(8.2)
        .add(new THREE.Vector3(1.2, 2.4, 1.2));
    } else if (axis.includes("X")) {
      desired = new THREE.Vector3(8.4, 2.7, 0.9);
    } else if (axis.includes("Y")) {
      desired = new THREE.Vector3(5.2, 7.1, 5.1);
    } else if (axis.includes("Z")) {
      desired = new THREE.Vector3(0.8, 2.8, 8.7);
    }

    const staged = camera.position.clone().lerp(desired, orient);
    const damping = 1 - Math.pow(0.025, delta);

    camera.position.lerp(staged, damping);
    targetRef.current.lerp(new THREE.Vector3(0, 0, 0), damping);
    camera.lookAt(targetRef.current);
  });

  return null;
}

function DefectMarker({
  defect,
  scale,
  centerOffset,
  selected,
  onSelect,
}: {
  defect: DefectItem;
  scale: number;
  centerOffset: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const region = defect.geometry_region as
    | {
        center?: number[];
      }
    | undefined;

  const center =
    finiteTriplet(
      defect.physical_center_cm,
    )
      ? defect.physical_center_cm
      : finiteTriplet(
            defect.point_3d_cm,
          )
        ? defect.point_3d_cm
        : region?.center;

  if (
    !finiteTriplet(center)
  ) {
    return null;
  }

  const cavity =
    digitalTwinIsCavity(
      defect,
    );

  const rimPoints =
    cavity
      ? (
          defect.rim_points_3d_cm ||
          []
        )
          .filter(
            finiteTriplet,
          )
          .slice(
            0,
            80,
          )
      : [];

  const interiorPoints =
    cavity
      ? (
          defect.interior_points_3d_cm ||
          []
        )
          .filter(
            finiteTriplet,
          )
          .slice(
            0,
            64,
          )
      : [];

  const localPoint = (
    point: number[],
  ): [
    number,
    number,
    number,
  ] => [
    (
      point[0] -
      centerOffset[0]
    ) * scale,
    (
      point[1] -
      centerOffset[1]
    ) * scale,
    (
      point[2] -
      centerOffset[2]
    ) * scale,
  ];

  const observedDepthCm =
    typeof defect.max_observed_depth_cm === "number" &&
    Number.isFinite(defect.max_observed_depth_cm) &&
    defect.max_observed_depth_cm > 0
      ? defect.max_observed_depth_cm
      : null;

  const depthSegment = (() => {
    if (!cavity || observedDepthCm == null || interiorPoints.length === 0) {
      return null;
    }

    const referencePoints = rimPoints.length > 0 ? rimPoints : [center];
    const reference: [number, number, number] = [
      referencePoints.reduce((sum, point) => sum + point[0], 0) /
        referencePoints.length,
      referencePoints.reduce((sum, point) => sum + point[1], 0) /
        referencePoints.length,
      referencePoints.reduce((sum, point) => sum + point[2], 0) /
        referencePoints.length,
    ];

    let deepest = interiorPoints[0];
    let largestDistance = -1;

    for (const point of interiorPoints) {
      const distance = Math.hypot(
        point[0] - reference[0],
        point[1] - reference[1],
        point[2] - reference[2],
      );
      if (distance > largestDistance) {
        largestDistance = distance;
        deepest = point;
      }
    }

    const start = localPoint(reference);
    const end = localPoint(deepest);
    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ];

    return { start, end, mid };
  })();

  return (
    <group>
      {selected && depthSegment && observedDepthCm != null ? (
        <>
          <Line
            points={[depthSegment.start, depthSegment.end]}
            color="#22d3ee"
            lineWidth={4}
            transparent
            opacity={0.96}
          />
          <Html
            position={depthSegment.mid}
            center
            distanceFactor={7}
            style={{ pointerEvents: "none" }}
          >
            <div className="whitespace-nowrap rounded-xl border border-cyan-300/40 bg-[#073640]/94 px-3 py-2 text-white shadow-2xl backdrop-blur">
              <div className="text-[8px] font-black uppercase tracking-[0.13em] text-cyan-200">
                Observed cavity depth
              </div>
              <div className="mt-0.5 font-mono text-[12px] font-black">
                {observedDepthCm.toFixed(2)} cm
              </div>
            </div>
          </Html>
        </>
      ) : null}

      {cavity &&
      selected &&
      rimPoints.length >= 3 ? (
        <Line
          points={[
            ...rimPoints.map(
              localPoint,
            ),
            localPoint(
              rimPoints[0],
            ),
          ]}
          color="#7dd3fc"
          lineWidth={2}
          transparent
          opacity={0.92}
        />
      ) : null}

      {cavity &&
      selected
        ? rimPoints.map(
            (
              point,
              index,
            ) => (
              <mesh
                key={`rim-${index}`}
                position={localPoint(
                  point,
                )}
              >
                <sphereGeometry
                  args={[
                    0.026,
                    10,
                    10,
                  ]}
                />
                <meshStandardMaterial
                  color="#bae6fd"
                  emissive="#6f4d17"
                  emissiveIntensity={
                    0.55
                  }
                />
              </mesh>
            ),
          )
        : null}

      {cavity &&
      selected
        ? interiorPoints.map(
            (
              point,
              index,
            ) => (
              <mesh
                key={`interior-${index}`}
                position={localPoint(
                  point,
                )}
              >
                <sphereGeometry
                  args={[
                    0.022,
                    9,
                    9,
                  ]}
                />
                <meshStandardMaterial
                  color="#67e8f9"
                  emissive="#164e63"
                  emissiveIntensity={
                    0.5
                  }
                  transparent
                  opacity={0.82}
                />
              </mesh>
            ),
          )
        : null}

      <group
        position={localPoint(
          center,
        )}
      >
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <sphereGeometry
            args={[
              selected
                ? 0.12
                : 0.085,
              20,
              20,
            ]}
          />
          <meshStandardMaterial
            color={
              selected
                ? "#7dd3fc"
                : cavity
                  ? "#f59e0b"
                  : "#ef4444"
            }
            emissive={
              selected
                ? "#6f4d17"
                : cavity
                  ? "#78350f"
                  : "#450a0a"
            }
            emissiveIntensity={
              0.65
            }
          />
        </mesh>

        {selected ? (
          <Html
            center
            distanceFactor={8}
            style={{
              pointerEvents:
                "none",
            }}
          >
            <div className="min-w-[188px] rounded-xl border border-[#7dd3fc]/25 bg-[#090c10]/95 px-3 py-2 text-[10px] font-bold text-[#f1f5f9] shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {defect.id ||
                    defect.kind ||
                    defect.type ||
                    "Visible finding"}
                </span>
                <span className="rounded-full border border-[#7dd3fc]/20 bg-[#7dd3fc]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[#bae6fd]">
                  {cavity
                    ? "Cavity"
                    : "Surface"}
                </span>
              </div>

              {cavity ? (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px] font-semibold">
                  <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
                    <div className="text-slate-500">
                      Opening W
                    </div>
                    <div className="mt-0.5 text-[#bae6fd]">
                      {digitalTwinCavityMetric(
                        defect,
                        "opening_width_cm",
                      ) != null
                        ? `${digitalTwinCavityMetric(
                            defect,
                            "opening_width_cm",
                          )!.toFixed(1)} cm`
                        : "—"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
                    <div className="text-slate-500">
                      Opening H
                    </div>
                    <div className="mt-0.5 text-[#bae6fd]">
                      {digitalTwinCavityMetric(
                        defect,
                        "opening_height_cm",
                      ) != null
                        ? `${digitalTwinCavityMetric(
                            defect,
                            "opening_height_cm",
                          )!.toFixed(1)} cm`
                        : "—"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
                    <div className="text-slate-500">
                      Observed depth
                    </div>
                    <div className="mt-0.5 text-cyan-200">
                      {digitalTwinCavityMetric(
                        defect,
                        "max_observed_depth_cm",
                      ) != null
                        ? `${digitalTwinCavityMetric(
                            defect,
                            "max_observed_depth_cm",
                          )!.toFixed(1)} cm`
                        : "UNOBSERVED"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
                    <div className="text-slate-500">
                      Visible volume
                    </div>
                    <div className="mt-0.5 text-cyan-200">
                      {digitalTwinCavityMetric(
                        defect,
                        "visible_cavity_volume_cm3",
                      ) != null
                        ? `${digitalTwinCavityMetric(
                            defect,
                            "visible_cavity_volume_cm3",
                          )!.toFixed(1)} cm³`
                        : "—"}
                    </div>
                  </div>
                </div>
              ) : null}

              {cavity ? (
                <div className="mt-2 text-[8px] font-medium leading-4 text-sky-200/60">
                  Hidden continuation:{" "}
                  {defect.internal_continuation_status ||
                    "UNOBSERVED"}
                </div>
              ) : null}
            </div>
          </Html>
        ) : null}
      </group>
    </group>
  );
}

function resolveEvidenceCameraPose(
  photo: PhotoEvidenceView | null,
  photoIndex: number,
  photoCount: number,
): {
  azimuth: number;
  elevation: number;
  distance_m: number;
  provenance:
    | "SOLVED"
    | "APPROXIMATE_SIDE";
} | null {
  if (!photo) {
    return null;
  }

  // Kept in the function signature for compatibility with callers; unlike the
  // old implementation, these are never used to invent a camera pose.
  void photoIndex;
  void photoCount;

  const solved = photo.camera_angles;

  if (
    solved &&
    Number.isFinite(solved.azimuth) &&
    Number.isFinite(solved.elevation) &&
    Number.isFinite(solved.distance_m) &&
    solved.distance_m > 0
  ) {
    return {
      azimuth: solved.azimuth,
      elevation: solved.elevation,
      distance_m: solved.distance_m,
      provenance: "SOLVED",
    };
  }

  const sideText = `${photo.side || ""} ${photo.view_name || ""}`
    .trim()
    .toUpperCase();

  const approximateBySide: Array<{
    match: RegExp;
    azimuth: number;
    elevation: number;
  }> = [
    { match: /\bFRONT\b/, azimuth: 0, elevation: 10 },
    { match: /\bLEFT\b/, azimuth: -90, elevation: 12 },
    { match: /\bBACK\b|\bREAR\b/, azimuth: 180, elevation: 10 },
    { match: /\bRIGHT\b/, azimuth: 90, elevation: 12 },
    { match: /\bTOP\b/, azimuth: 0, elevation: 88 },
    { match: /\bBOTTOM\b/, azimuth: 0, elevation: -88 },
  ];

  const sidePose = approximateBySide.find((item) =>
    item.match.test(sideText),
  );

  if (sidePose) {
    return {
      azimuth: sidePose.azimuth,
      elevation: sidePose.elevation,
      distance_m: 2.5,
      provenance: "APPROXIMATE_SIDE",
    };
  }

  // No solved camera pose and no trustworthy semantic side label.
  // Do not invent a sequence-based camera registration. The user may orbit
  // manually, but the UI must not claim that the 3D view matches this photo.
  return null;
}

function EvidenceNavigationControls({
  photo,
  photoIndex,
  photoCount,
  selectionRevision,
  enabled,
}: {
  photo: PhotoEvidenceView | null;
  photoIndex: number;
  photoCount: number;
  selectionRevision: number;
  enabled: boolean;
}) {
  const { camera, invalidate } = useThree();
  const controlsRef =
    useRef<React.ElementRef<typeof OrbitControls>>(null);

  const animation = useRef<{
    startedAt: number;
    durationMs: number;
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);

  // This is the key interaction rule:
  // one photo selection => one camera transition.
  // After that transition finishes, this component no longer owns the camera
  // until the user explicitly selects a photo again (revision changes).
  const appliedRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!enabled || !photo) {
      animation.current = null;
      if (controls) {
        controls.enabled = true;
      }
      return;
    }

    // Never re-apply the selected evidence pose because of an unrelated
    // React/R3F render. This prevents the camera from "sticking" to a photo
    // after the user starts orbiting or zooming manually.
    if (appliedRevisionRef.current === selectionRevision) {
      return;
    }

    appliedRevisionRef.current = selectionRevision;

    const pose = resolveEvidenceCameraPose(
      photo,
      photoIndex,
      photoCount,
    );

    if (!pose) {
      animation.current = null;
      if (controls) {
        controls.enabled = true;
      }
      return;
    }

    const azimuthRad = THREE.MathUtils.degToRad(
      pose.azimuth,
    );
    const elevationRad = THREE.MathUtils.degToRad(
      pose.elevation,
    );

    const renderRadius = 7.2;
    const horizontalRadius =
      Math.cos(elevationRad) * renderRadius;

    const target = new THREE.Vector3(0, 0, 0);
    const endPosition = new THREE.Vector3(
      Math.sin(azimuthRad) * horizontalRadius,
      Math.sin(elevationRad) * renderRadius,
      Math.cos(azimuthRad) * horizontalRadius,
    );

    if (controls) {
      // Only lock interaction while the short evidence-facing animation owns
      // the camera. Manual controls are restored immediately on completion.
      controls.enabled = false;
      controls.target.copy(target);
      controls.update();
    }

    animation.current = {
      startedAt: performance.now(),
      durationMs: 720,
      startPosition: camera.position.clone(),
      endPosition,
      target,
    };

    invalidate();
  }, [
    camera,
    enabled,
    invalidate,
    photo,
    photoCount,
    photoIndex,
    selectionRevision,
  ]);

  useFrame(() => {
    const current = animation.current;

    if (!current) {
      return;
    }

    const elapsed =
      performance.now() - current.startedAt;
    const t = THREE.MathUtils.clamp(
      elapsed / current.durationMs,
      0,
      1,
    );

    const eased =
      t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(
      current.startPosition,
      current.endPosition,
      eased,
    );
    camera.lookAt(current.target);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        34,
        0.18,
      );
      camera.updateProjectionMatrix();
    }

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(current.target);
      controls.update();
    }

    if (t >= 1) {
      camera.position.copy(current.endPosition);
      camera.lookAt(current.target);

      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = 34;
        camera.updateProjectionMatrix();
      }

      if (controls) {
        controls.target.copy(current.target);
        controls.update();
        controls.enabled = true;
      }

      // Critical: release camera ownership permanently for this selection.
      // Rotate / zoom / pan is now entirely controlled by the user.
      animation.current = null;
      invalidate();
      return;
    }

    // The Canvas runs on demand, so request the next animation frame only
    // while the one-shot photo transition is active.
    invalidate();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled
      enableDamping
      dampingFactor={0.08}
      enableRotate
      enableZoom
      enablePan
      rotateSpeed={0.82}
      zoomSpeed={0.95}
      panSpeed={0.7}
      minDistance={3.2}
      maxDistance={14}
      target={[0, 0, 0]}
      onStart={() => {
        // Defensive release: once controls are available to the user, manual
        // input always wins. A later camera move requires another photo click.
        animation.current = null;
        const controls = controlsRef.current;
        if (controls) {
          controls.enabled = true;
        }
      }}
      onChange={() => invalidate()}
    />
  );
}

function EvidenceViewIndicator({
  photo,
  lightTheme,
}: {
  photo: PhotoEvidenceView | null;
  lightTheme: boolean;
}) {
  const angles = photo?.camera_angles;
  if (!photo || !angles) return null;

  const { azimuth, elevation } = angles;
  if (![azimuth, elevation].every((value) => Number.isFinite(value))) return null;

  const az = THREE.MathUtils.degToRad(azimuth);
  const el = THREE.MathUtils.degToRad(elevation);
  const direction = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ).normalize();
  const cameraMarker = direction.clone().multiplyScalar(5.15);
  const surfaceMarker = direction.clone().multiplyScalar(2.35);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction,
  );
  const accent = lightTheme ? "#0369a1" : "#67e8f9";

  return (
    <group>
      <Line
        points={[cameraMarker.toArray(), surfaceMarker.toArray()]}
        color={accent}
        lineWidth={1.5}
        dashed
        dashSize={0.12}
        gapSize={0.09}
        transparent
        opacity={0.7}
      />
      <group position={cameraMarker.toArray()}>
        <mesh>
          <boxGeometry args={[0.26, 0.18, 0.34]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.32}
            roughness={0.38}
          />
        </mesh>
        <mesh
          position={[0, 0, -0.22]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[0.12, 0.28, 20]} />
          <meshBasicMaterial color={accent} transparent opacity={0.82} />
        </mesh>
        <Html center position={[0, 0.42, 0]} distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-xl border border-cyan-300/25 bg-white/96 px-2.5 py-1.5 text-[10px] font-black tracking-[0.08em] text-cyan-800 shadow-xl backdrop-blur-xl">
            {photo.photo_label} VIEW
          </div>
        </Html>
      </group>
      <mesh position={surfaceMarker.toArray()} quaternion={q}>
        <ringGeometry args={[0.38, 0.52, 64]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.58}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={surfaceMarker.toArray()}>
        <sphereGeometry args={[0.07, 18, 18]} />
        <meshBasicMaterial color={accent} />
      </mesh>
    </group>
  );
}

function DimensionLabel({
  position,
  axis,
  valueCm,
  accent,
  lightTheme,
}: {
  position: [number, number, number];
  axis: "L" | "B" | "H";
  valueCm: number;
  accent: string;
  lightTheme: boolean;
}) {
  const valueM = valueCm / 100;

  const axisName =
    axis === "L"
      ? "Length"
      : axis === "B"
        ? "Breadth"
        : "Height";

  return (
    <Html
      position={position}
      center
      transform={false}
      distanceFactor={7.2}
      zIndexRange={[30, 0]}
      style={{
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: `1px solid ${accent}70`,
          borderRadius: 999,
          background: lightTheme
            ? "rgba(255,255,255,.92)"
            : "rgba(7,10,14,.90)",
          boxShadow:
            "0 8px 24px rgba(0,0,0,.20)",
          backdropFilter: "blur(10px)",
          padding: "5px 8px 5px 5px",
          color: lightTheme
            ? "#111827"
            : "#f8fafc",
          fontFamily:
            "Inter, ui-sans-serif, system-ui",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: 25,
            height: 25,
            borderRadius: 999,
            background: accent,
            color: lightTheme
              ? "#ffffff"
              : "#111827",
            fontSize: 11,
            fontWeight: 950,
            letterSpacing: ".02em",
            flex: "0 0 auto",
          }}
        >
          {axis}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 5,
          }}
        >
          <span
            style={{
              fontSize: 14,
              lineHeight: 1,
              fontWeight: 950,
              letterSpacing: "-.025em",
            }}
          >
            {valueM.toFixed(3)}
          </span>

          <span
            style={{
              fontSize: 9,
              lineHeight: 1,
              fontWeight: 900,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: ".10em",
            }}
          >
            m
          </span>
        </div>

        <div
          style={{
            width: 1,
            height: 18,
            background: lightTheme
              ? "rgba(17,24,39,.12)"
              : "rgba(255,255,255,.14)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <span
            style={{
              fontSize: 8,
              lineHeight: 1,
              fontWeight: 850,
              opacity: 0.58,
              textTransform: "uppercase",
              letterSpacing: ".08em",
            }}
          >
            {axisName}
          </span>

          <span
            style={{
              fontSize: 8,
              lineHeight: 1.1,
              fontWeight: 750,
              opacity: 0.48,
            }}
          >
            {valueCm.toFixed(1)} cm
          </span>
        </div>
      </div>
    </Html>
  );
}

function AnimatedDimensionArrow({
  start,
  end,
  axis,
  accent,
  delay = 0,
}: {
  start: [number, number, number];
  end: [number, number, number];
  axis: "x" | "y" | "z";
  accent: string;
  delay?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);

  const delta = useMemo(
    () =>
      [
        end[0] - start[0],
        end[1] - start[1],
        end[2] - start[2],
      ] as [number, number, number],
    [end, start],
  );

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    if (startedAt.current == null) {
      startedAt.current = clock.elapsedTime + delay;
    }

    const t = THREE.MathUtils.clamp(
      (clock.elapsedTime - startedAt.current) / 0.62,
      0,
      1,
    );

    const eased = 1 - Math.pow(1 - t, 3);

    group.current.scale.set(1, 1, 1);

    if (axis === "x") {
      group.current.scale.x = Math.max(0.001, eased);
    }

    if (axis === "y") {
      group.current.scale.y = Math.max(0.001, eased);
    }

    if (axis === "z") {
      group.current.scale.z = Math.max(0.001, eased);
    }
  });

  const endRotation: [number, number, number] =
    axis === "x"
      ? [0, 0, -Math.PI / 2]
      : axis === "z"
        ? [Math.PI / 2, 0, 0]
        : [0, 0, 0];

  const startRotation: [number, number, number] =
    axis === "x"
      ? [0, 0, Math.PI / 2]
      : axis === "z"
        ? [-Math.PI / 2, 0, 0]
        : [Math.PI, 0, 0];

  return (
    <group ref={group} position={start}>
      <Line
        points={[[0, 0, 0], delta]}
        color={accent}
        lineWidth={1.7}
      />

      <mesh rotation={startRotation}>
        <coneGeometry args={[0.055, 0.15, 20]} />
        <meshBasicMaterial color={accent} />
      </mesh>

      <mesh position={delta} rotation={endRotation}>
        <coneGeometry args={[0.055, 0.15, 20]} />
        <meshBasicMaterial color={accent} />
      </mesh>
    </group>
  );
}

function PremiumMeasurementOverlay({
  dimensions,
  meshVertices,
  scale,
  accent,
  lightTheme,
}: {
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  meshVertices: number[][];
  scale: number;
  accent: string;
  lightTheme: boolean;
}) {
  const extents = useMemo(() => {
    if (meshVertices.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const point of meshVertices) {
      if (point.length < 3) continue;
      const [x, y, z] = point;
      if (![x, y, z].every(Number.isFinite)) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    if (
      ![
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      ].every(Number.isFinite)
    ) {
      return null;
    }

    return {
      minX: minX * scale,
      maxX: maxX * scale,
      minY: minY * scale,
      maxY: maxY * scale,
      minZ: minZ * scale,
      maxZ: maxZ * scale,
    };
  }, [meshVertices, scale]);

  if (!extents) return null;

  const xOffset = 0.48;
  const yOffset = 0.48;
  const zOffset = 0.48;

  const lengthStart: [number, number, number] = [
    extents.minX,
    extents.maxY + yOffset,
    extents.maxZ + zOffset * 0.2,
  ];
  const lengthEnd: [number, number, number] = [
    extents.maxX,
    extents.maxY + yOffset,
    extents.maxZ + zOffset * 0.2,
  ];

  const breadthStart: [number, number, number] = [
    extents.maxX + xOffset,
    extents.minY,
    extents.minZ,
  ];
  const breadthEnd: [number, number, number] = [
    extents.maxX + xOffset,
    extents.minY,
    extents.maxZ,
  ];

  const heightStart: [number, number, number] = [
    extents.minX - xOffset,
    extents.minY,
    extents.maxZ,
  ];
  const heightEnd: [number, number, number] = [
    extents.minX - xOffset,
    extents.maxY,
    extents.maxZ,
  ];

  const dot = (p: [number, number, number], key: string) => (
    <mesh key={key} position={p}>
      <sphereGeometry args={[0.055, 16, 16]} />
      <meshBasicMaterial color={accent} />
    </mesh>
  );

  return (
    <group>
      <Line points={[[extents.minX, extents.maxY, extents.maxZ], lengthStart]} color={accent} lineWidth={1.1} transparent opacity={0.45} />
      <Line points={[[extents.maxX, extents.maxY, extents.maxZ], lengthEnd]} color={accent} lineWidth={1.1} transparent opacity={0.45} />
      <Line points={[[extents.maxX, extents.minY, extents.minZ], breadthStart]} color={accent} lineWidth={1.1} transparent opacity={0.45} />
      <Line points={[[extents.maxX, extents.minY, extents.maxZ], breadthEnd]} color={accent} lineWidth={1.1} transparent opacity={0.45} />
      <Line points={[[extents.minX, extents.minY, extents.maxZ], heightStart]} color={accent} lineWidth={1.1} transparent opacity={0.45} />
      <Line points={[[extents.minX, extents.maxY, extents.maxZ], heightEnd]} color={accent} lineWidth={1.1} transparent opacity={0.45} />

      <AnimatedDimensionArrow start={lengthStart} end={lengthEnd} axis="x" accent={accent} delay={0.05} />
      <AnimatedDimensionArrow start={breadthStart} end={breadthEnd} axis="z" accent={accent} delay={0.18} />
      <AnimatedDimensionArrow start={heightStart} end={heightEnd} axis="y" accent={accent} delay={0.31} />

      {dot(lengthStart, "ls")}
      {dot(lengthEnd, "le")}
      {dot(breadthStart, "bs")}
      {dot(breadthEnd, "be")}
      {dot(heightStart, "hs")}
      {dot(heightEnd, "he")}

      <DimensionLabel
        position={[
          (lengthStart[0] + lengthEnd[0]) / 2,
          lengthStart[1] + 0.11,
          lengthStart[2],
        ]}
        axis="L"
        valueCm={dimensions.length}
        accent={accent}
        lightTheme={lightTheme}
      />
      <DimensionLabel
        position={[
          breadthStart[0] + 0.13,
          breadthStart[1],
          (breadthStart[2] + breadthEnd[2]) / 2,
        ]}
        axis="B"
        valueCm={dimensions.breadth}
        accent={accent}
        lightTheme={lightTheme}
      />
      <DimensionLabel
        position={[
          heightStart[0] - 0.14,
          (heightStart[1] + heightEnd[1]) / 2,
          heightStart[2],
        ]}
        axis="H"
        valueCm={dimensions.height}
        accent={accent}
        lightTheme={lightTheme}
      />
    </group>
  );
}

function GraniteScene({
  geometry,
  dimensions,
  dressedDimensions,
  mode,
  cuttingSteps,
  selectedCutIdx,
  defects,
  selectedDefect,
  onSelectDefect,
  showWireframe,
  showPoints,
  lightTheme,
  irregularMeshValidated,
  activePhoto,
  selectedPhotoIdx,
  photoCount,
  cameraRevision,
  showMeasurements,
  selectedCutProgress,
  cutPlaying,
  committedCutIndices,
}: {
  geometry: GeometryState;
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  } | null;
  dressedDimensions: {
    length: number;
    breadth: number;
    height: number;
  } | null;
  mode: ViewerMode;
  cuttingSteps: DressingCutStep[];
  selectedCutIdx: number;
  defects: DefectItem[];
  selectedDefect: DefectItem | null;
  onSelectDefect: (
    defect: DefectItem,
  ) => void;
  showWireframe: boolean;
  showPoints: boolean;
  lightTheme: boolean;
  irregularMeshValidated: boolean;
  activePhoto: PhotoEvidenceView | null;
  selectedPhotoIdx: number;
  photoCount: number;
  cameraRevision: number;
  showMeasurements: boolean;
  selectedCutProgress: number;
  cutPlaying: boolean;
  committedCutIndices: number[];
}) {
  const sourcePoints =
    geometry.meshVertices.length > 0
      ? geometry.meshVertices
      : geometry.points;

  const displayableObservedMesh =
    isDisplayableObservedMesh(geometry);

  const centered = useMemo(
    () =>
      centerGeometry(
        sourcePoints,
      ),
    [sourcePoints],
  );

  const sceneScale =
    4.2 /
    Math.max(
      centered.maxExtent,
      dimensions
        ? Math.max(
            dimensions.length,
            dimensions.breadth,
            dimensions.height,
          )
        : 1,
      1,
    );

  const meshCentered = useMemo(() => {
    if (
      geometry.meshVertices.length === 0
    ) {
      return [];
    }

    return geometry.meshVertices.map(
      ([x, y, z]) => [
        x - centered.center[0],
        y - centered.center[1],
        z - centered.center[2],
      ],
    );
  }, [
    centered.center,
    geometry.meshVertices,
  ]);

  const pointCentered = useMemo(() => {
    if (
      geometry.points.length === 0
    ) {
      return [];
    }

    return geometry.points.map(
      ([x, y, z]) => [
        x - centered.center[0],
        y - centered.center[1],
        z - centered.center[2],
      ],
    );
  }, [
    centered.center,
    geometry.points,
  ]);

  const showRaw =
    mode !== "FINAL_DRESSED_BLOCK";

  const rawOpacity =
    mode === "DRESSING_PLAN"
      ? 0.68
      : mode === "USABLE_ENVELOPE"
        ? 0.55
        : mode === "DEFECT_MAP"
          ? 0.66
          : 1;

  const activeCutStep =
    mode === "DRESSING_PLAN"
      ? cuttingSteps[selectedCutIdx] ?? null
      : null;

  return (
    <>
      <color
        attach="background"
        args={[
          "#f4f8fc",
        ]}
      />
      <fog
        attach="fog"
        args={[
          "#f4f8fc",
          8,
          18,
        ]}
      />

      <SceneLights
        lightTheme={lightTheme}
      />

      <EngineeringGrid
        size={12}
        lightTheme={lightTheme}
      />

      <EvidenceNavigationControls
        photo={activePhoto}
        photoIndex={selectedPhotoIdx}
        photoCount={photoCount}
        selectionRevision={cameraRevision}
        enabled={
          (mode === "REAL_PHOTO_3D" ||
            mode === "DEFECT_MAP" ||
            (mode === "DRESSING_PLAN" && !cutPlaying)) &&
          Boolean(activePhoto)
        }
      />

      <CutProcedureCameraDirector
        step={activeCutStep}
        enabled={
          mode === "DRESSING_PLAN" &&
          Boolean(activeCutStep) &&
          cutPlaying
        }
        progress={selectedCutProgress}
      />

      {(mode === "REAL_PHOTO_3D" ||
        mode === "DEFECT_MAP" ||
        mode === "DRESSING_PLAN") ? (
        <EvidenceViewIndicator photo={activePhoto} lightTheme={lightTheme} />
      ) : null}

      {showRaw &&
      displayableObservedMesh &&
      meshCentered.length > 0 &&
      geometry.meshTriangles.length > 0 ? (
        mode === "DRESSING_PLAN" &&
        activeCutStep ? (
          <CumulativeIrregularCutScene
            vertices={meshCentered}
            triangles={
              geometry.meshTriangles
            }
            normals={
              geometry.meshNormals
            }
            scale={sceneScale}
            cuttingSteps={
              cuttingSteps
            }
            committedCutIndices={
              committedCutIndices
            }
            activeCutIndex={
              selectedCutIdx
            }
            activeProgress={
              selectedCutProgress
            }
            centerOffset={
              centered.center
            }
            lightTheme={lightTheme}
            wireframe={
              showWireframe
            }
          />
        ) : (
          <ObservedMesh
            vertices={meshCentered}
            triangles={
              geometry.meshTriangles
            }
            normals={
              geometry.meshNormals
            }
            scale={sceneScale}
            lightTheme={lightTheme}
            opacity={rawOpacity}
            wireframe={showWireframe}
          />
        )
      ) : null}

      {showRaw &&
      (showPoints || geometry.meshIntegrity.severeSurfaceDropout) &&
      pointCentered.length >= 80 ? (
        <SparsePoints
          points={pointCentered}
          scale={sceneScale}
          lightTheme={lightTheme}
          opacity={
            geometry.meshVertices.length >
            0
              ? 0.24
              : 1
          }
        />
      ) : null}

      {dimensions &&
      mode ===
        "RAW_BOUNDING_BOX" &&
      irregularMeshValidated &&
      meshCentered.length > 0 ? (
        <BoundingOverlay
          dimensions={dimensions}
          scale={sceneScale}
          accent={
            lightTheme
              ? "#92400e"
              : "#fbbf24"
          }
        />
      ) : null}

      {dressedDimensions &&
      irregularMeshValidated &&
      meshCentered.length > 0 &&
      (mode ===
        "USABLE_ENVELOPE" ||
        mode ===
          "DRESSING_PLAN" ||
        mode ===
          "FINAL_DRESSED_BLOCK") ? (
        <DressedBlock
          dimensions={
            dressedDimensions
          }
          scale={sceneScale}
          lightTheme={lightTheme}
          opacity={
            mode ===
            "FINAL_DRESSED_BLOCK"
              ? 0.78
              : 0.22
          }
        />
      ) : null}

      {mode === "DRESSING_PLAN" &&
      dimensions &&
      irregularMeshValidated &&
      meshCentered.length > 0
        ? cuttingSteps.map(
            (step, index) => (
              <CutPlane
                key={`${step.step_number}-${step.cut_name}-${index}`}
                step={step}
                selected={
                  selectedCutIdx ===
                  index
                }
                scale={sceneScale}
                rawDimensions={
                  dimensions
                }
                centerOffset={
                  centered.center
                }
                progress={
                  selectedCutIdx === index
                    ? selectedCutProgress
                    : 0
                }
                lightTheme={
                  lightTheme
                }
              />
            ),
          )
        : null}

      {mode === "DEFECT_MAP"
        ? defects.map(
            (
              defect,
              index,
            ) => (
              <DefectMarker
                key={
                  defect.id ||
                  `${defect.type}-${index}`
                }
                defect={defect}
                scale={sceneScale}
                centerOffset={centered.center}
                selected={
                  selectedDefect ===
                  defect
                }
                onSelect={() =>
                  onSelectDefect(
                    defect,
                  )
                }
              />
            ),
          )
        : null}

      {showMeasurements &&
      dimensions &&
      irregularMeshValidated &&
      meshCentered.length > 0 &&
      (mode === "REAL_PHOTO_3D" ||
        mode === "RAW_3D" ||
        mode === "RAW_BOUNDING_BOX" ||
        mode === "DRESSING_PLAN") ? (
        <PremiumMeasurementOverlay
          dimensions={dimensions}
          meshVertices={meshCentered}
          scale={sceneScale}
          accent={
            lightTheme
              ? "#a16207"
              : "#f6c862"
          }
          lightTheme={lightTheme}
        />
      ) : null}


    </>
  );
}

function EvidencePhoto({
  photo,
  lang,
  showOriginal,
}: {
  photo: PhotoEvidenceView;
  lang: string;
  showOriginal: boolean;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const resolvedImageUrl = photo.image_url
    ? apiAssetUrl(photo.image_url)
    : "";

  useEffect(() => {
    setLoadFailed(false);
  }, [resolvedImageUrl]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-slate-100">
      {resolvedImageUrl && !loadFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={resolvedImageUrl}
          alt={photo.view_name}
          onError={() => setLoadFailed(true)}
          className={`h-full w-full object-contain transition-opacity duration-300 ${
            showOriginal
              ? "opacity-100"
              : "opacity-25"
          }`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(14,165,233,0.10),transparent_45%),linear-gradient(145deg,#f8fbff,#e8f1f8)] px-8 text-center">
          <ImageIcon
            size={38}
            className="mb-3 text-[var(--accent)] opacity-70"
          />
          <p className="text-sm font-extrabold text-slate-800">
            {photo.view_name}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {loadFailed
              ? lang === "te"
                ? "ఫోటో లోడ్ కాలేదు — API ఎండ్‌పాయింట్‌ను తనిఖీ చేయండి"
                : "Photo failed to load — check API endpoint"
              : lang === "te"
                ? "అసలు ఫోటో URL అందుబాటులో లేదు"
                : "Original image URL not available"}
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/95 via-white/72 to-transparent px-4 pb-4 pt-12">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
              {photo.photo_label}
            </div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {photo.view_name}
            </div>
          </div>
          <StatusPill
            tone={
              photo.is_observed
                ? "good"
                : "warn"
            }
          >
            {photo.is_observed
              ? "Observed"
              : "Unobserved"}
          </StatusPill>
        </div>
      </div>
    </div>
  );
}


type AnalysisPipelineTone =
  | "done"
  | "active"
  | "waiting"
  | "blocked"
  | "partial";

type AnalysisPipelineStage = {
  id: string;
  title: string;
  description: string;
  detail: string;
  tone: AnalysisPipelineTone;
  progress: number | null;
  icon:
    React.ComponentType<{
      size?: number;
    }>;
};

function AnalysisStageCard({
  stage,
  index,
}: {
  stage: AnalysisPipelineStage;
  index: number;
}) {
  const toneClass =
    stage.tone === "done"
      ? "border-emerald-400/25 bg-emerald-500/[0.07]"
      : stage.tone === "active"
        ? "border-sky-400/30 bg-sky-500/[0.08] shadow-[0_0_28px_rgba(56,189,248,0.08)]"
        : stage.tone === "blocked"
          ? "border-red-400/25 bg-red-500/[0.07]"
          : stage.tone === "partial"
            ? "border-amber-400/25 bg-amber-500/[0.07]"
            : "border-[var(--border)] bg-[var(--surface-raised)]";

  const iconClass =
    stage.tone === "done"
      ? "text-emerald-300"
      : stage.tone === "active"
        ? "text-sky-700"
        : stage.tone === "blocked"
          ? "text-red-700"
          : stage.tone === "partial"
            ? "text-sky-700"
            : "text-[var(--text-muted)]";

  const statusText =
    stage.tone === "done"
      ? "VERIFIED"
      : stage.tone === "active"
        ? "PROCESSING"
        : stage.tone === "blocked"
          ? "BLOCKED"
          : stage.tone === "partial"
            ? "PARTIAL"
            : "WAITING";

  const StatusIcon =
    stage.tone === "done"
      ? CheckCircle2
      : stage.tone === "blocked"
        ? AlertTriangle
        : stage.tone === "active"
          ? Activity
          : stage.icon;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3.5 transition-all duration-300 ${toneClass}`}
    >
      {stage.tone === "active" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
      ) : null}

      <div className="flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-100 ${iconClass}`}
        >
          <StatusIcon size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] font-black text-[var(--text-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h4 className="text-[12px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
                {stage.title}
              </h4>
            </div>

            <span className={`text-[8px] font-black uppercase tracking-[0.14em] ${iconClass}`}>
              {statusText}
            </span>
          </div>

          <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-secondary)]">
            {stage.description}
          </p>

          <p className="mt-2 font-mono text-[9px] leading-4 text-[var(--text-muted)]">
            {stage.detail}
          </p>

          {stage.progress != null ? (
            <div className="mt-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    stage.tone === "blocked"
                      ? "bg-red-400"
                      : stage.tone === "partial"
                        ? "bg-amber-400"
                        : stage.tone === "done"
                          ? "bg-emerald-400"
                          : "bg-sky-400"
                  }`}
                  style={{
                    width: `${Math.max(2, Math.min(100, stage.progress))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AnalysisPipelinePanel({
  stages,
  loading,
  measurementAllowed,
  metricDimensionsAvailable,
  provider,
}: {
  stages: AnalysisPipelineStage[];
  loading: boolean;
  measurementAllowed: boolean;
  metricDimensionsAvailable: boolean;
  provider: string | null;
}) {
  const completed = stages.filter((stage) => stage.tone === "done").length;
  const blocked = stages.filter((stage) => stage.tone === "blocked").length;
  const partial = stages.filter((stage) => stage.tone === "partial").length;

  const overallProgress =
    stages.length > 0
      ? Math.round(
          stages.reduce((sum, stage) => {
            if (stage.tone === "done") return sum + 100;
            if (stage.progress != null) return sum + stage.progress;
            if (stage.tone === "partial") return sum + 55;
            return sum;
          }, 0) / stages.length,
        )
      : 0;

  const statusLabel =
    !measurementAllowed
      ? "Measurement blocked"
      : metricDimensionsAvailable
        ? "Metric result ready"
        : loading
          ? "Analysis running"
          : "Measurement pending";

  return (
    <section className="relative border-b border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 sm:px-4 lg:px-5">
      <details className="group overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface-glass)] shadow-[var(--shadow-soft)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#7dd3fc]/20 bg-[#7dd3fc]/[0.07] text-[#7dd3fc]">
              <Cpu size={14} />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-primary)]">
                  Processing details
                </span>
                <span className="font-mono text-[8px] font-black text-[var(--text-muted)]">
                  {stages.length} steps
                </span>
              </div>

              <p className="mt-0.5 truncate text-[9px] text-[var(--text-muted)]">
                {statusLabel} · {completed}/{stages.length} ready
                {partial > 0 ? ` · ${partial} partial` : ""}
                {blocked > 0 ? ` · ${blocked} blocked` : ""}
                {provider ? ` · ${provider}` : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-[8px] font-black text-[var(--text-secondary)] sm:inline-flex">
              {overallProgress}%
            </span>
            <ChevronDown
              size={15}
              className="text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
            />
          </div>
        </summary>

        <div className="border-t border-[var(--border-subtle)] px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#a9772d] to-[#e4c675] transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, overallProgress))}%` }}
            />
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const ready = stage.tone === "done";
              const blockedStage = stage.tone === "blocked";
              const partialStage = stage.tone === "partial";

              return (
                <div
                  key={stage.id}
                  className={[
                    "flex min-w-0 items-start gap-2 rounded-[12px] border px-2.5 py-2",
                    ready
                      ? "border-emerald-500/14 bg-emerald-500/[0.045]"
                      : blockedStage
                        ? "border-red-500/14 bg-red-500/[0.04]"
                        : partialStage
                          ? "border-amber-500/14 bg-amber-500/[0.04]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-raised)]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-6 w-6 shrink-0 place-items-center rounded-lg border",
                      ready
                        ? "border-emerald-500/18 text-emerald-500"
                        : blockedStage
                          ? "border-red-500/18 text-red-400"
                          : partialStage
                            ? "border-amber-500/18 text-amber-500"
                            : "border-[var(--border)] text-[var(--text-muted)]",
                    ].join(" ")}
                  >
                    <Icon size={11} />
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[7px] font-black text-[var(--text-muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="truncate text-[8.5px] font-black text-[var(--text-primary)]">
                        {stage.title}
                      </p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[7.5px] leading-3.5 text-[var(--text-muted)]">
                      {stage.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[8px] leading-4 text-[var(--text-muted)]">
            Processing information is collapsed by default so the 3D granite remains the primary focus. Open this only when detailed evidence-state diagnostics are needed.
          </p>
        </div>
      </details>
    </section>
  );
}


function digitalTwinPercent(
  value: number | null | undefined,
): string {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return "Not measured";
  }

  const normalized =
    value <= 1
      ? value * 100
      : value;

  return `${normalized.toFixed(1)}%`;
}

function digitalTwinCavityMetric(
  defect: DefectItem,
  key:
    | "opening_width_cm"
    | "opening_height_cm"
    | "opening_area_cm2"
    | "max_observed_depth_cm"
    | "mean_observed_depth_cm"
    | "visible_cavity_volume_cm3",
): number | null {
  const direct = defect[key];

  if (
    typeof direct === "number" &&
    Number.isFinite(direct)
  ) {
    return direct;
  }

  const geometry =
    defect.metadata
      ?.cavity_geometry;

  if (
    !geometry ||
    typeof geometry !== "object"
  ) {
    return null;
  }

  const value = geometry[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function digitalTwinIsCavity(
  defect: DefectItem,
): boolean {
  const label =
    `${defect.kind || ""} ${defect.type || ""} ${defect.category || ""}`
      .toLowerCase();

  return [
    "hole",
    "pit",
    "cavity",
    "void",
    "depression",
  ].some((token) =>
    label.includes(token),
  );
}

function ObservedShapeValidationPanel({
  views,
  reconstructionQuality,
  observedSurfaces,
  missingSurfaces,
  selectedPhotoIndex,
  onSelectView,
}: {
  views: PhotoEvidenceView[];
  reconstructionQuality?: ReconstructionQualityReport | null;
  observedSurfaces: string[];
  missingSurfaces: string[];
  selectedPhotoIndex: number;
  onSelectView: (index: number) => void;
}) {
  const perViewIous =
    views
      .map(
        (view) =>
          view.silhouette_iou,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value === "number" &&
          Number.isFinite(value),
      );

  const meanPerViewIou =
    perViewIous.length > 0
      ? perViewIous.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) / perViewIous.length
      : null;

  const reportedIou =
    typeof reconstructionQuality
      ?.overall_silhouette_iou ===
    "number"
      ? reconstructionQuality
          .overall_silhouette_iou
      : typeof reconstructionQuality
            ?.silhouette_consistency ===
          "number"
        ? reconstructionQuality
            .silhouette_consistency
        : meanPerViewIou;

  const normalizedIou =
    reportedIou == null
      ? null
      : reportedIou <= 1
        ? reportedIou
        : reportedIou / 100;

  const targetMet =
    normalizedIou != null &&
    normalizedIou >= 0.9;

  return (
    <div className="relative border-b border-[#7dd3fc]/12 bg-[#0b0e12]/94 px-3 py-3 text-[#f1f5f9] sm:px-4 lg:px-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded-[22px] border border-[#7dd3fc]/14 bg-white/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#7dd3fc]">
                <Target size={13} />
                Observed-shape validation
              </div>

              <p className="mt-1 max-w-3xl text-[10px] leading-5 text-white/48">
                ≥90% is a validation target on observed photographic views only. Missing surfaces stay unknown and are never filled to improve the score.
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                targetMet
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : normalizedIou != null
                    ? "border-amber-500/25 bg-amber-500/10 text-sky-700"
                    : "border-slate-200 bg-white/[0.04] text-white/45"
              }`}
            >
              {normalizedIou == null
                ? "Not measured"
                : targetMet
                  ? "Target met"
                  : "More evidence needed"}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label="Silhouette IoU"
              value={digitalTwinPercent(
                reportedIou,
              )}
              sub="Observed target ≥ 90%"
            />

            <MetricTile
              label="Boundary error"
              value={
                typeof reconstructionQuality
                  ?.mean_boundary_error_px ===
                "number"
                  ? `${reconstructionQuality.mean_boundary_error_px.toFixed(2)} px`
                  : "Not measured"
              }
            />

            <MetricTile
              label="Reprojection"
              value={
                typeof reconstructionQuality
                  ?.mean_reprojection_error_px ===
                "number"
                  ? `${reconstructionQuality.mean_reprojection_error_px.toFixed(2)} px`
                  : "Not measured"
              }
            />

            <MetricTile
              label="Camera coverage"
              value={
                typeof reconstructionQuality
                  ?.camera_coverage_percentage ===
                "number"
                  ? digitalTwinPercent(
                      reconstructionQuality
                        .camera_coverage_percentage,
                    )
                  : "Not measured"
              }
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-[#7dd3fc]/14 bg-white/90 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#7dd3fc]">
            <ShieldCheck size={13} />
            Surface truth state
          </div>

          <div className="mt-3">
            <div className="text-[8px] font-black uppercase tracking-[0.12em] text-emerald-300/80">
              Observed
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {observedSurfaces.length >
              0 ? (
                observedSurfaces.map(
                  (surface) => (
                    <span
                      key={`observed-${surface}`}
                      className="rounded-full border border-emerald-500/18 bg-emerald-500/[0.07] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-300"
                    >
                      {surface}
                    </span>
                  ),
                )
              ) : (
                <span className="text-[9px] text-slate-500">
                  Not reported
                </span>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-700/85">
              Unobserved / unknown
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {missingSurfaces.length >
              0 ? (
                missingSurfaces.map(
                  (surface) => (
                    <span
                      key={`missing-${surface}`}
                      className="rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-sky-700"
                    >
                      {surface}
                    </span>
                  ),
                )
              ) : (
                <span className="text-[9px] text-slate-500">
                  None reported
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {views.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {views.map(
            (view, index) => {
              const iou =
                typeof view
                  .silhouette_iou ===
                "number"
                  ? view.silhouette_iou
                  : null;

              const normalized =
                iou == null
                  ? null
                  : iou <= 1
                    ? iou
                    : iou / 100;

              const weak =
                view.weak_view ===
                  true ||
                (
                  normalized != null &&
                  normalized < 0.85
                );

              const selected =
                index ===
                selectedPhotoIndex;

              return (
                <button
                  type="button"
                  onClick={() =>
                    onSelectView(
                      index,
                    )
                  }
                  key={
                    view.photo_id ||
                    `${view.photo_label}-${index}`
                  }
                  className={`min-w-[170px] rounded-[16px] border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-[#7dd3fc]/45 bg-[#7dd3fc]/12 shadow-[0_10px_28px_rgba(216,182,109,.10)]"
                      : weak
                        ? "border-amber-500/22 bg-amber-500/[0.065]"
                        : normalized != null &&
                            normalized >= 0.9
                          ? "border-emerald-500/18 bg-emerald-500/[0.055]"
                          : "border-white/8 bg-white/90"
                  }`}
                >
                  <div className="truncate text-[8px] font-black uppercase tracking-[0.12em] text-white/45">
                    {view.photo_label}
                  </div>

                  <div className="mt-1 text-[10px] font-black">
                    {iou != null
                      ? digitalTwinPercent(
                          iou,
                        )
                      : "Not measured"}
                  </div>

                  <div className="mt-1 truncate text-[8px] text-slate-500">
                    {view.view_name ||
                      view.side ||
                      "Observed view"}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[7px] font-black uppercase tracking-[0.1em] text-slate-500">
                      {selected
                        ? "Focused"
                        : "Select view"}
                    </span>

                    {weak ? (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-sky-700">
                        Weak
                      </span>
                    ) : normalized != null &&
                      normalized >= 0.9 ? (
                      <span className="rounded-full border border-emerald-500/18 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-emerald-300">
                        Validated
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function PointCloud3DViewer({
  jobId,
  pointsUrl,
  meshUrl,
  dimensions,
  dressedDimensions,
  defects = [],
  cuttingSteps = [],
  orientations = [],
  isDemo = false,
  provider = null,
  initialMode = "REAL_PHOTO_3D",
  observedSurfaces = [],
  missingSurfaces = [],
  scenarios,
  photoEvidenceMatrix,
  reconstructionQuality,
  referenceMode = false,
}: PointCloud3DViewerProps) {
  const { lang } =
    useLanguage();
  const { resolvedTheme } =
    useTheme();

  const lightTheme =
    resolvedTheme === "light";

  const [
    activeMode,
    setActiveMode,
  ] =
    useState<ViewerMode>(
      initialMode,
    );

  const [
    selectedScenario,
    setSelectedScenario,
  ] =
    useState<ScenarioMode>(
      "CONFIRMED_DAMAGE",
    );

  const [
    selectedPhotoIdx,
    setSelectedPhotoIdx,
  ] = useState(0);

  const [cameraRevision, setCameraRevision] = useState(0);

  const [
    selectedCutIdx,
    setSelectedCutIdx,
  ] = useState(0);

  const [
    cutPlaying,
    setCutPlaying,
  ] = useState(false);

  const [
    selectedCutProgress,
    setSelectedCutProgress,
  ] = useState(0);


  const [
    committedCutIndices,
    setCommittedCutIndices,
  ] = useState<number[]>([]);

  const cutStartedAtRef =
    useRef<number | null>(null);

  const cutAnimationFrameRef =
    useRef<number | null>(null);

  const [
    selectedDefect,
    setSelectedDefect,
  ] =
    useState<DefectItem | null>(
      null,
    );

  const [
    showWireframe,
    setShowWireframe,
  ] = useState(true);

  const [
    showPoints,
    setShowPoints,
  ] = useState(true);

  const [
    showMeasurements,
    setShowMeasurements,
  ] = useState(true);

  const [
    showPhoto,
    setShowPhoto,
  ] = useState(true);

  const [
    geometry,
    setGeometry,
  ] =
    useState<GeometryState>(
      EMPTY_GEOMETRY,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loadError,
    setLoadError,
  ] = useState<string | null>(
    null,
  );

  const requestKeyRef =
    useRef<string | null>(
      null,
    );

  const viewsData =
    useMemo(
      () =>
        photoEvidenceMatrix &&
        photoEvidenceMatrix.length >
          0
          ? photoEvidenceMatrix
          : [],
      [photoEvidenceMatrix],
    );

  const activePhoto =
    viewsData[
      selectedPhotoIdx
    ] ?? null;

  const effectiveObservedSurfaces =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...observedSurfaces,
            ...(
              reconstructionQuality
                ?.observed_surfaces ||
              []
            ),
          ]),
        ),
      [
        observedSurfaces,
        reconstructionQuality
          ?.observed_surfaces,
      ],
    );

  const effectiveMissingSurfaces =
    useMemo(
      () =>
        Array.from(
          new Set([
            ...missingSurfaces,
            ...(
              reconstructionQuality
                ?.missing_surfaces ||
              []
            ),
          ]),
        ),
      [
        missingSurfaces,
        reconstructionQuality
          ?.missing_surfaces,
      ],
    );

  const selectEvidencePhoto = (index: number) => {
    setSelectedPhotoIdx(index);
    setActiveMode("REAL_PHOTO_3D");
    setCameraRevision((value) => value + 1);
  };

  const evidenceIndicesForDefect = (
    defect: DefectItem,
  ): number[] => {
    const sourceIds = new Set(
      (defect.source_image_ids || []).map(String),
    );

    const evidenceViews = new Set(
      (defect.evidence_views || []).map((value) =>
        String(value).trim().toUpperCase(),
      ),
    );

    const matches = viewsData
      .map((view, index) => {
        const photoId =
          view.photo_id != null
            ? String(view.photo_id)
            : "";

        const labels = [
          view.photo_label,
          view.side,
          view.view_name,
        ]
          .filter(Boolean)
          .map((value) =>
            String(value).trim().toUpperCase(),
          );

        const matchedById =
          photoId.length > 0 &&
          sourceIds.has(photoId);

        const matchedByView =
          labels.some((label) =>
            evidenceViews.has(label),
          );

        return matchedById || matchedByView
          ? index
          : -1;
      })
      .filter((index) => index >= 0);

    return Array.from(new Set(matches));
  };

  const selectDefectEvidence = (
    defect: DefectItem,
    preferredEvidenceIndex?: number,
  ) => {
    setSelectedDefect(defect);
    setActiveMode("DEFECT_MAP");

    const evidenceIndices =
      evidenceIndicesForDefect(defect);

    const targetIndex =
      preferredEvidenceIndex != null &&
      evidenceIndices.includes(
        preferredEvidenceIndex,
      )
        ? preferredEvidenceIndex
        : evidenceIndices[0];

    if (targetIndex != null) {
      setSelectedPhotoIdx(targetIndex);
      setCameraRevision(
        (value) => value + 1,
      );
    }
  };

  const currentScenario =
    scenarios
      ? (scenarios[
          selectedScenario
        ] as
          | ScenarioDetail
          | undefined)
      : undefined;

  const metricDimensions =
    useMemo(() => {
      if (!dimensions) {
        return null;
      }

      const values = [
        dimensions.length_cm,
        dimensions.breadth_cm,
        dimensions.height_cm,
      ];

      if (
        !values.every(
          (value) =>
            typeof value ===
              "number" &&
            Number.isFinite(
              value,
            ) &&
            value > 0,
        )
      ) {
        return null;
      }

      return {
        length:
          dimensions.length_cm,
        breadth:
          dimensions.breadth_cm,
        height:
          dimensions.height_cm,
      };
    }, [dimensions]);

  const activeDressedDimensions =
    useMemo(() => {
      const scenarioDims =
        currentScenario?.dressed_dimensions;

      const length =
        scenarioDims?.length_m !=
        null
          ? scenarioDims.length_m *
            100
          : dressedDimensions?.length_cm;

      const breadth =
        scenarioDims?.breadth_m !=
        null
          ? scenarioDims.breadth_m *
            100
          : dressedDimensions?.breadth_cm;

      const height =
        scenarioDims?.height_m !=
        null
          ? scenarioDims.height_m *
            100
          : dressedDimensions?.height_cm;

      const values = [
        length,
        breadth,
        height,
      ];

      if (
        !values.every(
          (value) =>
            typeof value ===
              "number" &&
            Number.isFinite(
              value,
            ) &&
            value > 0,
        )
      ) {
        return null;
      }

      return {
        length: length as number,
        breadth: breadth as number,
        height: height as number,
      };
    }, [
      currentScenario,
      dressedDimensions,
    ]);

  useEffect(() => {
    const pointTarget =
      pointsUrl ||
      (jobId
        ? `/geometry/${jobId}/point-cloud`
        : null);

    const meshTarget =
      meshUrl ||
      (jobId
        ? `/geometry/${jobId}/mesh`
        : null);

    const requestKey =
      `${pointTarget || ""}|${meshTarget || ""}`;

    if (
      !pointTarget &&
      !meshTarget
    ) {
      requestKeyRef.current = null;
      setGeometry(
        EMPTY_GEOMETRY,
      );
      setLoadError(null);
      setLoading(false);
      return;
    }

    /*
     * Do not short-circuit solely because requestKeyRef already matches.
     * React 18/Next.js development Strict Mode intentionally mounts, cleans up,
     * and re-runs effects. The old request-key guard could cancel the first
     * request and then suppress the second one, leaving `loading` stuck true.
     * Re-running the fetch here is safe and guarantees the loading state reaches
     * a terminal success/error state.
     */
    requestKeyRef.current =
      requestKey;

    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    Promise.all([
      pointTarget
        ? getPointCloudData(
            pointTarget,
          )
        : Promise.resolve(null),
      meshTarget
        ? getPointCloudData(
            meshTarget,
          )
        : Promise.resolve(null),
    ])
      .then(
        ([
          pointResponse,
          meshResponse,
        ]) => {
          if (cancelled) {
            return;
          }

          const pointPayload =
            pointResponse as
              | PointPayload
              | null;

          const meshPayload =
            meshResponse as unknown as
              | MeshPayload
              | null;

          const points =
            Array.isArray(
              pointPayload?.points,
            )
              ? pointPayload!.points!.filter(
                  finiteTriplet,
                )
              : [];

          const meshVertices =
            Array.isArray(
              meshPayload?.vertices,
            )
              ? meshPayload!.vertices!.filter(
                  finiteTriplet,
                )
              : [];

          const meshTriangles =
            Array.isArray(
              meshPayload?.triangles,
            )
              ? meshPayload!.triangles!.filter(
                  finiteTriangle,
                )
              : [];

          const meshNormals =
            Array.isArray(
              meshPayload?.vertex_normals,
            )
              ? meshPayload!.vertex_normals!.filter(
                  finiteTriplet,
                )
              : [];

          const validTriangles =
            meshTriangles.filter(
              (triangle) =>
                triangle[0] <
                  meshVertices.length &&
                triangle[1] <
                  meshVertices.length &&
                triangle[2] <
                  meshVertices.length,
            );

          const meshIntegrity =
            computeMeshIntegrity(validTriangles);

          setGeometry({
            points,
            meshVertices,
            meshTriangles:
              validTriangles,
            meshNormals,
            meshStatus:
              String(
                meshPayload?.mesh_status ||
                  meshPayload?.status ||
                  (meshVertices.length >
                    0 &&
                  validTriangles.length >
                    0
                    ? "CALCULATED"
                    : "NOT_AVAILABLE"),
              ),
            meshMethod:
              meshPayload?.mesh_method ??
              meshPayload?.method ??
              null,
            isWatertight:
              typeof meshPayload?.is_watertight ===
              "boolean"
                ? meshPayload.is_watertight
                : null,
            meshSurfaceAreaCm2:
              typeof meshPayload?.surface_area_cm2 ===
                "number" &&
              Number.isFinite(
                meshPayload.surface_area_cm2,
              )
                ? meshPayload.surface_area_cm2
                : null,
            meshVolumeCm3:
              typeof meshPayload?.volume_cm3 ===
                "number" &&
              Number.isFinite(
                meshPayload.volume_cm3,
              )
                ? meshPayload.volume_cm3
                : typeof meshPayload?.mesh_volume_cm3 ===
                      "number" &&
                    Number.isFinite(
                      meshPayload.mesh_volume_cm3,
                    )
                  ? meshPayload.mesh_volume_cm3
                  : null,
            meshIntegrity,
          });
        },
      )
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setGeometry(
          EMPTY_GEOMETRY,
        );
        setLoadError(
          error instanceof Error
            ? error.message
            : "Geometry could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    jobId,
    meshUrl,
    pointsUrl,
  ]);

  const hasMesh =
    geometry.meshVertices.length >
      0 &&
    geometry.meshTriangles.length >
      0;

  const hasPoints =
    geometry.points.length > 0;

  const sparsePointCount = geometry.points.length;
  const sparseOnlyInsufficient =
    !hasMesh &&
    sparsePointCount > 0 &&
    sparsePointCount < 80;

  const displayableObservedMesh =
    hasMesh &&
    isDisplayableObservedMesh(geometry);

  const irregularRawMeshAvailable =
    hasMesh &&
    isValidatedIrregularRawMesh(
      geometry,
    );

  // Sparse SfM points are valid reconstruction evidence, but they are NOT
  // enough to authorize a raw stone surface, engineering cuboid, cut planes,
  // recoverable envelope, defect-on-surface map, or final dressed block.
  const rawGeometryAvailable =
    displayableObservedMesh ||
    hasPoints;

  const engineeringSurfaceAvailable =
    irregularRawMeshAvailable;

  const meshStatusTone =
    irregularRawMeshAvailable
      ? "good"
      : hasPoints
        ? "warn"
        : "danger";

  const measurementAllowed =
    reconstructionQuality
      ? reconstructionQuality.metric_measurement_allowed !==
        false
      : true;


  const calibratedViewCount =
    viewsData.filter((view) => {
      const status = String(
        view.calibration_status || "",
      ).toUpperCase();

      return (
        status.includes("CALIBRATED") ||
        status.includes("METRIC") ||
        status.includes("VALID")
      );
    }).length;

  const explicitlyUncalibratedCount =
    viewsData.filter((view) => {
      const status = String(
        view.calibration_status || "",
      ).toUpperCase();

      return (
        status.includes("UNCALIBRATED") ||
        status.includes("FAILED") ||
        status.includes("REJECTED") ||
        status.includes("INVALID")
      );
    }).length;

  const solvedPoseCount =
    viewsData.filter(
      (view) =>
        view.camera_angles &&
        [view.camera_angles.azimuth, view.camera_angles.elevation]
          .every(
            (value) =>
              typeof value === "number" &&
              Number.isFinite(value),
          ),
    ).length;

  const registrationEvidenceCount =
    viewsData.filter(
      (view) =>
        typeof view.silhouette_iou === "number" ||
        typeof view.boundary_error_px === "number" ||
        typeof view.feature_reprojection_error_px === "number",
    ).length;

  const reconstructionConfirmedCount =
    viewsData.filter((view) => {
      const status = String(
        view.reconstruction_status || "",
      ).toUpperCase();

      return (
        status.includes("RECONSTRUCT") ||
        status.includes("SOLVED") ||
        status.includes("VALID") ||
        status.includes("CONFIRMED")
      );
    }).length;

  const analysisPipelineStages =
    useMemo<AnalysisPipelineStage[]>(() => {
      const evidenceCount = viewsData.length;

      const calibrationTone: AnalysisPipelineTone =
        explicitlyUncalibratedCount > 0
          ? "blocked"
          : calibratedViewCount > 0
            ? "done"
            : evidenceCount > 0
              ? "waiting"
              : "waiting";

      const registrationTone: AnalysisPipelineTone =
        registrationEvidenceCount > 0
          ? registrationEvidenceCount >= Math.max(1, Math.ceil(evidenceCount * 0.5))
            ? "done"
            : "partial"
          : evidenceCount > 0
            ? "waiting"
            : "waiting";

      const poseTone: AnalysisPipelineTone =
        solvedPoseCount > 0
          ? solvedPoseCount >= Math.max(1, Math.ceil(evidenceCount * 0.5))
            ? "done"
            : "partial"
          : evidenceCount > 0
            ? "waiting"
            : "waiting";

      const reconstructionTone: AnalysisPipelineTone =
        loadError
          ? "blocked"
          : loading
            ? "active"
            : irregularRawMeshAvailable
              ? "done"
              : hasPoints
                ? "partial"
                : reconstructionConfirmedCount > 0
                  ? "partial"
                  : "waiting";

      const meshValidationTone: AnalysisPipelineTone =
        irregularRawMeshAvailable
          ? "done"
          : hasPoints
            ? "blocked"
            : loading
              ? "waiting"
              : "waiting";

      const metricGateTone: AnalysisPipelineTone =
        !measurementAllowed
          ? "blocked"
          : metricDimensions
            ? "done"
            : loading
              ? "waiting"
              : "partial";

      return [
        {
          id: "evidence",
          title: "Photos",
          description:
            "Checks whether usable granite photos are available.",
          detail:
            evidenceCount > 0
              ? `${evidenceCount} photo${evidenceCount === 1 ? "" : "s"} available`
              : "No photos available",
          tone:
            evidenceCount > 0
              ? "done"
              : "waiting",
          progress:
            evidenceCount > 0 ? 100 : null,
          icon: ImageIcon,
        },
        {
          id: "calibration",
          title: "Scale Check",
          description:
            "Checks whether the photos have enough scale information for real measurements.",
          detail:
            explicitlyUncalibratedCount > 0
              ? `${explicitlyUncalibratedCount} view${explicitlyUncalibratedCount === 1 ? "" : "s"} explicitly report failed/invalid calibration`
              : calibratedViewCount > 0
                ? `${calibratedViewCount}/${Math.max(evidenceCount, 1)} view${evidenceCount === 1 ? "" : "s"} report calibrated/metric status`
                : "Scale information is not confirmed",
          tone: calibrationTone,
          progress:
            evidenceCount > 0
              ? Math.round(
                  (calibratedViewCount / evidenceCount) * 100,
                )
              : null,
          icon: Ruler,
        },
        {
          id: "registration",
          title: "Photo Matching",
          description:
            "Checks whether different photos can be matched to the same granite block.",
          detail:
            registrationEvidenceCount > 0
              ? `${registrationEvidenceCount}/${Math.max(evidenceCount, 1)} photos matched`
              : "Photo matching is not confirmed",
          tone: registrationTone,
          progress:
            evidenceCount > 0
              ? Math.round(
                  (registrationEvidenceCount / evidenceCount) * 100,
                )
              : null,
          icon: ScanSearch,
        },
        {
          id: "poses",
          title: "Photo Direction",
          description:
            "Checks whether each photo can be linked to the correct 3D viewing direction.",
          detail:
            solvedPoseCount > 0
              ? `${solvedPoseCount}/${Math.max(evidenceCount, 1)} photo directions available`
              : "Photo directions are not available",
          tone: poseTone,
          progress:
            evidenceCount > 0
              ? Math.round(
                  (solvedPoseCount / evidenceCount) * 100,
                )
              : null,
          icon: Camera,
        },
        {
          id: "reconstruction",
          title: "3D Model",
          description:
            "Builds the visible granite shape from the uploaded photos.",
          detail:
            loadError
              ? `3D model could not load: ${loadError}`
              : loading
                ? "Building the 3D model"
                : irregularRawMeshAvailable
                  ? "3D surface available"
                  : hasPoints
                    ? "Partial 3D data available; full surface is not confirmed"
                    : "3D model is not available",
          tone: reconstructionTone,
          progress:
            loading
              ? hasPoints || hasMesh
                ? 75
                : 35
              : irregularRawMeshAvailable
                ? 100
                : hasPoints
                  ? 55
                  : null,
          icon: Cpu,
        },
        {
          id: "mesh-validation",
          title: "Surface Check",
          description:
            "Confirms that the displayed surface comes from the granite photos and not from a substitute box shape.",
          detail:
            irregularRawMeshAvailable
              ? "Photo-based granite surface confirmed"
              : hasPoints
                ? "Only partial 3D data is available; surface tools stay disabled"
                : "A confirmed granite surface is not available",
          tone: meshValidationTone,
          progress:
            irregularRawMeshAvailable
              ? 100
              : hasPoints
                ? 35
                : null,
          icon: Triangle,
        },
        {
          id: "quality-gate",
          title: "Measurement Check",
          description:
            "Checks whether the current photos and 3D result are good enough to show measurements.",
          detail:
            reconstructionQuality
              ? measurementAllowed
                ? "Measurements are allowed"
                : "Measurements are not reliable enough to show"
              : "Measurement quality status was not fully reported",
          tone:
            !measurementAllowed
              ? "blocked"
              : reconstructionQuality
                ? "done"
                : "partial",
          progress:
            !measurementAllowed
              ? 0
              : reconstructionQuality
                ? 100
                : 55,
          icon: ShieldAlert,
        },
        {
          id: "measurement",
          title: "Measurements",
          description:
            "Shows length, breadth and height only when valid measurement data is available.",
          detail:
            !measurementAllowed
              ? "Measurements are unavailable for the current 3D result"
              : metricDimensions
                ? `${metricDimensions.length.toFixed(1)} × ${metricDimensions.breadth.toFixed(1)} × ${metricDimensions.height.toFixed(1)} cm reported`
                : "Measurement values were not reported",
          tone: metricGateTone,
          progress:
            !measurementAllowed
              ? 0
              : metricDimensions
                ? 100
                : 55,
          icon: Ruler,
        },
      ];
    }, [
      calibratedViewCount,
      explicitlyUncalibratedCount,
      hasMesh,
      hasPoints,
      irregularRawMeshAvailable,
      loadError,
      loading,
      measurementAllowed,
      metricDimensions,
      reconstructionConfirmedCount,
      reconstructionQuality,
      registrationEvidenceCount,
      solvedPoseCount,
      viewsData.length,
    ]);

  const modes: Array<{
    id: ViewerMode;
    label: string;
    icon: React.ComponentType<{
      size?: number;
    }>;
  }> = [
    {
      id: "REAL_PHOTO_3D",
      label:
        lang === "te"
          ? "ఫోటో + డిజిటల్ ట్విన్"
          : "Photo + Digital Twin",
      icon: Sparkles,
    },
    {
      id: "PHOTOGRAPHS",
      label:
        lang === "te"
          ? "ఫోటో ఆధారం"
          : "Photo Evidence",
      icon: ImageIcon,
    },
    {
      id: "RAW_3D",
      label:
        lang === "te"
          ? "ముడి 3D"
          : "Raw Digital Twin",
      icon: Triangle,
    },
    {
      id: "RAW_BOUNDING_BOX",
      label:
        lang === "te"
          ? "కొలతల ఓవర్లే"
          : "Engineering Bounds (not stone)",
      icon: Maximize2,
    },
    {
      id: "DEFECT_MAP",
      label:
        lang === "te"
          ? "లోపాల మ్యాప్"
          : "Defect Intelligence",
      icon: ShieldAlert,
    },
    {
      id: "USABLE_ENVELOPE",
      label:
        lang === "te"
          ? "ఉపయోగకర భాగం"
          : "Ideal Recoverable Envelope",
      icon: Box,
    },
    {
      id: "DRESSING_PLAN",
      label:
        lang === "te"
          ? "కట్టింగ్ ప్రణాళిక"
          : "Cut Sequence",
      icon: Scissors,
    },
    {
      id: "FINAL_DRESSED_BLOCK",
      label:
        lang === "te"
          ? "తుది బ్లాక్"
          : "Ideal Final Dressed Block",
      icon: Target,
    },
  ];

  const show3D =
    activeMode !==
    "PHOTOGRAPHS";

  const metricText =
    metricDimensions
      ? `${(metricDimensions.length / 100).toFixed(2)} × ${(metricDimensions.breadth / 100).toFixed(2)} × ${(metricDimensions.height / 100).toFixed(2)} m`
      : lang === "te"
        ? "మెట్రిక్ కొలతలు అందుబాటులో లేవు"
        : "Metric dimensions unavailable";

  const selectedCut =
    cuttingSteps[
      selectedCutIdx
    ] ?? null;

  const physicalCavityDefects =
    useMemo(
      () =>
        defects.filter(
          (defect) =>
            Boolean(
              defect.physical_cavity_id,
            ) ||
            digitalTwinIsCavity(
              defect,
            ),
        ),
      [defects],
    );

  const multiviewPhysicalCavityCount =
    physicalCavityDefects.filter(
      (defect) =>
        defect.association_status ===
        "MULTIVIEW_ASSOCIATED",
    ).length;

  const cumulativeReportedRemovalM3 =
    useMemo(
      () =>
        committedCutIndices.reduce(
          (sum, index) => {
            const step =
              cuttingSteps[index];

            return (
              sum +
              (typeof step?.removed_volume_m3 ===
                "number" &&
              Number.isFinite(
                step.removed_volume_m3,
              )
                ? Math.max(
                    step.removed_volume_m3,
                    0,
                  )
                : 0)
            );
          },
          0,
        ),
      [
        committedCutIndices,
        cuttingSteps,
      ],
    );

  const visualRetainedMetrics =
    useMemo(
      () =>
        computeVisualRetainedMetrics({
          vertices:
            geometry.meshVertices,
          triangles:
            geometry.meshTriangles,
          cuttingSteps,
          committedCutIndices,
          metricDimensions,
        }),
      [
        committedCutIndices,
        cuttingSteps,
        geometry.meshTriangles,
        geometry.meshVertices,
        metricDimensions,
      ],
    );

  const sourceMeshVolumeM3 =
    typeof geometry.meshVolumeCm3 ===
      "number" &&
    Number.isFinite(
      geometry.meshVolumeCm3,
    ) &&
    geometry.meshVolumeCm3 > 0
      ? geometry.meshVolumeCm3 /
        1_000_000
      : null;

  const ledgerRemainingVolumeM3 =
    sourceMeshVolumeM3 != null
      ? Math.max(
          sourceMeshVolumeM3 -
            cumulativeReportedRemovalM3,
          0,
        )
      : null;

  const cumulativeReportedRemovalPct =
    sourceMeshVolumeM3 != null &&
    sourceMeshVolumeM3 > 0
      ? Math.min(
          100,
          (cumulativeReportedRemovalM3 /
            sourceMeshVolumeM3) *
            100,
        )
      : null;

  const sequenceComplete =
    cuttingSteps.length > 0 &&
    committedCutIndices.length ===
      cuttingSteps.length;

  const finalReportedRecovery =
    currentScenario?.recovery_yield_percentage ??
    null;

  const finalReportedWaste =
    currentScenario?.waste_percentage ??
    null;

  const activeTwinCutPhase =
    twinCutPhase(selectedCutProgress);

  useEffect(() => {
    if (
      !cutPlaying ||
      activeMode !== "DRESSING_PLAN" ||
      !selectedCut
    ) {
      cutStartedAtRef.current = null;

      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
        cutAnimationFrameRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;

      if (cutStartedAtRef.current == null) {
        cutStartedAtRef.current =
          now - selectedCutProgress * TWIN_CUT_DURATION_MS;
      }

      const next = twinClamp01(
        (now - cutStartedAtRef.current) / TWIN_CUT_DURATION_MS,
      );

      setSelectedCutProgress(next);

      if (next >= 1) {
        setCommittedCutIndices(
          (current) =>
            current.includes(
              selectedCutIdx,
            )
              ? current
              : [
                  ...current,
                  selectedCutIdx,
                ].sort(
                  (a, b) => a - b,
                ),
        );
        setCutPlaying(false);
        cutStartedAtRef.current = null;
        return;
      }

      cutAnimationFrameRef.current = requestAnimationFrame(tick);
    };

    cutAnimationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
        cutAnimationFrameRef.current = null;
      }
    };
  }, [
    activeMode,
    cutPlaying,
    selectedCut,
    selectedCutIdx,
    selectedCutProgress,
  ]);

  useEffect(
    () => () => {
      if (cutAnimationFrameRef.current != null) {
        cancelAnimationFrame(cutAnimationFrameRef.current);
      }
    },
    [],
  );

  const selectCut = (index: number) => {
    setSelectedCutIdx(index);
    setSelectedCutProgress(
      committedCutIndices.includes(index)
        ? 1
        : 0,
    );
    setCutPlaying(false);
    cutStartedAtRef.current = null;
  };


  const resetCutSequence = () => {
    setCutPlaying(false);
    setSelectedCutIdx(0);
    setSelectedCutProgress(0);
    setCommittedCutIndices([]);
    cutStartedAtRef.current = null;
  };

  const advanceToNextCut = () => {
    if (
      cuttingSteps.length === 0
    ) {
      return;
    }

    const nextIndex = Math.min(
      selectedCutIdx + 1,
      cuttingSteps.length - 1,
    );

    setCutPlaying(false);
    setSelectedCutIdx(nextIndex);
    setSelectedCutProgress(
      committedCutIndices.includes(
        nextIndex,
      )
        ? 1
        : 0,
    );
    cutStartedAtRef.current = null;
  };

  if (referenceMode) {
    return (
      <section className="relative h-full min-h-[420px] overflow-hidden rounded-[14px] border border-slate-200 bg-[#f4f8fc]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,rgba(14,165,233,.10),transparent_35%),linear-gradient(180deg,#f9fcff,#e8f1f8)]" />
        <div className="absolute inset-x-0 bottom-0 h-[58%] opacity-55 [background-image:linear-gradient(rgba(88,101,132,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(88,101,132,.12)_1px,transparent_1px)] [background-size:34px_34px] [mask-image:linear-gradient(to_top,black,transparent)]" />
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-xs font-bold text-slate-400">Initializing 3D model…</div>}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.75]}
            camera={{ position: [5.8, 4.4, 6.4], fov: 38, near: 0.1, far: 100 }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          >
            <GraniteScene
              geometry={geometry}
              dimensions={metricDimensions}
              dressedDimensions={activeDressedDimensions}
              mode={activeMode}
              cuttingSteps={cuttingSteps}
              selectedCutIdx={selectedCutIdx}
              defects={defects}
              selectedDefect={selectedDefect}
              onSelectDefect={setSelectedDefect}
              showWireframe={showWireframe}
              showPoints={showPoints}
              lightTheme={true}
              irregularMeshValidated={engineeringSurfaceAvailable}
              activePhoto={activePhoto}
              selectedPhotoIdx={selectedPhotoIdx}
              photoCount={viewsData.length}
              cameraRevision={cameraRevision}
              showMeasurements={showMeasurements}
              selectedCutProgress={selectedCutProgress}
              cutPlaying={cutPlaying}
              committedCutIndices={committedCutIndices}
            />
          </Canvas>
        </Suspense>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 backdrop-blur-md">
            <button type="button" onClick={() => { setShowWireframe(false); setShowPoints(false); }} className={`rounded-md px-2.5 py-1.5 text-[9px] font-black ${!showWireframe && !showPoints ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"}`}>Solid</button>
            <button type="button" onClick={() => setShowPoints((value) => !value)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-black ${showPoints ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"}`}>Point Cloud</button>
            <button type="button" onClick={() => setShowWireframe((value) => !value)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-black ${showWireframe ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-900"}`}>Wireframe</button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[9px] font-bold text-slate-400 backdrop-blur-md">Drag · zoom · inspect</div>
        </div>

        {loading ? <div className="absolute inset-0 z-30 grid place-items-center bg-white/78 backdrop-blur-sm"><div className="rounded-xl border border-slate-200 bg-white/96 px-4 py-3 text-xs font-bold text-sky-700">Loading reconstruction…</div></div> : null}
        {!loading && !rawGeometryAvailable && activeMode !== "FINAL_DRESSED_BLOCK" ? (
          <div className="absolute left-1/2 top-1/2 z-20 w-[min(88%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sky-300/15 bg-white/96 p-5 text-center backdrop-blur-xl">
            <ShieldAlert size={22} className="mx-auto text-sky-700" />
            <p className="mt-2 text-sm font-black text-slate-900">3D reconstruction unavailable</p>
            <p className="mt-1 text-[10px] leading-5 text-slate-400">No fabricated cube is shown. Upload enough overlapping evidence or complete the reconstruction first.</p>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-[#f7fafc] text-slate-900 shadow-[0_22px_60px_rgba(15,23,42,.10)]">
      <div className="relative min-h-[760px] overflow-hidden sm:min-h-[820px] lg:min-h-[880px]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(14,165,233,.10),transparent_29%),radial-gradient(circle_at_80%_16%,rgba(45,212,191,.06),transparent_25%),linear-gradient(180deg,#f9fcff_0%,#eef5fa_50%,#e8f0f6_100%)]" />
          <div className="absolute inset-0 opacity-[0.20] [background-image:linear-gradient(rgba(100,116,139,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,.13)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />
        </div>

        {/* NEW IMMERSIVE COMMAND BAR — no dashboard-card header */}
        <div className="absolute inset-x-0 top-0 z-30 flex flex-col gap-2 border-b border-slate-200/80 bg-white/86 px-3 py-2.5 backdrop-blur-2xl sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
              <ScanLine size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-black tracking-[-0.02em] text-white">
                  {lang === "te" ? "డిజిటల్ ట్విన్ వర్క్‌స్పేస్" : "Digital Twin Workspace"}
                </h3>
                <span className="rounded-full border border-slate-200/90 bg-white/90 px-2 py-0.5 text-[6.5px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {isDemo ? "presentation" : "live evidence"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[7.5px] text-slate-500">
                {hasMesh
                  ? "Observed irregular mesh loaded"
                  : hasPoints
                    ? "Sparse reconstruction loaded"
                    : "Waiting for reconstruction geometry"}
                {provider ? ` · ${provider}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {modes.map(({ id, label, icon: Icon }) => {
              const active = activeMode === id;
              const requiresIrregularSurface =
                id === "RAW_BOUNDING_BOX" ||
                id === "DEFECT_MAP" ||
                id === "USABLE_ENVELOPE" ||
                id === "DRESSING_PLAN" ||
                id === "FINAL_DRESSED_BLOCK";
              const disabled = requiresIrregularSurface && !engineeringSurfaceAvailable;

              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setActiveMode(id)}
                  className={[
                    "flex min-h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[7px] font-black uppercase tracking-[0.08em] transition",
                    disabled
                      ? "cursor-not-allowed text-slate-700"
                      : active
                        ? "bg-sky-600 text-white shadow-[0_6px_20px_rgba(2,132,199,.16)]"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                  ].join(" ")}
                >
                  <Icon size={10} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Full-screen reconstruction stage */}
        {show3D ? (
          <div className="absolute inset-0 pt-[66px]">
            {sparseOnlyInsufficient ? (
              <div className="absolute inset-0 flex items-center justify-center px-4 pb-24 pt-6">
                <div className="grid h-[min(74vh,680px)] w-[min(92%,1080px)] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,.11)] lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="relative min-h-[420px] bg-slate-100">
                    {activePhoto?.image_url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={apiAssetUrl(activePhoto.image_url)}
                          alt={activePhoto.view_name || activePhoto.photo_label}
                          className="h-full w-full object-contain"
                        />
                        <div className="absolute left-4 top-4 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-slate-700 shadow-sm backdrop-blur">
                          Actual photo evidence · {activePhoto.photo_label}
                        </div>
                      </>
                    ) : (
                      <div className="grid h-full place-items-center px-8 text-center">
                        <div>
                          <ImageIcon size={32} className="mx-auto text-sky-500" />
                          <p className="mt-3 text-sm font-black text-slate-800">Photo evidence unavailable</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center border-t border-slate-200 bg-[#f8fbfe] p-6 lg:border-l lg:border-t-0">
                    <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-amber-700">
                      Surface not formed yet
                    </span>
                    <h3 className="mt-3 text-xl font-black tracking-[-0.03em] text-slate-900">
                      {sparsePointCount} reconstruction points are not enough for a granite surface.
                    </h3>
                    <p className="mt-3 text-[10px] leading-5 text-slate-500">
                      The application will not display a handful of correspondence points as if they were the final 3D granite. The actual uploaded photo stays visible until the backend produces a usable observed mesh or a sufficiently dense point cloud.
                    </p>

                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white px-3 py-2.5">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Sparse points</span>
                        <strong className="text-sm text-slate-800">{sparsePointCount}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white px-3 py-2.5">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Observed mesh</span>
                        <strong className="text-[9px] text-slate-800">{hasMesh ? "AVAILABLE" : "NOT AVAILABLE"}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white px-3 py-2.5">
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Engineering measurement</span>
                        <strong className="text-[9px] text-slate-800">{engineeringSurfaceAvailable ? "READY" : "LOCKED"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="absolute inset-0 z-20 grid place-items-center bg-white/78 backdrop-blur-md">
                    <div className="text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-sky-600" />
                      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.13em] text-slate-600">
                        Initializing digital twin
                      </p>
                    </div>
                  </div>
                }
              >
                <Canvas
                  frameloop="demand"
                  dpr={[1, 1.75]}
                  camera={{
                    position: [4.8, 3.4, 5.4],
                    fov: 32,
                    near: 0.1,
                    far: 100,
                  }}
                  gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: "high-performance",
                  }}
                >
                  <GraniteScene
                    geometry={geometry}
                    dimensions={metricDimensions}
                    dressedDimensions={activeDressedDimensions}
                    mode={activeMode}
                    cuttingSteps={cuttingSteps}
                    selectedCutIdx={selectedCutIdx}
                    defects={defects}
                    selectedDefect={selectedDefect}
                    onSelectDefect={setSelectedDefect}
                    showWireframe={showWireframe}
                    showPoints={showPoints}
                    lightTheme={true}
                    irregularMeshValidated={engineeringSurfaceAvailable}
                    activePhoto={activePhoto}
                    selectedPhotoIdx={selectedPhotoIdx}
                    photoCount={viewsData.length}
                    cameraRevision={cameraRevision}
                    showMeasurements={showMeasurements}
                    selectedCutProgress={selectedCutProgress}
                    cutPlaying={cutPlaying}
                    committedCutIndices={committedCutIndices}
                  />
                </Canvas>
              </Suspense>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto px-4 pb-28 pt-20">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {viewsData.length > 0 ? (
                viewsData.map((photo, index) => (
                  <button
                    key={photo.photo_id || `${photo.photo_label}-${index}`}
                    type="button"
                    onClick={() => selectEvidencePhoto(index)}
                    className="group relative h-[280px] overflow-hidden rounded-[18px] border border-slate-200 bg-white text-left transition hover:border-sky-300 hover:shadow-md"
                  >
                    <EvidencePhoto photo={photo} lang={lang} showOriginal />
                  </button>
                ))
              ) : (
                <div className="col-span-full grid min-h-[520px] place-items-center text-center">
                  <div>
                    <ImageIcon size={30} className="mx-auto text-slate-600" />
                    <p className="mt-3 text-sm font-black text-slate-800">No photographic evidence</p>
                    <p className="mt-1 text-[9px] text-slate-600">No placeholder images are generated.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating evidence rail — completely different from old fixed side panels */}
        {viewsData.length > 0 ? (
          <div className="absolute bottom-[86px] left-1/2 z-30 w-[min(92%,880px)] -translate-x-1/2">
            <div className="flex items-center gap-2 overflow-x-auto rounded-[18px] border border-slate-200 bg-white/88 p-2 shadow-[0_14px_40px_rgba(15,23,42,.12)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {viewsData.map((view, index) => {
                const selected = selectedPhotoIdx === index;
                return (
                  <button
                    key={view.photo_id || `${view.photo_label}-${index}`}
                    type="button"
                    onClick={() => selectEvidencePhoto(index)}
                    className={[
                      "relative h-[58px] w-[78px] shrink-0 overflow-hidden rounded-[12px] border transition",
                      selected
                        ? "border-sky-500 ring-2 ring-sky-500/10"
                        : "border-slate-200 opacity-70 hover:opacity-100",
                    ].join(" ")}
                    title={view.photo_label}
                  >
                    {view.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={apiAssetUrl(view.image_url)}
                        alt={view.photo_label}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-slate-100">
                        <Camera size={14} className="text-slate-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-transparent" />
                    <span className="absolute bottom-1 left-1 right-1 truncate text-[5.5px] font-black uppercase tracking-[0.08em] text-slate-800">
                      {view.photo_label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Compact live state, not old warning cards */}
        <div className="absolute left-3 top-[78px] z-30 flex max-w-[260px] flex-col gap-1.5 sm:left-4">
          <div className="rounded-[13px] border border-slate-200 bg-white/88 shadow-sm px-3 py-2 backdrop-blur-xl">
            <p className="text-[6.5px] font-black uppercase tracking-[0.14em] text-slate-500">Geometry state</p>
            <p className="mt-1 text-[8.5px] font-black text-slate-800">
              {hasMesh
                ? `${geometry.meshVertices.length.toLocaleString()} vertices · ${geometry.meshTriangles.length.toLocaleString()} triangles`
                : hasPoints
                  ? `${geometry.points.length.toLocaleString()} reconstructed points`
                  : "No geometry artifact"}
            </p>
          </div>

          {!engineeringSurfaceAvailable && rawGeometryAvailable ? (
            <div className="rounded-[13px] border border-amber-200 bg-amber-50/90 px-3 py-2 backdrop-blur-xl">
              <p className="text-[7px] font-black uppercase tracking-[0.11em] text-amber-700">Surface unconfirmed</p>
              <p className="mt-1 text-[7px] leading-3.5 text-slate-500">Partial 3D only. Missing surfaces remain unknown.</p>
            </div>
          ) : null}

          {!measurementAllowed ? (
            <div className="rounded-[13px] border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur-xl">
              <p className="text-[7px] font-black uppercase tracking-[0.11em] text-slate-400">Metric locked</p>
              <p className="mt-1 text-[7px] leading-3.5 text-slate-500">Relative geometry only until calibration/quality permits measurement.</p>
            </div>
          ) : null}
        </div>

        {/* Floating inspection tools */}
        <div className="absolute right-3 top-[78px] z-30 flex flex-col gap-1.5 sm:right-4">
          <button
            type="button"
            onClick={() => setShowWireframe((value) => !value)}
            className={[
              "grid h-10 w-10 place-items-center rounded-[13px] border backdrop-blur-xl transition",
              showWireframe
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            ].join(" ")}
            title="Mesh edges"
          >
            <Layers size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowPoints((value) => !value)}
            className={[
              "grid h-10 w-10 place-items-center rounded-[13px] border backdrop-blur-xl transition",
              showPoints
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : "border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            ].join(" ")}
            title="Point evidence"
          >
            <CircleDot size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowMeasurements((value) => !value)}
            className={[
              "grid h-10 w-10 place-items-center rounded-[13px] border backdrop-blur-xl transition",
              showMeasurements
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            ].join(" ")}
            title="Measurements"
          >
            <Ruler size={14} />
          </button>
        </div>

        {/* Bottom command dock */}
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur-2xl sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className={[
                "h-2 w-2 shrink-0 rounded-full",
                hasMesh ? "bg-emerald-400" : hasPoints ? "bg-cyan-300" : "bg-slate-600",
              ].join(" ")} />
              <div className="min-w-0">
                <p className="truncate text-[8px] font-black text-slate-300">
                  {hasMesh
                    ? "Observed irregular mesh"
                    : hasPoints
                      ? "Sparse reconstruction"
                      : "Digital Twin pending"}
                </p>
                <p className="mt-0.5 truncate text-[6.5px] text-slate-600">
                  Missing/unseen surfaces are not fabricated
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-[9px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[7px] font-black text-slate-500">
                {metricDimensions
                  ? `${metricDimensions.length.toFixed(1)} × ${metricDimensions.breadth.toFixed(1)} × ${metricDimensions.height.toFixed(1)} cm`
                  : "Metric dimensions pending"}
              </span>

              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[9px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[7px] font-black uppercase tracking-[0.08em] text-slate-500 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                  <Activity size={10} />
                  Diagnostics
                  <ChevronDown size={10} className="transition-transform group-open:rotate-180" />
                </summary>

                <div className="absolute bottom-10 right-0 w-[min(92vw,760px)] overflow-hidden rounded-[18px] border border-slate-200/90 bg-white/98 shadow-[0_24px_70px_rgba(15,23,42,.18)]">
                  <AnalysisPipelinePanel
                    stages={analysisPipelineStages}
                    loading={loading}
                    measurementAllowed={measurementAllowed}
                    metricDimensionsAvailable={Boolean(metricDimensions)}
                    provider={provider}
                  />
                  <ObservedShapeValidationPanel
                    views={viewsData}
                    reconstructionQuality={reconstructionQuality}
                    observedSurfaces={effectiveObservedSurfaces}
                    missingSurfaces={effectiveMissingSurfaces}
                    selectedPhotoIndex={selectedPhotoIdx}
                    onSelectView={(index) => {
                      setSelectedPhotoIdx(index);
                      setCameraRevision((value) => value + 1);
                      setActiveMode("REAL_PHOTO_3D");
                    }}
                  />
                </div>
              </details>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="absolute inset-0 z-40 grid place-items-center bg-white/72 backdrop-blur-[2px]">
            <div className="rounded-[18px] border border-sky-200 bg-white/94 px-5 py-4 text-center shadow-2xl">
              <Loader2 size={22} className="mx-auto animate-spin text-cyan-300" />
              <p className="mt-3 text-[9px] font-black uppercase tracking-[0.13em] text-slate-300">
                Loading reconstruction evidence
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !rawGeometryAvailable && activeMode !== "FINAL_DRESSED_BLOCK" ? (
          <div className="absolute left-1/2 top-1/2 z-30 w-[min(90%,430px)] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-slate-200 bg-white/94 p-6 text-center shadow-2xl backdrop-blur-2xl">
            <ScanLine size={25} className="mx-auto text-cyan-300" />
            <p className="mt-3 text-sm font-black text-slate-900">3D reconstruction is not available yet</p>
            <p className="mt-2 text-[9px] leading-5 text-slate-500">
              No generic granite or substitute cube is shown. The model appears only when the backend provides real point or mesh evidence.
            </p>
            {loadError ? (
              <p className="mt-3 rounded-xl bg-rose-400/[0.06] px-3 py-2 text-[8px] text-rose-300">
                {loadError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeMode ===
        "DRESSING_PLAN" &&
      cuttingSteps.length >
        0 ? (
        <div className="relative border-t border-[var(--border)] bg-[var(--surface-glass)] p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
                <Scissors
                  size={13}
                />
                Engineering cut sequence
              </div>


              <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                  Fragment source: reconstructed mesh
                </span>
                <span className={`rounded-full border px-2.5 py-1 ${
                  resolveRemovalSide(selectedCut) === "UNKNOWN"
                    ? "border-amber-400/20 bg-amber-500/10 text-sky-700"
                    : "border-sky-400/20 bg-sky-500/10 text-sky-700"
                }`}>
                  {resolveRemovalSide(selectedCut) === "UNKNOWN"
                    ? "Removal direction unresolved"
                    : `Removal direction: ${resolveRemovalSide(selectedCut)}`}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!selectedCut}
                  onClick={() => {
                    if (selectedCutProgress >= 1) {
                      setCommittedCutIndices(
                        (current) =>
                          current.filter(
                            (index) =>
                              index !== selectedCutIdx,
                          ),
                      );
                      setSelectedCutProgress(0);
                      cutStartedAtRef.current = null;
                    }
                    setCutPlaying((value) => !value);
                  }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-[11px] font-black text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {cutPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {cutPlaying
                    ? "Pause cut"
                    : selectedCutProgress > 0 && selectedCutProgress < 1
                      ? "Resume cut"
                      : selectedCutProgress >= 1
                        ? "Replay cut"
                        : "Run selected cut"}
                </button>

                <button
                  type="button"
                  disabled={!selectedCut}
                  onClick={() => {
                    setCutPlaying(false);
                    setSelectedCutProgress(
                      committedCutIndices.includes(
                        selectedCutIdx,
                      )
                        ? 1
                        : 0,
                    );
                    cutStartedAtRef.current = null;
                  }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[10px] font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  <RotateCcw size={13} />
                  Reset cut
                </button>

                <button
                  type="button"
                  disabled={
                    committedCutIndices.length === 0
                  }
                  onClick={resetCutSequence}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/8 px-3 py-2 text-[10px] font-bold text-red-700 transition hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <RotateCcw size={13} />
                  Reset sequence
                </button>

                <button
                  type="button"
                  disabled={
                    selectedCutProgress < 1 ||
                    selectedCutIdx >= cuttingSteps.length - 1
                  }
                  onClick={advanceToNextCut}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/8 px-3 py-2 text-[10px] font-bold text-sky-700 transition hover:bg-sky-500/12 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next cut
                  <ChevronRight size={13} />
                </button>

                <div className="min-w-[210px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--accent)]">
                      {twinCutPhaseLabel(activeTwinCutPhase)}
                    </span>
                    <span className="font-mono text-[9px] font-black text-[var(--text-muted)]">
                      {Math.round(selectedCutProgress * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-75"
                      style={{
                        width: `${Math.max(
                          selectedCutProgress > 0 ? 2 : 0,
                          selectedCutProgress * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--accent)]">
                      Live retained-stone metrology
                    </div>
                    <div className="mt-1 text-sm font-black text-[var(--text-primary)]">
                      Stage {committedCutIndices.length} of {cuttingSteps.length} committed
                    </div>
                    <p className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--text-muted)]">
                      Partial-stage dimensions are geometry-aligned visual extents derived from the retained reconstructed mesh. They are not a substitute for a backend post-cut metric survey.
                    </p>
                  </div>

                  <div className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                    sequenceComplete
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                      : "border-sky-400/20 bg-sky-500/10 text-sky-700"
                  }`}>
                    {sequenceComplete
                      ? "Sequence complete"
                      : "Cumulative simulation active"}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  <MetricTile
                    label="Visual retained L"
                    value={
                      visualRetainedMetrics.visualDimensionsCm
                        ? `${visualRetainedMetrics.visualDimensionsCm.length.toFixed(1)} cm`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Visual retained B"
                    value={
                      visualRetainedMetrics.visualDimensionsCm
                        ? `${visualRetainedMetrics.visualDimensionsCm.breadth.toFixed(1)} cm`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Visual retained H"
                    value={
                      visualRetainedMetrics.visualDimensionsCm
                        ? `${visualRetainedMetrics.visualDimensionsCm.height.toFixed(1)} cm`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Reported removal"
                    value={`${cumulativeReportedRemovalM3.toFixed(4)} m³`}
                  />
                  <MetricTile
                    label="Ledger remaining"
                    value={
                      ledgerRemainingVolumeM3 != null
                        ? `${ledgerRemainingVolumeM3.toFixed(4)} m³`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Mesh retained"
                    value={
                      visualRetainedMetrics.retainedTrianglePercentage != null
                        ? `${visualRetainedMetrics.retainedTrianglePercentage.toFixed(1)}%`
                        : "N/A"
                    }
                  />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                        Reported cumulative removal
                      </span>
                      <span className="font-mono text-[10px] font-black text-red-700">
                        {cumulativeReportedRemovalPct != null
                          ? `${cumulativeReportedRemovalPct.toFixed(1)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                      <div
                        className="h-full rounded-full bg-red-400 transition-[width] duration-300"
                        style={{
                          width: `${cumulativeReportedRemovalPct ?? 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[9px] leading-4 text-[var(--text-muted)]">
                      Based only on committed backend-reported removed volumes versus reconstructed source mesh volume when available.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                      Final reported recovery
                    </div>
                    <div className="mt-1.5 text-lg font-black text-emerald-300">
                      {sequenceComplete &&
                      typeof finalReportedRecovery === "number" &&
                      Number.isFinite(finalReportedRecovery)
                        ? `${finalReportedRecovery.toFixed(1)}%`
                        : "Pending final stage"}
                    </div>
                    <p className="mt-1 text-[9px] leading-4 text-[var(--text-muted)]">
                      Shown only from backend scenario output; no partial-stage yield is invented.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                      Final reported waste
                    </div>
                    <div className="mt-1.5 text-lg font-black text-sky-700">
                      {sequenceComplete &&
                      typeof finalReportedWaste === "number" &&
                      Number.isFinite(finalReportedWaste)
                        ? `${finalReportedWaste.toFixed(1)}%`
                        : "Pending final stage"}
                    </div>
                    <p className="mt-1 text-[9px] leading-4 text-[var(--text-muted)]">
                      Final scenario value only. Intermediate waste is represented by the reported removal ledger.
                    </p>
                  </div>
                </div>

                {sequenceComplete && activeDressedDimensions ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-emerald-300">
                      Backend final dressed dimensions
                    </div>
                    <div className="mt-1.5 font-mono text-sm font-black text-[var(--text-primary)]">
                      {(activeDressedDimensions.length / 100).toFixed(3)} ×{" "}
                      {(activeDressedDimensions.breadth / 100).toFixed(3)} ×{" "}
                      {(activeDressedDimensions.height / 100).toFixed(3)} m
                    </div>
                    <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                      Final backend/scenario result, intentionally separated from the geometry-derived partial-stage extents above.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-1.5">
                  <div className="rounded-xl border border-slate-200 bg-slate-100/95 px-3 py-2">
                    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white/40">
                      RAW
                    </div>
                    <div className="mt-1 text-[10px] font-black text-[var(--text-primary)]">
                      Digital Twin
                    </div>
                  </div>

                  {cuttingSteps.map((step, index) => {
                    const committed =
                      committedCutIndices.includes(index);
                    const active =
                      selectedCutIdx === index;

                    return (
                      <div
                        key={`timeline-${step.step_number}-${index}`}
                        className="flex items-center gap-1.5"
                      >
                        <ChevronRight
                          size={13}
                          className={
                            committed
                              ? "text-emerald-300"
                              : "text-[var(--text-muted)]"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => selectCut(index)}
                          className={`rounded-xl border px-3 py-2 text-left transition ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)]/10"
                              : committed
                                ? "border-emerald-400/25 bg-emerald-500/8"
                                : "border-[var(--border)] bg-[var(--surface-raised)]"
                          }`}
                        >
                          <div className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                            CUT {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className={`mt-1 text-[10px] font-black ${
                            committed
                              ? "text-emerald-300"
                              : "text-[var(--text-primary)]"
                          }`}>
                            {committed
                              ? "Applied"
                              : active
                                ? twinCutPhaseLabel(activeTwinCutPhase)
                                : "Pending"}
                          </div>
                        </button>
                      </div>
                    );
                  })}

                  <ChevronRight
                    size={13}
                    className={
                      committedCutIndices.length === cuttingSteps.length &&
                      cuttingSteps.length > 0
                        ? "text-emerald-300"
                        : "text-[var(--text-muted)]"
                    }
                  />
                  <div className={`rounded-xl border px-3 py-2 ${
                    committedCutIndices.length === cuttingSteps.length &&
                    cuttingSteps.length > 0
                      ? "border-emerald-400/25 bg-emerald-500/8"
                      : "border-[var(--border)] bg-[var(--surface-raised)]"
                  }`}>
                    <div className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      DRESSED
                    </div>
                    <div className={`mt-1 text-[10px] font-black ${
                      committedCutIndices.length === cuttingSteps.length &&
                      cuttingSteps.length > 0
                        ? "text-emerald-300"
                        : "text-[var(--text-primary)]"
                    }`}>
                      {committedCutIndices.length === cuttingSteps.length &&
                      cuttingSteps.length > 0
                        ? "Sequence complete"
                        : "Awaiting cuts"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {cuttingSteps.map(
                  (
                    step,
                    index,
                  ) => (
                    <button
                      key={`${step.step_number}-${step.cut_name}-${index}`}
                      type="button"
                      onClick={() =>
                        selectCut(index)
                      }
                      className={`min-w-[170px] shrink-0 rounded-2xl border p-3 text-left transition ${
                        selectedCutIdx === index
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[var(--shadow-accent)]"
                          : committedCutIndices.includes(index)
                            ? "border-emerald-400/25 bg-emerald-500/8"
                            : "border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/25"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                          Cut{" "}
                          {step.step_number}
                        </div>
                        {committedCutIndices.includes(index) ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-300">
                            Committed
                          </span>
                        ) : selectedCutIdx === index && selectedCutProgress > 0 ? (
                          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-sky-700">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] font-extrabold text-[var(--text-primary)]">
                        {step.cut_name}
                      </div>
                      <div className="mt-2 font-mono text-[9px] text-[var(--text-muted)]">
                        {String(
                          step.plane_axis ||
                            "axis N/A",
                        )}
                      </div>
                    </button>
                  ),
                )}
              </div>
            </div>

            {selectedCut ? (
              <div className="w-full rounded-[22px] border border-[var(--border)] bg-[var(--surface-raised)] p-4 xl:w-[390px]">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Selected cut rationale
                </div>
                <div className="mt-1 text-sm font-black text-[var(--text-primary)]">
                  {selectedCut.cut_name}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                  {selectedCut.reason ||
                    "Backend did not report a cut rationale."}
                </p>


                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                      Removal side
                    </div>
                    <div className={`mt-1.5 text-[11px] font-black ${
                      resolveRemovalSide(selectedCut) === "UNKNOWN"
                        ? "text-[var(--warning)]"
                        : "text-[var(--success)]"
                    }`}>
                      {resolveRemovalSide(selectedCut) === "UNKNOWN"
                        ? "Unresolved"
                        : resolveRemovalSide(selectedCut) === "MIN"
                          ? "Minimum-side fragment"
                          : "Maximum-side fragment"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[var(--text-muted)]">
                      Fragment geometry
                    </div>
                    <div className="mt-1.5 text-[11px] font-black text-[var(--text-primary)]">
                      {resolveRemovalSide(selectedCut) === "UNKNOWN"
                        ? "Not separated"
                        : "Original mesh triangles"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--accent)]">
                      {twinCutPhaseLabel(activeTwinCutPhase)}
                    </span>
                    <span className="font-mono text-[9px] font-black text-[var(--text-muted)]">
                      {Math.round(selectedCutProgress * 100)}%
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]">
                    {activeTwinCutPhase === "READY"
                      ? committedCutIndices.includes(selectedCutIdx)
                        ? "This cut is committed in the cumulative mesh ledger. Its removed irregular fragment remains parked beside the retained Digital Twin."
                        : "The irregular Digital Twin is ready. Run the selected backend cut to inspect orientation, plane and removal."
                      : activeTwinCutPhase === "ORIENT"
                        ? "The same reconstructed granite camera is moving toward the backend-reported cut axis."
                        : activeTwinCutPhase === "RATIONALE"
                          ? "The engineering rationale remains visible before the plane becomes active."
                          : activeTwinCutPhase === "PLANE"
                            ? "The reported cut plane is being introduced against the reconstructed granite."
                            : activeTwinCutPhase === "CUTTING"
                              ? "The luminous line travels across the plane to communicate the cutting path."
                              : activeTwinCutPhase === "SEPARATION"
                                ? resolveRemovalSide(selectedCut) === "UNKNOWN"
                                  ? "The backend cut does not resolve which side is removed, so the viewer does not fabricate an irregular fragment. Only the cut plane is shown."
                                  : "The actual irregular mesh triangles on the resolved removal side separate from the retained Digital Twin. Reported volume remains backend-derived."
                                : "The selected cut visualization is complete. Select the next cut or replay this stage."}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MetricTile
                    label="Retained triangles"
                    value={`${visualRetainedMetrics.retainedTriangleCount.toLocaleString()} / ${visualRetainedMetrics.originalTriangleCount.toLocaleString()}`}
                  />
                  <MetricTile
                    label="Reported cumulative removal"
                    value={`${cumulativeReportedRemovalM3.toFixed(4)} m³`}
                  />
                </div>

                {visualRetainedMetrics.visualDimensionsCm ? (
                  <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.05] p-3">
                    <div className="text-[8px] font-black uppercase tracking-[0.13em] text-sky-700">
                      Geometry-aligned retained extents
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] font-black text-[var(--text-primary)]">
                      {visualRetainedMetrics.visualDimensionsCm.length.toFixed(1)} ×{" "}
                      {visualRetainedMetrics.visualDimensionsCm.breadth.toFixed(1)} ×{" "}
                      {visualRetainedMetrics.visualDimensionsCm.height.toFixed(1)} cm
                    </div>
                    <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.11em] text-[var(--text-muted)]">
                      Visual reconstruction estimate · not statutory
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MetricTile
                    label="Committed cuts"
                    value={`${committedCutIndices.length}/${cuttingSteps.length}`}
                  />
                  <MetricTile
                    label="Fragments retained"
                    value={`${committedCutIndices.filter((index) =>
                      resolveRemovalSide(cuttingSteps[index]) !== "UNKNOWN",
                    ).length}`}
                  />
                  <MetricTile
                    label="Current state"
                    value={
                      committedCutIndices.includes(selectedCutIdx)
                        ? "Applied"
                        : selectedCutProgress > 0
                          ? "In progress"
                          : "Pending"
                    }
                  />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MetricTile
                    label="Area"
                    value={
                      typeof selectedCut.cut_area_m2 ===
                      "number"
                        ? `${selectedCut.cut_area_m2.toFixed(3)} m²`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Removed"
                    value={
                      typeof selectedCut.removed_volume_m3 ===
                      "number"
                        ? `${selectedCut.removed_volume_m3.toFixed(4)} m³`
                        : "N/A"
                    }
                  />
                  <MetricTile
                    label="Waste class"
                    value={
                      selectedCut.waste_category ||
                      "N/A"
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeMode ===
      "DEFECT_MAP" ? (
        <div className="relative border-t border-[var(--border)] bg-[var(--surface-glass)] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#e4c57f]">
                <ShieldAlert size={13} />
                Physical cavity & visible-surface evidence
              </div>
              <div className="mt-1 text-[9px] leading-4 text-[var(--text-muted)]">
                Selecting a physical cavity highlights its persisted 3D rim/interior evidence.
                Supporting-view controls move the camera to the registered photographic view;
                the viewer does not create new cavity associations.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="rounded-xl border border-[#7dd3fc]/14 bg-[#7dd3fc]/[0.05] px-3 py-2">
                <div className="text-[7px] font-black uppercase tracking-[0.12em] text-[#7dd3fc]/70">
                  Physical cavities
                </div>
                <div className="mt-1 font-mono text-[13px] font-black text-[#f1d79b]">
                  {physicalCavityDefects.length}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-400/14 bg-emerald-400/[0.045] px-3 py-2">
                <div className="text-[7px] font-black uppercase tracking-[0.12em] text-emerald-300/70">
                  Multi-view
                </div>
                <div className="mt-1 font-mono text-[13px] font-black text-emerald-300">
                  {multiviewPhysicalCavityCount}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {defects.length > 0 ? (
              defects.map((defect, index) => {
                const cavity =
                  digitalTwinIsCavity(defect);
                const physicalCavityId =
                  defect.physical_cavity_id ||
                  (cavity
                    ? `CAVITY-${String(index + 1).padStart(3, "0")}`
                    : null);
                const evidenceIndices =
                  evidenceIndicesForDefect(defect);
                const active =
                  selectedDefect === defect;
                const multiview =
                  defect.association_status ===
                  "MULTIVIEW_ASSOCIATED";

                return (
                  <div
                    key={
                      defect.id ||
                      physicalCavityId ||
                      `${defect.type}-${index}`
                    }
                    className={`overflow-hidden rounded-2xl border text-left transition ${
                      active
                        ? cavity
                          ? "border-[#7dd3fc]/45 bg-[#7dd3fc]/[0.075] shadow-[0_14px_36px_rgba(216,182,109,.08)]"
                          : "border-red-400/45 bg-red-500/10"
                        : "border-[var(--border)] bg-[var(--surface-raised)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        selectDefectEvidence(
                          defect,
                        )
                      }
                      className="w-full p-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="text-[11px] font-black text-[var(--text-primary)]">
                              {physicalCavityId ||
                                defect.id ||
                                `Finding ${index + 1}`}
                            </div>

                            {cavity ? (
                              <span
                                className={`rounded-full px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] ${
                                  multiview
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : "bg-amber-500/10 text-sky-700"
                                }`}
                              >
                                {multiview
                                  ? "MULTI-VIEW"
                                  : "SINGLE VIEW"}
                              </span>
                            ) : null}
                          </div>

                          {cavity ? (
                            <div className="mt-1 font-mono text-[8px] text-[#7dd3fc]/70">
                              {defect.association_confidence ||
                                "UNCONFIRMED"}{" "}
                              association
                            </div>
                          ) : null}
                        </div>

                        <StatusPill
                          tone={
                            cavity
                              ? multiview
                                ? "good"
                                : "warn"
                              : "danger"
                          }
                        >
                          {cavity
                            ? defect.cavity_measurement_status ||
                              "VISIBLE CAVITY"
                            : defect.severity ||
                              "visible"}
                        </StatusPill>
                      </div>

                      <div className="mt-2 text-[10px] leading-5 text-[var(--text-secondary)]">
                        {defect.type ||
                          defect.kind ||
                          "Visible surface finding"}
                      </div>

                      {!cavity ? (
                        <div className="mt-2 font-mono text-[9px] text-[var(--text-muted)]">
                          {defect.depth_status ||
                            "Depth not measured"}
                        </div>
                      ) : null}

                      {cavity ? (
                        <>
                          <div className="mt-3 grid grid-cols-2 gap-1.5">
                            <MetricTile
                              label="Opening W"
                              value={
                                digitalTwinCavityMetric(
                                  defect,
                                  "opening_width_cm",
                                ) != null
                                  ? `${digitalTwinCavityMetric(
                                      defect,
                                      "opening_width_cm",
                                    )!.toFixed(2)} cm`
                                  : "Unmeasured"
                              }
                            />
                            <MetricTile
                              label="Opening H"
                              value={
                                digitalTwinCavityMetric(
                                  defect,
                                  "opening_height_cm",
                                ) != null
                                  ? `${digitalTwinCavityMetric(
                                      defect,
                                      "opening_height_cm",
                                    )!.toFixed(2)} cm`
                                  : "Unmeasured"
                              }
                            />
                            <MetricTile
                              label="Observed depth"
                              value={
                                digitalTwinCavityMetric(
                                  defect,
                                  "max_observed_depth_cm",
                                ) != null
                                  ? `${digitalTwinCavityMetric(
                                      defect,
                                      "max_observed_depth_cm",
                                    )!.toFixed(2)} cm`
                                  : "UNOBSERVED"
                              }
                            />
                            <MetricTile
                              label="Visible volume"
                              value={
                                digitalTwinCavityMetric(
                                  defect,
                                  "visible_cavity_volume_cm3",
                                ) != null
                                  ? `${digitalTwinCavityMetric(
                                      defect,
                                      "visible_cavity_volume_cm3",
                                    )!.toFixed(2)} cm³`
                                  : "Unmeasured"
                              }
                            />
                          </div>

                          <div className="mt-2 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] px-2.5 py-2 text-[8px] leading-4 text-amber-100/65">
                            Internal continuation:{" "}
                            <strong>
                              {defect.internal_continuation_status ||
                                "UNOBSERVED"}
                            </strong>
                            . True maximum depth:{" "}
                            <strong>
                              {defect.true_maximum_depth_status ||
                                "UNKNOWN_UNLESS_CAVITY_BOTTOM_IS_FULLY_OBSERVED"}
                            </strong>
                            .
                          </div>
                        </>
                      ) : null}
                    </button>

                    {cavity &&
                    evidenceIndices.length > 0 ? (
                      <div className="border-t border-[#7dd3fc]/10 px-3 py-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[7px] font-black uppercase tracking-[0.12em] text-[#7dd3fc]/65">
                            Supporting camera views
                          </span>
                          <span className="font-mono text-[7px] text-[var(--text-muted)]">
                            {defect.evidence_view_count ??
                              evidenceIndices.length}{" "}
                            evidence view(s)
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {evidenceIndices.map(
                            (viewIndex) => {
                              const view =
                                viewsData[
                                  viewIndex
                                ];
                              const selected =
                                active &&
                                selectedPhotoIdx ===
                                  viewIndex;

                              return (
                                <button
                                  key={`${physicalCavityId}-${viewIndex}`}
                                  type="button"
                                  onClick={() =>
                                    selectDefectEvidence(
                                      defect,
                                      viewIndex,
                                    )
                                  }
                                  className={`rounded-full border px-2.5 py-1.5 text-[7px] font-black uppercase tracking-[0.08em] transition ${
                                    selected
                                      ? "border-[#bae6fd]/50 bg-[#7dd3fc]/15 text-[#e0f2fe]"
                                      : view.weak_view
                                        ? "border-amber-400/20 bg-amber-400/[0.05] text-sky-200"
                                        : "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200/80 hover:border-[#7dd3fc]/30"
                                  }`}
                                >
                                  {view.photo_label ||
                                    view.side ||
                                    view.view_name ||
                                    `VIEW ${viewIndex + 1}`}
                                  {view.silhouette_iou != null
                                    ? ` · ${digitalTwinPercent(
                                        view.silhouette_iou,
                                      )}`
                                    : ""}
                                </button>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ) : cavity ? (
                      <div className="border-t border-[#7dd3fc]/10 px-3 py-2 text-[8px] text-[var(--text-muted)]">
                        Physical cavity evidence is persisted, but no local
                        photo-evidence row could be matched by source image ID or
                        canonical view label.
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-5 text-[11px] text-[var(--text-muted)]">
                No visible-surface findings were reported. This does not establish
                absence of hidden or unobserved defects.
              </div>
            )}
          </div>

          {selectedDefect &&
          digitalTwinIsCavity(
            selectedDefect,
          ) ? (
            <div className="mt-3 rounded-[18px] border border-[#7dd3fc]/14 bg-[#0b0e12]/55 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.13em] text-[#7dd3fc]">
                    Digital Twin cavity synchronization active
                  </div>
                  <div className="mt-1 text-[9px] leading-4 text-white/48">
                    Champagne rim points and cyan interior points are persisted
                    metric evidence. The mesh is not artificially carved to make
                    the cavity look deeper.
                  </div>
                </div>
                <div className="font-mono text-[8px] text-slate-500">
                  {selectedDefect.physical_cavity_id ||
                    selectedDefect.id ||
                    "SELECTED CAVITY"}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {(activeMode ===
        "USABLE_ENVELOPE" ||
        activeMode ===
          "DRESSING_PLAN") &&
      scenarios ? (
        <div className="relative border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                "CONFIRMED_DAMAGE",
                "CONSERVATIVE",
                "MAXIMUM_RECOVERY",
              ] as ScenarioMode[]
            ).map(
              (scenario) => {
                const data =
                  scenarios[
                    scenario
                  ] as
                    | ScenarioDetail
                    | undefined;

                return (
                  <button
                    key={
                      scenario
                    }
                    type="button"
                    onClick={() =>
                      setSelectedScenario(
                        scenario,
                      )
                    }
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      selectedScenario ===
                      scenario
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] bg-[var(--surface-raised)]"
                    }`}
                  >
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {scenario.replaceAll(
                        "_",
                        " ",
                      )}
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-[var(--text-primary)]">
                      {data?.recovery_yield_percentage !=
                      null
                        ? `${data.recovery_yield_percentage.toFixed(1)}% reported recovery`
                        : "Recovery not reported"}
                    </div>
                  </button>
                );
              },
            )}
          </div>
        </div>
      ) : null}

      <footer className="relative flex flex-col gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-glass)] px-3 py-3 text-[10px] text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from(
            new Set([
              ...effectiveObservedSurfaces,
              ...effectiveMissingSurfaces,
            ]),
          ).map((surface) => {
            const observed =
              effectiveObservedSurfaces.includes(
                surface,
              ) &&
              !effectiveMissingSurfaces.includes(
                surface,
              );

            return (
              <StatusPill
                key={surface}
                tone={
                  observed
                    ? "good"
                    : "warn"
                }
              >
                {surface}{" "}
                {observed
                  ? "observed"
                  : "unobserved"}
              </StatusPill>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px]">
          <span>
            {geometry.meshStatus}
          </span>
          <span>
            {geometry.isWatertight ===
            false
              ? "OPEN SURFACE"
              : geometry.isWatertight ===
                  true
                ? "CLOSED SURFACE"
                : "TOPOLOGY UNKNOWN"}
          </span>
          <span>
            NO RAW CUBE / SPARSE-BOX FALLBACK
          </span>
        </div>
      </footer>
    </section>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { CaptureSide } from "../../lib/types";

type MetricDimensions = {
  length: number;
  breadth: number;
  height: number;
};

type Props = {
  images: Partial<Record<CaptureSide, string>>;
  dimensions?: MetricDimensions | null;
};

const CANONICAL_SIDES: CaptureSide[] = [
  "FRONT",
  "RIGHT",
  "BACK",
  "LEFT",
  "TOP",
  "BOTTOM",
];

function isCanonicalSide(side: string): side is CaptureSide {
  return CANONICAL_SIDES.includes(side as CaptureSide);
}

function hasPositiveMetricDimensions(
  dimensions?: MetricDimensions | null,
): dimensions is MetricDimensions {
  return Boolean(
    dimensions &&
      [dimensions.length, dimensions.breadth, dimensions.height].every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value > 0,
      ),
  );
}

export default function ImageCubeViewer({ images, dimensions }: Props) {
  const [rotation, setRotation] = useState({ x: -18, y: -28 });
  const [scale, setScale] = useState(0.84);

  /*
   * This component intentionally renders a six-face reference cuboid ONLY when
   * the caller supplies explicit canonical face assignments.
   *
   * Sequential PHOTO_001 / PHOTO_002 captures must not be converted into
   * FRONT / RIGHT / BACK / LEFT / TOP / BOTTOM here. Camera pose and surface
   * assignment belong to reconstruction evidence, not capture order.
   */
  const availableSides = useMemo(
    () =>
      CANONICAL_SIDES.filter(
        (side) => typeof images[side] === "string" && Boolean(images[side]),
      ),
    [images],
  );

  const unassignedEntries = useMemo(
    () =>
      Object.entries(images).filter(
        ([side, url]) => Boolean(url) && !isCanonicalSide(side),
      ),
    [images],
  );

  const metricDimensionsAvailable = hasPositiveMetricDimensions(dimensions);

  const geometry = useMemo(() => {
    if (!metricDimensionsAvailable) return null;

    const maxDimension = Math.max(
      dimensions.length,
      dimensions.breadth,
      dimensions.height,
    );

    // CSS 3D cuboid dimensions preserve the reported L:B:H ratio only.
    // They do not represent reconstructed raw surface geometry.
    return {
      width: (240 * dimensions.length) / maxDimension,
      height: (190 * dimensions.height) / maxDimension,
      depth: (150 * dimensions.breadth) / maxDimension,
    };
  }, [dimensions, metricDimensionsAvailable]);

  const canRenderReferenceCube =
    geometry !== null && availableSides.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="eyebrow text-[var(--text-muted)]">
            Image evidence reference
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {availableSides.length > 0
              ? `${availableSides.length} explicitly assigned canonical surface${
                  availableSides.length === 1 ? "" : "s"
                }`
              : "No canonical surface assignments reported"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="viewer-control"
            title="Rotate left"
            aria-label="Rotate reference left"
            disabled={!canRenderReferenceCube}
            onClick={() =>
              setRotation((value) => ({ ...value, y: value.y - 15 }))
            }
          >
            ↶
          </button>

          <button
            type="button"
            className="viewer-control"
            title="Rotate right"
            aria-label="Rotate reference right"
            disabled={!canRenderReferenceCube}
            onClick={() =>
              setRotation((value) => ({ ...value, y: value.y + 15 }))
            }
          >
            ↷
          </button>

          <button
            type="button"
            className="viewer-control"
            title="Reset view"
            aria-label="Reset reference view"
            disabled={!canRenderReferenceCube}
            onClick={() => {
              setRotation({ x: -18, y: -28 });
              setScale(0.84);
            }}
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            className="viewer-control"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={!canRenderReferenceCube}
            onClick={() =>
              setScale((value) => Math.min(1.2, value + 0.08))
            }
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            className="viewer-control"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!canRenderReferenceCube}
            onClick={() =>
              setScale((value) => Math.max(0.55, value - 0.08))
            }
          >
            <ZoomOut size={14} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden [perspective:900px]">
        {canRenderReferenceCube ? (
          <div
            className="relative transition-transform duration-300 [transform-style:preserve-3d]"
            style={{
              width: geometry.width,
              height: geometry.height,
              transform: `scale(${scale}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            }}
          >
            {CANONICAL_SIDES.map((side) => {
              const imageUrl = images[side];

              return (
                <div
                  key={side}
                  className="absolute overflow-hidden border border-[#e8b45e]/30 bg-[#17191d]"
                  style={{
                    width: geometry.width,
                    height: geometry.height,
                    transform: faceTransform(side, geometry),
                    backfaceVisibility: "hidden",
                  }}
                >
                  {imageUrl ? (
                    // Kept as <img> because capture URLs may be local/blob/API URLs
                    // that are not compatible with Next/Image optimization.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={`${side} surface evidence`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center px-3 text-center text-[9px] uppercase tracking-wider text-white/25">
                      <span>
                        {side}
                        <br />
                        no assigned image
                      </span>
                    </div>
                  )}

                  <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-1 text-[8px] uppercase tracking-wider text-white/75">
                    {side}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-md px-6 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Reference cuboid unavailable
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              {!metricDimensionsAvailable
                ? "Metric L × B × H dimensions were not supplied, so this viewer will not invent a 1:1:1 block."
                : "Metric dimensions are available, but no images were explicitly assigned to canonical granite surfaces."}
            </p>
          </div>
        )}
      </div>

      {unassignedEntries.length > 0 && (
        <div className="border-t border-[var(--border)] bg-amber-500/[.05] px-4 py-3">
          <p className="text-xs font-semibold text-amber-300">
            {unassignedEntries.length} sequential/unassigned image
            {unassignedEntries.length === 1 ? "" : "s"} not mapped to cube faces
          </p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
            Capture order is not treated as physical surface identity. These
            images require backend camera-pose or surface-assignment evidence
            before they can be placed on FRONT / RIGHT / BACK / LEFT / TOP /
            BOTTOM.
          </p>
        </div>
      )}

      <div className="border-t border-[var(--border)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
        {metricDimensionsAvailable ? (
          <>
            This is a dimension-ratio reference cuboid using backend-reported
            L × B × H values. Images are textured only onto explicitly assigned
            canonical surfaces. It is <strong>not</strong> the photogrammetric
            Digital Twin and does not represent irregular raw-surface geometry.
          </>
        ) : (
          <>
            No metric reference geometry is rendered because measured
            dimensions are unavailable. Use the reconstruction viewer for
            backend point-cloud or camera-pose evidence when available.
          </>
        )}
      </div>
    </div>
  );
}

function faceTransform(
  side: CaptureSide,
  geometry: { width: number; height: number; depth: number },
): string {
  const halfDepth = geometry.depth / 2;
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;

  /*
   * This is a CSS reference cuboid, not reconstructed geometry.
   * FRONT/BACK are width × height. RIGHT/LEFT and TOP/BOTTOM are
   * still displayed inside the same face box for backward compatibility;
   * physical surface identity is preserved by explicit labels/evidence.
   */
  switch (side) {
    case "FRONT":
      return `translateZ(${halfDepth}px)`;
    case "BACK":
      return `rotateY(180deg) translateZ(${halfDepth}px)`;
    case "RIGHT":
      return `rotateY(90deg) translateZ(${halfWidth}px)`;
    case "LEFT":
      return `rotateY(-90deg) translateZ(${halfWidth}px)`;
    case "TOP":
      return `rotateX(90deg) translateZ(${halfHeight}px)`;
    case "BOTTOM":
      return `rotateX(-90deg) translateZ(${halfHeight}px)`;
    default:
      return "none";
  }
}

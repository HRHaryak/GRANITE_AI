"use client";

import type { FaceReport } from "./store";
import { measureQuadCm, type Pt } from "./homography";

export const MARKER_DICT = "ARUCO_4X4_1000";
export const MARKER_ID = 7;
const MAX_PX = 3000;

export type MarkerHit = {
  /** Marker corners, normalised 0-1 in the photo, clockwise. */
  corners: Pt[];
  /** Width/height of the decoded photo the corners were found in. */
  w: number;
  h: number;
  sidePx: number;
};

async function loadAruco() {
  const mod = await import("js-aruco2/src/aruco.js");
  await import("js-aruco2/src/dictionaries/aruco_4x4_1000.js");
  return mod.AR;
}

const area = (c: Pt[]) =>
  Math.abs(
    c.reduce((a, p, i) => {
      const q = c[(i + 1) % c.length];
      return a + (p.x * q.y - q.x * p.y);
    }, 0) / 2,
  );

/** Detect the printed marker in an already-drawn canvas. */
export async function detectInCanvas(c: HTMLCanvasElement): Promise<MarkerHit | null> {
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, w, h);
  const AR = await loadAruco();
  const det = new AR.Detector({ dictionaryName: MARKER_DICT });
  const hits = det
    .detect({ width: w, height: h, data: data.data })
    .filter((m) => m.id === MARKER_ID);
  if (!hits.length) return null;
  const best = hits.reduce((a, b) => (area(b.corners) > area(a.corners) ? b : a));
  return {
    corners: best.corners.map((p) => ({ x: p.x / w, y: p.y / h })),
    w,
    h,
    sidePx: Math.sqrt(area(best.corners)),
  };
}

/** Finds the printed ArUco marker (4x4, id 7) at up to 3000 px, the resolution that matters for scale accuracy. */
export async function detectMarker(file: File): Promise<MarkerHit | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const k = Math.min(1, MAX_PX / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await detectInCanvas(c);
  } catch {
    return null;
  }
}

export async function markerSvg(cm: number): Promise<string> {
  const AR = await loadAruco();
  const dict = new AR.Dictionary(MARKER_DICT);
  const svg = dict.generateSVG(MARKER_ID);
  // generateSVG draws a 1-unit white margin around the black marker square.
  const units = dict.markSize; // black square side in units (incl. border)
  const total = units + 2;
  const full = (cm * total) / units;
  return svg.replace(
    "<svg ",
    `<svg width="${full.toFixed(2)}cm" height="${full.toFixed(2)}cm" `,
  );
}

type Dim = "l" | "w" | "h";
const MAP: Record<string, [Dim, Dim]> = {
  FRONT: ["l", "h"],
  BACK: ["l", "h"],
  LEFT: ["w", "h"],
  RIGHT: ["w", "h"],
  TOP: ["l", "w"],
};

export type Refined = {
  faces: FaceReport[];
  dims: { l: number; w: number; h: number } | null;
  uncertaintyPct: number | null;
  used: number;
  notes: string;
};

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

/**
 * Replace the AI's guessed size with metric values from the marker: for every face that has
 * both a detected marker and a face outline, the homography gives the true width x height (cm).
 */
export function refineWithMarkers(
  faces: FaceReport[],
  markers: Record<string, MarkerHit | null | undefined>,
  markerCm: number,
  aiDims: { l: number; w: number; h: number },
  aiUncertaintyPct: number,
): Refined {
  const per: Record<Dim, number[]> = { l: [], w: [], h: [] };
  let used = 0;
  const out = faces.map((f) => {
    const mk = markers[f.face];
    const q = f.face_quad;
    const map = MAP[f.face];
    if (!mk || !q || q.length !== 8 || !map) return f;
    const quadPx = [0, 2, 4, 6].map((i) => ({
      x: q[i] * mk.w,
      y: q[i + 1] * mk.h,
    }));
    const markerPx = mk.corners.map((p) => ({ x: p.x * mk.w, y: p.y * mk.h }));
    const { w, h } = measureQuadCm(markerPx, markerCm, quadPx);
    if (!(w > 5 && h > 5) || w > 800 || h > 800) return f;
    per[map[0]].push(w);
    per[map[1]].push(h);
    used++;
    return { ...f, width_cm: Math.round(w), height_cm: Math.round(h), measured: "MARKER" as const };
  });
  if (!used) {
    return { faces: out, dims: null, uncertaintyPct: null, used: 0, notes: "" };
  }
  const dims = { ...aiDims };
  const notes: string[] = [];
  let worst = 0;
  (["l", "w", "h"] as Dim[]).forEach((d) => {
    const v = per[d];
    if (!v.length) {
      worst = Math.max(worst, aiUncertaintyPct);
      notes.push(`${d.toUpperCase()} has no marker face, kept the AI estimate`);
      return;
    }
    const m = median(v);
    dims[d] = Math.round(m);
    const spread = v.length > 1 ? ((Math.max(...v) - Math.min(...v)) / m) * 100 : 0;
    worst = Math.max(worst, v.length > 1 ? Math.max(5, spread) : 10);
    if (spread > 10)
      notes.push(`${d.toUpperCase()}: marker faces disagree by ${spread.toFixed(0)}%`);
  });
  return {
    faces: out,
    dims,
    uncertaintyPct: Math.round(worst),
    used,
    notes: notes.join("; "),
  };
}

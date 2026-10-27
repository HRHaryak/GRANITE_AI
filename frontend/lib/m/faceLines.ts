/**
 * Measurement lines across one face of a block.
 *
 * The AI only supplies the face's four corners and its traced outline (both in the photo).
 * Everything else is plain geometry done here:
 *  1. the four corners are mapped to a flat rectangle of the face's real size (a homography, so
 *     perspective is removed),
 *  2. the traced outline is mapped the same way,
 *  3. ten evenly spaced horizontal lines are laid between the top and the bottom of the outline;
 *     each is measured edge-to-edge on the outline (the face's lengths),
 *  4. the face's height is the distance from the first to the last of those lines' band, that is
 *     ten line gaps, so no separate height lines are needed,
 *  5. line ends are mapped back onto the photo so they can be drawn.
 */
export type Pt = [number, number];
export type Kind = "length" | "width" | "height";
export type Line = { kind: Kind; p1: Pt; p2: Pt; cm: number };
export type Gross = { length_cm: number | null; width_cm: number | null; height_cm: number | null };
export type FaceGeo = {
  /** The ten length lines, top to bottom. */
  lines: Line[];
  /** The face's height (or depth, for the top), drawn as one line down its left side. */
  heightLine: Line;
  heightCm: number;
  /** Distance between two neighbouring lines. */
  gapCm: number;
  w: number;
  h: number;
  hKind: Kind;
  vKind: Kind;
};

/** Number of length lines laid across every face. */
export const LINES = 10;

type Mat = number[]; // 3x3, row-major

/** Homography taking four source points to four destination points. */
function homography(src: Pt[], dst: Pt[]): Mat | null {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

function apply(h: Mat, [x, y]: Pt): Pt | null {
  const d = h[6] * x + h[7] * y + h[8];
  if (Math.abs(d) < 1e-12) return null;
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

const finite = (p: unknown): p is Pt =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n));

/** The face's flat size in cm and which dimension its horizontal and vertical directions are. */
export function faceDims(face: string, gross: Gross, quad?: Pt[]): Pick<FaceGeo, "w" | "h" | "hKind" | "vKind"> | null {
  const { length_cm: L, width_cm: W, height_cm: H } = gross;
  if (!L || !W || !H) return null;
  if (face === "FRONT" || face === "BACK") return { w: L, h: H, hKind: "length", vKind: "height" };
  if (face === "LEFT" || face === "RIGHT") return { w: W, h: H, hKind: "width", vKind: "height" };
  if (face === "TOP") {
    // The top may be photographed with either side up: pick the reading that matches the photo's shape.
    let lengthHorizontal = true;
    if (quad && quad.length === 4) {
      const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const across = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
      const down = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
      lengthHorizontal = Math.abs(Math.log(across / down / (L / W))) <= Math.abs(Math.log(across / down / (W / L)));
    }
    return lengthHorizontal
      ? { w: L, h: W, hKind: "length", vKind: "width" }
      : { w: W, h: L, hKind: "width", vKind: "length" };
  }
  return null;
}

/** Where a straight line at `at` crosses the polygon: the outermost two crossings. */
function span(poly: Pt[], axis: 0 | 1, at: number): [number, number] | null {
  const o = axis === 0 ? 1 : 0;
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a[axis] === b[axis]) continue;
    if ((a[axis] - at) * (b[axis] - at) > 0) continue;
    const t = (at - a[axis]) / (b[axis] - a[axis]);
    hits.push(a[o] + t * (b[o] - a[o]));
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

export function faceLines(face: string, quadFlat: unknown, outlineRaw: unknown, gross: Gross | undefined): FaceGeo | null {
  if (!gross || !Array.isArray(quadFlat) || quadFlat.length !== 8 || !quadFlat.every((n) => typeof n === "number" && isFinite(n))) return null;
  const q = quadFlat as number[];
  const quad: Pt[] = [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]];
  const dims = faceDims(face, gross, quad);
  if (!dims) return null;
  const { w, h } = dims;
  const rect: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const toRect = homography(quad, rect);
  const toPhoto = homography(rect, quad);
  if (!toRect || !toPhoto) return null;

  const traced = Array.isArray(outlineRaw) ? (outlineRaw as unknown[]).filter(finite) : [];
  const outline: Pt[] = traced.length >= 3 ? traced : quad;
  const flat = outline.map((p) => apply(toRect, p)).filter((p): p is Pt => p != null);
  if (flat.length < 3) return null;

  // Band the lines occupy: the outline's top to its bottom.
  const ys = flat.map((p) => p[1]);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const heightCm = bottom - top;
  if (!(heightCm > 0)) return null;
  const gapCm = heightCm / LINES;

  const lines: Line[] = [];
  for (let i = 0; i < LINES; i++) {
    const y = top + (i + 0.5) * gapCm;
    const sp = span(flat, 1, y);
    const p1 = sp && apply(toPhoto, [sp[0], y]);
    const p2 = sp && apply(toPhoto, [sp[1], y]);
    if (sp && p1 && p2) lines.push({ kind: dims.hKind, p1, p2, cm: sp[1] - sp[0] });
  }
  const h1 = apply(toPhoto, [0, top]);
  const h2 = apply(toPhoto, [0, bottom]);
  if (!lines.length || !h1 || !h2) return null;
  return { lines, heightLine: { kind: dims.vKind, p1: h1, p2: h2, cm: heightCm }, heightCm, gapCm, ...dims };
}

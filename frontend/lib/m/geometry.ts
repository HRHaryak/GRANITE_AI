import type { Dims, FaceReport } from "./store";

export type Range = [number, number];
export type Prism = {
  x: Range;
  y: Range;
  z: Range;
  photo: number;
  face: string;
  type: string;
  severity: string;
  reason: string;
  /** Surface defect: excluded only to a limited depth, not through the whole block. */
  surface?: boolean;
};
export type Cuboid = { x: Range; y: Range; z: Range };

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// Block axes (fractions 0..1): x = length (left→right on FRONT), y = width
// (front→back), z = height (bottom→top). Photos are viewed from outside the block.
function mapFace(
  face: string,
  u: Range,
  v: Range,
): { x: Range; y: Range; z: Range } | null {
  const zv: Range = [1 - v[1], 1 - v[0]];
  const ui: Range = [1 - u[1], 1 - u[0]];
  switch (face) {
    case "FRONT":
      return { x: u, y: [0, 1], z: zv };
    case "BACK":
      return { x: ui, y: [0, 1], z: zv };
    case "RIGHT":
      return { x: [0, 1], y: u, z: zv };
    case "LEFT":
      return { x: [0, 1], y: ui, z: zv };
    case "TOP":
      return { x: u, y: [1 - v[1], 1 - v[0]], z: [0, 1] };
    default:
      return null;
  }
}

const SURFACE_TYPES = new Set(["chip", "weathered", "soil", "other"]);
export const SURFACE_DEPTH_CM = 20;
export const MAJOR_DEPTH_CM = 30;

/**
 * MAJOR/REJECT defects become excluded zones. Only REJECT defects (cracks, voids, holes that split
 * or hollow the block) run through the full depth. MAJOR defects are localised, so they reach
 * MAJOR_DEPTH_CM into the block, and surface defects (chips, weathered patches) SURFACE_DEPTH_CM.
 */
export function zonesFromFaces(faces: FaceReport[], gross?: Dims): Prism[] {
  const out: Prism[] = [];
  for (const f of faces) {
    const fb = f.face_box && f.face_box.length === 4 ? f.face_box : [0, 0, 1, 1];
    const fw = Math.max(0.01, fb[2] - fb[0]);
    const fh = Math.max(0.01, fb[3] - fb[1]);
    for (const d of f.defects ?? []) {
      if (d.severity === "MINOR" || !d.box || d.box.length !== 4) continue;
      const u: Range = [clamp((d.box[0] - fb[0]) / fw), clamp((d.box[2] - fb[0]) / fw)];
      const v: Range = [clamp((d.box[1] - fb[1]) / fh), clamp((d.box[3] - fb[1]) / fh)];
      if (u[1] - u[0] < 0.01 || v[1] - v[0] < 0.01) continue;
      const m = mapFace(f.face, u, v);
      if (!m) continue;
      const surface =
        (SURFACE_TYPES.has(d.type) || d.severity === "MAJOR") &&
        !!gross && gross.l > 0 && gross.w > 0 && gross.h > 0;
      if (surface) {
        const depth = SURFACE_TYPES.has(d.type) ? SURFACE_DEPTH_CM : MAJOR_DEPTH_CM;
        const dl = Math.min(1, depth / gross!.l);
        const dw = Math.min(1, depth / gross!.w);
        const dh = Math.min(1, depth / gross!.h);
        if (f.face === "FRONT") m.y = [0, dw];
        else if (f.face === "BACK") m.y = [1 - dw, 1];
        else if (f.face === "LEFT") m.x = [0, dl];
        else if (f.face === "RIGHT") m.x = [1 - dl, 1];
        else if (f.face === "TOP") m.z = [1 - dh, 1];
      }
      out.push({
        ...m,
        surface,
        photo: f.photo,
        face: f.face,
        type: d.type,
        severity: d.severity,
        reason: d.reason,
      });
    }
  }
  return out;
}

/** Largest axis-aligned cuboid inside the unit block that avoids every zone. */
export function bestCuboid(zones: Prism[], N = 20): Cuboid {
  const blocked = new Uint8Array(N * N * N);
  const cell = 1 / N;
  const ov = (r: Range, i: number) =>
    Math.min(r[1], (i + 1) * cell) - Math.max(r[0], i * cell) > cell * 0.4;
  for (const z of zones)
    for (let i = 0; i < N; i++) {
      if (!ov(z.x, i)) continue;
      for (let j = 0; j < N; j++) {
        if (!ov(z.y, j)) continue;
        for (let k = 0; k < N; k++) if (ov(z.z, k)) blocked[(i * N + j) * N + k] = 1;
      }
    }
  const M = N + 1;
  const P = new Int32Array(M * M * M);
  const at = (i: number, j: number, k: number) => (i * M + j) * M + k;
  for (let i = 1; i <= N; i++)
    for (let j = 1; j <= N; j++)
      for (let k = 1; k <= N; k++)
        P[at(i, j, k)] =
          blocked[((i - 1) * N + (j - 1)) * N + (k - 1)] +
          P[at(i - 1, j, k)] + P[at(i, j - 1, k)] + P[at(i, j, k - 1)] -
          P[at(i - 1, j - 1, k)] - P[at(i - 1, j, k - 1)] - P[at(i, j - 1, k - 1)] +
          P[at(i - 1, j - 1, k - 1)];
  const sum = (a: number, b: number, c: number, d: number, e: number, f: number) =>
    P[at(b, d, f)] - P[at(a, d, f)] - P[at(b, c, f)] - P[at(b, d, e)] +
    P[at(a, c, f)] + P[at(a, d, e)] + P[at(b, c, e)] - P[at(a, c, e)];
  let best = 0;
  let bc: [number, number, number, number, number, number] = [0, N, 0, N, 0, N];
  for (let x0 = 0; x0 < N; x0++)
    for (let x1 = x0 + 1; x1 <= N; x1++)
      for (let y0 = 0; y0 < N; y0++)
        for (let y1 = y0 + 1; y1 <= N; y1++)
          for (let z0 = 0; z0 < N; z0++)
            for (let z1 = z0 + 1; z1 <= N; z1++) {
              const vol = (x1 - x0) * (y1 - y0) * (z1 - z0);
              if (vol <= best) continue;
              if (sum(x0, x1, y0, y1, z0, z1) === 0) {
                best = vol;
                bc = [x0, x1, y0, y1, z0, z1];
              }
            }
  return {
    x: [bc[0] / N, bc[1] / N],
    y: [bc[2] / N, bc[3] / N],
    z: [bc[4] / N, bc[5] / N],
  };
}

/** Final dressed size. For RAW blocks a dressing allowance is removed from every side that lies on the block surface. */
export function finalDims(
  c: Cuboid,
  gross: Dims,
  allowanceCm: number,
  raw: boolean,
): Dims {
  const one = (r: Range, g: number) => {
    let d = (r[1] - r[0]) * g;
    if (raw) {
      if (r[0] <= 0.001) d -= allowanceCm;
      if (r[1] >= 0.999) d -= allowanceCm;
    }
    return Math.max(0, Math.round(d * 10) / 10);
  };
  return { l: one(c.x, gross.l), w: one(c.y, gross.w), h: one(c.z, gross.h) };
}

/** Useful width x height of each face = projection of the final block on that face. */
export function faceUseful(
  face: string,
  fin: Dims,
): [number, number] | null {
  switch (face) {
    case "FRONT":
    case "BACK":
      return [fin.l, fin.h];
    case "LEFT":
    case "RIGHT":
      return [fin.w, fin.h];
    case "TOP":
      return [fin.l, fin.w];
    default:
      return null;
  }
}

const pctRange = (r: Range) =>
  `${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%`;

export function explain(
  zones: Prism[],
  c: Cuboid,
  gross: Dims,
  fin: Dims,
  raw: boolean,
  allowanceCm: number,
): string {
  const lines: string[] = [];
  if (zones.length === 0) {
    lines.push(
      "No major defects were found on any face, so the whole block body is usable.",
    );
  }
  zones.forEach((z) => {
    const part: string[] = [];
    if (z.x[1] - z.x[0] < 0.99) part.push(`length ${pctRange(z.x)}`);
    if (z.y[1] - z.y[0] < 0.99) part.push(`width ${pctRange(z.y)}`);
    if (z.z[1] - z.z[0] < 0.99) part.push(`height ${pctRange(z.z)}`);
    lines.push(
      `Photo ${z.photo} (${z.face}): ${z.type} (${z.severity}) — ${z.reason}. ${z.surface ? `It is a localised defect, so only the outer ${SURFACE_DEPTH_CM}-${MAJOR_DEPTH_CM} cm is excluded (${part.join(", ") || "the area"}).` : `It is carried through the whole block, so ${part.join(", ") || "the full block"} is excluded.`}`,
    );
  });
  const trims: string[] = [];
  const axis = (name: string, r: Range, g: number) => {
    const a = Math.round(r[0] * g);
    const b = Math.round((1 - r[1]) * g);
    if (a > 0 || b > 0)
      trims.push(`${name}: ${a} cm cut from one end, ${b} cm from the other`);
  };
  axis("Length", c.x, gross.l);
  axis("Width", c.y, gross.w);
  axis("Height", c.z, gross.h);
  if (trims.length) lines.push(`Largest clean block found → ${trims.join("; ")}.`);
  if (raw)
    lines.push(
      `Raw block: a further ${allowanceCm} cm dressing allowance is removed from each outer face. Final ${fin.l} × ${fin.w} × ${fin.h} cm.`,
    );
  return lines.join("\n");
}

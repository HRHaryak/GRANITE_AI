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
};
export type Cuboid = { x: Range; y: Range; z: Range };

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// Block axes (fractions 0..1): x = length (left→right on FRONT), y = width
// (front→back), z = height (bottom→top). Photos are viewed from outside the block.
function mapFace(
  face: string,
  u: Range,
  v: Range,
  depthFraction = 0.15,
  isThrough = false,
): { x: Range; y: Range; z: Range } | null {
  const zv: Range = [1 - v[1], 1 - v[0]];
  const ui: Range = [1 - u[1], 1 - u[0]];
  const d = isThrough ? 1.0 : clamp(depthFraction);
  switch (face) {
    case "FRONT":
      return { x: u, y: [0, d], z: zv };
    case "BACK":
      return { x: ui, y: [1 - d, 1], z: zv };
    case "RIGHT":
      return { x: [1 - d, 1], y: u, z: zv };
    case "LEFT":
      return { x: [0, d], y: ui, z: zv };
    case "TOP":
      return { x: u, y: [1 - v[1], 1 - v[0]], z: [1 - d, 1] };
    default:
      return null;
  }
}

/**
 * Maps 2D face defects into 3D exclusion prisms.
 * Surface defects penetrate into dressing depth (default 15%),
 * while REJECT or through-cracks cut through the entire block depth.
 */
export function zonesFromFaces(
  faces: FaceReport[],
  ignoredKeys?: Set<string>,
): Prism[] {
  const out: Prism[] = [];
  for (const f of faces) {
    const fb = f.face_box && f.face_box.length === 4 ? f.face_box : [0, 0, 1, 1];
    const fw = Math.max(0.01, fb[2] - fb[0]);
    const fh = Math.max(0.01, fb[3] - fb[1]);
    for (let idx = 0; idx < (f.defects ?? []).length; idx++) {
      const d = f.defects[idx];
      const key = `${f.photo}-${f.face}-${idx}`;
      if (ignoredKeys && ignoredKeys.has(key)) continue;
      if (d.severity === "MINOR" || !d.box || d.box.length !== 4) continue;
      const u: Range = [clamp((d.box[0] - fb[0]) / fw), clamp((d.box[2] - fb[0]) / fw)];
      const v: Range = [clamp((d.box[1] - fb[1]) / fh), clamp((d.box[3] - fb[1]) / fh)];
      if (u[1] - u[0] < 0.01 || v[1] - v[0] < 0.01) continue;
      const isThrough =
        d.severity === "REJECT" ||
        /through|transverse|shear|split\s*across|split\s*through/i.test(d.reason || "");
      const depthFraction = isThrough ? 1.0 : 0.15;
      const m = mapFace(f.face, u, v, depthFraction, isThrough);
      if (!m) continue;
      out.push({
        ...m,
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

/** Standard commercial quarry dressed dimensions (Govt DMG statutory allowance). */
export function standardDressedDims(
  gross: Dims,
  allowanceCm: number,
  raw: boolean,
): Dims {
  if (!raw) return { ...gross };
  const d = allowanceCm * 2;
  return {
    l: Math.max(0, Math.round((gross.l - d) * 10) / 10),
    w: Math.max(0, Math.round((gross.w - d) * 10) / 10),
    h: Math.max(0, Math.round((gross.h - d) * 10) / 10),
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
  calcMode: "STANDARD" | "DEFECT_CARVE" = "DEFECT_CARVE",
): string {
  const lines: string[] = [];
  if (calcMode === "STANDARD") {
    if (raw) {
      lines.push(
        `Standard commercial dressing applied (DMG statutory rule): statutory ${allowanceCm} cm dressing allowance deducted on all faces (total ${allowanceCm * 2} cm per axis). Final dressed block: ${fin.l} × ${fin.w} × ${fin.h} cm.`,
      );
    } else {
      lines.push(
        `Dressed block: all faces already squared and dressed. Commercial block: ${fin.l} × ${fin.w} × ${fin.h} cm.`,
      );
    }
    if (zones.length > 0) {
      lines.push(
        `Note: ${zones.length} defect zone(s) were flagged by AI. Switch to "Strict Defect Carving" to subtract 3D prisms if any represent unslabable structural cracks.`,
      );
    }
    return lines.join("\n");
  }

  if (zones.length === 0) {
    lines.push(
      "No major defects were found on any face, so the whole block body is sound and usable.",
    );
  }
  zones.forEach((z) => {
    const part: string[] = [];
    if (z.x[1] - z.x[0] < 0.99) part.push(`length ${pctRange(z.x)}`);
    if (z.y[1] - z.y[0] < 0.99) part.push(`width ${pctRange(z.y)}`);
    if (z.z[1] - z.z[0] < 0.99) part.push(`height ${pctRange(z.z)}`);
    const isThrough =
      (z.y[1] - z.y[0] >= 0.99 && (z.face === "FRONT" || z.face === "BACK")) ||
      (z.x[1] - z.x[0] >= 0.99 && (z.face === "LEFT" || z.face === "RIGHT")) ||
      (z.z[1] - z.z[0] >= 0.99 && z.face === "TOP");
    if (isThrough) {
      lines.push(
        `Photo ${z.photo} (${z.face}): ${z.type} (${z.severity}) — ${z.reason}. Through-crack carried through block body (${part.join(", ") || "full block"}).`,
      );
    } else {
      lines.push(
        `Photo ${z.photo} (${z.face}): ${z.type} (${z.severity}) — ${z.reason}. Surface defect trimmed to dressing depth on ${z.face} face (${part.join(", ")}).`,
      );
    }
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

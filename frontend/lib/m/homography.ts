export type Pt = { x: number; y: number };

/** Direct linear transform: homography mapping 4 src points to 4 dst points. */
export function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 system.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function applyH(H: number[], p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Real-world width x height (cm) of a quadrilateral lying in the same plane as a
 * square marker of known side. quad order: top-left, top-right, bottom-right, bottom-left.
 * markerPx: the 4 detected marker corners in image pixels (consistent winding).
 */
export function measureQuadCm(
  markerPx: Pt[],
  markerCm: number,
  quadPx: Pt[],
): { w: number; h: number } {
  const plane: Pt[] = [
    { x: 0, y: 0 },
    { x: markerCm, y: 0 },
    { x: markerCm, y: markerCm },
    { x: 0, y: markerCm },
  ];
  const H = solveHomography(markerPx, plane);
  const [tl, tr, br, bl] = quadPx.map((p) => applyH(H, p));
  return {
    w: (dist(tl, tr) + dist(bl, br)) / 2,
    h: (dist(tl, bl) + dist(tr, br)) / 2,
  };
}

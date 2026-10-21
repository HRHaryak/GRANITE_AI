"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, ImagePlus, Loader2, Plus, ScanLine, X } from "lucide-react";
import { fileToImage } from "../../../lib/m/store";
import { Badge, Card, Header } from "../../../components/m/ui";

type Pt = [number, number];
type Measurement = {
  label: string;
  kind?: string;
  tag?: "top" | "bottom" | "left" | "right";
  p1: Pt;
  p2: Pt;
  value_cm: number | null;
};
type Result = {
  is_granite?: boolean;
  scale_basis?: string;
  scale_cues?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  uncertainty_pct?: number;
  notes?: string;
  outline?: Pt[];
  measurements?: Measurement[];
  defects?: { type: string; box: [number, number, number, number] }[];
};

const COLORS = ["#ff2d55", "#ffd60a", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2", "#ffffff", "#000000"];

const FACE_OPTIONS = [
  { id: "FRONT", label: "Front (L × H)", badge: "Front" },
  { id: "BACK", label: "Back (L × H)", badge: "Back" },
  { id: "LEFT", label: "Left End (W × H)", badge: "Left" },
  { id: "RIGHT", label: "Right End (W × H)", badge: "Right" },
  { id: "TOP", label: "Top (L × W)", badge: "Top" },
  { id: "EXTRA", label: "Other / Extra", badge: "Other" },
];

const fmt = (cm: number | null) => (cm == null ? "?" : cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`);

const valid = (p: unknown): p is Pt =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n));

function getFourEdges(result: Result | null, face: string): Measurement[] {
  if (!result) return [];
  const existing = (result.measurements ?? []).filter(
    (m) => valid(m.p1) && valid(m.p2) && typeof m.value_cm === "number" && m.value_cm > 0
  );

  if (existing.length >= 4) {
    return existing.map((m) => {
      if (m.tag) return m;
      const l = m.label.toLowerCase();
      let tag: "top" | "bottom" | "left" | "right" | undefined = undefined;
      if (l.includes("top")) tag = "top";
      else if (l.includes("bot")) tag = "bottom";
      else if (l.includes("left")) tag = "left";
      else if (l.includes("right")) tag = "right";
      return { ...m, tag };
    });
  }

  const outline = (result.outline ?? []).filter(valid);
  if (outline.length < 3) return existing;

  let tl = outline[0], tr = outline[0], br = outline[0], bl = outline[0];
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  for (const [x, y] of outline) {
    if (x + y < minSum) { minSum = x + y; tl = [x, y]; }
    if (x + y > maxSum) { maxSum = x + y; br = [x, y]; }
    if (x - y > maxDiff) { maxDiff = x - y; tr = [x, y]; }
    if (x - y < minDiff) { minDiff = x - y; bl = [x, y]; }
  }

  const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  let scaleH = 0;
  let scaleV = 0;
  for (const m of existing) {
    const d = dist(m.p1, m.p2);
    if (d <= 0.001) continue;
    const ratio = m.value_cm! / d;
    const dx = Math.abs(m.p2[0] - m.p1[0]);
    const dy = Math.abs(m.p2[1] - m.p1[1]);
    if (dx >= dy) {
      scaleH = scaleH ? (scaleH + ratio) / 2 : ratio;
    } else {
      scaleV = scaleV ? (scaleV + ratio) / 2 : ratio;
    }
  }

  if (!scaleH && scaleV) scaleH = scaleV;
  if (!scaleV && scaleH) scaleV = scaleH;
  if (!scaleH && !scaleV) return existing;

  const isWidthFace = face === "LEFT" || face === "RIGHT";
  const isTop = face === "TOP";
  const horizKind = isWidthFace ? "width" : "length";
  const horizName = isWidthFace ? "Width" : "Length";
  const vertKind = isTop ? "width" : "height";
  const vertName = isTop ? "Width" : "Height";

  type EdgeDef = {
    tag: "top" | "bottom" | "left" | "right";
    label: string;
    kind: string;
    p1: Pt;
    p2: Pt;
    scale: number;
  };

  const edges: EdgeDef[] = [
    { tag: "top", label: `Top ${horizName}`, kind: horizKind, p1: tl, p2: tr, scale: scaleH },
    { tag: "bottom", label: `Bottom ${horizName}`, kind: horizKind, p1: bl, p2: br, scale: scaleH },
    { tag: "left", label: `Left ${vertName}`, kind: vertKind, p1: tl, p2: bl, scale: scaleV },
    { tag: "right", label: `Right ${vertName}`, kind: vertKind, p1: tr, p2: br, scale: scaleV },
  ];

  const resultEdges: Measurement[] = [];

  for (const edge of edges) {
    const edgeMid = [(edge.p1[0] + edge.p2[0]) / 2, (edge.p1[1] + edge.p2[1]) / 2];
    const match = existing.find((m) => {
      const mid = [(m.p1[0] + m.p2[0]) / 2, (m.p1[1] + m.p2[1]) / 2];
      return Math.hypot(mid[0] - edgeMid[0], mid[1] - edgeMid[1]) < 0.22;
    });

    if (match) {
      const edgePrefix = edge.tag.charAt(0).toUpperCase() + edge.tag.slice(1);
      const cleanLabel = match.label.toLowerCase().includes(edge.tag)
        ? match.label
        : `${edgePrefix} ${match.label}`;
      resultEdges.push({
        ...match,
        tag: edge.tag,
        label: cleanLabel,
        kind: edge.kind,
      });
    } else {
      const d = dist(edge.p1, edge.p2);
      const val = Math.round(d * edge.scale * 10) / 10;
      resultEdges.push({
        tag: edge.tag,
        label: edge.label,
        kind: edge.kind,
        p1: edge.p1,
        p2: edge.p2,
        value_cm: val,
      });
    }
  }

  return resultEdges;
}

export default function AnalysePage() {
  const [images, setImages] = useState<string[]>([]);
  const [faces, setFaces] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [custom, setCustom] = useState("#ff2d55");
  const [showOutline, setShowOutline] = useState(true);
  const [showCorners, setShowCorners] = useState(true);
  const [showDefects, setShowDefects] = useState(true);
  const [dragCorner, setDragCorner] = useState<"tl" | "tr" | "br" | "bl" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const appendRef = useRef(false);

  const currentImage = images[currentIndex] || "";
  const currentFace = (faces[currentIndex] || FACE_OPTIONS[currentIndex % FACE_OPTIONS.length].id).toUpperCase();
  const currentResult = results[currentIndex] || null;
  const unmeasuredCount = images.filter((_, i) => !results[i]).length;

  function getCurrentCorners(): { tl: Pt; tr: Pt; br: Pt; bl: Pt } | null {
    if (!currentResult) return null;
    const edges = getFourEdges(currentResult, currentFace);
    const top = edges.find((e) => e.tag === "top" || e.label.toLowerCase().includes("top"));
    const bottom = edges.find((e) => e.tag === "bottom" || e.label.toLowerCase().includes("bottom"));
    const left = edges.find((e) => e.tag === "left" || e.label.toLowerCase().includes("left"));
    const right = edges.find((e) => e.tag === "right" || e.label.toLowerCase().includes("right"));

    const tl: Pt = top?.p1 ?? left?.p1 ?? [0.2, 0.2];
    const tr: Pt = top?.p2 ?? right?.p1 ?? [0.8, 0.2];
    const br: Pt = bottom?.p2 ?? right?.p2 ?? [0.8, 0.8];
    const bl: Pt = bottom?.p1 ?? left?.p2 ?? [0.2, 0.8];

    return { tl, tr, br, bl };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!currentResult) return;
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const corners = getCurrentCorners();
    if (!corners) return;

    const thresholdNorm = 36 / Math.min(rect.width, rect.height);
    const dists: Array<{ id: "tl" | "tr" | "br" | "bl"; d: number }> = [
      { id: "tl", d: Math.hypot(px - corners.tl[0], py - corners.tl[1]) },
      { id: "tr", d: Math.hypot(px - corners.tr[0], py - corners.tr[1]) },
      { id: "br", d: Math.hypot(px - corners.br[0], py - corners.br[1]) },
      { id: "bl", d: Math.hypot(px - corners.bl[0], py - corners.bl[1]) },
    ];
    dists.sort((a, b) => a.d - b.d);

    if (dists[0].d < thresholdNorm) {
      setDragCorner(dists[0].id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragCorner || !currentResult) return;
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));

    const corners = getCurrentCorners();
    if (!corners) return;

    const next = { ...corners };
    next[dragCorner] = [Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000];

    // Compute calibration scale ratio from existing edges
    const edges = getFourEdges(currentResult, currentFace);
    let scaleH = 0;
    let scaleV = 0;
    for (const m of edges) {
      const d = Math.hypot(m.p2[0] - m.p1[0], m.p2[1] - m.p1[1]);
      if (d > 0.005 && m.value_cm && m.value_cm > 0) {
        const ratio = m.value_cm / d;
        const dx = Math.abs(m.p2[0] - m.p1[0]);
        const dy = Math.abs(m.p2[1] - m.p1[1]);
        if (dx >= dy) scaleH = scaleH ? (scaleH + ratio) / 2 : ratio;
        else scaleV = scaleV ? (scaleV + ratio) / 2 : ratio;
      }
    }
    if (!scaleH && scaleV) scaleH = scaleV;
    if (!scaleV && scaleH) scaleV = scaleH;
    if (!scaleH) scaleH = 220;

    const isWidthFace = currentFace === "LEFT" || currentFace === "RIGHT";
    const isTop = currentFace === "TOP";
    const horizKind = isWidthFace ? "width" : "length";
    const horizName = isWidthFace ? "Width" : "Length";
    const vertKind = isTop ? "width" : "height";
    const vertName = isTop ? "Width" : "Height";

    const calcVal = (p1: Pt, p2: Pt, scale: number) =>
      Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * scale * 10) / 10;

    const updatedEdges: Measurement[] = [
      {
        tag: "top",
        label: `Top ${horizName}`,
        kind: horizKind,
        p1: next.tl,
        p2: next.tr,
        value_cm: calcVal(next.tl, next.tr, scaleH),
      },
      {
        tag: "bottom",
        label: `Bottom ${horizName}`,
        kind: horizKind,
        p1: next.bl,
        p2: next.br,
        value_cm: calcVal(next.bl, next.br, scaleH),
      },
      {
        tag: "left",
        label: `Left ${vertName}`,
        kind: vertKind,
        p1: next.tl,
        p2: next.bl,
        value_cm: calcVal(next.tl, next.bl, scaleV),
      },
      {
        tag: "right",
        label: `Right ${vertName}`,
        kind: vertKind,
        p1: next.tr,
        p2: next.br,
        value_cm: calcVal(next.tr, next.br, scaleV),
      },
    ];

    setResults((prev) => ({
      ...prev,
      [currentIndex]: {
        ...prev[currentIndex],
        outline: [next.tl, next.tr, next.br, next.bl],
        measurements: updatedEdges,
      },
    }));
  }

  function handlePointerUp() {
    setDragCorner(null);
  }

  // Per-photo breakdown for all uploaded images
  type ImageBreakdown = {
    index: number;
    image: string;
    faceId: string;
    faceLabel: string;
    faceBadge: string;
    result: Result | null;
    isMeasured: boolean;
    edges: Measurement[];
    topEdge: Measurement | null;
    bottomEdge: Measurement | null;
    leftEdge: Measurement | null;
    rightEdge: Measurement | null;
    faceAvg: number | null;
  };

  const imageBreakdowns: ImageBreakdown[] = images.map((img, i) => {
    const faceOpt = FACE_OPTIONS.find((f) => f.id === faces[i]) || FACE_OPTIONS[i % FACE_OPTIONS.length];
    const faceId = faceOpt.id;
    const res = results[i] || null;
    const edges = res ? getFourEdges(res, faceId) : [];
    const topEdge = edges.find((e) => e.tag === "top" || e.label.toLowerCase().includes("top")) || null;
    const bottomEdge = edges.find((e) => e.tag === "bottom" || e.label.toLowerCase().includes("bottom")) || null;
    const leftEdge = edges.find((e) => e.tag === "left" || e.label.toLowerCase().includes("left")) || null;
    const rightEdge = edges.find((e) => e.tag === "right" || e.label.toLowerCase().includes("right")) || null;

    const validVals = [topEdge?.value_cm, bottomEdge?.value_cm, leftEdge?.value_cm, rightEdge?.value_cm].filter(
      (v): v is number => typeof v === "number" && v > 0
    );
    const faceAvg = validVals.length ? validVals.reduce((a, b) => a + b, 0) / validVals.length : null;

    return {
      index: i,
      image: img,
      faceId,
      faceLabel: faceOpt.label,
      faceBadge: faceOpt.badge,
      result: res,
      isMeasured: !!res && (res.measurements?.length ?? 0) > 0,
      edges,
      topEdge,
      bottomEdge,
      leftEdge,
      rightEdge,
      faceAvg,
    };
  });

  const measuredBreakdowns = imageBreakdowns.filter((b) => b.isMeasured);
  const analyzedEntries = Object.entries(results).filter(
    ([_, r]) => r && (r.measurements?.length ?? 0) > 0
  );

  // Four-side perimeter edge aggregates across all measured photos
  const topValues = measuredBreakdowns
    .map((b) => b.topEdge?.value_cm)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const bottomValues = measuredBreakdowns
    .map((b) => b.bottomEdge?.value_cm)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const leftValues = measuredBreakdowns
    .map((b) => b.leftEdge?.value_cm)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const rightValues = measuredBreakdowns
    .map((b) => b.rightEdge?.value_cm)
    .filter((v): v is number => typeof v === "number" && v > 0);

  // 3D Block Dimensions: Length, Width, Height across all photos
  const lengths: number[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  const allSideValues: number[] = [];

  for (const b of measuredBreakdowns) {
    for (const m of b.edges) {
      if (typeof m.value_cm !== "number" || isNaN(m.value_cm) || m.value_cm <= 0) continue;
      const k = (m.kind || "").toLowerCase();
      const l = (m.label || "").toLowerCase();

      if (k === "width" || l.includes("wid") || l.includes("breadth")) {
        widths.push(m.value_cm);
      } else if (k === "height" || l.includes("hei")) {
        heights.push(m.value_cm);
      } else if (k === "length" || l.includes("len")) {
        lengths.push(m.value_cm);
      } else {
        if (!l.includes("crack") && !l.includes("defect") && !l.includes("diag")) {
          lengths.push(m.value_cm);
        }
      }
      allSideValues.push(m.value_cm);
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const minVal = (arr: number[]) => (arr.length ? Math.min(...arr) : null);
  const maxVal = (arr: number[]) => (arr.length ? Math.max(...arr) : null);

  const avgTop = avg(topValues);
  const avgBottom = avg(bottomValues);
  const avgLeft = avg(leftValues);
  const avgRight = avg(rightValues);

  const avgSide = avg(allSideValues);
  const avgL = avg(lengths);
  const avgW = avg(widths);
  const avgH = avg(heights);

  const minL = minVal(lengths);
  const maxL = maxVal(lengths);
  const minW = minVal(widths);
  const maxW = maxVal(widths);
  const minH = minVal(heights);
  const maxH = maxVal(heights);

  const volumeM3 = avgL && avgW && avgH ? (avgL / 100) * (avgW / 100) * (avgH / 100) : null;
  const tonnes = volumeM3 ? volumeM3 * 2.7 : null;

  async function pick(files: FileList | null, append = false) {
    if (!files || files.length === 0) return;
    setError("");
    try {
      const loaded = await Promise.all(
        Array.from(files).map((f) => fileToImage(f, 1600, 0.85))
      );
      if (append) {
        setImages((prev) => [...prev, ...loaded]);
        setFaces((prev) => [
          ...prev,
          ...loaded.map((_, i) => FACE_OPTIONS[(prev.length + i) % FACE_OPTIONS.length].id),
        ]);
      } else {
        setImages(loaded);
        setCurrentIndex(0);
        setResults({});
        setFaces(loaded.map((_, i) => FACE_OPTIONS[i % FACE_OPTIONS.length].id));
      }
    } catch {
      setError("Could not read one or more images.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(index: number) {
    const nextImages = images.filter((_, i) => i !== index);
    const nextFaces = faces.filter((_, i) => i !== index);
    const nextResults: Record<number, Result> = {};
    let rIdx = 0;
    for (let i = 0; i < images.length; i++) {
      if (i === index) continue;
      if (results[i]) nextResults[rIdx] = results[i];
      rIdx++;
    }
    setImages(nextImages);
    setFaces(nextFaces);
    setResults(nextResults);
    if (currentIndex >= nextImages.length) {
      setCurrentIndex(Math.max(0, nextImages.length - 1));
    }
  }

  function setPhotoFace(index: number, faceId: string) {
    setFaces((prev) => {
      const next = [...prev];
      while (next.length < images.length) {
        next.push(FACE_OPTIONS[next.length % FACE_OPTIONS.length].id);
      }
      next[index] = faceId;
      return next;
    });
  }

  async function analyseSingle(index: number) {
    if (!images[index]) return;
    setBusy(true);
    setError("");
    try {
      const face = faces[index] || FACE_OPTIONS[index % FACE_OPTIONS.length].id;
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: images[index], face }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Analysis failed on photo #${index + 1}`);
      setResults((prev) => ({ ...prev, [index]: data as Result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function analyseCurrent() {
    await analyseSingle(currentIndex);
  }

  async function analyseAll() {
    if (images.length === 0) return;
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < images.length; i++) {
        if (results[i]) continue;
        const face = faces[i] || FACE_OPTIONS[i % FACE_OPTIONS.length].id;
        const res = await fetch("/api/analyse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: images[i], face }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? `Analysis failed on photo #${i + 1}`);
        setResults((prev) => ({ ...prev, [i]: data as Result }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img || !img.complete || !img.naturalWidth) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, W, H);
    if (!currentResult) return;
    const result = currentResult;
    const u = Math.max(W, H) / 800; // scale line widths and text with the image
    const X = (p: Pt) => p[0] * W;
    const Y = (p: Pt) => p[1] * H;
    g.lineCap = "round";
    g.lineJoin = "round";

    const outline = (result.outline ?? []).filter(valid);
    if (showOutline && outline.length > 2) {
      g.beginPath();
      outline.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
      g.closePath();
      g.globalAlpha = 0.12;
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;

      // Dark contrast under-stroke for clear edge visibility
      g.strokeStyle = "rgba(0,0,0,0.65)";
      g.lineWidth = 4 * u;
      g.stroke();

      // Sharp edge line
      g.strokeStyle = color;
      g.lineWidth = 2.5 * u;
      g.stroke();
    }

    // Draw detected defects / veins if enabled
    if (showDefects && result.defects && result.defects.length > 0) {
      for (const d of result.defects) {
        if (!Array.isArray(d.box) || d.box.length !== 4) continue;
        const [b0, b1, b2, b3] = d.box.map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
        const minX = Math.min(b0, b2);
        const maxX = Math.max(b0, b2);
        const minY = Math.min(b1, b3);
        const maxY = Math.max(b1, b3);

        const bx = minX * W;
        const by = minY * H;
        const bw = Math.max(16 * u, (maxX - minX) * W);
        const bh = Math.max(16 * u, (maxY - minY) * H);

        // Warning background tint
        g.fillStyle = "rgba(255, 59, 48, 0.22)";
        g.fillRect(bx, by, bw, bh);

        // Dark contrast stroke under
        g.strokeStyle = "rgba(0, 0, 0, 0.75)";
        g.lineWidth = 4 * u;
        g.strokeRect(bx, by, bw, bh);

        // Bright red/amber dashed line
        g.strokeStyle = "#ff3b30";
        g.lineWidth = 2.5 * u;
        g.setLineDash([6 * u, 3 * u]);
        g.strokeRect(bx, by, bw, bh);
        g.setLineDash([]);

        // Defect label with warning pill
        label(g, `⚠ ${d.type}`, bx, Math.max(14 * u, by - 6 * u), u, "#ff3b30");
      }
    }

    const fourEdges = getFourEdges(result, currentFace);
    for (const m of fourEdges) {
      if (!valid(m.p1) || !valid(m.p2)) continue;
      const [ax, ay, bx, by] = [X(m.p1), Y(m.p1), X(m.p2), Y(m.p2)];
      // Dark halo under the line keeps it visible on any colour of stone.
      for (const [stroke, w] of [["rgba(0,0,0,0.55)", 6 * u], [color, 3 * u]] as const) {
        g.strokeStyle = stroke;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      const ang = Math.atan2(by - ay, bx - ax);
      const tick = 9 * u;
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        for (const [stroke, w] of [["rgba(0,0,0,0.55)", 6 * u], [color, 3 * u]] as const) {
          g.strokeStyle = stroke;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(x + Math.cos(ang + Math.PI / 2) * tick, y + Math.sin(ang + Math.PI / 2) * tick);
          g.lineTo(x - Math.cos(ang + Math.PI / 2) * tick, y - Math.sin(ang + Math.PI / 2) * tick);
          g.stroke();
        }
      }
      label(g, `${m.label}: ${fmt(m.value_cm)}`, (ax + bx) / 2, (ay + by) / 2, u, color, true);
    }

    // Prominently mark all 4 interactive corners (TL, TR, BR, BL)
    if (showCorners) {
      const top = fourEdges.find((e) => e.tag === "top");
      const bot = fourEdges.find((e) => e.tag === "bottom");
      const cornerPts = [
        { id: "tl", p: top?.p1 ?? (outline[0] || [0.2, 0.2]) },
        { id: "tr", p: top?.p2 ?? (outline[1] || [0.8, 0.2]) },
        { id: "br", p: bot?.p2 ?? (outline[2] || [0.8, 0.8]) },
        { id: "bl", p: bot?.p1 ?? (outline[3] || [0.2, 0.8]) },
      ];

      cornerPts.forEach((cItem) => {
        const px = X(cItem.p);
        const py = Y(cItem.p);
        const isDragging = dragCorner === cItem.id;
        const r = (isDragging ? 9 : 6.5) * u;

        // Dark outer halo
        g.beginPath();
        g.arc(px, py, r + 2.5 * u, 0, Math.PI * 2);
        g.fillStyle = "rgba(0,0,0,0.75)";
        g.fill();

        // Bright color dot
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fillStyle = isDragging ? "#00e5ff" : color;
        g.fill();

        // White core target
        g.beginPath();
        g.arc(px, py, 2.5 * u, 0, Math.PI * 2);
        g.fillStyle = "#ffffff";
        g.fill();
      });
    }
  }, [currentResult, currentFace, color, showOutline, showCorners, showDefects, dragCorner]);

  // Reload the element when a photo is chosen or switched; redraw on any change.
  useEffect(() => {
    if (!currentImage) return;
    if (imgRef.current && imgRef.current.src === currentImage && imgRef.current.complete) {
      draw();
      return;
    }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = currentImage;
  }, [currentImage, draw]);

  function download() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `granite-measurements-${currentIndex + 1}.png`;
    a.click();
  }

  return (
    <div>
      <Header title="Analyse images" subtitle="Upload photos, see them measured" back="/m" />
      <div className="space-y-4 p-4">
        {error && (
          <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => pick(e.target.files, appendRef.current)}
        />

        {images.length === 0 ? (
          <button
            onClick={() => {
              appendRef.current = false;
              fileRef.current?.click();
            }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#15949b]/60 bg-teal-50 py-14 text-sm font-semibold text-[#0f7e84] active:bg-teal-100"
          >
            <ImagePlus size={28} />
            Upload block photos (select one or multiple)
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => {
                const isSelected = idx === currentIndex;
                const isMeasured = Boolean(results[idx]);
                return (
                  <div key={idx} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative h-16 w-16 overflow-hidden rounded-xl border-2 transition-all ${
                        isSelected
                          ? "border-[#0f5257] ring-2 ring-[#0f5257]/30"
                          : "border-slate-200 opacity-70 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 left-1 max-w-[85%] truncate rounded bg-black/60 px-1 py-0.5 text-[8px] font-bold text-white">
                        #{idx + 1} {FACE_OPTIONS.find((f) => f.id === (faces[idx] || FACE_OPTIONS[idx % FACE_OPTIONS.length].id))?.badge || ""}
                      </span>
                      {isMeasured && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(idx);
                      }}
                      className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white shadow hover:bg-red-600"
                      title="Remove photo"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  appendRef.current = true;
                  fileRef.current?.click();
                }}
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#15949b]/60 bg-teal-50 text-[10px] font-semibold text-[#0f7e84] active:bg-teal-100"
              >
                <Plus size={18} />
                Add
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs shadow-sm">
              <span className="font-semibold text-slate-700">Photo #{currentIndex + 1} side:</span>
              <select
                value={currentFace}
                onChange={(e) => setPhotoFace(currentIndex, e.target.value)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-[#0f5257] shadow-sm outline-none focus:ring-2 focus:ring-[#0f5257]"
              >
                {FACE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <Card className="space-y-3 p-2">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full rounded-xl touch-none select-none cursor-crosshair"
              />
              {currentResult && (
                <div className="flex items-center justify-between rounded-lg bg-teal-50/80 px-2.5 py-1.5 text-[11px] font-medium text-[#0f5257]">
                  <span className="flex items-center gap-1.5">
                    <span>&#128073;</span> Drag any corner dot to adjust stone edges
                  </span>
                  <span className="text-[10px] text-teal-700 font-semibold uppercase">Interactive</span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    appendRef.current = false;
                    fileRef.current?.click();
                  }}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700"
                >
                  Replace all
                </button>
                {currentResult && (
                  <button
                    onClick={download}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700"
                  >
                    <Download size={14} /> Save image
                  </button>
                )}
              </div>
            </Card>

            {images.length > 1 ? (
              <div className="flex gap-2">
                <button
                  onClick={analyseCurrent}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
                  {busy ? "Measuring…" : currentResult ? `Re-measure #${currentIndex + 1}` : `Measure photo #${currentIndex + 1}`}
                </button>
                {unmeasuredCount > 0 && (
                  <button
                    onClick={analyseAll}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-[#0f5257] bg-teal-50 px-4 py-3.5 text-xs font-semibold text-[#0f5257] disabled:opacity-40"
                  >
                    Measure all ({unmeasuredCount})
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={analyseCurrent}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
                {busy ? "Measuring…" : currentResult ? "Measure again" : "Measure this photo"}
              </button>
            )}

            {/* Combined Block Dimensions: calculated across all uploaded photos */}
            {measuredBreakdowns.length > 0 && (
              <Card className="space-y-3.5 border border-teal-200 bg-gradient-to-br from-teal-50/90 via-white to-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-2.5">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#0f5257]">
                      Combined Block Dimensions ({measuredBreakdowns.length} of {images.length} {images.length === 1 ? "Photo" : "Photos"} Measured)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      3D block dimensions calculated across all photographed sides
                    </p>
                  </div>
                </div>

                {/* 3D Dimensions: Length × Width × Height */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-xs">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Length (L)</p>
                    <p className="mt-1 text-base font-bold text-slate-800">{fmt(avgL)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-xs">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Width (W)</p>
                    <p className="mt-1 text-base font-bold text-slate-800">{fmt(avgW)}</p>
                    {widths.length === 0 && (
                      <p className="mt-1 text-[8px] leading-tight text-amber-600">Tag end photos as Left/Right</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-xs">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Height (H)</p>
                    <p className="mt-1 text-base font-bold text-slate-800">{fmt(avgH)}</p>
                  </div>
                </div>

                {volumeM3 != null && (
                  <div className="flex items-center justify-between rounded-xl bg-teal-900/5 px-3 py-2 text-xs">
                    <span className="text-slate-600 font-medium">Combined Volume &amp; Mass (2.7 t/m&sup3;)</span>
                    <span className="font-bold text-[#0f5257]">
                      {volumeM3.toFixed(2)} m&sup3; &bull; {tonnes?.toFixed(2)} tonnes
                    </span>
                  </div>
                )}
              </Card>
            )}

            {/* Results for all multiple uploaded images */}
            {images.length > 0 && (
              <Card className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      All Uploaded Photos ({images.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      All 4 edges and average for each uploaded photo &bull; Click any row to inspect on canvas
                    </p>
                  </div>
                  <Badge tone={measuredBreakdowns.length === images.length ? "ok" : "info"}>
                    {measuredBreakdowns.length} / {images.length} Measured
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  {imageBreakdowns.map((b) => {
                    const isSelected = b.index === currentIndex;
                    return (
                      <div
                        key={b.index}
                        onClick={() => setCurrentIndex(b.index)}
                        className={`group relative cursor-pointer rounded-2xl border p-3 transition-all ${
                          isSelected
                            ? "border-[#0f5257] bg-teal-50/40 shadow-xs ring-1 ring-[#0f5257]/30"
                            : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                        }`}
                      >
                        {/* Top row: Photo #, Face select, and Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                              #{b.index + 1}
                            </span>
                            <select
                              value={b.faceId}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setPhotoFace(b.index, e.target.value)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-[#0f5257] outline-none focus:ring-1 focus:ring-[#0f5257]"
                            >
                              {FACE_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {isSelected && (
                              <Badge tone="ok">Active on Canvas</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {b.isMeasured ? (
                              <>
                                {b.result?.confidence && (
                                  <Badge
                                    tone={
                                      b.result.confidence === "HIGH"
                                        ? "ok"
                                        : b.result.confidence === "MEDIUM"
                                        ? "warn"
                                        : "bad"
                                    }
                                  >
                                    {b.result.confidence}
                                  </Badge>
                                )}
                                {b.faceAvg != null && (
                                  <span className="text-xs font-bold text-teal-800">
                                    Face Avg: {fmt(b.faceAvg)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => analyseSingle(b.index)}
                                className="flex items-center gap-1 rounded-lg bg-[#0f5257] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                              >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
                                Measure
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Middle row: Thumbnail + 4-side grid */}
                        <div className="mt-2.5 flex items-start gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={b.image}
                            alt={`Photo #${b.index + 1}`}
                            className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover shadow-xs"
                          />

                          {b.isMeasured ? (
                            <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
                              <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1">
                                <span className="block text-[9px] font-medium text-slate-400 uppercase">
                                  Top ({b.topEdge?.kind ?? "edge"})
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {fmt(b.topEdge?.value_cm ?? null)}
                                </span>
                              </div>
                              <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1">
                                <span className="block text-[9px] font-medium text-slate-400 uppercase">
                                  Bottom ({b.bottomEdge?.kind ?? "edge"})
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {fmt(b.bottomEdge?.value_cm ?? null)}
                                </span>
                              </div>
                              <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1">
                                <span className="block text-[9px] font-medium text-slate-400 uppercase">
                                  Left ({b.leftEdge?.kind ?? "edge"})
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {fmt(b.leftEdge?.value_cm ?? null)}
                                </span>
                              </div>
                              <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1">
                                <span className="block text-[9px] font-medium text-slate-400 uppercase">
                                  Right ({b.rightEdge?.kind ?? "edge"})
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {fmt(b.rightEdge?.value_cm ?? null)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-400">
                              Photo not measured yet &mdash; click Measure to detect all 4 edges
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {currentResult && (
              <>
                <Card className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Drawing colour</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        aria-label={`Colour ${c}`}
                        onClick={() => setColor(c)}
                        style={{ background: c }}
                        className={`h-8 w-8 rounded-full border border-slate-300 ${color === c ? "ring-2 ring-[#0f5257] ring-offset-2" : ""}`}
                      />
                    ))}
                    <label className="relative flex h-8 items-center rounded-full border border-slate-300 px-3 text-[11px] font-semibold text-slate-600">
                      Any
                      <input
                        type="color"
                        value={custom}
                        onChange={(e) => {
                          setCustom(e.target.value);
                          setColor(e.target.value);
                        }}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-600">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} />
                      Block edges
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={showCorners} onChange={(e) => setShowCorners(e.target.checked)} />
                      Corners
                    </label>
                    <label className={`flex items-center gap-1.5 cursor-pointer font-medium ${showDefects ? "text-amber-700" : "text-slate-600 hover:text-slate-800"}`}>
                      <input type="checkbox" checked={showDefects} onChange={(e) => setShowDefects(e.target.checked)} />
                      Defects / Veins
                    </label>
                  </div>
                </Card>

                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">Photo #{currentIndex + 1} analysis</span>
                    {currentResult.confidence && (
                      <Badge tone={currentResult.confidence === "HIGH" ? "ok" : currentResult.confidence === "MEDIUM" ? "warn" : "bad"}>
                        {currentResult.confidence} confidence
                      </Badge>
                    )}
                    {currentResult.uncertainty_pct != null && <Badge tone="mute">±{currentResult.uncertainty_pct}%</Badge>}
                    {currentResult.scale_basis && <Badge tone="info">{currentResult.scale_basis}</Badge>}
                  </div>
                  {getFourEdges(currentResult, currentFace).map((m, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-100 py-1 text-sm last:border-0">
                      <span className="text-slate-600">{m.label}</span>
                      <span className="font-semibold text-slate-800">{fmt(m.value_cm)}</span>
                    </div>
                  ))}
                  {getFourEdges(currentResult, currentFace).length === 0 && (
                    <p className="text-xs text-slate-500">No measurable edges were found in this photo.</p>
                  )}

                  {showDefects && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
                      <div className="flex items-center justify-between font-semibold text-amber-950">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-amber-600" />
                          Visible Defects &amp; Veins
                        </span>
                        <Badge tone={(currentResult.defects?.length ?? 0) > 0 ? "warn" : "ok"}>
                          {(currentResult.defects?.length ?? 0)} detected
                        </Badge>
                      </div>
                      {(currentResult.defects?.length ?? 0) > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {currentResult.defects!.map((d, idx) => (
                            <div key={idx} className="flex items-center justify-between rounded-lg bg-white/90 px-2.5 py-1 text-slate-700 shadow-2xs">
                              <span className="flex items-center gap-1.5 font-medium text-red-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                {d.type}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Box: {Math.round(d.box[0] * 100)}%, {Math.round(d.box[1] * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">
                          No structural defects or veins detected on this face.
                        </p>
                      )}
                    </div>
                  )}

                  {currentResult.scale_cues && <p className="text-xs text-slate-500">Scale: {currentResult.scale_cues}</p>}
                  {currentResult.notes && <p className="text-xs text-slate-500">{currentResult.notes}</p>}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Text with a contrasting backing pill so it reads on any photo and any drawing colour. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, u: number, color: string, centre = false) {
  g.font = `bold ${14 * u}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  const w = g.measureText(text).width;
  const pad = 5 * u;
  const bx = centre ? x - w / 2 - pad : x;
  g.fillStyle = "rgba(0,0,0,0.7)";
  g.beginPath();
  g.roundRect(bx, y - 10 * u, w + pad * 2, 20 * u, 5 * u);
  g.fill();
  g.fillStyle = color === "#000000" ? "#ffffff" : color;
  g.textAlign = "left";
  g.fillText(text, bx + pad, y);
}

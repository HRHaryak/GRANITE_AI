"use client";

import { useSyncExternalStore } from "react";
import type { Cuboid, Prism } from "./geometry";

export type Source = "AI_VISION" | "AI_ADJUSTED" | "MANUAL" | "DEMO";

export type Weighbridge = {
  ticket: string;
  vehicle: string;
  tonnes: number;
  ts: string;
  /** Dispatch return / transit permit reference and declared quantity (MT). */
  permit?: string;
  dispatchedT?: number;
};

export type Slab = "ABOVE" | "BELOW";

export type Defect = {
  type: string;
  severity: "MINOR" | "MAJOR" | "REJECT";
  box: number[];
  reason: string;
};

export type FaceReport = {
  photo: number;
  face: string;
  reference_visible: boolean;
  reference_box: number[] | null;
  /** Bounding box of the block face inside the photo (normalised 0-1). */
  face_box?: number[] | null;
  /** Face corners in the photo, normalised: TL, TR, BR, BL as [x,y,x,y,x,y,x,y]. */
  face_quad?: number[] | null;
  /** Set when width/height were measured from the printed marker, not estimated. */
  measured?: "MARKER";
  width_cm: number | null;
  height_cm: number | null;
  usable_pct: number;
  explanation: string;
  defects: Defect[];
};

export type Dims = { l: number; w: number; h: number };

export type BlockRecord = {
  id: string;
  code: string;
  quarry: string;
  operator: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  ts: string;
  refLabel: string;
  refCm: number | null;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  fill: number;
  category: string;
  /** Final volume: dressed block volume (equals measured volume for already-dressed blocks). */
  volumeM3: number;
  weightT: number;
  slab?: Slab;
  /** Seigniorage rate applied, Rs per MT. */
  ratePerMT: number;
  fee: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  source: Source;
  shape: string;
  notes: string;
  defects: string[];
  thumbs: string[];
  box: { block?: number[]; ref?: number[] } | null;
  hash: string;
  weighbridge?: Weighbridge;
  condition?: "RAW" | "DRESSED";
  rawVolumeM3?: number;
  faces?: FaceReport[];
  /** Final dressed dimensions (cm). lengthCm/widthCm/heightCm hold the raw bounding box. */
  usable?: Dims;
  usableVolumeM3?: number;
  uncertaintyPct?: number;
  reasoning?: string;
  consistency?: string;
  tape?: Dims;
  /** Final block geometry as fractions of the raw bounding box. */
  viz?: { zones: Prism[]; cuboid: Cuboid };
};

export type Settings = {
  operator: string;
  quarry: string;
  density: number;
  tolerancePct: number;
  dressingCm: number;
  /** Side length (cm) of the printed ArUco marker, black square only. */
  markerCm: number;
  rates: Record<string, { above: number; below: number }>;
};

export const CATEGORIES = [
  "Black Galaxy",
  "Black Granite (other)",
  "Colour Group A",
  "Colour Group B",
  "Colour Others",
];

export const CATEGORY_INFO: Record<string, string> = {
  "Black Galaxy": "Black with golden/copper specks",
  "Black Granite (other)": "Black granite other than Black Galaxy",
  "Colour Group A":
    "Srikakulam Blue, Moon White, River White (Visakhapatnam), Leptinites (coastal dists.), Black Pearl (Prakasam & Guntur)",
  "Colour Group B": "Silver Waves, Madanapalli White, Iscon White",
  "Colour Others": "All other colour granites",
};

export const CATEGORY_COLORS: Record<string, string> = {
  "Black Galaxy": "#1e293b",
  "Black Granite (other)": "#475569",
  "Colour Group A": "#3b82f6",
  "Colour Group B": "#f59e0b",
  "Colour Others": "#14b8a6",
};

// Gangsaw threshold (cm). A block is ABOVE gangsaw if its longest side exceeds
// 270 cm or its second-longest side exceeds 150 cm; otherwise BELOW.
export const GANGSAW_LONG_CM = 270;
export const GANGSAW_SHORT_CM = 150;

export function slabFor(l: number, w: number, h: number): Slab {
  const [a, b] = [l, w, h].sort((x, y) => y - x);
  return a > GANGSAW_LONG_CM || b > GANGSAW_SHORT_CM ? "ABOVE" : "BELOW";
}

export const DEFAULT_SETTINGS: Settings = {
  operator: "Quarry Operator",
  quarry: "Demo Quarry – Prakasam",
  density: 2.7,
  tolerancePct: 10,
  dressingCm: 5,
  markerCm: 40,
  // Seigniorage rates currently in force (Rs per MT).
  rates: {
    "Black Galaxy": { above: 1830, below: 1530 },
    "Black Granite (other)": { above: 1520, below: 1300 },
    "Colour Group A": { above: 1660, below: 1410 },
    "Colour Group B": { above: 1360, below: 1200 },
    "Colour Others": { above: 940, below: 720 },
  },
};

export function rateFor(
  s: Settings,
  category: string,
  slab: Slab,
): number {
  const r = s.rates[category];
  return r ? (slab === "ABOVE" ? r.above : r.below) : 0;
}

export const REFERENCES = [
  { label: "A4 sheet (long side)", cm: 29.7 },
  { label: "1 m scale stick", cm: 100 },
  { label: "Measuring tape mark", cm: 50 },
];

const BLOCKS_KEY = "gm.blocks.v2";
const SETTINGS_KEY = "gm.settings.v2";

const listeners = new Set<() => void>();
const cache: Record<string, { raw: string | null; value: unknown }> = {};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const hit = cache[key];
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try {
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  cache[key] = { raw, value };
  return value;
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const EMPTY: BlockRecord[] = [];

export function useBlocks(): BlockRecord[] {
  return useSyncExternalStore(
    subscribe,
    () => read<BlockRecord[]>(BLOCKS_KEY, EMPTY),
    () => EMPTY,
  );
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribe,
    getSettings,
    () => DEFAULT_SETTINGS,
  );
}

// Memoised on the raw JSON so the snapshot identity is stable.
let lastSettingsRaw: string | null | undefined;
let lastSettings: Settings = DEFAULT_SETTINGS;
export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (raw !== lastSettingsRaw) {
    lastSettingsRaw = raw;
    try {
      lastSettings = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      lastSettings = DEFAULT_SETTINGS;
    }
  }
  return lastSettings;
}

export function getBlocks(): BlockRecord[] {
  return read<BlockRecord[]>(BLOCKS_KEY, EMPTY);
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export function saveBlock(b: BlockRecord) {
  const all = getBlocks().filter((x) => x.id !== b.id);
  try {
    write(BLOCKS_KEY, [b, ...all]);
  } catch {
    // Storage full: drop thumbnails of the oldest records and retry.
    const slim = [b, ...all].map((x, i) => (i > 5 ? { ...x, thumbs: [] } : x));
    write(BLOCKS_KEY, slim);
  }
}

export function deleteBlock(id: string) {
  write(
    BLOCKS_KEY,
    getBlocks().filter((x) => x.id !== id),
  );
}

export function clearDemo() {
  write(
    BLOCKS_KEY,
    getBlocks().filter((x) => x.source !== "DEMO"),
  );
}

export function computeVolume(
  l: number,
  w: number,
  h: number,
  fill: number,
) {
  return (l * w * h * fill) / 1_000_000;
}

export function nextBlockCode(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const n = getBlocks().filter((b) => b.code.includes(ymd)).length + 1;
  return `BLK-${ymd}-${String(n).padStart(3, "0")}`;
}

export function generateUUID(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // fallback if restricted
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function sha256(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return "unavailable";
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function variancePct(b: BlockRecord): number | null {
  if (!b.weighbridge || !b.weighbridge.tonnes) return null;
  return ((b.weightT - b.weighbridge.tonnes) / b.weighbridge.tonnes) * 100;
}

export async function fileToImage(
  file: File,
  maxPx: number,
  quality = 0.8,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function demoBlocks(s: Settings): BlockRecord[] {
  const mk = (
    i: number,
    cat: string,
    l: number,
    w: number,
    h: number,
    fill: number,
    wb: number | null,
  ): BlockRecord => {
    const vol = computeVolume(l, w, h, fill);
    const wt = vol * s.density;
    const slab = slabFor(l, w, h);
    const rate = rateFor(s, cat, slab);
    return {
      id: `demo-${i}`,
      code: `DEMO-${String(i).padStart(3, "0")}`,
      quarry: s.quarry,
      operator: s.operator,
      lat: 15.5057,
      lng: 80.0499,
      accuracyM: 12,
      ts: new Date(Date.now() - i * 3_600_000 * 5).toISOString(),
      refLabel: "A4 sheet (long side)",
      refCm: 29.7,
      lengthCm: l,
      widthCm: w,
      heightCm: h,
      fill,
      category: cat,
      volumeM3: vol,
      weightT: wt,
      slab,
      ratePerMT: rate,
      fee: wt * rate,
      confidence: "MEDIUM",
      source: "DEMO",
      shape: "Sample data",
      notes: "Sample record for layout preview only.",
      defects: [],
      thumbs: [],
      box: null,
      hash: "demo",
      weighbridge:
        wb == null
          ? undefined
          : {
              ticket: `WB-${1000 + i}`,
              vehicle: "AP 27 TX 4821",
              tonnes: wb,
              ts: new Date().toISOString(),
            },
    };
  };
  return [
    mk(1, "Black Galaxy", 240, 130, 110, 0.92, 24.1),
    mk(2, "Colour Group A", 210, 120, 100, 0.85, 15.9),
    mk(3, "Black Granite (other)", 290, 160, 120, 0.9, null),
    mk(4, "Colour Others", 190, 110, 95, 0.78, 12.6),
  ];
}

export function addDemo(s: Settings) {
  const existing = getBlocks().filter((b) => b.source !== "DEMO");
  write(BLOCKS_KEY, [...existing, ...demoBlocks(s)]);
}

export function omepsPayload(b: BlockRecord) {
  const v = variancePct(b);
  return {
    schema: "granitemeasure.omeps-block/1",
    block: {
      id: b.id,
      code: b.code,
      captured_at: b.ts,
      quarry: b.quarry,
      operator: b.operator,
      gps: { lat: b.lat, lng: b.lng, accuracy_m: b.accuracyM },
    },
    measurement: {
      method: b.source,
      condition: b.condition ?? null,
      confidence: b.confidence,
      uncertainty_pct: b.uncertaintyPct ?? null,
      dimensions_cm: b.usable
        ? { l: b.usable.l, w: b.usable.w, h: b.usable.h }
        : { l: b.lengthCm, w: b.widthCm, h: b.heightCm },
      raw_dimensions_cm: { l: b.lengthCm, w: b.widthCm, h: b.heightCm },
      volume_m3: +b.volumeM3.toFixed(3),
      density_t_m3: +(b.weightT / (b.volumeM3 || 1)).toFixed(2),
      weight_mt: +b.weightT.toFixed(3),
    },
    seigniorage: {
      category: b.category,
      slab: b.slab ?? null,
      rate_rs_per_mt: b.ratePerMT,
      indicative_fee_rs: Math.round(b.fee),
    },
    weighbridge: b.weighbridge ?? null,
    cross_validation:
      v == null
        ? null
        : { variance_pct: +v.toFixed(2), within_tolerance: Math.abs(v) <= 10 },
    audit: { record_sha256: b.hash },
  };
}

export function ledgerCsv(blocks: BlockRecord[]): string {
  const head = [
    "block_code","captured_at","quarry","lat","lng","condition","category","slab",
    "length_cm","width_cm","height_cm","volume_m3","weight_mt","rate_rs_per_mt",
    "fee_rs","weighbridge_ticket","weighbridge_mt","dispatch_permit","dispatched_mt",
    "variance_pct","method","record_sha256",
  ];
  const rows = blocks.map((b) => {
    const d = b.usable ?? { l: b.lengthCm, w: b.widthCm, h: b.heightCm };
    const v = variancePct(b);
    return [
      b.code, b.ts, b.quarry, b.lat ?? "", b.lng ?? "", b.condition ?? "", b.category,
      b.slab ?? "", d.l, d.w, d.h, b.volumeM3.toFixed(3), b.weightT.toFixed(3),
      b.ratePerMT, Math.round(b.fee), b.weighbridge?.ticket ?? "",
      b.weighbridge?.tonnes ?? "", b.weighbridge?.permit ?? "",
      b.weighbridge?.dispatchedT ?? "", v == null ? "" : v.toFixed(2), b.source, b.hash,
    ]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

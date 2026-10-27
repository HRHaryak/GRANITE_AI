"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { AlertTriangle, Download, ImagePlus, Loader2, ScanLine } from "lucide-react";
import { fileToImage, useSettings } from "../../../lib/m/store";
import { Card, Header } from "../../../components/m/ui";

type Pt = [number, number];
type Measurement = { label: string; kind?: string; p1: Pt; p2: Pt; value_cm: number | null };
type Result = {
  is_granite?: boolean;
  scale_basis?: string;
  scale_cues?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  uncertainty_pct?: number;
  notes?: string;
  outline?: Pt[];
  measurements?: Measurement[];
  defects?: { type: string; severity?: string; box: [number, number, number, number] }[];
};

const COLORS = ["#ff2d55", "#ffd60a", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2", "#ffffff", "#000000"];

const fmt = (cm: number | null) => (cm == null ? "?" : cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`);

const valid = (p: unknown): p is Pt =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n));

const SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "EXTRA"] as const;
const REQUIRED = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;
const HINT: Record<string, string> = {
  FRONT: "Longest side",
  BACK: "Opposite of front",
  LEFT: "Left end",
  RIGHT: "Right end",
  TOP: "From above (opt.)",
  EXTRA: "Close-up (opt.)",
};

type Item = {
  src: string;
  status: "idle" | "busy" | "done" | "error";
  result?: Result;
  error?: string;
  defects: boolean;
  outline: boolean;
};
type Dim = "length" | "width" | "height";
const DIMS: Dim[] = ["length", "width", "height"];

/** Which dimension a measurement is, from the model's kind or its label. */
function dimOf(m: Measurement): Dim | null {
  const t = `${m.kind ?? ""} ${m.label}`.toLowerCase();
  return DIMS.find((d) => t.includes(d)) ?? null;
}

const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Per photo: mean of its readings for each dimension. */
function perPhoto(r?: Result): Partial<Record<Dim, number>> {
  const out: Partial<Record<Dim, number>> = {};
  for (const d of DIMS) {
    const v = (r?.measurements ?? []).filter((m) => dimOf(m) === d && m.value_cm != null).map((m) => m.value_cm as number);
    if (v.length) out[d] = avg(v);
  }
  return out;
}

function draw(c: HTMLCanvasElement, img: HTMLImageElement, result: Result | undefined, color: string, showOutline: boolean, showDefects: boolean) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, W, H);
  if (!result) return;
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
    g.globalAlpha = 0.15;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 2 * u;
    g.setLineDash([8 * u, 6 * u]);
    g.stroke();
    g.setLineDash([]);
  }

  if (showDefects) {
    for (const d of result.defects ?? []) {
      if (!Array.isArray(d.box) || d.box.length !== 4) continue;
      const [x1, y1, x2, y2] = d.box;
      g.strokeStyle = color;
      g.lineWidth = 2 * u;
      g.setLineDash([4 * u, 4 * u]);
      g.strokeRect(x1 * W, y1 * H, (x2 - x1) * W, (y2 - y1) * H);
      g.setLineDash([]);
      label(g, d.type, x1 * W, y1 * H - 4 * u, u, color);
    }
  }

  for (const m of result.measurements ?? []) {
    if (!valid(m.p1) || !valid(m.p2)) continue;
    const [ax, ay, bx, by] = [X(m.p1), Y(m.p1), X(m.p2), Y(m.p2)];
    // Dark halo under the line keeps it visible on any colour of stone.
    const strokes = [["rgba(0,0,0,0.55)", 6 * u], [color, 3 * u]] as const;
    for (const [stroke, w] of strokes) {
      g.strokeStyle = stroke;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
    const tick = 9 * u;
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      for (const [stroke, w] of strokes) {
        g.strokeStyle = stroke;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x + Math.cos(ang) * tick, y + Math.sin(ang) * tick);
        g.lineTo(x - Math.cos(ang) * tick, y - Math.sin(ang) * tick);
        g.stroke();
      }
    }
    label(g, `${m.label}: ${fmt(m.value_cm)}`, (ax + bx) / 2, (ay + by) / 2, u, color, true);
  }
}

function PhotoCanvas({ item, color }: { item: Item; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const render = useCallback(() => {
    if (ref.current && imgRef.current) draw(ref.current, imgRef.current, item.result, color, item.outline, item.defects);
  }, [item.result, color, item.outline, item.defects]);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      render();
    };
    img.src = item.src;
  }, [item.src, render]);
  useEffect(render, [render]);
  return <canvas ref={ref} className="w-full rounded-xl" />;
}

/** One-time cache so the same photo in the same slot shows the same numbers again. */
async function hashOf(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type SetResult = {
  scale_basis?: string;
  scale_cues?: string;
  confidence?: Result["confidence"];
  uncertainty_pct?: number;
  notes?: string;
  faces?: (Result & { face: string; slot_warning?: string })[];
};

/** All photos go in one request so the AI uses one scale for the whole block. */
async function measureSet(images: { face: string; data: string }[]): Promise<SetResult> {
  const key = `gm.an.a3.${await hashOf(images.map((i) => `${i.face}|${i.data}`).join("\n"))}`;
  try {
    const hit = window.localStorage.getItem(key);
    if (hit) return JSON.parse(hit) as SetResult;
  } catch {
    // unreadable cache: ask again
  }
  const res = await fetch("/api/analyse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage full: skip caching
  }
  return data as SetResult;
}

export default function AnalysePage() {
  const s = useSettings();
  const [items, setItems] = useState<Partial<Record<(typeof SLOTS)[number], Item>>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [custom, setCustom] = useState("#ff2d55");
  const fileRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<(typeof SLOTS)[number]>("FRONT");

  const fresh = (src: string): Item => ({ src, status: "idle", defects: true, outline: true });

  async function addOne(files: FileList | null) {
    const f = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    const slot = slotRef.current;
    setLoading(slot);
    setError("");
    try {
      const src = await fileToImage(f, 1600, 0.85);
      setItems((cur) => ({ ...cur, [slot]: fresh(src) }));
    } catch {
      setError("Could not read that image.");
    } finally {
      setLoading("");
    }
  }

  // Bulk upload fills the empty slots in order FRONT, BACK, LEFT, RIGHT, TOP, EXTRA.
  async function addMany(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (multiRef.current) multiRef.current.value = "";
    if (!list.length) return;
    setLoading("ALL");
    setError("");
    try {
      const srcs = await Promise.all(list.slice(0, SLOTS.length).map((f) => fileToImage(f, 1600, 0.85)));
      setItems((cur) => {
        const next = { ...cur };
        const empty = SLOTS.filter((k) => !next[k]);
        srcs.forEach((src, i) => {
          if (empty[i]) next[empty[i]] = fresh(src);
        });
        return next;
      });
      if (list.length > SLOTS.length) setError(`Only ${SLOTS.length} photos are allowed; extra photos were ignored.`);
    } catch {
      setError("Could not read one of the images.");
    } finally {
      setLoading("");
    }
  }

  const patch = (k: (typeof SLOTS)[number], p: Partial<Item>) =>
    setItems((cur) => (cur[k] ? { ...cur, [k]: { ...cur[k]!, ...p } } : cur));

  const taken = SLOTS.filter((k) => items[k]);
  const ready = REQUIRED.every((k) => items[k]);

  async function analyseAll() {
    setBusy(true);
    setError("");
    taken.forEach((k) => patch(k, { status: "busy", error: undefined }));
    try {
      const set = await measureSet(taken.map((k) => ({ face: k, data: items[k]!.src })));
      taken.forEach((k) => {
        const f = (set.faces ?? []).find((x) => x.face === k);
        if (!f) return patch(k, { status: "error", error: "No reading came back for this photo." });
        patch(k, {
          status: "done",
          result: {
            ...f,
            scale_basis: set.scale_basis,
            scale_cues: set.scale_cues,
            confidence: set.confidence,
            uncertainty_pct: set.uncertainty_pct,
            notes: f.slot_warning || undefined,
          },
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      setError(msg);
      taken.forEach((k) => patch(k, { status: "error", error: msg }));
    }
    setBusy(false);
  }

  function download(k: string) {
    const c = document.getElementById(`canvas-${k}`)?.querySelector("canvas");
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `granite-${k.toLowerCase()}.png`;
    a.click();
  }

  const done = taken.filter((k) => items[k]!.status === "done");
  const rows = done.map((k) => perPhoto(items[k]!.result));
  const final = Object.fromEntries(
    DIMS.map((d) => {
      const v = rows.map((r) => r[d]).filter((x): x is number => x != null);
      return [d, v.length ? { value: avg(v), n: v.length } : null];
    }),
  ) as Record<Dim, { value: number; n: number } | null>;
  const complete = DIMS.every((d) => final[d]);
  const volume = complete ? (final.length!.value * final.width!.value * final.height!.value) / 1_000_000 : 0;
  const weight = volume * s.density;
  const unc = done.length ? Math.round(avg(done.map((k) => items[k]!.result?.uncertainty_pct ?? 15))) : 0;
  const missing = REQUIRED.filter((k) => !items[k]);

  return (
    <div>
      <Header title="Analyse images" subtitle="Front, back, left and right of one block" back="/m" />
      <div className="space-y-4 p-4">
        {error && (
          <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => addOne(e.target.files)} />
        <input ref={multiRef} type="file" accept="image/*" multiple hidden onChange={(e) => addMany(e.target.files)} />

        <Card>
          <p className="text-sm font-semibold text-slate-700">
            Block photos ({taken.length}/{SLOTS.length})
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Front, back, left and right are required. Top and extra are optional. Front and back give the length, left and right give the width, and every photo gives the height.
          </p>
          <button
            onClick={() => multiRef.current?.click()}
            disabled={loading === "ALL"}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#15949b]/60 bg-teal-50 py-3 text-sm font-semibold text-[#0f7e84] active:bg-teal-100"
          >
            {loading === "ALL" ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
            Select photos (fills the empty slots in order)
          </button>
          <div className="grid grid-cols-3 gap-2">
            {SLOTS.map((k) => {
              const it = items[k];
              return (
                <div key={k}>
                  <button
                    onClick={() => {
                      slotRef.current = k;
                      fileRef.current?.click();
                    }}
                    className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 ${it ? "border-transparent" : "border-dashed border-slate-300 bg-slate-50 text-slate-400"}`}
                  >
                    {it ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.src} alt={k} className="h-full w-full object-cover" />
                    ) : loading === k ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    {it && (
                      <span
                        role="button"
                        aria-label={`Remove ${k}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setItems((cur) => {
                            const n = { ...cur };
                            delete n[k];
                            return n;
                          });
                        }}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      >
                        <X size={12} />
                      </span>
                    )}
                  </button>
                  <p className="mt-1 text-center text-[10px] font-bold text-slate-600">{k}</p>
                  <p className="text-center text-[9px] leading-tight text-slate-400">{HINT[k] ?? ""}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <button
          onClick={analyseAll}
          disabled={!ready || busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
          {busy ? "Measuring…" : !ready ? `Add ${missing.join(", ").toLowerCase()}` : done.length ? "Measure again" : `Measure ${taken.length} photos`}
        </button>

        {done.length > 0 && (
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
          </Card>
        )}

        {taken.map((k) => {
          const it = items[k]!;
          if (it.status === "idle") return null;
          const defects = it.result?.defects ?? [];
          return (
            <Card key={k} className="space-y-2 p-2">
              <p className="px-1 text-xs font-bold text-slate-600">{k} photo</p>
              {it.status === "busy" && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={18} /> Measuring…
                </div>
              )}
              {it.status === "error" && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{it.error}</p>}
              {it.status === "done" && (
                <>
                  <div id={`canvas-${k}`}>
                    <PhotoCanvas item={it} color={color} />
                  </div>
                  <div className="flex gap-4 px-1 text-xs text-slate-600">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={it.defects} onChange={(e) => patch(k, { defects: e.target.checked })} />
                      Show defects ({defects.length})
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={it.outline} onChange={(e) => patch(k, { outline: e.target.checked })} />
                      Outline
                    </label>
                  </div>
                  <div className="space-y-1 px-1">
                    {(it.result?.measurements ?? []).map((m, i) => (
                      <div key={i} className="flex justify-between border-b border-slate-100 py-1 text-sm last:border-0">
                        <span className="text-slate-600">{m.label}</span>
                        <span className="font-semibold text-slate-800">{fmt(m.value_cm)}</span>
                      </div>
                    ))}
                    {(it.result?.measurements ?? []).length === 0 && (
                      <p className="text-xs text-slate-500">No measurable edges found in this photo.</p>
                    )}
                    {it.defects &&
                      defects.map((d, i) => (
                        <p key={i} className="text-xs text-slate-600">
                          Defect: <span className="font-semibold">{d.type}</span>
                          {d.severity ? ` (${d.severity.toLowerCase()})` : ""}
                        </p>
                      ))}
                    {it.result?.notes && <p className="text-xs font-semibold text-amber-700">Check this photo: {it.result.notes}</p>}
                    {it.result?.scale_cues && <p className="text-xs text-slate-500">Scale: {it.result.scale_cues}</p>}
                  </div>
                  <button
                    onClick={() => download(k)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700"
                  >
                    <Download size={14} /> Save image
                  </button>
                </>
              )}
            </Card>
          );
        })}

        {done.length > 0 && (
          <div className="rounded-3xl bg-gradient-to-br from-[#14532d] to-[#16a34a] p-5 text-white">
            <p className="text-xs uppercase tracking-wide text-green-100">Block result (average of {done.length} photos)</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {DIMS.map((d) => (
                <div key={d} className="rounded-xl bg-white/15 p-2">
                  <p className="text-[11px] capitalize text-green-100">{d}</p>
                  <p className="text-lg font-bold">{final[d] ? fmt(final[d]!.value) : "—"}</p>
                  <p className="text-[10px] text-green-100">{final[d] ? `from ${final[d]!.n} photo${final[d]!.n > 1 ? "s" : ""}` : "not found"}</p>
                </div>
              ))}
            </div>
            {complete ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-green-100">Volume</p>
                  <p className="text-xl font-bold">{volume.toFixed(2)} m³</p>
                </div>
                <div>
                  <p className="text-[11px] text-green-100">Weight @ {s.density} t/m³</p>
                  <p className="text-xl font-bold">{weight.toFixed(2)} MT</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-200">
                A length, width and height were not all found, so volume and weight can&apos;t be worked out. Check the photos marked above and measure again.
              </p>
            )}
            <p className="mt-3 text-[11px] text-green-100">
              Each value is the average over the photos that showed it. Estimated accuracy about ±{unc}%. Weight uses a solid box (length × width × height) at the density in Settings.
            </p>
          </div>
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

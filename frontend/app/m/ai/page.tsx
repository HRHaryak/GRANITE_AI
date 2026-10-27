"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, ImagePlus, Loader2, Plus, ScanLine, X } from "lucide-react";
import { fileToImage, useSettings } from "../../../lib/m/store";
import { faceLines, LINES, type FaceGeo, type Gross, type Kind, type Pt } from "../../../lib/m/faceLines";
import { Card, Header } from "../../../components/m/ui";

type Defect = { type: string; severity?: string; box: [number, number, number, number] };
type FaceRead = {
  face: string;
  slot_warning?: string;
  face_quad?: number[];
  outline?: Pt[];
  defects?: Defect[];
};
type SetRead = {
  is_granite?: boolean;
  scale_basis?: string;
  scale_cues?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  uncertainty_pct?: number;
  notes?: string;
  gross?: Gross;
  faces?: FaceRead[];
};

const COLORS = ["#ff2d55", "#ffd60a", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2", "#ffffff", "#000000"];
const SLOTS = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"] as const;
type Slot = (typeof SLOTS)[number];
const REQUIRED: Slot[] = ["FRONT", "BACK", "LEFT", "RIGHT"];
const HINT: Record<Slot, string> = {
  FRONT: "Longest side",
  BACK: "Opposite of front",
  LEFT: "Left end",
  RIGHT: "Right end",
  TOP: "From above (opt.)",
};
const KINDS: Kind[] = ["length", "width", "height"];
const LETTER: Record<Kind, string> = { length: "L", width: "W", height: "H" };

type Item = {
  src: string;
  status: "idle" | "busy" | "done" | "error";
  error?: string;
  read?: FaceRead;
  defects: boolean;
  lines: boolean;
};

const m2 = (cm: number) => `${(cm / 100).toFixed(2)} m`;
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Text on a dark pill so it reads on any photo and any drawing colour. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: "left" | "center" = "left") {
  g.font = `bold ${size}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  const w = g.measureText(text).width;
  const pad = size * 0.35;
  const bx = align === "center" ? x - w / 2 - pad : x;
  g.fillStyle = "rgba(0,0,0,0.72)";
  g.beginPath();
  g.roundRect(bx, y - size * 0.7, w + pad * 2, size * 1.4, size * 0.35);
  g.fill();
  g.fillStyle = isDark(color) ? "#ffffff" : color;
  g.fillText(text, bx + pad, y);
}

function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 90;
}

function draw(c: HTMLCanvasElement, img: HTMLImageElement, read: FaceRead | undefined, geo: FaceGeo | null, color: string, show: { defects: boolean; lines: boolean }) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, W, H);
  if (!read) return;
  const u = Math.max(W, H) / 800; // scale line widths and text with the image
  g.lineCap = "round";
  g.lineJoin = "round";

  if (show.defects) {
    for (const d of read.defects ?? []) {
      if (!Array.isArray(d.box) || d.box.length !== 4) continue;
      const [x1, y1, x2, y2] = d.box;
      g.strokeStyle = color;
      g.lineWidth = 2 * u;
      g.setLineDash([4 * u, 4 * u]);
      g.strokeRect(x1 * W, y1 * H, (x2 - x1) * W, (y2 - y1) * H);
      g.setLineDash([]);
      label(g, d.type, x1 * W, y1 * H - 10 * u, 11 * u, color);
    }
  }

  if (show.lines && geo) {
    for (const ln of [...geo.lines, geo.heightLine]) {
      const [ax, ay, bx, by] = [ln.p1[0] * W, ln.p1[1] * H, ln.p2[0] * W, ln.p2[1] * H];
      const strokes = [["rgba(0,0,0,0.55)", 4.5 * u], [color, 2 * u]] as const;
      for (const [stroke, w] of strokes) {
        g.strokeStyle = stroke;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      // End ticks
      const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        for (const [stroke, w] of strokes) {
          g.strokeStyle = stroke;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(x + Math.cos(ang) * 5 * u, y + Math.sin(ang) * 5 * u);
          g.lineTo(x - Math.cos(ang) * 5 * u, y - Math.sin(ang) * 5 * u);
          g.stroke();
        }
      }
      // Horizontal lines are labelled at their left end, vertical lines at their lower end.
      const text = `${LETTER[ln.kind]} ${m2(ln.cm)}`;
      const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
      if (horizontal) {
        const [x, y] = ax <= bx ? [ax, ay] : [bx, by];
        label(g, text, x + 7 * u, y, 10 * u, color);
      } else {
        const [x, y] = ay >= by ? [ax, ay] : [bx, by];
        label(g, text, x, y - 12 * u, 10 * u, color, "center");
      }
    }
  }
}

function PhotoCanvas({ item, geo, color }: { item: Item; geo: FaceGeo | null; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const render = useCallback(() => {
    if (ref.current && imgRef.current) {
      draw(ref.current, imgRef.current, item.read, geo, color, { defects: item.defects, lines: item.lines });
    }
  }, [item.read, item.defects, item.lines, geo, color]);
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

async function hashOf(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** All photos go in one request so the AI uses one scale for the whole block. */
async function measureSet(images: { face: string; data: string }[]): Promise<SetRead> {
  const key = `gm.ai.b1.${await hashOf(images.map((i) => `${i.face}|${i.data}`).join("\n"))}`;
  try {
    const hit = window.localStorage.getItem(key);
    if (hit) return JSON.parse(hit) as SetRead;
  } catch {
    // unreadable cache: ask again
  }
  const res = await fetch("/api/ai-measure", {
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
  return data as SetRead;
}

export default function AiPage() {
  const s = useSettings();
  const [items, setItems] = useState<Partial<Record<Slot, Item>>>({});
  const [set, setSet] = useState<SetRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [custom, setCustom] = useState("#ff2d55");
  const fileRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<Slot>("FRONT");

  const fresh = (src: string): Item => ({ src, status: "idle", defects: true, lines: true });

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

  // Bulk upload fills the empty slots in order FRONT, BACK, LEFT, RIGHT, TOP.
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

  const patch = (k: Slot, p: Partial<Item>) => setItems((cur) => (cur[k] ? { ...cur, [k]: { ...cur[k]!, ...p } } : cur));

  const taken = SLOTS.filter((k) => items[k]);
  const ready = REQUIRED.every((k) => items[k]);
  const missing = REQUIRED.filter((k) => !items[k]);

  async function analyseAll() {
    setBusy(true);
    setError("");
    taken.forEach((k) => patch(k, { status: "busy", error: undefined }));
    try {
      const data = await measureSet(taken.map((k) => ({ face: k, data: items[k]!.src })));
      setSet(data);
      taken.forEach((k) => {
        const f = (data.faces ?? []).find((x) => x.face === k);
        if (f) patch(k, { status: "done", read: f });
        else patch(k, { status: "error", error: "No reading came back for this photo." });
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

  // Lines for every face: pure geometry from the AI's corners and outline.
  const geos = useMemo(() => {
    const out: Partial<Record<Slot, FaceGeo | null>> = {};
    for (const k of SLOTS) {
      const r = items[k]?.read;
      out[k] = r ? faceLines(k, r.face_quad, r.outline, set?.gross) : null;
    }
    return out;
  }, [items, set]);

  // Per face: the mean of its ten length lines, and its height from the band the lines span.
  // Then the mean of those face values for each dimension.
  type Row = { face: Slot; kind: Kind; n: number; min: number; mean: number; max: number };
  const faceStats: Row[] = done.flatMap((k) => {
    const geo = geos[k];
    if (!geo) return [];
    const v = geo.lines.map((l) => l.cm);
    return [
      { face: k, kind: geo.hKind, n: v.length, min: Math.min(...v), mean: avg(v), max: Math.max(...v) },
      { face: k, kind: geo.vKind, n: 0, min: geo.heightCm, mean: geo.heightCm, max: geo.heightCm },
    ];
  });
  const final = Object.fromEntries(
    KINDS.map((kind) => {
      const rows = faceStats.filter((r) => r.kind === kind);
      if (!rows.length) return [kind, null];
      const means = rows.map((r) => r.mean);
      return [
        kind,
        {
          value: avg(means),
          faces: rows.length,
          lines: rows.reduce((a, r) => a + r.n, 0),
          spreadPct: rows.length > 1 ? ((Math.max(...means) - Math.min(...means)) / avg(means)) * 100 : 0,
        },
      ];
    }),
  ) as Record<Kind, { value: number; faces: number; lines: number; spreadPct: number } | null>;
  const complete = KINDS.every((k) => final[k]);
  const volume = complete ? (final.length!.value * final.width!.value * final.height!.value) / 1_000_000 : 0;
  const weight = volume * s.density;
  const unc = set?.uncertainty_pct ?? 0;

  return (
    <div>
      <Header title="AI measure" subtitle="10 length lines per face" back="/m" />
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
            Front, back, left and right are required; top is optional. Take each photo square-on to the face, with the whole face in view.
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
                  <p className="text-center text-[9px] leading-tight text-slate-400">{HINT[k]}</p>
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
          const geo = geos[k] ?? null;
          const defects = it.read?.defects ?? [];
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
                    <PhotoCanvas item={it} geo={geo} color={color} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-600">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={it.lines} onChange={(e) => patch(k, { lines: e.target.checked })} />
                      Measurement lines ({geo?.lines.length ?? 0})
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={it.defects} onChange={(e) => patch(k, { defects: e.target.checked })} />
                      Show defects ({defects.length})
                    </label>
                  </div>
                  {geo ? (
                    <div className="space-y-2 px-1">
                      {(() => {
                        const v = geo.lines.map((l) => l.cm);
                        return (
                          <>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="flex justify-between text-sm">
                                <span className="font-semibold capitalize text-slate-700">
                                  {geo.hKind} ({v.length} lines)
                                </span>
                                <span className="font-bold text-slate-900">{m2(avg(v))}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                lowest {m2(Math.min(...v))} · highest {m2(Math.max(...v))}
                              </p>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                                {v.map((x, i) => `${i + 1}. ${(x / 100).toFixed(2)}`).join("   ")}
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-2">
                              <div className="flex justify-between text-sm">
                                <span className="font-semibold capitalize text-slate-700">{geo.vKind}</span>
                                <span className="font-bold text-slate-900">{m2(geo.heightCm)}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {LINES} gaps of {m2(geo.gapCm)} between the lines
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="px-1 text-xs text-amber-700">
                      Could not trace this face&apos;s corners, so no lines were drawn. Retake the photo square-on with the whole face in view.
                    </p>
                  )}
                  {it.read?.slot_warning && (
                    <p className="px-1 text-xs font-semibold text-amber-700">Check this photo: {it.read.slot_warning}</p>
                  )}
                  {defects.length > 0 && it.defects && (
                    <div className="px-1">
                      {defects.map((d, i) => (
                        <p key={i} className="text-xs text-slate-600">
                          Defect: <span className="font-semibold">{d.type}</span>
                          {d.severity ? ` (${d.severity.toLowerCase()})` : ""}
                        </p>
                      ))}
                    </div>
                  )}
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
          <>
            <div className="rounded-3xl bg-gradient-to-br from-[#14532d] to-[#16a34a] p-5 text-white">
              <p className="text-xs uppercase tracking-wide text-green-100">
                Block result (average of {done.length} faces)
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {KINDS.map((kind) => (
                  <div key={kind} className="rounded-xl bg-white/15 p-2">
                    <p className="text-[11px] capitalize text-green-100">{kind}</p>
                    <p className="text-lg font-bold">{final[kind] ? m2(final[kind]!.value) : "—"}</p>
                    <p className="text-[10px] text-green-100">
                      {final[kind]
                        ? `${final[kind]!.lines ? `${final[kind]!.lines} lines, ` : ""}${final[kind]!.faces} face${final[kind]!.faces > 1 ? "s" : ""}`
                        : "not found"}
                    </p>
                  </div>
                ))}
              </div>
              {complete ? (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-green-100">Volume</p>
                    <p className="text-xl font-bold">{volume.toFixed(2)} m³</p>
                    {unc > 0 && (
                      <p className="text-[11px] text-green-100">
                        likely {(volume * (1 - unc / 100)).toFixed(2)} – {(volume * (1 + unc / 100)).toFixed(2)} m³
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-green-100">Weight @ {s.density} t/m³</p>
                    <p className="text-xl font-bold">{weight.toFixed(2)} MT</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-amber-200">
                  A length, width and height were not all found, so volume and weight can&apos;t be worked out. Check the photos above and measure again.
                </p>
              )}
              <p className="mt-3 text-[11px] text-green-100">Estimated accuracy about ±{unc}%.</p>
            </div>

            <Card className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">Face by face</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400">
                      <th className="py-1 pr-2 font-semibold">Face</th>
                      <th className="pr-2 font-semibold">Measures</th>
                      <th className="pr-2 font-semibold">Lines</th>
                      <th className="pr-2 font-semibold">Lowest</th>
                      <th className="pr-2 font-semibold">Average</th>
                      <th className="font-semibold">Highest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faceStats.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-2 font-semibold text-slate-700">{r.face}</td>
                        <td className="pr-2 capitalize">{r.kind}</td>
                        <td className="pr-2">{r.n || "gaps"}</td>
                        <td className="pr-2">{m2(r.min)}</td>
                        <td className="pr-2 font-semibold text-slate-800">{m2(r.mean)}</td>
                        <td>{m2(r.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {KINDS.filter((k) => final[k] && final[k]!.faces > 1).map((k) => (
                <p key={k} className="text-[11px] text-slate-500">
                  <span className="capitalize">{k}</span>: faces differ by {final[k]!.spreadPct.toFixed(1)}%
                  {final[k]!.spreadPct > 10 ? " — larger than expected, check these photos or tape-measure the block." : "."}
                </p>
              ))}
            </Card>

            <Card className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">How this result was worked out</p>
              <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
                <li>
                  <span className="font-semibold">Scale.</span>{" "}
                  {set?.scale_basis === "REFERENCE"
                    ? "A reference object of known size was used"
                    : set?.scale_basis === "SCENE_CUES"
                      ? "No ruler was found, so the size was judged from objects in the scene"
                      : set?.scale_basis === "NONE"
                        ? "Nothing gave a scale, so sizes are unreliable"
                        : "No reference was found, so a typical block size was assumed"}
                  {set?.scale_cues ? ` (${set.scale_cues})` : ""}. This sets the overall size and is the main source of the ±{unc}%.
                </li>
                <li>
                  <span className="font-semibold">Face outline.</span> For each photo the AI marks the four corners of the face and traces its real edge, including chipped or uneven parts. The outline is used for the measuring but is not drawn on the photo.
                </li>
                <li>
                  <span className="font-semibold">Perspective removed.</span> The face is flattened to a true-shape rectangle by computer geometry, so a face photographed at an angle is not stretched.
                </li>
                <li>
                  <span className="font-semibold">Ten lines.</span> Ten evenly spaced lines are laid across each face, from the top of its outline to the bottom, and each is measured from edge to edge. These are the face&apos;s lengths.
                </li>
                <li>
                  <span className="font-semibold">Height.</span> The face&apos;s height is the span the ten lines cover (ten equal gaps between them), so no separate height lines are needed.
                </li>
                <li>
                  <span className="font-semibold">Averages.</span> The ten lengths are averaged within each face, then faces are averaged: length from front, back (and top), width from left and right, height from every face.
                </li>
                <li>
                  <span className="font-semibold">Volume and weight.</span> Volume = length × width × height as a solid box. Weight = volume × {s.density} t/m³ (density in Settings).
                </li>
              </ol>
              <p className="rounded-xl bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">
                This is an estimate from photographs, not a tape measurement. The lines show how uneven the real edges are, but the overall scale is the AI&apos;s estimate unless a ruler or known object is in the photo. Verify on site before using it for royalty.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

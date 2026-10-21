"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ImagePlus, Loader2, ScanLine } from "lucide-react";
import { fileToImage } from "../../../lib/m/store";
import { Badge, Card, Header } from "../../../components/m/ui";

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
  defects?: { type: string; box: [number, number, number, number] }[];
};

const COLORS = ["#ff2d55", "#ffd60a", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2", "#ffffff", "#000000"];

const fmt = (cm: number | null) => (cm == null ? "?" : cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`);

const valid = (p: unknown): p is Pt =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n));

export default function AnalysePage() {
  const [image, setImage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [custom, setCustom] = useState("#ff2d55");
  const [showOutline, setShowOutline] = useState(true);
  const [showDefects, setShowDefects] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setError("");
    setResult(null);
    try {
      setImage(await fileToImage(f, 1600, 0.85));
    } catch {
      setError("Could not read that image.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function analyse() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      setResult(data as Result);
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
  }, [result, color, showOutline, showDefects]);

  // Reload the element when a new photo is chosen; redraw on any change.
  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = image;
  }, [image, draw]);

  function download() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "granite-measurements.png";
    a.click();
  }

  return (
    <div>
      <Header title="Analyse image" subtitle="Upload a photo, see it measured" back="/m" />
      <div className="space-y-4 p-4">
        {error && (
          <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />

        {!image ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#15949b]/60 bg-teal-50 py-14 text-sm font-semibold text-[#0f7e84] active:bg-teal-100"
          >
            <ImagePlus size={28} />
            Upload a block photo
          </button>
        ) : (
          <>
            <Card className="space-y-3 p-2">
              <canvas ref={canvasRef} className="w-full rounded-xl" />
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700"
                >
                  Change photo
                </button>
                {result && (
                  <button
                    onClick={download}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700"
                  >
                    <Download size={14} /> Save image
                  </button>
                )}
              </div>
            </Card>

            <button
              onClick={analyse}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
              {busy ? "Measuring…" : result ? "Measure again" : "Measure this photo"}
            </button>

            {result && (
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
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} />
                      Block outline
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={showDefects} onChange={(e) => setShowDefects(e.target.checked)} />
                      Defects
                    </label>
                  </div>
                </Card>

                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {result.confidence && (
                      <Badge tone={result.confidence === "HIGH" ? "ok" : result.confidence === "MEDIUM" ? "warn" : "bad"}>
                        {result.confidence} confidence
                      </Badge>
                    )}
                    {result.uncertainty_pct != null && <Badge tone="mute">±{result.uncertainty_pct}%</Badge>}
                    {result.scale_basis && <Badge tone="info">{result.scale_basis}</Badge>}
                  </div>
                  {(result.measurements ?? []).map((m, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-100 py-1 text-sm last:border-0">
                      <span className="text-slate-600">{m.label}</span>
                      <span className="font-semibold text-slate-800">{fmt(m.value_cm)}</span>
                    </div>
                  ))}
                  {(result.measurements ?? []).length === 0 && (
                    <p className="text-xs text-slate-500">No measurable edges were found in this photo.</p>
                  )}
                  {result.scale_cues && <p className="text-xs text-slate-500">Scale: {result.scale_cues}</p>}
                  {result.notes && <p className="text-xs text-slate-500">{result.notes}</p>}
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

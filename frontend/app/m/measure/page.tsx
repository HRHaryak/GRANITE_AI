"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Images,
  Plus,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_INFO,
  computeVolume,
  fileToImage,
  generateUUID,
  nextBlockCode,
  rateFor,
  saveBlock,
  sha256,
  slabFor,
  useSettings,
  type BlockRecord,
  type Dims,
  type FaceReport,
  type Source,
} from "../../../lib/m/store";
import {
  bestCuboid,
  explain,
  faceUseful,
  finalDims,
  standardDressedDims,
  zonesFromFaces,
} from "../../../lib/m/geometry";
import { Badge, Card, FaceCards, Header } from "../../../components/m/ui";
import { BlockViz } from "../../../components/m/BlockViz";
import { detectMarker, refineWithMarkers, type MarkerHit } from "../../../lib/m/marker";
import { LiveCamera } from "../../../components/m/LiveCamera";
import { MethodCard } from "../../../components/m/MethodCard";

type Photo = { full: string; thumb: string; marker: MarkerHit | null };
type Ai = {
  is_granite: boolean;
  stone_state_detected?: "RAW" | "DRESSED";
  scale_basis?: "REFERENCE" | "SCENE_CUES" | "NONE" | "MARKER";
  scale_cues?: string;
  category: string;
  shape: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  gross: {
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    fill_factor: number;
    uncertainty_pct: number;
  };
  consistency_notes: string;
  notes: string;
  samples?: number;
  faces: FaceReport[];
};
type Step = "photos" | "analyzing" | "result";

const STEPS = ["Photos", "Analyse", "Result"];
const FACES = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"] as const;
const SLOTS = [...FACES, "EXTRA"] as const;
const SLOT_HINT: Record<string, string> = {
  FRONT: "Longest side",
  BACK: "Opposite of front",
  LEFT: "Left end",
  RIGHT: "Right end",
  TOP: "From above",
  EXTRA: "Optional close-up",
};

const m = (cm: number) => `${(cm / 100).toFixed(2)} m (${cm.toFixed(0)} cm)`;

export default function MeasurePage() {
  const router = useRouter();
  const s = useSettings();
  const [step, setStep] = useState<Step>("photos");
  const [code, setCode] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsErr, setGpsErr] = useState("");
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const [busy, setBusy] = useState("");
  const [sheet, setSheet] = useState<string | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<Ai | null>(null);
  const [source, setSource] = useState<Source>("MANUAL");
  const [condition, setCondition] = useState<"RAW" | "DRESSED">("RAW");
  const [dims, setDims] = useState<Dims>({ l: 0, w: 0, h: 0 });
  const [tape, setTape] = useState({ l: "", w: "", h: "" });
  const [fill, setFill] = useState(0.85);
  const [category, setCategory] = useState("Colour Others");
  const [calcMode, setCalcMode] = useState<"STANDARD" | "DEFECT_CARVE">("STANDARD");
  const [ignoredDefects, setIgnoredDefects] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<string>("FRONT");
  const ts = useRef(new Date().toISOString());

  function toggleDefect(key: string) {
    setIgnoredDefects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    setCode(nextBlockCode());
    if (!navigator.geolocation) {
      setGpsErr("GPS not available on this device");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => setGpsErr(e.message || "Location permission denied"),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const taken = SLOTS.filter((k) => photos[k]);
  const ready = FACES.every((k) => photos[k]);

  async function load(f: File) {
    return {
      full: await fileToImage(f, 1280, 0.8),
      thumb: await fileToImage(f, 480, 0.6),
      marker: await detectMarker(f),
    };
  }

  async function setSlotFile(slot: string, f: File) {
    setBusy(slot);
    setError("");
    try {
      const photo = await load(f);
      setPhotos((p) => ({ ...p, [slot]: photo }));
    } catch {
      setError("Could not read that image.");
    } finally {
      setBusy("");
    }
  }

  async function addOne(files: FileList | null) {
    const f = files?.[0];
    if (f) await setSlotFile(slotRef.current, f);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Bulk upload: fills empty slots in order FRONT, BACK, LEFT, RIGHT, TOP, EXTRA.
  async function addMany(files: FileList | null) {
    if (!files) return;
    setBusy("ALL");
    try {
      const loaded = await Promise.all(Array.from(files).slice(0, 6).map(load));
      setPhotos((cur) => {
        const next = { ...cur };
        const empty = SLOTS.filter((k) => !next[k]);
        loaded.forEach((p, i) => {
          if (empty[i]) next[empty[i]] = p;
        });
        return next;
      });
    } catch {
      setError("Could not read one of the images.");
    } finally {
      setBusy("");
      if (multiRef.current) multiRef.current.value = "";
    }
  }

  async function analyse() {
    setStep("analyzing");
    setError("");
    try {
      const images = taken.map((k) => ({ data: photos[k].full, face: k }));
      // Same photos → same stored answer, even after a server restart.
      const cacheKey = `gm.ai.v3.${await sha256(images.map((i) => `${i.face}|${i.data}`).join("\n"))}`;
      let data: unknown = null;
      try {
        const hit = window.localStorage.getItem(cacheKey);
        if (hit) {
          const parsed = JSON.parse(hit);
          if (!JSON.stringify(parsed).includes("Set ANTHROPIC_API_KEY")) {
            data = parsed;
          }
        }
      } catch {
        data = null;
      }
      if (!data) {
        const res = await fetch("/api/measure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ images }),
        });
        data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // storage full: skip caching
        }
      }
      const r = data as Ai;
      r.faces = (r.faces ?? []).map((f) => ({ ...f, defects: f.defects ?? [] }));
      // Open-source metric scale: printed ArUco marker + homography, when a marker was found.
      const aiDims = {
        l: r.gross.length_cm ?? 0,
        w: r.gross.width_cm ?? 0,
        h: r.gross.height_cm ?? 0,
      };
      const ref = refineWithMarkers(
        r.faces,
        Object.fromEntries(taken.map((k) => [k, photos[k].marker])),
        s.markerCm,
        aiDims,
        r.gross.uncertainty_pct,
      );
      if (ref.used > 0 && ref.dims) {
        r.faces = ref.faces;
        r.gross = {
          ...r.gross,
          length_cm: ref.dims.l,
          width_cm: ref.dims.w,
          height_cm: ref.dims.h,
          uncertainty_pct: ref.uncertaintyPct ?? r.gross.uncertainty_pct,
        };
        r.scale_basis = "MARKER";
        r.scale_cues = `ArUco marker (${s.markerCm} cm) found on ${ref.used} of ${r.faces.length} photos${ref.notes ? "; " + ref.notes : ""}`;
        if (r.confidence === "LOW") r.confidence = "MEDIUM";
      }
      setAi(r);
      setDims({
        l: r.gross.length_cm ?? 0,
        w: r.gross.width_cm ?? 0,
        h: r.gross.height_cm ?? 0,
      });
      setFill(Math.min(1, Math.max(0.5, r.gross.fill_factor || 0.85)));
      setCategory(CATEGORIES.includes(r.category) ? r.category : "Colour Others");
      setCondition(r.stone_state_detected === "DRESSED" ? "DRESSED" : "RAW");
      setSource("AI_VISION");
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStep("photos");
    }
  }

  function manual() {
    setAi(null);
    setSource("MANUAL");
    setStep("result");
  }

  const zones = useMemo(
    () => (ai ? zonesFromFaces(ai.faces, ignoredDefects) : []),
    [ai, ignoredDefects],
  );
  const cuboid = useMemo(() => bestCuboid(zones), [zones]);
  const standardFin = useMemo(
    () => standardDressedDims(dims, s.dressingCm, condition === "RAW"),
    [dims, s.dressingCm, condition],
  );
  const carvedFin = useMemo(
    () => (ai ? finalDims(cuboid, dims, s.dressingCm, condition === "RAW") : dims),
    [ai, cuboid, dims, s.dressingCm, condition],
  );
  const fin: Dims = !ai
    ? dims
    : calcMode === "STANDARD" || zones.length === 0
      ? standardFin
      : carvedFin;
  const vol = computeVolume(fin.l, fin.w, fin.h, 1);
  const rawVol = computeVolume(dims.l, dims.w, dims.h, fill);
  const weight = vol * s.density;
  const slab = slabFor(fin.l, fin.w, fin.h);
  const rate = rateFor(s, category, slab);
  const fee = weight * rate;
  const unc = ai?.gross.uncertainty_pct ?? 0;
  const valid = fin.l > 0 && fin.w > 0 && fin.h > 0;
  const reasoning = ai
    ? explain(zones, cuboid, dims, fin, condition === "RAW", s.dressingCm, calcMode)
    : "";
  const useful = Object.fromEntries(
    (ai?.faces ?? []).map((f) => [f.face, faceUseful(f.face, fin)]),
  );

  const tapeNum = { l: Number(tape.l), w: Number(tape.w), h: Number(tape.h) };
  const diff = (a: number, t: number) => (t > 0 && a > 0 ? ((a - t) / t) * 100 : null);
  const tapeDiffs = (["l", "w", "h"] as const)
    .map((k) => diff(fin[k], tapeNum[k]))
    .filter((d): d is number => d != null);
  const tapeOk = tapeDiffs.length > 0 && tapeDiffs.every((d) => Math.abs(d) <= 10);

  function editDim(k: keyof Dims, v: number) {
    setDims((d) => ({ ...d, [k]: v }));
    if (source === "AI_VISION") setSource("AI_ADJUSTED");
  }

  async function save() {
    const hash = await sha256(
      JSON.stringify({ code, ts: ts.current, lat: gps?.lat, lng: gps?.lng, dims, fin, category, condition }),
    );
    const order = SLOTS.filter((k) => photos[k]);
    const rec: BlockRecord = {
      id: generateUUID(),
      code,
      quarry: s.quarry,
      operator: s.operator,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      accuracyM: gps ? Math.round(gps.acc) : null,
      ts: ts.current,
      refLabel: ai ? `${ai.scale_basis ?? "?"}: ${ai.scale_cues ?? ""}` : "manual",
      refCm: null,
      lengthCm: dims.l,
      widthCm: dims.w,
      heightCm: dims.h,
      fill,
      category,
      volumeM3: vol,
      condition,
      rawVolumeM3: ai && condition === "RAW" ? rawVol : undefined,
      weightT: weight,
      slab,
      ratePerMT: rate,
      fee,
      confidence: ai?.confidence ?? null,
      source,
      shape: ai?.shape ?? "Manual tape measurement",
      notes: ai?.notes ?? "",
      defects: ai ? ai.faces.flatMap((f) => f.defects.map((d) => `${f.face}: ${d.type}`)) : [],
      thumbs: order.map((k) => photos[k].thumb),
      box: null,
      hash,
      faces: ai?.faces,
      usable: fin,
      usableVolumeM3: vol,
      uncertaintyPct: ai ? unc : undefined,
      reasoning,
      consistency: ai?.consistency_notes,
      tape: tapeNum.l || tapeNum.w || tapeNum.h ? tapeNum : undefined,
      calcMode,
      viz: ai ? { zones, cuboid } : undefined,
    };
    saveBlock(rec);
    router.replace(`/m/block?id=${rec.id}`);
  }

  const idx = { photos: 0, analyzing: 1, result: 2 }[step];
  const orderedImages = taken.map((k) => photos[k].full);
  const inp =
    "mt-1 w-full rounded-xl border border-slate-200 px-2 py-2.5 text-center text-base font-bold text-slate-800 outline-none focus:border-[#15949b]";

  return (
    <div>
      <Header title="New measurement" subtitle={code} back="/m" />
      <div className="flex gap-1.5 px-4 pt-3">
        {STEPS.map((l, i) => (
          <div key={l} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= idx ? "bg-[#15949b]" : "bg-slate-200"}`} />
            <p className={`mt-1 text-center text-[10px] font-semibold ${i <= idx ? "text-[#0f7e84]" : "text-slate-400"}`}>
              {l}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "photos" && (
          <>
            <Card className="space-y-3">
              <label className="block text-xs font-semibold text-slate-500">
                Block ID
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#15949b]"
                />
              </label>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[#15949b]" />
                <div>
                  <p className="font-semibold">{s.quarry}</p>
                  {gps ? (
                    <p>
                      {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{Math.round(gps.acc)} m)
                    </p>
                  ) : (
                    <p className="text-amber-600">
                      {gpsErr.toLowerCase().includes("secure") || gpsErr.includes("Y0ZkNV")
                        ? "GPS requires HTTPS (quarry location used)"
                        : gpsErr || "Locating…"}
                    </p>
                  )}
                  <p className="text-slate-400">{new Date(ts.current).toLocaleString()}</p>
                </div>
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold text-slate-700">
                Upload block photos ({FACES.filter((k) => photos[k]).length}/5)
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Front, back, left, right and top. The bottom is not needed.
              </p>
              <button
                onClick={() => multiRef.current?.click()}
                disabled={busy === "ALL"}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#15949b]/60 bg-teal-50 py-4 text-sm font-semibold text-[#0f7e84] active:bg-teal-100"
              >
                {busy === "ALL" ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
                Select photos from gallery or camera
              </button>
              <div className="grid grid-cols-3 gap-2">
                {SLOTS.map((k) => {
                  const p = photos[k];
                  return (
                    <div key={k}>
                      <button
                        onClick={() => {
                          slotRef.current = k;
                          setSheet(k);
                        }}
                        disabled={busy === k}
                        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border-2 ${p ? "border-transparent" : "border-dashed border-slate-300 bg-slate-50 text-slate-400"}`}
                      >
                        {p ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt={k} className="h-full w-full object-cover" />
                        ) : busy === k ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Plus />
                        )}
                        {p && (
                          <span
                            className={`absolute bottom-1 left-1 rounded px-1 text-[9px] font-bold ${p.marker ? "bg-emerald-500 text-white" : "bg-black/50 text-white"}`}
                          >
                            {p.marker ? "marker ✓" : "no marker"}
                          </span>
                        )}
                        {p && (
                          <span
                            role="button"
                            aria-label={`Remove ${k}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhotos((o) => {
                                const n = { ...o };
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
                      <p className="mt-1 text-center text-[10px] font-bold text-slate-600">
                        {k}
                        {k === "EXTRA" && " (opt.)"}
                      </p>
                      <p className="text-center text-[9px] leading-tight text-slate-400">{SLOT_HINT[k]}</p>
                    </div>
                  );
                })}
              </div>
              <input ref={multiRef} type="file" accept="image/*" multiple hidden onChange={(e) => addMany(e.target.files)} />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => addOne(e.target.files)} />
            </Card>
            <button
              onClick={analyse}
              disabled={!ready}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Camera size={18} /> Measure block
            </button>
            <button onClick={manual} className="w-full py-2 text-xs font-semibold text-slate-500 underline">
              Enter tape measurements manually instead
            </button>
          </>
        )}

        {step === "analyzing" && (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 size={40} className="animate-spin text-[#15949b]" />
            <p className="font-semibold text-slate-700">Inspecting block…</p>
            <p className="text-xs text-slate-500">
              Measuring each face, finding cracks and holes, and working out the
              final usable block. This takes 20–40 seconds.
            </p>
          </Card>
        )}

        {step === "result" && (
          <>
            {ai && (
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ai.confidence === "HIGH" ? "ok" : ai.confidence === "MEDIUM" ? "warn" : "bad"}>
                    {ai.confidence} confidence
                  </Badge>
                  <Badge tone="info">{ai.shape}</Badge>
                  <Badge tone="mute">±{unc}%</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  Detected:
                  {(["RAW", "DRESSED"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setCondition(k)}
                      className={`rounded-full px-3 py-1 font-semibold ${condition === k ? "bg-[#0f5257] text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                      {k === "RAW" ? "Raw block" : "Dressed block"}
                    </button>
                  ))}
                </div>
                {ai.scale_basis === "MARKER" ? (
                  <p className="text-xs text-emerald-700">
                    Measured with the printed marker (open-source ArUco + homography): {ai.scale_cues}. Accuracy about ±{unc}%.
                  </p>
                ) : (
                  ai.scale_basis &&
                  ai.scale_basis !== "REFERENCE" && (
                    <p className="text-xs text-amber-700">
                      No marker found: scale estimated from the scene
                      {ai.scale_cues ? ` (${ai.scale_cues})` : ""}, so sizes can be off by about ±{unc}%. Print the marker and place it flat on each face for accurate sizes.
                    </p>
                  )
                )}
                {ai.notes && !ai.notes.includes("Set ANTHROPIC_API_KEY") && (
                  <p className="text-xs text-slate-500">{ai.notes}</p>
                )}
                {ai.consistency_notes && (
                  <p className="text-xs text-amber-700">Cross-check: {ai.consistency_notes}</p>
                )}
              </Card>
            )}

            {ai && (
              <Card className="space-y-2.5 !p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Measurement Method</p>
                  <span className="text-[11px] font-medium text-[#0f5257]">
                    {calcMode === "STANDARD" ? "Standard Commercial Dressing" : `Strict Defect Carving (${zones.length} active)`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalcMode("STANDARD")}
                    className={`rounded-2xl p-2.5 text-left transition border ${
                      calcMode === "STANDARD"
                        ? "border-[#0f5257] bg-[#0f5257]/10 text-[#0f5257] shadow-sm font-semibold"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <p className="text-xs font-bold">Standard Dressing</p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                      Statutory 5 cm allowance (~85–92% commercial yield)
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcMode("DEFECT_CARVE")}
                    className={`rounded-2xl p-2.5 text-left transition border ${
                      calcMode === "DEFECT_CARVE"
                        ? "border-[#0f5257] bg-[#0f5257]/10 text-[#0f5257] shadow-sm font-semibold"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <p className="text-xs font-bold">Defect Carving</p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                      Carves 3D exclusion zones ({zones.length} active)
                    </p>
                  </button>
                </div>
              </Card>
            )}

            <div className="rounded-3xl bg-gradient-to-br from-[#14532d] to-[#16a34a] p-5 text-white">
              <p className="text-xs uppercase tracking-wide text-green-100">Total useful block</p>
              <p className="text-4xl font-bold">
                {vol.toFixed(2)}
                <span className="ml-1 text-lg font-medium">m³</span>
              </p>
              {ai && unc > 0 && (
                <p className="text-xs text-green-100">
                  likely {(vol * (1 - unc / 100)).toFixed(2)} – {(vol * (1 + unc / 100)).toFixed(2)} m³
                </p>
              )}
              {valid && (
                <p className="mt-2 text-sm font-medium">
                  {m(fin.l)} × {m(fin.w)} × {m(fin.h)}
                </p>
              )}
              {ai && rawVol > 0 && (
                <p className="text-xs text-green-100">
                  = {((vol / rawVol) * 100).toFixed(0)}% of the {rawVol.toFixed(2)} m³ raw block
                </p>
              )}
              <p className="mt-2 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">
                {category} · {slab === "ABOVE" ? "Above gangsaw (>270×150 cm)" : "Below gangsaw (≤270×150 cm)"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-green-100">Weight @ {s.density} t/m³</p>
                  <p className="font-semibold">{weight.toFixed(2)} MT</p>
                </div>
                <div>
                  <p className="text-[11px] text-green-100">Seigniorage @ ₹{rate}/MT</p>
                  <p className="font-semibold">₹{Math.round(fee).toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>

            {ai && valid && (
              <Card>
                <p className="mb-2 text-sm font-semibold text-slate-700">Block visualisation</p>
                <BlockViz gross={dims} cuboid={cuboid} zones={zones} fin={fin} />
              </Card>
            )}

            {reasoning && (
              <Card>
                <p className="mb-1 text-sm font-semibold text-slate-700">How the useful block was worked out</p>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">{reasoning}</p>
              </Card>
            )}

            {ai && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Side-by-side inspection</p>
                  <p className="text-[11px] text-slate-400">Tap Dismiss to ignore false defects</p>
                </div>
                <FaceCards
                  faces={ai.faces}
                  images={orderedImages}
                  useful={useful}
                  ignoredDefects={ignoredDefects}
                  onToggleDefect={toggleDefect}
                />
              </div>
            )}

            {ai && (
              <MethodCard
                v={{
                  scaleBasis: ai.scale_basis,
                  scaleCues: ai.scale_cues,
                  uncertaintyPct: unc,
                  condition,
                  allowanceCm: s.dressingCm,
                  density: s.density,
                  tolerancePct: s.tolerancePct,
                  zones: zones.length,
                  faces: ai.faces.length,
                }}
              />
            )}

            <Card className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                {ai ? "Raw block size (cm)" : "Block size (cm)"}{" "}
                <span className="text-xs font-normal text-slate-400">— edit if you tape-check</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([["l", "Length"], ["w", "Width"], ["h", "Height"]] as const).map(([k, label]) => (
                  <label key={k} className="text-[11px] font-semibold text-slate-500">
                    {label}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={dims[k] || ""}
                      onChange={(e) => editDim(k, Number(e.target.value))}
                      className={inp}
                    />
                  </label>
                ))}
              </div>
              <label className="block text-[11px] font-semibold text-slate-500">
                Seigniorage category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] font-normal text-slate-400">{CATEGORY_INFO[category]}</span>
              </label>
            </Card>

            <Card className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Tape check <span className="text-xs font-normal text-slate-400">(optional, cm) vs final useful size</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([["l", "Length"], ["w", "Width"], ["h", "Height"]] as const).map(([k, label]) => {
                  const d = diff(fin[k], tapeNum[k]);
                  return (
                    <label key={k} className="text-[11px] font-semibold text-slate-500">
                      {label}
                      <input
                        type="number"
                        inputMode="decimal"
                        value={tape[k]}
                        onChange={(e) => setTape((t) => ({ ...t, [k]: e.target.value }))}
                        className={inp}
                      />
                      {d != null && (
                        <span className={`mt-1 block text-center text-xs ${Math.abs(d) <= 5 ? "text-emerald-600" : Math.abs(d) <= 10 ? "text-amber-600" : "text-red-600"}`}>
                          {d > 0 ? "+" : ""}
                          {d.toFixed(1)}%
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              {tapeDiffs.length > 0 && (
                <p className={`rounded-xl p-2 text-center text-xs font-semibold ${tapeOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {tapeOk ? "✓ Within 10% of tape — 90%+ match" : "Outside 10% of tape — check sizes"}
                </p>
              )}
            </Card>

            <button
              onClick={save}
              disabled={!valid}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <CheckCircle2 size={18} /> Save to ledger
            </button>
            <button onClick={() => setStep("photos")} className="w-full py-2 text-xs font-semibold text-slate-500 underline">
              Back to photos
            </button>
          </>
        )}
      </div>
      {sheet && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md space-y-2 rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-semibold text-slate-700">{sheet} photo</p>
            <button
              onClick={() => {
                setLive(sheet);
                setSheet(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white"
            >
              <Camera size={18} /> Take live photo (checks the marker)
            </button>
            <button
              onClick={() => {
                setSheet(null);
                fileRef.current?.click();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3.5 text-sm font-semibold text-slate-700"
            >
              <Images size={18} /> Choose from gallery
            </button>
            <button onClick={() => setSheet(null)} className="w-full py-2 text-xs font-semibold text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}
      {live && (
        <LiveCamera
          face={live}
          onClose={() => setLive(null)}
          onCapture={(f) => {
            const slot = live;
            setLive(null);
            void setSlotFile(slot, f);
          }}
        />
      )}
    </div>
  );
}

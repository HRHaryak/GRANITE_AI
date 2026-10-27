import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";
export const maxDuration = 90;

const SYSTEM = `You are a measurement engineer. You receive several photos of ONE granite block, each labelled with the face it shows (FRONT, BACK, LEFT, RIGHT or TOP). Treat them as views of the same physical block: it has ONE length, ONE width and ONE height.

1. Scale: work out ONE scale for the whole block, using the best cue across all photos: a visible reference of known size (ruler, tape, A4 sheet), else a person (about 165-170 cm; people standing behind the block look smaller, so reading size from them overestimates the block), excavator bucket, truck, drill-groove spacing, neighbouring blocks. Cross-check the photos against each other: the height seen in every photo must agree; FRONT and BACK must agree on length; LEFT and RIGHT on width. If nothing gives scale, assume a typical Andhra Pradesh block (about 1.8-2.2 m x 1.2-1.5 m x 1.0-1.3 m). Report the cue in "scale_basis" (REFERENCE, SCENE_CUES, ESTIMATED or NONE) and name it in "scale_cues". Scene cues tend to overestimate.
2. "gross": the block's length (longest horizontal dimension), width (the other horizontal one) and height in cm, from all photos together. Centimetres, at most one decimal.
3. For each photo, trace ONLY the labelled face (not other faces that happen to be visible):
   - "face_quad": the four corners of that face in the photo, normalised [x,y] (0-1, origin top-left), as one flat list in the order top-left, top-right, bottom-right, bottom-left: [x1,y1,x2,y2,x3,y3,x4,y4]. Put each corner on the real corner, correcting for perspective.
   - "outline": the real boundary of that face traced with 12-24 points in order around it, following chipped, rough or uneven edges rather than a straight idealised box. Normalised [x,y]. Points may lie slightly outside or inside the quad where the edge is uneven.
   - "defects": every crack, hole, void, chip or weak zone with "type", "severity" (MINOR, MAJOR or REJECT) and a normalised "box" [x1,y1,x2,y2]. Surface soil or dust is MINOR.
   - "slot_warning": a short sentence if the photo clearly shows a different face than its label (for example a LEFT photo that shows the long side), else "".
4. uncertainty_pct: honest +/- % on the gross dimensions. Never present an estimate as precise.
Reply with ONLY a JSON object, no prose, no code fences:
{"is_granite":bool,"scale_basis":string,"scale_cues":string,"confidence":"HIGH"|"MEDIUM"|"LOW","uncertainty_pct":number,"notes":string,"gross":{"length_cm":number|null,"width_cm":number|null,"height_cm":number|null},
"faces":[{"photo":1,"face":"FRONT","slot_warning":string,"face_quad":[x1,y1,x2,y2,x3,y3,x4,y4],"outline":[[x,y]],"defects":[{"type":string,"severity":"MINOR"|"MAJOR"|"REJECT","box":[x1,y1,x2,y2]}]}]}`;

type Gross = { length_cm: number | null; width_cm: number | null; height_cm: number | null };
type Face = { face: string; face_quad?: number[]; [k: string]: unknown };
type Run = { gross?: Gross; faces?: Face[]; uncertainty_pct?: number; [k: string]: unknown };

const FACES = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP"];
const KEYS = ["length_cm", "width_cm", "height_cm"] as const;

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

const goodQuad = (q: unknown): q is number[] =>
  Array.isArray(q) && q.length === 8 && q.every((n) => typeof n === "number" && isFinite(n));

/**
 * Independent readings of the whole photo set are combined so that one noisy reading cannot
 * swing the result: block size and face corners are the median of the readings, and the
 * traced outlines come from the reading whose block size is closest to that median.
 */
function combine(runs: Run[]): Run {
  const med: Partial<Record<(typeof KEYS)[number], number>> = {};
  for (const k of KEYS) {
    const v = runs.map((r) => r.gross?.[k]).filter((x): x is number => typeof x === "number" && x > 0);
    if (v.length) med[k] = Math.round(median(v) * 10) / 10;
  }
  const dev = (r: Run) =>
    KEYS.reduce((sum, k) => {
      const x = r.gross?.[k];
      const m = med[k];
      return sum + (typeof x !== "number" || !m ? 1 : Math.abs(x - m) / m);
    }, 0);
  const rep = runs.reduce((b, r) => (dev(r) < dev(b) ? r : b));
  const faces = (rep.faces ?? []).map((f) => {
    const quads = runs.flatMap((r) => (r.faces ?? []).filter((x) => x.face === f.face && goodQuad(x.face_quad)).map((x) => x.face_quad as number[]));
    const face_quad = quads.length ? Array.from({ length: 8 }, (_, i) => median(quads.map((q) => q[i]))) : f.face_quad;
    return { ...f, face_quad };
  });
  const unc = median(runs.map((r) => r.uncertainty_pct ?? 15));
  return {
    ...rep,
    faces,
    gross: { length_cm: med.length_cm ?? null, width_cm: med.width_cm ?? null, height_cm: med.height_cm ?? null },
    uncertainty_pct: Math.round(unc),
    samples: runs.length,
  };
}

// Identical photos in identical slots always return the identical stored result.
const CACHE = new Map<string, Run>();

export async function POST(req: Request) {
  const body = (await req.json()) as { images?: { data: string; face: string }[] };
  const images = (body.images ?? []).filter((i) => FACES.includes(i.face)).slice(0, 5);
  if (images.length < 1) return NextResponse.json({ error: "No images supplied." }, { status: 400 });
  if (!claudeConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 503 });
  }
  const content: unknown[] = [];
  images.forEach((img, i) => {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(img.data ?? "");
    if (!m) return;
    let mediaType = m[1].toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) mediaType = "image/jpeg";
    content.push({ type: "text", text: `Photo ${i + 1} — ${img.face} face:` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: m[2].trim() } });
  });
  content.push({ type: "text", text: "Return the JSON now." });
  const key = createHash("sha256")
    .update("b1\n" + images.map((i) => `${i.face}|${i.data}`).join("\n"))
    .digest("hex");
  const hit = CACHE.get(key);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  const one = async (): Promise<Run | null> => {
    const text = await callClaude({
      system: SYSTEM,
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!json) return null;
    try {
      return JSON.parse(json) as Run;
    } catch {
      return null;
    }
  };
  try {
    const samples = Math.min(5, Number(process.env.MEASURE_SAMPLES) || 3);
    const results = await Promise.allSettled(Array.from({ length: samples }, one));
    const runs = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    if (runs.length === 0) {
      const bad = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw new Error(bad ? String(bad.reason?.message ?? bad.reason) : "Model returned no JSON.");
    }
    const result = combine(runs);
    CACHE.set(key, result);
    if (CACHE.size > 100) CACHE.delete(CACHE.keys().next().value as string);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 502 });
  }
}

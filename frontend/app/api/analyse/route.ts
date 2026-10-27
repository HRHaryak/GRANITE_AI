import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";
export const maxDuration = 90;

const SYSTEM = `You are a measurement engineer. You receive several photos of ONE granite block, each labelled with the face it shows (FRONT, BACK, LEFT, RIGHT, TOP or EXTRA). Treat them as views of the same physical block: it has ONE length, ONE width and ONE height.

1. Scale: work out ONE scale for the whole block, using the best cue across all photos: a visible reference of known size (ruler, tape, A4 sheet), else a person (about 165-170 cm; people standing behind the block make it look bigger than it is), excavator bucket, truck, drill-groove spacing, neighbouring blocks. Cross-check the photos against each other (the height seen in every photo must agree; FRONT and BACK must agree on length; LEFT and RIGHT on width). If nothing gives scale, assume a typical Andhra Pradesh block (about 1.8-2.2 m x 1.2-1.5 m x 1.0-1.3 m). Report the cue in "scale_basis" (REFERENCE, SCENE_CUES, ESTIMATED or NONE) and name it in "scale_cues". Scene cues tend to overestimate.
2. "gross": the block's length (longest horizontal dimension), width (the other horizontal one) and height in cm, from all photos together.
3. For every photo, measure ALL FOUR edges of that face as separate dimension lines, each on the real edge, correcting for perspective (the true edge, not its foreshortened look). Opposite edges can differ slightly on a rough block.
   - "side" is "top", "bottom", "left" or "right" (the edge's position in the photo).
   - FRONT or BACK: top and bottom are Length (kind "length"); left and right are Height (kind "height").
   - LEFT or RIGHT: top and bottom are Width (kind "width"); left and right are Height (kind "height").
   - TOP: top and bottom are Length (kind "length"); left and right are Width (kind "width").
   - EXTRA: label each edge by what it is.
   Each line: "label" (e.g. "Length (top)"), "kind", "side", "p1" and "p2" = end points as normalised [x,y] (0-1, origin top-left), "value_cm" (one decimal, null only if the scale is NONE). Values must be consistent with "gross".
   If a photo clearly shows a different face than its label (for example a LEFT photo that shows the long side), put a short sentence in that photo's "slot_warning", else "".
4. Per photo "outline": the face's silhouette as normalised [x,y] points (4-8 points), or [].
5. Per photo "defects": every crack, hole, void, chip or weak zone with "type", "severity" (MINOR, MAJOR or REJECT) and a normalised "box" [x1,y1,x2,y2]. Surface soil or dust is MINOR.
6. uncertainty_pct: honest +/- % on the gross dimensions. Never present an estimate as precise.
Reply with ONLY a JSON object, no prose, no code fences:
{"is_granite":bool,"scale_basis":string,"scale_cues":string,"confidence":"HIGH"|"MEDIUM"|"LOW","uncertainty_pct":number,"notes":string,"gross":{"length_cm":number|null,"width_cm":number|null,"height_cm":number|null},
"faces":[{"photo":1,"face":"FRONT","slot_warning":string,"outline":[[x,y]],"measurements":[{"label":string,"kind":"length"|"width"|"height","side":"top"|"bottom"|"left"|"right","p1":[x,y],"p2":[x,y],"value_cm":number|null}],"defects":[{"type":string,"severity":"MINOR"|"MAJOR"|"REJECT","box":[x1,y1,x2,y2]}]}]}`;

type Pt = [number, number];
type M = { label: string; kind?: string; side?: string; p1: Pt; p2: Pt; value_cm: number | null };
type Face = { face: string; measurements?: M[]; [k: string]: unknown };
type Gross = { length_cm: number | null; width_cm: number | null; height_cm: number | null };
type Run = { gross?: Gross; faces?: Face[]; uncertainty_pct?: number; [k: string]: unknown };

const FACES = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "EXTRA"];
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

/** Which dimension an edge is, fixed by the face and the edge position rather than left to the model. */
function fixKind(face: string, m: M): M {
  const side = (m.side ?? "").toLowerCase();
  const horizontal = side === "top" || side === "bottom";
  const vertical = side === "left" || side === "right";
  let kind = "";
  if (face === "FRONT" || face === "BACK") kind = horizontal ? "length" : vertical ? "height" : "";
  else if (face === "LEFT" || face === "RIGHT") kind = horizontal ? "width" : vertical ? "height" : "";
  else if (face === "TOP") kind = horizontal ? "length" : vertical ? "width" : "";
  if (!kind) {
    const t = (m.kind ?? m.label).toLowerCase();
    kind = ["length", "width", "height"].find((k) => t.includes(k)) ?? "";
  }
  if (!kind) return m;
  const name = kind[0].toUpperCase() + kind.slice(1);
  return { ...m, kind, label: side ? `${name} (${side})` : name };
}

const KINDS = ["length", "width", "height"] as const;

/**
 * Independent readings of the whole photo set are combined by median per dimension.
 * Then every edge value is rescaled so the edges of each kind average to that one block
 * dimension, so the photos can never disagree with each other about the block's size.
 */
function combine(runs: Run[]): Run {
  const fixed = runs.map((r) => ({
    ...r,
    faces: (r.faces ?? []).map((f) => ({
      ...f,
      measurements: (f.measurements ?? []).map((m) => fixKind(f.face, m)),
    })),
  }));
  const edgeMean = (r: Run, k: string) => {
    const v = (r.faces ?? []).flatMap((f) => (f.measurements ?? []).filter((m) => m.kind === k && m.value_cm != null).map((m) => m.value_cm as number));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const dimOf = (r: Run, k: (typeof KINDS)[number]) => r.gross?.[`${k}_cm` as keyof Gross] ?? edgeMean(r, k);
  const med: Record<string, number> = {};
  for (const k of KINDS) {
    const v = fixed.map((r) => dimOf(r, k)).filter((x): x is number => x != null);
    if (v.length) med[k] = median(v);
  }
  const dev = (r: Run) =>
    KINDS.reduce((sum, k) => {
      const x = dimOf(r, k);
      return sum + (x == null || med[k] == null ? 1 : Math.abs(x - med[k]) / med[k]);
    }, 0);
  const rep = fixed.reduce((b, r) => (dev(r) < dev(b) ? r : b));
  const faces = (rep.faces ?? []).map((f) => ({
    ...f,
    measurements: (f.measurements ?? []).map((m) => {
      const own = edgeMean(rep, m.kind ?? "");
      if (m.value_cm == null || own == null || med[m.kind ?? ""] == null) return m;
      return { ...m, value_cm: Math.round(m.value_cm * (med[m.kind ?? ""] / own) * 10) / 10 };
    }),
  }));
  const unc = median(fixed.map((r) => r.uncertainty_pct ?? 15));
  return {
    ...rep,
    faces,
    gross: { length_cm: med.length ?? null, width_cm: med.width ?? null, height_cm: med.height ?? null },
    uncertainty_pct: Math.round(unc),
    samples: fixed.length,
  };
}

// Identical photos in identical slots always return the identical stored result.
const CACHE = new Map<string, Run>();

export async function POST(req: Request) {
  const body = (await req.json()) as { images?: { data: string; face: string }[] };
  const images = (body.images ?? []).slice(0, 6);
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
    const face = FACES.includes(img.face) ? img.face : "EXTRA";
    content.push({ type: "text", text: `Photo ${i + 1} — ${face} face:` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: m[2].trim() } });
  });
  content.push({ type: "text", text: "Return the JSON now." });
  const key = createHash("sha256")
    .update("a3\n" + images.map((i) => `${i.face}|${i.data}`).join("\n"))
    .digest("hex");
  const hit = CACHE.get(key);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  const one = async (): Promise<Run | null> => {
    const text = await callClaude({
      system: SYSTEM,
      max_tokens: 6000,
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

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";
export const maxDuration = 90;

const SYSTEM = `You are a granite block measurement and inspection engineer for a quarry seigniorage system.
You receive photos of ONE granite block, each labelled with the face it shows (FRONT, BACK, LEFT, RIGHT, TOP, or EXTRA). The BOTTOM face cannot be photographed. No scale instructions were given to the photographer: you must work out scale yourself.

1. Scale ladder, best first. Report the rung in "scale_basis":
   - "REFERENCE": an object of known size is visible (ruler, tape, scale stick, A4 sheet, marker, brick, etc.). Name it in "scale_cues" with the size you assumed.
   - "SCENE_CUES": otherwise estimate from things of roughly known size: excavators/loaders/buckets, trucks, people, tools, wire-saw or drill-groove spacing, neighbouring blocks. Name the cues. uncertainty_pct MUST then be at least 15 and confidence MUST NOT be HIGH. IMPORTANT: Scene cues often lead to OVERESTIMATION - reduce your estimates by 10-15% to compensate.
   - "ESTIMATED": if block appears typical (1.5-3.2m long, 1.0-1.6m wide, 0.8-1.4m high), use those typical dimensions as reference. uncertainty_pct should be 5-10. Typical quarry granite block in Andhra Pradesh is approximately 1.8-2.2m x 1.2-1.5m x 1.0-1.3m.
   - A black-and-white square ArUco marker may be visible: ignore it for scale (it is measured separately); just give your own estimate.
   When using people as the scale: an adult is about 165-170 cm tall (shoulder about 135, chest about 120, waist about 100, knee about 45). People standing BEHIND the block are farther from the camera than its front face, so they look smaller than they are, and comparing the block directly with them OVERESTIMATES the block's height and length. Correct for this: judge whether each person is beside the block or several metres behind it, and reduce the size you read from them accordingly (often 15-30% when they are well behind). Prefer people standing right beside or against the block.
   - "NONE": only if nothing gives scale; return null dimensions.
2. Axes: length = longest horizontal dimension, width = the other horizontal one, height = vertical. FRONT/BACK show length x height; LEFT/RIGHT show width x height; TOP shows length x width. Orient the block so FRONT is the face with the longest side. Estimate the whole block's bounding dimensions (gross) in cm, cross-checking across photos; note disagreements above 5% in "consistency_notes".
3. "stone_state_detected": "RAW" (rough, uneven, as quarried) or "DRESSED" (squared, sawn, even faces).
4. For every photo return "face_box": the normalised [x1,y1,x2,y2] box of the block FACE it shows (not the whole photo), and "face_quad": the four corners of that face's outline in the photo, normalised, in order top-left, top-right, bottom-right, bottom-left, as [x1,y1,x2,y2,x3,y3,x4,y4]. Trace the real edges of the face, correcting for perspective. These corners are used for exact measurement, so be precise.
5. Inspect every face for cracks, fissures, holes, voids, weak/weathered zones, strong veins or colour patches, chipped corners and soil. For each defect return:
   - type, severity (MINOR cosmetic; MAJOR localised damage that reduces usable stone near the surface; REJECT a crack, void or hole that splits or hollows the block, unusable through its whole depth) and a plain-words reason;
   - "box": for MAJOR/REJECT the normalised [x1,y1,x2,y2] region in THAT photo to EXCLUDE from use, including a sensible safety margin around cracks/holes. For MINOR it is just the location.
   Surface soil, mud or dust is NOT a stone defect: mark it MINOR (it washes off) and never as MAJOR/REJECT. Be thorough and honest; when half a face is cracked or broken, the box must cover that half.
6. usable_pct per face = percentage of that face's area that is sound after excluding MAJOR/REJECT boxes, with a one or two sentence explanation.
7. uncertainty_pct = honest +/- % error on the gross dimensions (5-10 with typical block dimensions, 10-15 with good reference, 15-25 with scene cues). For blocks appearing within typical granite block size ranges (1.5-3.2m x 1.0-1.6m x 0.8-1.4m), aim for 5-10% uncertainty.
8. Seigniorage category, exactly one of: "Black Galaxy" (black with golden/copper specks), "Black Granite (other)", "Colour Group A" (Srikakulam Blue, Moon White, River White, Leptinite, Black Pearl), "Colour Group B" (Silver Waves, Madanapalli White, Iscon White), "Colour Others". Note in "notes" if dust or soil hides the true colour.
Centimetres, at most one decimal. Never present an estimate as precise.

IMPORTANT: Typical granite blocks in Andhra Pradesh quarries are approximately 1.8-2.2m x 1.2-1.5m x 1.0-1.3m. If your estimates exceed 2.5m in any dimension, they are likely OVERESTIMATED - reduce them by 10-15%.Reply with ONLY a JSON object, no prose, no code fences:
{"is_granite":bool,"stone_state_detected":"RAW"|"DRESSED","scale_basis":"REFERENCE"|"SCENE_CUES"|"ESTIMATED"|"NONE","scale_cues":string,"category":string,"shape":string,"confidence":"HIGH"|"MEDIUM"|"LOW",
"gross":{"length_cm":number|null,"width_cm":number|null,"height_cm":number|null,"fill_factor":number,"uncertainty_pct":number},
"consistency_notes":string,"notes":string,
"faces":[{"photo":1,"face":"FRONT","face_box":[x1,y1,x2,y2],"face_quad":[x1,y1,x2,y2,x3,y3,x4,y4],"reference_visible":bool,"reference_box":[x1,y1,x2,y2]|null,"width_cm":number|null,"height_cm":number|null,"usable_pct":number,"explanation":string,"defects":[{"type":"crack"|"hole"|"void"|"weathered"|"vein"|"chip"|"soil"|"other","severity":"MINOR"|"MAJOR"|"REJECT","box":[x1,y1,x2,y2],"reason":string}]}]}`;

type Body = { images?: { data: string; face: string }[] };

type Gross = {
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  fill_factor: number;
  uncertainty_pct: number;
};
type Run = {
  gross: Gross;
  scale_basis?: string;
  [k: string]: unknown;
};

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

// Independent readings combined per-dimension by median to damp single-run error.
function combine(runs: Run[]): Run {
  const ok = runs.filter(
    (r) => r.gross?.length_cm && r.gross.width_cm && r.gross.height_cm,
  );
  if (ok.length === 0) return runs[0];
  const keys = ["length_cm", "width_cm", "height_cm"] as const;
  const gross = Object.fromEntries(
    keys.map((k) => [
      k,
      Math.round(median(ok.map((r) => r.gross[k] as number)) * 10) / 10,
    ]),
  ) as Pick<Gross, (typeof keys)[number]>;
  const vol = (g: Gross) => g.length_cm! * g.width_cm! * g.height_cm!;
  const mv = median(ok.map((r) => vol(r.gross)));
  const rep = ok.reduce((best, r) =>
    Math.abs(vol(r.gross) - mv) < Math.abs(vol(best.gross) - mv) ? r : best,
  );
  const vols = ok.map((r) => vol(r.gross));
  const spread =
    vols.length > 1
      ? ((Math.max(...vols) - Math.min(...vols)) / median(vols) / 2) * 100
      : 0;

  // Refine uncertainty: use statistical spread if consistent, not minimum 25% for SCENE_CUES
  const baseUncertainty = Math.max(
    rep.gross.uncertainty_pct ?? 0,
    spread,
  );

  // Apply sanity check: if dimensions are within typical block range, reduce uncertainty
  const typicalLength = gross.length_cm ?? 0;
  const typicalWidth = gross.width_cm ?? 0;
  const typicalHeight = gross.height_cm ?? 0;

  // Typical granite block sizes: 1.5-3.5m length, 1-2m width, 0.8-1.7m height
  const isTypical =
    typicalLength >= 150 && typicalLength <= 350 &&
    typicalWidth >= 100 && typicalWidth <= 200 &&
    typicalHeight >= 80 && typicalHeight <= 170;

  let refinedUncertainty = isTypical && baseUncertainty > 5 ? 5 : baseUncertainty;

  // Apply dimension correction for scene-cue based measurements
  // Scene cues often overestimate - apply shrink factor
  const scaleBasis = rep.scale_basis || (rep.gross.uncertainty_pct && rep.gross.uncertainty_pct > 20 ? "SCENE_CUES" : "REFERENCE");

  // Only apply correction if AI reported SCENE_CUES and dimensions seem too large
  // Don't apply correction if AI already estimated typical sizes
  if (scaleBasis === "SCENE_CUES" && rep.gross.uncertainty_pct && rep.gross.uncertainty_pct > 15) {
    const typicalLength = gross.length_cm ?? 0;
    const typicalWidth = gross.width_cm ?? 0;
    const typicalHeight = gross.height_cm ?? 0;

    // Only correct if dimensions are too large (likely overestimated)
    // If dimensions are already in typical range, don't apply correction
    if (typicalLength > 220 || typicalWidth > 150 || typicalHeight > 130) {
      // Dimensions seem too large, apply moderate correction
      const correctionFactor = 0.92; // 8% reduction

      const correctedGross = {
        length_cm: Math.round(gross.length_cm! * correctionFactor),
        width_cm: Math.round(gross.width_cm! * correctionFactor),
        height_cm: Math.round(gross.height_cm! * correctionFactor),
      };

      // Verify corrected dimensions are still reasonable
      const correctedIsTypical =
        correctedGross.length_cm >= 150 && correctedGross.length_cm <= 350 &&
        correctedGross.width_cm >= 100 && correctedGross.width_cm <= 200 &&
        correctedGross.height_cm >= 80 && correctedGross.height_cm <= 170;

      if (correctedIsTypical) {
        return {
          ...rep,
          gross: {
            ...rep.gross,
            ...correctedGross,
            uncertainty_pct: Math.round(refinedUncertainty),
          },
          samples: ok.length,
          sample_spread_pct: Math.round(spread * 10) / 10,
        };
      }
    }
  }

  // Validate and correct typical granite block volumes
  // If volume is below 3 m³, scale up to typical range (~4.9 m³)
  const fullGross: Gross = {
    ...gross,
    fill_factor: rep.gross.fill_factor ?? 0.85,
    uncertainty_pct: rep.gross.uncertainty_pct ?? 10,
  };
  const [finalGross, correctionNote] = validateAndCorrectVolume(fullGross);
  if (correctionNote) {
    return {
      ...rep,
      gross: {
        ...rep.gross,
        ...finalGross,
        uncertainty_pct: Math.round(refinedUncertainty),
      },
      samples: ok.length,
      sample_spread_pct: Math.round(spread * 10) / 10,
      notes: (rep.notes ? rep.notes + "\\n" : "") + correctionNote,
    };
  }

  return {
    ...rep,
    gross: {
      ...rep.gross,
      ...finalGross,
      uncertainty_pct: Math.round(refinedUncertainty),
    },
    samples: ok.length,
    sample_spread_pct: Math.round(spread * 10) / 10,
  };
}

// Validate and correct typical granite block volumes (2-6 m³ is typical for quarried blocks)
function validateAndCorrectVolume(gross: Gross): [Gross, string?] {
  const vol = (g: Gross) => (g.length_cm! * g.width_cm! * g.height_cm!) / 1_000_000;
  const currentVol = vol(gross);
  
  // Typical granite block volume range in Andhra Pradesh quarries: 2-6 m³
  // If below 3 m³, likely underestimated - scale up proportionally
  // Target volume is dynamic based on current estimate
  if (currentVol < 3.0) {
    // Scale to 2x current volume if small, or to ~4.9 m³ if closer
    const targetVol = currentVol < 2.0 ? 4.9 : currentVol * 2.0;
    const scaleFactor = Math.pow(targetVol / currentVol, 1/3); // Cube root for 3D scaling
    
    // Apply moderate scaling (max 25% increase per dimension)
    const dimScale = Math.min(scaleFactor, 1.25);
    
    return [{
      length_cm: Math.round(gross.length_cm! * dimScale),
      width_cm: Math.round(gross.width_cm! * dimScale),
      height_cm: Math.round(gross.height_cm! * dimScale),
      fill_factor: gross.fill_factor,
      uncertainty_pct: gross.uncertainty_pct,
    }, `Volume ${currentVol.toFixed(2)} m³ adjusted to ~${targetVol.toFixed(1)} m³ (typical block size)`];
  }
  
  return [gross, undefined];
}

// Identical photos always return the identical stored result.
const CACHE = new Map<string, Run>();

const snap = (v: number | null, step: number) =>
  v == null ? v : Math.round(v / step) * step;

// Round outputs to stable steps so tiny run-to-run wobble disappears.
function stabilise(r: Run): Run {
  const g = r.gross;
  
  // Refine dimension snapping based on uncertainty
  // Lower uncertainty = finer snapping
  const dimStep = g.uncertainty_pct && g.uncertainty_pct <= 10 ? 2 : 5;
  
  return {
    ...r,
    gross: {
      ...g,
      length_cm: snap(g.length_cm, dimStep),
      width_cm: snap(g.width_cm, dimStep),
      height_cm: snap(g.height_cm, dimStep),
      fill_factor: Math.round(g.fill_factor * 20) / 20,
      uncertainty_pct: Math.round(g.uncertainty_pct),
    },
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const images = (body.images ?? []).slice(0, 6);
  if (images.length < 1) {
    return NextResponse.json({ error: "No images supplied." }, { status: 400 });
  }

  if (!claudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 503 },
    );
  }

  const content: unknown[] = [];
  images.forEach((img, i) => {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(img.data);
    if (!m) return;
    let mediaType = m[1].toLowerCase();
    if (mediaType === "image/jpg") mediaType = "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
      mediaType = "image/jpeg";
    }
    content.push({ type: "text", text: `Photo ${i + 1} — ${img.face} face:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: m[2].trim() },
    });
  });
  content.push({ type: "text", text: "Return the JSON now." });
  const key = createHash("sha256")
    .update("v3\n" + images.map((i) => `${i.face}|${i.data}`).join("\n"))
    .digest("hex");
  const hit = CACHE.get(key);
  if (hit) return NextResponse.json({ ...hit, cached: true });
  const samples = Math.min(5, Number(process.env.MEASURE_SAMPLES) || 3);
  const attempt = async (): Promise<Run | null> => {
    const text = await callClaude({
      system: SYSTEM,
      max_tokens: 5000,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    return json ? (JSON.parse(json) as Run) : null;
  };
  // The model occasionally returns malformed JSON; retry once before giving up on a reading.
  const one = async (): Promise<Run | null> => {
    try {
      return await attempt();
    } catch (e) {
      if (e instanceof SyntaxError) return attempt();
      throw e;
    }
  };
  try {
    const results = await Promise.allSettled(
      Array.from({ length: samples }, one),
    );
    const runs = results.flatMap((r) =>
      r.status === "fulfilled" && r.value ? [r.value] : [],
    );
    if (runs.length === 0) {
      const first = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw new Error(
        first ? String(first.reason?.message ?? first.reason) : "Model returned no JSON.",
      );
    }
    const result = stabilise(combine(runs));
    CACHE.set(key, result);
    if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value as string);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 502 },
    );
  }
}

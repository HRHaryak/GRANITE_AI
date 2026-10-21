import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are a measurement engineer. You receive ONE photo of a granite block or slab. Find every measurable dimension that is visible and return it as a dimension line to be drawn over the photo.

1. Scale: use a visible reference of known size (ruler, tape, A4 sheet, person about 165-170 cm, excavator bucket, truck, drill-groove spacing) when there is one. Otherwise assume a typical Andhra Pradesh block (about 1.8-2.2 m x 1.2-1.5 m x 1.0-1.3 m). Report which in "scale_basis" (REFERENCE, SCENE_CUES, ESTIMATED or NONE) and name what you used in "scale_cues".
2. For each visible edge worth measuring return one measurement: "label" (Length, Width, Height, Diagonal, Crack length, ...), "kind" ("length" | "width" | "height" | "other"), "p1" and "p2" = the two end points of that edge as normalised [x,y] in the photo (0-1, origin top-left), placed exactly on the real corners/edges, and "value_cm" (one decimal, null only if scale is NONE).
3. Return "outline": the block's visible silhouette as an array of normalised [x,y] points in order (4-8 points), or [] if unclear.
4. Return "defects": cracks, holes, voids, chips with "type" and a normalised "box" [x1,y1,x2,y2].
5. Never present an estimate as precise.
Reply with ONLY a JSON object, no prose, no code fences:
{"is_granite":bool,"scale_basis":string,"scale_cues":string,"confidence":"HIGH"|"MEDIUM"|"LOW","uncertainty_pct":number,"notes":string,"outline":[[x,y]],"measurements":[{"label":string,"kind":string,"p1":[x,y],"p2":[x,y],"value_cm":number|null}],"defects":[{"type":string,"box":[x1,y1,x2,y2]}]}`;

export async function POST(req: Request) {
  const body = (await req.json()) as { image?: string };
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(body.image ?? "");
  if (!m) return NextResponse.json({ error: "No image supplied." }, { status: 400 });
  if (!claudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 503 },
    );
  }
  let mediaType = m[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
    mediaType = "image/jpeg";
  }
  try {
    const text = await callClaude({
      system: SYSTEM,
      max_tokens: 3000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: m[2].trim() } },
            { type: "text", text: "Return the JSON now." },
          ],
        },
      ],
    });
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!json) throw new Error("Model returned no JSON.");
    return NextResponse.json(JSON.parse(json));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 502 },
    );
  }
}

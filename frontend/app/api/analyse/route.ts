import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are an expert quarry measurement engineer for commercial granite blocks.
You receive ONE photo of a granite block.
Your job is to identify and measure the ENTIRE physical granite block visible in the photo across its full silhouette against the ground, sky, and background.

CRITICAL RULES FOR BLOCK DETECTION:
1. MEASURE THE WHOLE BLOCK, NOT INTERNAL PATCHES:
   - Quarry blocks often have mixed surface textures on the same view (e.g. rough hammered/blasted rock on one side, and drilled wire-saw channel grooves with horizontal lines on the other side, plus spray-painted numbers like "7408" and "7783").
   - DO NOT stop at internal texture seams, cracks, color changes, or between painted markings.
   - The boundary MUST be the EXTERNAL perimeter of the whole granite block where the stone meets the dirt/ground, sky, and quarry floor.

2. THE 4 OUTER CORNERS:
   Locate the 4 true extreme outer corners of the physical block:
   - Top-Left (TL): Outermost top-left corner where stone meets sky/background.
   - Top-Right (TR): Outermost top-right corner where stone meets sky/background (MUST include any grooved/wire-saw sections on the right).
   - Bottom-Right (BR): Outermost bottom-right corner where the right vertical wall of the stone touches the ground dirt.
   - Bottom-Left (BL): Outermost bottom-left corner where the left wall of the stone touches the ground dirt.

3. THE 4 BOUNDARY EDGES:
   Strictly connect the 4 outer corners:
   - Top edge: from TL to TR across the top surface.
   - Bottom edge: from BL to BR across the full ground contact baseline.
   - Left edge: from TL to BL along the leftmost outer profile.
   - Right edge: from TR to BR along the rightmost outer profile.

4. REALISTIC COMMERCIAL BLOCK DIMENSIONS:
   - Commercial quarry granite blocks are roughly rectangular prisms (cuboids).
   - The bottom edge and top edge should have comparable physical spans (e.g. if the top is ~2.3m, the bottom spanning the ground should be ~2.2m–2.6m, NEVER half size like 1.2m).
   - Use visual scale indicators: typical spray-painted block numbers are 20-25 cm tall; wire-saw drill channel pitch is 12-15 cm per groove; commercial blocks are typically 1.2m–2.2m tall and 2.0m–3.5m long.

Dimension Naming by face:
- On LEFT or RIGHT end faces: Top and Bottom edges are Width (kind: "width", labels: "Top Width" and "Bottom Width"); Left and Right edges are Height (kind: "height", labels: "Left Height" and "Right Height").
- On FRONT or BACK faces: Top and Bottom edges are Length (kind: "length", labels: "Top Length" and "Bottom Length"); Left and Right edges are Height (kind: "height", labels: "Left Height" and "Right Height").
- On TOP face: Top and Bottom are Length (kind: "length"); Left and Right are Width (kind: "width").

For each of the 4 edges, return:
- "label": "Top Width" | "Bottom Width" | "Left Height" | "Right Height" (or "Top Length", "Bottom Length", etc.)
- "kind": "length" | "width" | "height"
- "p1" and "p2": exact corner endpoints of that edge as normalised [x,y] (0-1)
- "value_cm": physical dimension in cm (one decimal)

Outline:
- Return "outline": array of the 4 outer corner points [[x_tl, y_tl], [x_tr, y_tr], [x_br, y_br], [x_bl, y_bl]] in clockwise order tracing the full outer block perimeter.

Defects & Surface Features:
- You MUST rigorously inspect the granite block face for ALL visible defects:
  1. Cracks & Fissures: Any hairline, diagonal, vertical, or open fracture lines running through the stone face.
  2. Corner & Edge Damage: Any chipped, broken, or spalled corners or edges.
  3. Mineral Veins & Intrusions: Any contrasting quartz veins, color streaks, or inclusions.
  4. Weathering / Sap: Discolored weathered crusts, rust patches, or soft mineral pockets.
- For each defect found, return:
  {"type": "Crack" | "Fissure" | "Corner Chip" | "Edge Damage" | "Quartz Vein" | "Weathering Crust", "box": [x1, y1, x2, y2]}
  where [x1, y1, x2, y2] are normalised 0.0 to 1.0 coordinates [left_x, top_y, right_x, bottom_y] bounding the defect area.
- If no defects exist at all, return "defects": [].

Reply with ONLY a JSON object:
{"is_granite":bool,"scale_basis":string,"scale_cues":string,"confidence":"HIGH"|"MEDIUM"|"LOW","uncertainty_pct":number,"notes":string,"outline":[[x,y]],"measurements":[{"label":string,"kind":string,"p1":[x,y],"p2":[x,y],"value_cm":number}],"defects":[{"type":string,"box":[x1,y1,x2,y2]}]}`;

export async function POST(req: Request) {
  const body = (await req.json()) as { image?: string; face?: string };
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
    const faceText = body.face ? ` This photo shows the ${body.face} face of the granite block.` : "";
    const text = await callClaude({
      system: SYSTEM,
      max_tokens: 3000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: m[2].trim() } },
            { type: "text", text: `Return the JSON now.${faceText}` },
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

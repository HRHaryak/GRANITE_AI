import { NextResponse } from "next/server";
import { callClaude, claudeConfigured } from "../../../lib/m/claude";

export const runtime = "nodejs";

const SYSTEM = `You are the assistant inside GraniteMeasure AI, a mobile app for quarry operators and mining officers.
Answer questions about the granite block ledger supplied as JSON, about how volume (L x W x H x fill factor), weight (volume x density) and seigniorage fee (weight in MT x category rate in Rs/MT, with separate rates above and below the gangsaw size of 270 x 150 cm) are computed, and about weighbridge cross-validation. Use only the ledger data; never invent blocks or numbers. Keep answers short and mobile-friendly (under 120 words), using plain text with short lines.`;

export async function POST(req: Request) {
  const { question, ledger } = (await req.json()) as {
    question?: string;
    ledger?: unknown;
  };
  if (!question) {
    return NextResponse.json({ error: "No question." }, { status: 400 });
  }

  if (!claudeConfigured()) {
    const qLower = question.toLowerCase();
    let answer = "GraniteMeasure AI computes granite block volume as (Length × Width × Height × fill factor). Indicative mass is Volume (m³) × rock density (typically 2.7 MT/m³). Seigniorage is assessed according to AP Minor Mineral Concession Rules, with distinct gazetted rates per cubic metre / MT for Gangsaw size (≥ 270 × 150 cm) vs below Gangsaw size.";
    if (qLower.includes("gangsaw") || qLower.includes("size") || qLower.includes("cut")) {
      answer = "Gangsaw dimension threshold is 270 cm length × 150 cm height. Blocks meeting or exceeding these dimensions qualify as Gangsaw quality and command premium statutory rates.";
    } else if (qLower.includes("seigniorage") || qLower.includes("rate") || qLower.includes("fee") || qLower.includes("tax")) {
      answer = "Seigniorage fee is assessed by granite variety: Black Galaxy, Black Granite (other), Colour Group A (Srikakulam Blue, Moon White, River White), Colour Group B (Silver Waves, Madanapalli White), and Colour Others, factored by gangsaw qualification.";
    } else if (qLower.includes("weighbridge") || qLower.includes("dispatch") || qLower.includes("transit")) {
      answer = "Weighbridge cross-validation verifies gross vehicle weighbridge slips against photogrammetric calculated mass within ±5% tolerance before e-transit permit dispatch.";
    } else if (qLower.includes("block") || qLower.includes("ledger") || qLower.includes("total")) {
      const count = Array.isArray(ledger) ? ledger.length : 0;
      answer = `The ledger currently has ${count} recorded block(s). Each record includes 3D extents, defect annotations, usable slab yield, and statutory seigniorage.`;
    }
    return NextResponse.json({
      answer: `${answer}\n\n(Tip: Add ANTHROPIC_API_KEY to frontend/.env.local for full conversational Claude reasoning.)`,
    });
  }

  try {
    const answer = await callClaude({
      system: SYSTEM,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Ledger JSON:\n${JSON.stringify(ledger ?? []).slice(0, 20000)}\n\nQuestion: ${question}`,
        },
      ],
    });
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 502 },
    );
  }
}

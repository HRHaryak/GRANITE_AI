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
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 503 },
    );
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useBlocks, useSettings } from "../../../lib/m/store";
import { Header } from "../../../components/m/ui";

type Msg = { role: "user" | "ai"; text: string };

const CHIPS = [
  "Total volume measured?",
  "Which blocks are flagged?",
  "How is the fee calculated?",
  "Which category is highest?",
];

export default function AskPage() {
  const blocks = useBlocks();
  const s = useSettings();
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Hi! Ask me about your measured blocks, volumes, seigniorage or weighbridge mismatches.",
    },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    const ledger = {
      settings: { density: s.density, tolerancePct: s.tolerancePct, rates: s.rates },
      blocks: blocks.map((b) => ({
        code: b.code,
        category: b.category,
        dims_cm: [b.lengthCm, b.widthCm, b.heightCm],
        fill: b.fill,
        volume_m3: +b.volumeM3.toFixed(3),
        weight_t: +b.weightT.toFixed(2),
        fee: Math.round(b.fee),
        weighbridge_t: b.weighbridge?.tonnes ?? null,
        source: b.source,
        ts: b.ts,
      })),
    };
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, ledger }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "ai", text: res.ok ? data.answer : `⚠ ${data.error}` },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "⚠ Network error." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Ask GraniteMeasure" subtitle="Query your ledger in plain language" />
      <div className="flex-1 space-y-3 p-4">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "ml-auto bg-[#0f5257] text-white" : "bg-white text-slate-700 shadow-sm"}`}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Thinking…</div>}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 space-y-2 bg-[#f1f5f4] p-3">
        <div className="flex gap-2 overflow-x-auto">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#0f7e84] shadow-sm"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(q);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask a question…"
            className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#15949b]"
          />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5257] text-white disabled:opacity-40"
            disabled={busy}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import { CATEGORIES, ledgerCsv, useBlocks, variancePct } from "../../../lib/m/store";
import { BlockRow, Header } from "../../../components/m/ui";

export default function BlocksPage() {
  const blocks = useBlocks();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  const list = blocks.filter(
    (b) =>
      (cat === "All" || b.category === cat) &&
      b.code.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <Header
        title="Block ledger"
        subtitle={`${blocks.length} measured`}
        right={
          <button
            aria-label="Export CSV"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([ledgerCsv(blocks)], { type: "text/csv" }),
              );
              a.download = "granite-ledger.csv";
              a.click();
            }}
            className="rounded-full bg-white/15 p-2 active:bg-white/25"
          >
            <Download size={20} />
          </button>
        }
      />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search block ID"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${cat === c ? "bg-[#0f5257] text-white" : "bg-white text-slate-600"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-2.5">
          {list.map((b) => (
            <BlockRow key={b.id} b={b} variance={variancePct(b)} />
          ))}
          {list.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">
              No blocks found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Camera, Settings as Gear, MapPin, Sparkles } from "lucide-react";
import {
  CATEGORY_COLORS,
  addDemo,
  clearDemo,
  useBlocks,
  useSettings,
  variancePct,
} from "../../lib/m/store";
import { BlockRow, Card, Header, Stat } from "../../components/m/ui";

export default function HomePage() {
  const blocks = useBlocks();
  const s = useSettings();

  const today = new Date().toDateString();
  const todays = blocks.filter((b) => new Date(b.ts).toDateString() === today);
  const totalVol = blocks.reduce((a, b) => a + b.volumeM3, 0);
  const totalFee = blocks.reduce((a, b) => a + b.fee, 0);
  const flagged = blocks.filter((b) => {
    const v = variancePct(b);
    return v != null && Math.abs(v) > s.tolerancePct;
  }).length;
  const pending = blocks.filter((b) => !b.weighbridge).length;

  const byCat = Object.entries(
    blocks.reduce<Record<string, number>>((m, b) => {
      m[b.category] = (m[b.category] ?? 0) + b.volumeM3;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...byCat.map(([, v]) => v), 1);
  const hasDemo = blocks.some((b) => b.source === "DEMO");

  return (
    <div>
      <Header
        title="GraniteMeasure AI"
        subtitle={`${s.operator} · ${s.quarry}`}
        right={
          <Link
            href="/m/settings"
            className="rounded-full bg-white/15 p-2 active:bg-white/25"
            aria-label="Settings"
          >
            <Gear size={20} />
          </Link>
        }
      />

      <div className="-mt-1 space-y-4 px-4 pb-6">
        <div className="-mt-0 grid grid-cols-2 gap-3 pt-4">
          <Stat label="Blocks today" value={String(todays.length)} />
          <Stat
            label="Total volume"
            value={totalVol.toFixed(1)}
            unit="m³"
          />
          <Stat
            label="Seigniorage est."
            value={`₹${Math.round(totalFee).toLocaleString("en-IN")}`}
          />
          <Stat
            label="Variance flags"
            value={String(flagged)}
            tone={flagged ? "warn" : "default"}
          />
        </div>

        <Link
          href="/m/measure"
          className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#15949b] to-[#0b3a3f] p-5 text-white shadow-lg shadow-teal-900/25 active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <Camera size={28} />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold">
              Measure a new block
            </span>
            <span className="block text-xs text-teal-100">
              GPS-tagged photos → volume, category, fee
            </span>
          </span>
          <Sparkles size={20} className="text-teal-200" />
        </Link>

        {pending > 0 && (
          <Link
            href="/m/verify"
            className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <span>
              <b>{pending}</b> block{pending > 1 ? "s" : ""} awaiting weighbridge
              match
            </span>
            <span className="font-semibold">Verify →</span>
          </Link>
        )}

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Volume by category
          </h2>
          {byCat.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No blocks measured yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {byCat.map(([cat, v]) => (
                <div key={cat}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-600">{cat}</span>
                    <span className="text-slate-500">{v.toFixed(2)} m³</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(v / max) * 100}%`,
                        background: CATEGORY_COLORS[cat] ?? "#14b8a6",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Recent blocks
            </h2>
            <Link href="/m/blocks" className="text-xs font-semibold text-[#0f7e84]">
              See all
            </Link>
          </div>
          <div className="space-y-2.5">
            {blocks.slice(0, 3).map((b) => (
              <BlockRow key={b.id} b={b} variance={variancePct(b)} />
            ))}
            {blocks.length === 0 && (
              <Card className="text-center">
                <MapPin className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Go to the quarry and tap <b>Measure</b> to capture your first
                  block.
                </p>
              </Card>
            )}
          </div>
        </div>

        <Link
          href="/m/marker"
          className="block rounded-2xl bg-white p-3 text-center text-sm font-semibold text-[#0f7e84] shadow-sm"
        >
          Print the scale marker →
        </Link>

        <Link
          href="/m/method"
          className="block rounded-2xl bg-white p-3 text-center text-sm font-semibold text-[#0f7e84] shadow-sm"
        >
          How measurement and useful block work →
        </Link>

        <p className="text-center text-xs text-slate-400">
          {hasDemo ? (
            <button onClick={clearDemo} className="underline">
              Remove sample data
            </button>
          ) : blocks.length === 0 ? (
            <button onClick={() => addDemo(s)} className="underline">
              Preview layout with sample data
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}

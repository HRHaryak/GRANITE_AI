"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Scale, ShieldAlert } from "lucide-react";
import {
  saveBlock,
  useBlocks,
  useSettings,
  variancePct,
  type BlockRecord,
} from "../../../lib/m/store";
import { Badge, BlockRow, Card, Header } from "../../../components/m/ui";

function Form({ b, onDone }: { b: BlockRecord; onDone: () => void }) {
  const s = useSettings();
  const [ticket, setTicket] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [tonnes, setTonnes] = useState("");
  const [permit, setPermit] = useState("");
  const [dispatched, setDispatched] = useState("");
  const t = Number(tonnes);
  const preview = t > 0 ? ((b.weightT - t) / t) * 100 : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-800">{b.code}</p>
        <button onClick={onDone} className="text-xs text-slate-400 underline">
          Close
        </button>
      </div>
      <p className="text-xs text-slate-500">
        AI weight <b>{b.weightT.toFixed(2)} t</b> ({b.volumeM3.toFixed(2)} m³ ×{" "}
        {s.density} t/m³)
      </p>
      {[
        ["Weighbridge ticket no.", ticket, setTicket, "text"],
        ["Vehicle no.", vehicle, setVehicle, "text"],
        ["Net weight (MT)", tonnes, setTonnes, "number"],
        ["Dispatch permit / transit no.", permit, setPermit, "text"],
        ["Dispatched qty declared (MT)", dispatched, setDispatched, "number"],
      ].map(([label, val, set, type]) => (
        <label key={label as string} className="block text-[11px] font-semibold text-slate-500">
          {label as string}
          <input
            type={type as string}
            inputMode={type === "number" ? "decimal" : undefined}
            value={val as string}
            onChange={(e) => (set as (v: string) => void)(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#15949b]"
          />
        </label>
      ))}
      {preview != null && (
        <div
          className={`rounded-xl p-3 text-sm ${Math.abs(preview) <= s.tolerancePct ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}
        >
          Variance {preview > 0 ? "+" : ""}
          {preview.toFixed(1)}% —{" "}
          {Math.abs(preview) <= s.tolerancePct
            ? "within tolerance"
            : "possible revenue leakage, inspect"}
        </div>
      )}
      <button
        disabled={!(t > 0) || !ticket}
        onClick={() => {
          saveBlock({
            ...b,
            weighbridge: {
              ticket,
              vehicle,
              tonnes: t,
              permit: permit || undefined,
              dispatchedT: Number(dispatched) > 0 ? Number(dispatched) : undefined,
              ts: new Date().toISOString(),
            },
          });
          onDone();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        <CheckCircle2 size={18} /> Save match
      </button>
    </Card>
  );
}

function Verify() {
  const blocks = useBlocks();
  const s = useSettings();
  const pre = useSearchParams().get("id");
  const [openId, setOpenId] = useState<string | null>(pre);

  const pending = blocks.filter((b) => !b.weighbridge);
  const done = blocks.filter((b) => b.weighbridge);
  const flagged = done.filter((b) => {
    const v = variancePct(b);
    return v != null && Math.abs(v) > s.tolerancePct;
  });
  const open = blocks.find((b) => b.id === openId);

  return (
    <div>
      <Header
        title="Cross-validation"
        subtitle={`AI weight vs weighbridge · ±${s.tolerancePct}% tolerance`}
      />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Pending", pending.length, "text-slate-700"],
            ["Matched", done.length - flagged.length, "text-emerald-600"],
            ["Flagged", flagged.length, "text-red-600"],
          ].map(([l, n, c]) => (
            <div key={l as string} className="rounded-2xl bg-white p-3 shadow-sm">
              <p className={`text-2xl font-bold ${c}`}>{n as number}</p>
              <p className="text-[11px] text-slate-500">{l as string}</p>
            </div>
          ))}
        </div>

        {open && <Form b={open} onDone={() => setOpenId(null)} />}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Scale size={16} /> Awaiting weighbridge
          </p>
          <div className="space-y-2.5">
            {pending.map((b) => (
              <button
                key={b.id}
                onClick={() => setOpenId(b.id)}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold">{b.code}</p>
                    <p className="text-xs text-slate-500">
                      {b.weightT.toFixed(1)} t · {b.category}
                    </p>
                  </div>
                  <Badge tone="info">Enter ticket</Badge>
                </div>
              </button>
            ))}
            {pending.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">
                All measured blocks are matched.
              </p>
            )}
          </div>
        </div>

        {flagged.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <ShieldAlert size={16} /> Flagged for inspection
            </p>
            <div className="space-y-2.5">
              {flagged.map((b) => (
                <BlockRow key={b.id} b={b} variance={variancePct(b)} />
              ))}
            </div>
          </div>
        )}

        <p className="px-2 text-center text-[11px] text-slate-400">
          Each block exports an OMEPS-ready JSON record, and the
          /api/omeps/validate service cross-checks volume, weighbridge and
          dispatch quantities. Live OMEPS 2.0 credentials are not connected in
          this prototype.
        </p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

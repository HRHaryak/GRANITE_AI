"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_INFO, saveSettings, useSettings } from "../../../lib/m/store";
import { Card, Header } from "../../../components/m/ui";

export default function SettingsPage() {
  const saved = useSettings();
  const [s, setS] = useState(saved);
  const [ok, setOk] = useState(false);

  const input =
    "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#15949b]";

  return (
    <div>
      <Header title="Settings" back="/m" />
      <div className="space-y-4 p-4">
        <Card className="space-y-3">
          <label className="block text-[11px] font-semibold text-slate-500">
            Operator name
            <input className={input} value={s.operator} onChange={(e) => setS({ ...s, operator: e.target.value })} />
          </label>
          <label className="block text-[11px] font-semibold text-slate-500">
            Quarry / lease
            <input className={input} value={s.quarry} onChange={(e) => setS({ ...s, quarry: e.target.value })} />
          </label>
          <label className="block text-[11px] font-semibold text-slate-500">
            Dressing allowance per face (cm)
            <input type="number" className={input} value={s.dressingCm} onChange={(e) => setS({ ...s, dressingCm: Number(e.target.value) })} />
          </label>
          <label className="block text-[11px] font-semibold text-slate-500">
            Printed marker size (cm, black square)
            <input type="number" className={input} value={s.markerCm} onChange={(e) => setS({ ...s, markerCm: Number(e.target.value) })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-semibold text-slate-500">
              Density (t/m³)
              <input type="number" step="0.01" className={input} value={s.density} onChange={(e) => setS({ ...s, density: Number(e.target.value) })} />
            </label>
            <label className="block text-[11px] font-semibold text-slate-500">
              Tolerance (±%)
              <input type="number" className={input} value={s.tolerancePct} onChange={(e) => setS({ ...s, tolerancePct: Number(e.target.value) })} />
            </label>
          </div>
        </Card>
        <Card className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">
            Seigniorage rates (₹ per MT)
          </p>
          <p className="text-xs text-slate-500">
            Rates currently in force. Above gangsaw = longest side &gt; 270 cm
            or second side &gt; 150 cm.
          </p>
          {CATEGORIES.map((c) => (
            <div key={c} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">{c}</p>
              <p className="mb-2 text-[10px] leading-tight text-slate-400">
                {CATEGORY_INFO[c]}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["above", "below"] as const).map((k) => (
                  <label key={k} className="block text-[11px] font-semibold text-slate-500">
                    {k === "above" ? "Above gangsaw" : "Below gangsaw"}
                    <input
                      type="number"
                      className={input}
                      value={s.rates[c]?.[k] ?? 0}
                      onChange={(e) =>
                        setS({
                          ...s,
                          rates: {
                            ...s.rates,
                            [c]: { ...s.rates[c], [k]: Number(e.target.value) },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <button
          onClick={() => {
            saveSettings(s);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          }}
          className="w-full rounded-2xl bg-[#0f5257] py-3.5 text-sm font-semibold text-white"
        >
          {ok ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

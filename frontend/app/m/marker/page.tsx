"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { markerSvg } from "../../../lib/m/marker";
import { saveSettings, useSettings } from "../../../lib/m/store";
import { Card, Header } from "../../../components/m/ui";

export default function MarkerPage() {
  const s = useSettings();
  const [svg, setSvg] = useState("");

  useEffect(() => {
    markerSvg(s.markerCm).then(setSvg);
  }, [s.markerCm]);

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `granite-marker-${s.markerCm}cm.svg`;
    a.click();
  }

  return (
    <div>
      <Header title="Scale marker" subtitle="Print once, use on every block" back="/m" />
      <div className="space-y-4 p-4">
        <Card className="space-y-3">
          <label className="block text-[11px] font-semibold text-slate-500">
            Marker size (cm, black square)
            <input
              type="number"
              value={s.markerCm}
              onChange={(e) => saveSettings({ ...s, markerCm: Number(e.target.value) || 40 })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <div
            className="flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2"
            dangerouslySetInnerHTML={{
              __html: svg.replace(/width="[^"]*cm" height="[^"]*cm"/, 'width="100%"'),
            }}
          />
          <button
            onClick={download}
            disabled={!svg}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5257] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Download size={16} /> Download printable SVG ({s.markerCm} cm)
          </button>
        </Card>
        <Card className="space-y-2 text-xs leading-relaxed text-slate-600">
          <p className="text-sm font-semibold text-slate-700">How to use</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Print the SVG at <b>100% scale</b> (no “fit to page”) on a large sheet or banner, and stick it on a flat rigid board. Measure the black square with a tape: it must equal {s.markerCm} cm.</li>
            <li>Lay or hold the marker <b>flat against each face</b> you photograph, fully visible, not folded or in shadow.</li>
            <li>Photograph straight on, from a few metres, with the whole face and the marker in frame. Use the camera at full resolution.</li>
            <li>A bigger marker is more accurate. Tests on a 2.7 m face: a 15 cm marker can be off by 10% or more; 40–50 cm stays within about 1–2%.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

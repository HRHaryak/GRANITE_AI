"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, MapPin, Trash2 } from "lucide-react";
import {
  omepsPayload,
  deleteBlock,
  useBlocks,
  useSettings,
  variancePct,
} from "../../../lib/m/store";
import { Badge, Box, Card, FaceCards, Header } from "../../../components/m/ui";
import { MethodCard } from "../../../components/m/MethodCard";
import { BlockViz } from "../../../components/m/BlockViz";
import { faceUseful } from "../../../lib/m/geometry";

function Detail() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const b = useBlocks().find((x) => x.id === id);
  const s = useSettings();

  if (!b) {
    return (
      <div>
        <Header title="Block" back="/m/blocks" />
        <p className="p-8 text-center text-sm text-slate-400">
          Block not found.
        </p>
      </div>
    );
  }
  const v = variancePct(b);

  function exportJson() {
    if (!b) return;
    const blob = new Blob([JSON.stringify(omepsPayload(b), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${b.code}.json`;
    a.click();
  }

  const rows: [string, string][] = [
    ["Condition", b.condition === "DRESSED" ? "Dressed" : "Raw → dressed"],
    ["Raw L × W × H", `${b.lengthCm} × ${b.widthCm} × ${b.heightCm} cm`],
    ["Raw shape fill factor", `${(b.fill * 100).toFixed(0)}%`],
    ["Category", b.category],
    ["Weight", `${b.weightT.toFixed(2)} t`],
    ["Slab", b.slab === "ABOVE" ? "Above gangsaw (>270×150 cm)" : "Below gangsaw (≤270×150 cm)"],
    ["Rate", `₹${b.ratePerMT}/MT`],
    ["Scale reference", `${b.refLabel} (${b.refCm} cm)`],
    ["Method", b.source.replace("_", " ")],
  ];

  return (
    <div>
      <Header title={b.code} subtitle={b.quarry} back="/m/blocks" />
      <div className="space-y-4 p-4">
        {!b.faces && b.thumbs[0] && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.thumbs[0]} alt="" className="w-full" />
            {b.box?.block && <Box b={b.box.block} color="#2dd4bf" label="Block" />}
            {b.box?.ref && <Box b={b.box.ref} color="#fbbf24" label="Ref" />}
          </div>
        )}
        {!b.faces && b.thumbs.length > 1 && (
          <div className="flex gap-2">
            {b.thumbs.slice(1).map((t, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={t} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ))}
          </div>
        )}

        <div className="rounded-3xl bg-gradient-to-br from-[#14532d] to-[#16a34a] p-5 text-white">
          <p className="text-xs uppercase tracking-wide text-green-100">
            {b.condition === "DRESSED" ? "Dressed block" : "Final dressed block"}
          </p>
          <p className="text-4xl font-bold">
            {b.volumeM3.toFixed(2)}
            <span className="ml-1 text-lg font-medium">m³</span>
          </p>
          {(() => {
            const d = b.usable ?? {
              l: b.lengthCm,
              w: b.widthCm,
              h: b.heightCm,
            };
            return (
              <p className="mt-1 text-sm font-medium">
                {(d.l / 100).toFixed(2)} × {(d.w / 100).toFixed(2)} ×{" "}
                {(d.h / 100).toFixed(2)} m
                <span className="ml-1 text-xs font-normal text-green-100">
                  ({d.l} × {d.w} × {d.h} cm)
                </span>
              </p>
            );
          })()}
          <p className="mt-2 text-sm">
            Seigniorage estimate{" "}
            <b>₹{Math.round(b.fee).toLocaleString("en-IN")}</b>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {b.confidence && (
              <Badge
                tone={
                  b.confidence === "HIGH"
                    ? "ok"
                    : b.confidence === "MEDIUM"
                      ? "warn"
                      : "bad"
                }
              >
                {b.confidence}
              </Badge>
            )}
            {b.uncertaintyPct != null && (
              <Badge tone="mute">±{b.uncertaintyPct}%</Badge>
            )}
            <Badge tone="info">{b.shape}</Badge>
          </div>
        </div>

        {b.rawVolumeM3 != null && (
          <div className="rounded-3xl bg-gradient-to-br from-[#0b3a3f] to-[#15808a] p-5 text-white">
            <p className="text-xs uppercase tracking-wide text-teal-100">
              Raw block as quarried
            </p>
            <p className="text-2xl font-bold">
              {b.rawVolumeM3.toFixed(2)}
              <span className="ml-1 text-base font-medium">m³</span>
              <span className="ml-2 text-sm font-medium text-teal-100">
                dressed = {((b.volumeM3 / b.rawVolumeM3) * 100).toFixed(0)}% of raw
              </span>
            </p>
            <p className="mt-1 text-sm">
              {(b.lengthCm / 100).toFixed(2)} × {(b.widthCm / 100).toFixed(2)} ×{" "}
              {(b.heightCm / 100).toFixed(2)} m
            </p>
          </div>
        )}

        {b.viz && b.usable && (
          <Card>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Block visualisation
            </p>
            <BlockViz
              gross={{ l: b.lengthCm, w: b.widthCm, h: b.heightCm }}
              cuboid={b.viz.cuboid}
              zones={b.viz.zones}
              fin={b.usable}
            />
          </Card>
        )}

        {b.reasoning && (
          <Card>
            <p className="mb-1 text-sm font-semibold text-slate-700">
              How the useful block was worked out
            </p>
            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {b.reasoning}
            </p>
          </Card>
        )}

        {b.faces && b.faces.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Face-by-face inspection
            </p>
            <FaceCards
              faces={b.faces}
              images={b.thumbs}
              useful={
                b.usable
                  ? Object.fromEntries(
                      b.faces.map((f) => [f.face, faceUseful(f.face, b.usable!)]),
                    )
                  : undefined
              }
            />
          </div>
        )}

        {b.faces && (
          <MethodCard
            v={{
              scaleBasis: b.refLabel.split(":")[0],
              scaleCues: b.refLabel.split(":").slice(1).join(":").trim() || undefined,
              uncertaintyPct: b.uncertaintyPct,
              condition: b.condition,
              allowanceCm: s.dressingCm,
              density: s.density,
              tolerancePct: s.tolerancePct,
              zones: b.viz?.zones.length,
              faces: b.faces.length,
            }}
          />
        )}

        {b.tape && (
          <Card className="text-xs text-slate-600">
            <p className="mb-1 text-sm font-semibold text-slate-700">
              Tape check
            </p>
            {(
              [
                ["Length", b.usable?.l ?? b.lengthCm, b.tape.l],
                ["Width", b.usable?.w ?? b.widthCm, b.tape.w],
                ["Height", b.usable?.h ?? b.heightCm, b.tape.h],
              ] as [string, number, number][]
            )
              .filter(([, , t]) => t > 0)
              .map(([k, a, t]) => (
                <p key={k}>
                  {k}: measured {a} cm vs tape {t} cm (
                  {(((a - t) / t) * 100).toFixed(1)}%)
                </p>
              ))}
          </Card>
        )}

        <Card className="divide-y divide-slate-100 !p-0">
          {rows.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="text-slate-500">{k}</span>
              <span className="text-right font-medium text-slate-800">{val}</span>
            </div>
          ))}
        </Card>

        <Card className="space-y-1 text-xs text-slate-600">
          <p className="flex items-center gap-1.5 font-semibold text-slate-700">
            <MapPin size={14} /> Audit trail
          </p>
          <p>
            {b.lat != null
              ? `${b.lat.toFixed(5)}, ${b.lng?.toFixed(5)} (±${b.accuracyM} m)`
              : "No GPS fix"}
          </p>
          <p>{new Date(b.ts).toLocaleString()}</p>
          <p>Operator: {b.operator}</p>
          <p className="break-all font-mono text-[10px] text-slate-400">
            SHA-256 {b.hash}
          </p>
        </Card>

        <Card>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Weighbridge cross-check
          </p>
          {b.weighbridge ? (
            <div className="space-y-1 text-sm">
              <p>
                Ticket {b.weighbridge.ticket} · {b.weighbridge.vehicle}
              </p>
              <p>
                AI {b.weightT.toFixed(2)} MT vs weighbridge{" "}
                {b.weighbridge.tonnes.toFixed(2)} MT
              </p>
              {b.weighbridge.permit && (
                <p>
                  Dispatch permit {b.weighbridge.permit}
                  {b.weighbridge.dispatchedT != null &&
                    ` · declared ${b.weighbridge.dispatchedT.toFixed(2)} MT`}
                </p>
              )}
              {v != null && (
                <Badge tone={Math.abs(v) <= s.tolerancePct ? "ok" : "bad"}>
                  {v > 0 ? "+" : ""}
                  {v.toFixed(1)}% (tolerance ±{s.tolerancePct}%)
                </Badge>
              )}
            </div>
          ) : (
            <Link
              href={`/m/verify?id=${b.id}`}
              className="text-sm font-semibold text-[#0f7e84]"
            >
              Add weighbridge ticket →
            </Link>
          )}
        </Card>

        {b.notes && <p className="px-1 text-xs text-slate-500">{b.notes}</p>}

        <div className="flex gap-3">
          <button
            onClick={exportJson}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-[#0f5257] shadow-sm"
          >
            <Download size={16} /> Export OMEPS record
          </button>
          <button
            onClick={() => {
              deleteBlock(b.id);
              router.replace("/m/blocks");
            }}
            className="flex items-center justify-center rounded-2xl bg-white px-4 text-red-500 shadow-sm"
            aria-label="Delete"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BlockPage() {
  return (
    <Suspense>
      <Detail />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import {
  CATEGORY_COLORS,
  type BlockRecord,
  type FaceReport,
} from "../../lib/m/store";

export function Header({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <div className="bg-gradient-to-br from-[#0b3a3f] via-[#0f5257] to-[#15808a] px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {back && (
            <Link
              href={back}
              className="-ml-2 rounded-full p-1.5 active:bg-white/15"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </Link>
          )}
          <div>
            <h1 className="text-xl font-semibold leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-teal-100/80">{subtitle}</p>
            )}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(15,60,65,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-2xl bg-white/95 p-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : "text-[#0f5257]"}`}
      >
        {value}
        {unit && (
          <span className="ml-1 text-xs font-medium text-slate-400">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export function CategoryDot({ category }: { category: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full ring-2 ring-white"
      style={{ background: CATEGORY_COLORS[category] ?? "#14b8a6" }}
    />
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ok" | "warn" | "bad" | "info" | "mute";
}) {
  const map = {
    ok: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-red-100 text-red-700",
    info: "bg-sky-100 text-sky-700",
    mute: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function BlockRow({
  b,
  variance,
}: {
  b: BlockRecord;
  variance: number | null;
}) {
  return (
    <Link
      href={`/m/block?id=${b.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_8px_rgba(15,60,65,0.08)] active:scale-[0.99]"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-200">
        {b.thumbs[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.thumbs[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-lg font-bold text-white"
            style={{ background: CATEGORY_COLORS[b.category] ?? "#14b8a6" }}
          >
            {b.category[0]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {b.code}
        </p>
        <p className="text-xs text-slate-500">
          {b.category} · {b.volumeM3.toFixed(2)} m³ · {b.weightT.toFixed(1)} t
        </p>
        <p className="text-[11px] text-slate-400">
          {new Date(b.ts).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <div className="text-right">
        {variance == null ? (
          <Badge tone="mute">No weighbridge</Badge>
        ) : Math.abs(variance) <= 10 ? (
          <Badge tone="ok">Match {variance.toFixed(1)}%</Badge>
        ) : (
          <Badge tone="bad">Flag {variance.toFixed(1)}%</Badge>
        )}
      </div>
    </Link>
  );
}

export function Box({
  b,
  color,
  label,
}: {
  b: number[];
  color: string;
  label: string;
}) {
  const [x1, y1, x2, y2] = b;
  return (
    <div
      className="absolute rounded-md border-2"
      style={{
        left: `${x1 * 100}%`,
        top: `${y1 * 100}%`,
        width: `${(x2 - x1) * 100}%`,
        height: `${(y2 - y1) * 100}%`,
        borderColor: color,
      }}
    >
      <span
        className="absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
        style={{ background: color }}
      >
        {label}
      </span>
    </div>
  );
}

const SEV_COLOR = { MINOR: "#fbbf24", MAJOR: "#fb923c", REJECT: "#ef4444" };

export function FaceCards({
  faces,
  images,
  useful,
  ignoredDefects,
  onToggleDefect,
}: {
  faces: FaceReport[];
  images: string[];
  /** Useful width x height (cm) of the final block as seen on each face. */
  useful?: Record<string, [number, number] | null>;
  ignoredDefects?: Set<string>;
  onToggleDefect?: (key: string) => void;
}) {
  return (
    <div className="space-y-3">
      {faces.map((f, i) => {
        const img = images[f.photo - 1] ?? images[i];
        const pct = Math.max(0, Math.min(100, f.usable_pct));
        return (
          <Card key={`${f.photo}-${f.face}`} className="space-y-2 !p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">
                {f.photo}. {f.face} face
              </p>
              <Badge tone={pct >= 85 ? "ok" : pct >= 60 ? "warn" : "bad"}>
                {pct.toFixed(0)}% usable
              </Badge>
            </div>
            {img && (
              <div className="relative overflow-hidden rounded-xl bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={f.face} className="w-full" />
                {f.reference_box && (
                  <Box b={f.reference_box} color="#38bdf8" label="Ref" />
                )}
                {f.defects.map((d, j) => {
                  const key = `${f.photo}-${f.face}-${j}`;
                  const isIgnored = ignoredDefects?.has(key);
                  if (isIgnored) return null;
                  return (
                    <Box
                      key={j}
                      b={d.box}
                      color={SEV_COLOR[d.severity] ?? "#ef4444"}
                      label={`${j + 1}`}
                    />
                  );
                })}
              </div>
            )}
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: pct >= 85 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-[10px] uppercase text-slate-400">
                  Face size {f.measured === "MARKER" ? "· measured ✓" : "· estimated"}
                </p>
                <p className="font-semibold text-slate-700">
                  {f.width_cm ? Math.round(f.width_cm) : "?"} ×{" "}
                  {f.height_cm ? Math.round(f.height_cm) : "?"} cm
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2">
                <p className="text-[10px] uppercase text-emerald-600">
                  Useful on this face
                </p>
                <p className="font-semibold text-emerald-800">
                  {useful?.[f.face]
                    ? `${Math.round(useful[f.face]![0])} × ${Math.round(useful[f.face]![1])} cm`
                    : `${pct.toFixed(0)}% of area`}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600">{f.explanation}</p>
            {f.defects.length > 0 && (
              <ul className="space-y-1.5 text-xs">
                {f.defects.map((d, j) => {
                  const key = `${f.photo}-${f.face}-${j}`;
                  const isIgnored = ignoredDefects?.has(key);
                  return (
                    <li
                      key={j}
                      className={`flex items-center justify-between gap-2 rounded-lg p-2 transition ${
                        isIgnored ? "bg-slate-100 opacity-60" : "bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
                          style={{ background: isIgnored ? "#94a3b8" : SEV_COLOR[d.severity] ?? "#ef4444" }}
                        >
                          {j + 1}
                        </span>
                        <span className={`text-slate-600 ${isIgnored ? "line-through text-slate-400" : ""}`}>
                          <b className="capitalize">{d.type}</b> ({d.severity}): {d.reason}
                        </span>
                      </div>
                      {onToggleDefect && d.severity !== "MINOR" && (
                        <button
                          type="button"
                          onClick={() => onToggleDefect(key)}
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            isIgnored
                              ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                              : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          }`}
                        >
                          {isIgnored ? "Ignored" : "Dismiss"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

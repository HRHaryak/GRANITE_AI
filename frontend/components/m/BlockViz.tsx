"use client";

import type { Cuboid, Prism, Range } from "../../lib/m/geometry";
import type { Dims } from "../../lib/m/store";

const RED = "#ef4444";
const GREEN = "#16a34a";

export function BlockViz({
  gross,
  cuboid,
  zones,
  fin,
}: {
  gross: Dims;
  cuboid: Cuboid;
  zones: Prism[];
  fin: Dims;
}) {
  const { l: L, w: W, h: H } = gross;
  if (!(L > 0 && W > 0 && H > 0)) return null;

  const Wd = W * 0.5;
  const cx = 0.82;
  const cy = 0.57;
  const s = Math.min(290 / (L + Wd * cx), 170 / (H + Wd * cy));
  const ox = 24;
  const base = 24 + (H + Wd * cy) * s;
  const P = (x: number, y: number, z: number) =>
    `${(ox + x * L * s + y * Wd * s * cx).toFixed(1)},${(base - z * H * s - y * Wd * s * cy).toFixed(1)}`;
  const poly = (pts: [number, number, number][]) =>
    pts.map(([x, y, z]) => P(x, y, z)).join(" ");

  const front = (x: Range, z: Range, y = 0) =>
    poly([[x[0], y, z[0]], [x[1], y, z[0]], [x[1], y, z[1]], [x[0], y, z[1]]]);
  const top = (x: Range, y: Range, z = 1) =>
    poly([[x[0], y[0], z], [x[1], y[0], z], [x[1], y[1], z], [x[0], y[1], z]]);
  const right = (y: Range, z: Range, x = 1) =>
    poly([[x, y[0], z[0]], [x, y[1], z[0]], [x, y[1], z[1]], [x, y[0], z[1]]]);

  const c = cuboid;
  const W3 = Math.ceil(L * s + Wd * s * cx + 48);
  const H3 = Math.ceil(base + 8);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W3} ${H3}`} className="w-full" role="img" aria-label="3D view of the block">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={RED} fillOpacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={RED} strokeWidth="2" />
          </pattern>
        </defs>
        {/* gross block */}
        <polygon points={front([0, 1], [0, 1])} fill="#e2e8f0" stroke="#64748b" />
        <polygon points={top([0, 1], [0, 1])} fill="#f1f5f9" stroke="#64748b" />
        <polygon points={right([0, 1], [0, 1])} fill="#cbd5e1" stroke="#64748b" />
        {/* defect zones on visible faces */}
        {zones.map((z, i) => (
          <g key={i}>
            {z.y[0] <= 0.001 && <polygon points={front(z.x, z.z)} fill="url(#hatch)" stroke={RED} />}
            {z.x[1] >= 0.999 && <polygon points={right(z.y, z.z)} fill="url(#hatch)" stroke={RED} />}
            {z.z[1] >= 0.999 && <polygon points={top(z.x, z.y)} fill="url(#hatch)" stroke={RED} />}
          </g>
        ))}
        {/* usable block */}
        <polygon points={right(c.y, c.z, c.x[1])} fill={GREEN} fillOpacity="0.8" stroke="#14532d" strokeWidth="1.5" />
        <polygon points={top(c.x, c.y, c.z[1])} fill="#4ade80" fillOpacity="0.9" stroke="#14532d" strokeWidth="1.5" />
        <polygon points={front(c.x, c.z, c.y[0])} fill={GREEN} fillOpacity="0.85" stroke="#14532d" strokeWidth="1.5" />
        <text
          x={ox + ((c.x[0] + c.x[1]) / 2) * L * s + c.y[0] * Wd * s * cx}
          y={base - ((c.z[0] + c.z[1]) / 2) * H * s - c.y[0] * Wd * s * cy + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="white"
        >
          {fin.l} × {fin.h}
        </text>
      </svg>

      <div className="grid grid-cols-3 gap-2">
        <Ortho title="Front" a={[L, "L"]} b={[H, "H"]} xr={c.x} yr={c.z} zones={zones.map((z) => [z.x, z.z] as [Range, Range])} fa={fin.l} fb={fin.h} />
        <Ortho title="Side" a={[W, "W"]} b={[H, "H"]} xr={c.y} yr={c.z} zones={zones.map((z) => [z.y, z.z] as [Range, Range])} fa={fin.w} fb={fin.h} />
        <Ortho title="Top" a={[L, "L"]} b={[W, "W"]} xr={c.x} yr={c.y} zones={zones.map((z) => [z.x, z.y] as [Range, Range])} fa={fin.l} fb={fin.w} flipY />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
        <Legend color="#e2e8f0" label="Raw block" border />
        <Legend color="#fca5a5" label="Excluded (defect)" />
        <Legend color={GREEN} label="Final usable block" />
      </div>
    </div>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${border ? "border border-slate-400" : ""}`} style={{ background: color }} />
      {label}
    </span>
  );
}

function Ortho({
  title,
  a,
  b,
  xr,
  yr,
  zones,
  fa,
  fb,
  flipY,
}: {
  title: string;
  a: [number, number | string];
  b: [number, number | string];
  xr: Range;
  yr: Range;
  zones: [Range, Range][];
  fa: number;
  fb: number;
  flipY?: boolean;
}) {
  const [A, an] = a;
  const [B, bn] = b;
  const k = Math.min(92 / A, 72 / B);
  const w = A * k;
  const h = B * k;
  const ox = 4;
  const oy = 4;
  const X = (v: number) => ox + v * w;
  const Y = (v: number) => oy + (flipY ? 1 - v : 1 - v) * h;
  const rect = (x: Range, y: Range) => ({
    x: X(x[0]),
    y: Y(y[1]),
    width: (x[1] - x[0]) * w,
    height: (y[1] - y[0]) * h,
  });
  return (
    <div className="rounded-xl bg-white p-1.5 shadow-sm">
      <svg viewBox={`0 0 ${w + 8} ${h + 8}`} className="w-full">
        <rect x={ox} y={oy} width={w} height={h} fill="#f1f5f9" stroke="#64748b" />
        {zones.map(([x, y], i) => (
          <rect key={i} {...rect(x, y)} fill={RED} fillOpacity="0.45" stroke={RED} />
        ))}
        <rect {...rect(xr, yr)} fill={GREEN} fillOpacity="0.85" stroke="#14532d" />
      </svg>
      <p className="text-center text-[10px] font-semibold text-slate-700">{title}</p>
      <p className="text-center text-[10px] text-slate-500">
        {an} {Math.round(fa)} · {bn} {Math.round(fb)} cm
      </p>
    </div>
  );
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// OMEPS 2.0-compatible cross-validation service.
// POST { volume_m3?, weight_mt, weighbridge_mt, dispatched_mt?, tolerance_pct? }
type Body = {
  weight_mt?: number;
  weighbridge_mt?: number;
  dispatched_mt?: number;
  tolerance_pct?: number;
};

const pct = (a: number, b: number) => ((a - b) / b) * 100;

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const tol = b.tolerance_pct ?? 10;
  if (!(b.weight_mt && b.weight_mt > 0) || !(b.weighbridge_mt && b.weighbridge_mt > 0)) {
    return NextResponse.json(
      { error: "weight_mt and weighbridge_mt must be positive numbers." },
      { status: 400 },
    );
  }
  const checks = [
    {
      name: "ai_vs_weighbridge",
      variance_pct: +pct(b.weight_mt, b.weighbridge_mt).toFixed(2),
    },
    ...(b.dispatched_mt && b.dispatched_mt > 0
      ? [
          {
            name: "weighbridge_vs_dispatch",
            variance_pct: +pct(b.weighbridge_mt, b.dispatched_mt).toFixed(2),
          },
          {
            name: "ai_vs_dispatch",
            variance_pct: +pct(b.weight_mt, b.dispatched_mt).toFixed(2),
          },
        ]
      : []),
  ].map((c) => ({ ...c, within_tolerance: Math.abs(c.variance_pct) <= tol }));
  return NextResponse.json({
    tolerance_pct: tol,
    status: checks.every((c) => c.within_tolerance) ? "MATCH" : "FLAG",
    checks,
  });
}

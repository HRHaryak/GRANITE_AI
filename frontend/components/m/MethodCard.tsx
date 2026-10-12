"use client";

import type { ReactNode } from "react";
import { Card } from "./ui";

export type MethodValues = {
  scaleBasis?: string;
  scaleCues?: string;
  uncertaintyPct?: number;
  condition?: "RAW" | "DRESSED";
  allowanceCm: number;
  density: number;
  tolerancePct: number;
  zones?: number;
  faces?: number;
};

const OSS: [string, string, string][] = [
  ["OpenCV + ArUco / ChArUco markers", "Apache-2.0", "Printed marker of known size gives exact cm-per-pixel scale and removes perspective error (homography)."],
  ["COLMAP, OpenMVG + OpenMVS, Meshroom", "BSD / MPL-2.0", "Structure-from-Motion + multi-view stereo: builds a real 3D point cloud from the 5+ photos."],
  ["Open3D", "MIT", "Cleans the point cloud, fits an oriented bounding box, computes length, width, height and volume."],
  ["Depth Anything V2 (small), MiDaS", "Apache-2.0 / MIT", "Depth from a single photo; relative only, so it needs a marker or known object to become metric."],
  ["SAM 2 (Segment Anything)", "Apache-2.0", "Cuts the block out of the background and separates each face."],
  ["YOLO segmentation, Detectron2", "AGPL-3.0 / Apache-2.0", "Trained on labelled granite photos to find cracks, holes, voids and weathered zones as pixel masks."],
  ["PyTorch + timm (EfficientNet, ConvNeXt)", "BSD / Apache-2.0", "Classifies the stone into the seigniorage colour categories."],
];

function Sec({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-700">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}

export function MethodCard({ v }: { v: MethodValues }) {
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">How this was measured</p>
        <p className="text-[11px] text-slate-400">Explanation for reviewers</p>
      </div>

      <Sec title="1. How the actual block size is measured" open>
        <p className="font-semibold text-slate-700">In this prototype</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <b>Open-source scale (accurate path):</b> a printed ArUco marker of known size is placed flat on each face. It is found in the browser with js-aruco2 (MIT, OpenCV marker dictionary). Four marker corners give a homography, which turns pixels on that face into real centimetres and corrects camera angle.
          </li>
          <li>A vision AI (Claude, not open source) traces the outline of each face and the defects. The face corners are passed through the homography to get each face's true width and height.</li>
          <li>Length, width and height of the block are taken as the median over every face that shows them; disagreements are reported.</li>
          <li>
            Without a marker, the AI estimates scale from the scene instead (error ±25% or more) and says so.
            {v.scaleBasis && (
              <>
                {" "}
                <b>This block: {v.scaleBasis === "MARKER" ? "marker measured" : "scene estimate"}{v.scaleCues ? ` — ${v.scaleCues}` : ""}.</b>
              </>
            )}
          </li>
          <li>
            Error bar shown with the result: <b>±{v.uncertaintyPct ?? "—"}%</b>. Bench test of the maths on a 2.7 m face: a 15 cm marker can be off by 10%+, a 40–50 cm marker at full resolution stays within about 1–2% (marker scale error only; the face-outline tracing adds a few percent).
          </li>
          <li>Results are rounded to 5 cm and stored, so the same photos always give the same answer.</li>
        </ol>

        <p className="pt-1 font-semibold text-slate-700">Open-source stack for the production version</p>
        <div className="space-y-1.5">
          {OSS.map(([name, lic, what]) => (
            <div key={name} className="rounded-lg bg-white p-2">
              <p className="font-semibold text-slate-700">
                {name} <span className="font-normal text-slate-400">· {lic}</span>
              </p>
              <p>{what}</p>
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-white p-2">
          <b>Next step for production:</b> keep the marker, but replace AI face tracing with COLMAP 3D reconstruction and an Open3D bounding box for exact L × W × H and volume. SAM 2 and a trained YOLO model find the block and the defects. Check each licence (for example AGPL and non-commercial ones) before government deployment.
        </p>
      </Sec>

      <Sec title="2. How the useful block is identified" open>
        <p className="font-semibold text-slate-700">Parameters used</p>
        <ul className="list-disc space-y-1 pl-4">
          <li><b>Defect type:</b> crack, hole, void, weathered zone, strong vein, chipped corner. Surface soil or dust is ignored because it washes off.</li>
          <li><b>Severity:</b> MINOR (cosmetic, kept), MAJOR (reduces usable stone, excluded), REJECT (unusable, excluded).</li>
          <li><b>Defect extent:</b> a box around each MAJOR/REJECT defect, with a safety margin around cracks and holes. {v.zones != null && <>This block has <b>{v.zones}</b> excluded zone{v.zones === 1 ? "" : "s"} across {v.faces ?? 5} photos.</>}</li>
          <li><b>Depth rule:</b> a REJECT defect (a crack, void or hole that splits the block) is assumed to run through the whole block, so if half the top face is cracked, that half is removed from every side. MAJOR and surface defects (chips, weathered patches) are localised and only excluded 20-30 cm deep.</li>
          <li><b>Largest clean block:</b> the app searches every rectangular block that avoids all excluded zones and keeps the one with the biggest volume.</li>
          <li>
            <b>Dressing allowance:</b>{" "}
            {v.condition === "DRESSED"
              ? "not applied, because the block is already dressed."
              : <>{v.allowanceCm} cm is removed from each outer face of a raw block for squaring (editable in Settings).</>}
          </li>
          <li><b>Face usability:</b> % of each face that is sound after excluding the defect boxes, shown under each photo.</li>
        </ul>
        <p className="pt-1 font-semibold text-slate-700">From useful block to money</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Volume = L × W × H of the useful block. Weight = volume × density ({v.density} t/m³).</li>
          <li>Slab: above gangsaw if the longest side exceeds 270 cm or the second side exceeds 150 cm, otherwise below.</li>
          <li>Seigniorage = weight (MT) × the rate for the category and slab.</li>
        </ul>
        <p className="pt-1 font-semibold text-slate-700">How the result is checked</p>
        <ul className="list-disc space-y-1 pl-4">
          <li><b>Tape check:</b> the officer types the real L, W, H; the app shows the % difference for each dimension.</li>
          <li><b>Weighbridge:</b> AI weight is compared with the weighbridge and dispatch weights, flagged beyond ±{v.tolerancePct}%.</li>
        </ul>
        <p className="rounded-lg bg-white p-2">
          <b>Production version:</b> the defect boxes come from a segmentation model trained on labelled quarry photos, the exclusion zones come from the 3D reconstruction instead of the through-depth assumption, and the final cut is confirmed by the officer on site.
        </p>
      </Sec>
    </Card>
  );
}

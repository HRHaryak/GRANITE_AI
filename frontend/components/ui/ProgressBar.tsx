"use client";

import React from "react";

type ProgressColor = "amber" | "emerald" | "sky" | "danger";

type ProgressBarProps = {
  progress: number | null | undefined;
  className?: string;
  color?: ProgressColor;
  label?: string;
  showValue?: boolean;
};

const COLOR_CLASSES: Record<ProgressColor, string> = {
  amber: "bg-[var(--accent)]",
  emerald: "bg-[var(--success)]",
  sky: "bg-[var(--info)]",
  danger: "bg-[var(--danger)]",
};

export default function ProgressBar({
  progress,
  className = "",
  color = "amber",
  label,
  showValue = false,
}: ProgressBarProps) {
  const hasProgress =
    typeof progress === "number" && Number.isFinite(progress);

  const clamped = hasProgress
    ? Math.min(100, Math.max(0, progress))
    : null;

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? (
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {label}
            </span>
          ) : (
            <span />
          )}

          {showValue && (
            <span className="mono-data shrink-0 text-[10px] font-bold text-[var(--text-secondary)]">
              {clamped === null ? "—" : `${Math.round(clamped)}%`}
            </span>
          )}
        </div>
      )}

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]"
        role="progressbar"
        aria-label={label || "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped === null ? undefined : clamped}
        aria-valuetext={clamped === null ? "Progress unavailable" : undefined}
      >
        {clamped !== null && (
          <div
            className={`h-full rounded-full ${COLOR_CLASSES[color]} transition-[width] duration-300 ease-out`}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  );
}

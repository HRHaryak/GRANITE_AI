"use client";

import React from "react";
import Card from "./Card";

type MetricStatus =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "unavailable";

type MetricCardProps = {
  icon?: React.ReactNode;
  label: string;
  value: string | number | null | undefined;
  sublabel?: string;
  status?: MetricStatus;
  unit?: string;
  provenance?: string;
};

const STATUS_STYLES: Record<
  MetricStatus,
  { value: string; border: string; badge: string }
> = {
  neutral: {
    value: "text-[var(--text-primary)]",
    border: "border-[var(--border)]",
    badge: "bg-[var(--surface-raised)] text-[var(--text-muted)]",
  },
  success: {
    value: "text-[var(--success)]",
    border: "border-[color-mix(in_srgb,var(--success)_38%,var(--border))]",
    badge: "bg-[var(--success-muted)] text-[var(--success)]",
  },
  warning: {
    value: "text-[var(--warning)]",
    border: "border-[color-mix(in_srgb,var(--warning)_38%,var(--border))]",
    badge: "bg-[var(--warning-muted)] text-[var(--warning)]",
  },
  danger: {
    value: "text-[var(--danger)]",
    border: "border-[color-mix(in_srgb,var(--danger)_38%,var(--border))]",
    badge: "bg-[var(--danger-muted)] text-[var(--danger)]",
  },
  unavailable: {
    value: "text-[var(--text-muted)]",
    border: "border-[var(--border-subtle)]",
    badge: "bg-[var(--surface-raised)] text-[var(--text-muted)]",
  },
};

export default function MetricCard({
  icon,
  label,
  value,
  sublabel,
  status = "neutral",
  unit,
  provenance,
}: MetricCardProps) {
  const missing = value === null || value === undefined || value === "";
  const resolvedStatus: MetricStatus = missing ? "unavailable" : status;
  const styles = STATUS_STYLES[resolvedStatus];

  return (
    <Card
      padding="none"
      className={`h-full ${styles.border}`}
    >
      <div className="flex min-h-[132px] h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="data-label min-w-0 truncate" title={label}>
            {label}
          </p>

          {icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--accent)]">
              {icon}
            </span>
          )}
        </div>

        <div className="mt-3 flex min-w-0 items-baseline gap-1.5">
          <p
            className={`min-w-0 truncate text-[26px] font-extrabold tracking-[-0.035em] tabular-nums sm:text-[30px] ${styles.value}`}
            title={missing ? "Unavailable" : String(value)}
          >
            {missing ? "—" : value}
          </p>

          {!missing && unit && (
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {unit}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          {sublabel && (
            <p
              className="line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]"
              title={sublabel}
            >
              {sublabel}
            </p>
          )}

          {provenance && (
            <span
              className={`mt-2 inline-flex max-w-full rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${styles.badge}`}
              title={provenance}
            >
              <span className="truncate">{provenance}</span>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

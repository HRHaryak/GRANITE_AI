"use client";

import React from "react";

export type BadgeStatus =
  | "operational"
  | "degraded"
  | "unavailable"
  | "pending"
  | "synced"
  | "failed"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT"
  | "ANALYZED"
  | "READY_FOR_ANALYSIS"
  | "ANALYZING"
  | "CAPTURE_IN_PROGRESS"
  | "ANALYSIS_FAILED"
  | "REGISTERED"
  | "COMPLETED"
  | string;

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

type StatusBadgeProps = {
  status: BadgeStatus | null | undefined;
  label?: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
};

const SIZE_CLASSES = {
  sm: "gap-1.5 px-2 py-0.5 text-[9px]",
  md: "gap-2 px-2.5 py-1 text-[10px]",
  lg: "gap-2.5 px-3.5 py-1.5 text-xs",
} as const;

const TONE_CLASSES: Record<
  StatusTone,
  { badge: string; dot: string }
> = {
  neutral: {
    badge:
      "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-muted)]",
  },
  success: {
    badge:
      "border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[var(--success-muted)] text-[var(--success)]",
    dot: "bg-[var(--success)]",
  },
  warning: {
    badge:
      "border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[var(--warning-muted)] text-[var(--warning)]",
    dot: "bg-[var(--warning)]",
  },
  danger: {
    badge:
      "border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[var(--danger-muted)] text-[var(--danger)]",
    dot: "bg-[var(--danger)]",
  },
  info: {
    badge:
      "border-[color-mix(in_srgb,var(--info)_30%,var(--border))] bg-[var(--info-muted)] text-[var(--info)]",
    dot: "bg-[var(--info)]",
  },
};

function resolveTone(status: string): StatusTone {
  const norm = status.toLowerCase();

  if (
    [
      "operational",
      "synced",
      "high",
      "analyzed",
      "completed",
      "active",
      "observed",
      "registered",
      "valid",
      "available",
      "ready",
      "metric",
      "calibrated",
    ].includes(norm)
  ) {
    return "success";
  }

  if (
    [
      "degraded",
      "medium",
      "warning",
      "ready_for_analysis",
      "estimated",
      "partial",
      "approximate",
      "limited",
    ].includes(norm)
  ) {
    return "warning";
  }

  if (
    [
      "unavailable",
      "failed",
      "low",
      "insufficient",
      "analysis_failed",
      "error",
      "invalid",
      "not_configured",
      "not_measurable",
    ].includes(norm)
  ) {
    return "danger";
  }

  if (
    [
      "pending",
      "analyzing",
      "capture_in_progress",
      "uploading",
      "processing",
      "queued",
      "running",
    ].includes(norm)
  ) {
    return "info";
  }

  if (
    [
      "unobserved",
      "unknown",
      "not_assessed",
      "not_observed",
      "not_available",
    ].includes(norm)
  ) {
    return "neutral";
  }

  return "neutral";
}

function formatLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function StatusBadge({
  status,
  label,
  size = "md",
  pulse,
}: StatusBadgeProps) {
  const rawStatus = status == null || status === "" ? "UNKNOWN" : String(status);
  const normalized = rawStatus.toLowerCase();
  const tone = resolveTone(rawStatus);
  const styles = TONE_CLASSES[tone];

  const shouldPulse =
    pulse ??
    ["pending", "analyzing", "capture_in_progress", "uploading", "processing", "queued", "running"].includes(
      normalized,
    );

  const text = label || formatLabel(rawStatus);

  return (
    <span
      className={[
        "inline-flex max-w-full items-center rounded-full border font-bold uppercase tracking-[0.12em]",
        SIZE_CLASSES[size],
        styles.badge,
      ].join(" ")}
      title={text}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {shouldPulse && (
          <span
            aria-hidden="true"
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-25 ${styles.dot}`}
          />
        )}
        <span
          aria-hidden="true"
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${styles.dot}`}
        />
      </span>

      <span className="truncate">{text}</span>
    </span>
  );
}

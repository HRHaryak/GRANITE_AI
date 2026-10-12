"use client";

import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  highlight?: boolean;
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING_CLASSES = {
  none: "",
  sm: "p-3.5 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
} as const;

export default function Card({
  children,
  className = "",
  glow = false,
  highlight = false,
  interactive = false,
  padding = "md",
}: CardProps) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border text-[var(--text-primary)]",
        "transition-[background-color,border-color,box-shadow,transform] duration-150",
        highlight
          ? "border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent-muted)_38%,var(--card)),var(--card))] shadow-[0_14px_34px_rgba(168,111,25,0.08)]"
          : "border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)]",
        interactive
          ? "hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-card)]"
          : "",
        PADDING_CLASSES[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--border-strong)_55%,transparent)] to-transparent"
      />

      {glow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-[var(--accent)] opacity-[0.08] blur-3xl"
        />
      )}

      <div className="relative">{children}</div>
    </div>
  );
}

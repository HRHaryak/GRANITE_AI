"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--accent)] bg-[var(--accent)] text-[#17130c] shadow-[0_8px_20px_rgba(168,111,25,0.16)] hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)] dark:hover:bg-[var(--accent-hover)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
  outline:
    "border border-[color-mix(in_srgb,var(--accent)_58%,var(--border))] bg-transparent text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)]",
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_38%,var(--border))] bg-[var(--danger-muted)] text-[var(--danger)] hover:border-[var(--danger)] hover:brightness-[0.98]",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 rounded-lg px-3 py-1.5 text-xs",
  md: "min-h-11 gap-2 rounded-xl px-4 py-2.5 text-sm",
  lg: "min-h-12 gap-2.5 rounded-xl px-5 py-3 text-[15px]",
};

export default function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled,
  type = "button",
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-bold",
        "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        "active:scale-[0.985]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}

      <span className="min-w-0 truncate">
        {loading && loadingLabel ? loadingLabel : children}
      </span>
    </button>
  );
}

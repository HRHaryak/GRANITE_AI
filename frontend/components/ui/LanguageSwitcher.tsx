"use client";

import React from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "../../lib/i18n";

type LanguageSwitcherProps = {
  className?: string;
};

export default function LanguageSwitcher({
  className = "",
}: LanguageSwitcherProps) {
  const {
    language,
    setLanguage,
  } = useTranslation();

  return (
    <div
      role="group"
      aria-label="Language"
      className={[
        "inline-flex min-h-10 min-w-0 items-center gap-1 rounded-[12px]",
        "border border-slate-200/90 bg-white/88 p-1 shadow-sm backdrop-blur",
        "dark:border-slate-600/35 dark:bg-slate-700/14",
        className,
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className="hidden h-7 w-7 shrink-0 place-items-center rounded-[8px] text-sky-600 sm:grid dark:text-sky-300"
      >
        <Languages
          size={14}
          strokeWidth={2.1}
        />
      </span>

      <LanguageButton
        active={
          language === "en"
        }
        label="EN"
        ariaLabel="Switch language to English"
        onClick={() =>
          setLanguage("en")
        }
      />

      <LanguageButton
        active={
          language === "te"
        }
        label="తెలుగు"
        ariaLabel="భాషను తెలుగుకు మార్చండి"
        onClick={() =>
          setLanguage("te")
        }
      />
    </div>
  );
}

function LanguageButton({
  active,
  label,
  ariaLabel,
  onClick,
}: {
  active: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={[
        "relative min-h-8 min-w-[48px] overflow-hidden rounded-[9px] px-2.5",
        "text-[9px] font-black tracking-[0.035em]",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-200",
        "active:scale-[0.97]",
        active
          ? [
              "border border-sky-500/90",
              "bg-[linear-gradient(135deg,#0284c7_0%,#06b6d4_100%)]",
              "text-white",
              "shadow-[0_7px_18px_rgba(2,132,199,.22)]",
            ].join(" ")
          : [
              "border border-transparent",
              "bg-transparent",
              "text-slate-500",
              "hover:border-sky-200",
              "hover:bg-sky-50",
              "hover:text-sky-700",
              "dark:text-slate-400",
              "dark:hover:border-sky-300/15",
              "dark:hover:bg-sky-300/[0.05]",
              "dark:hover:text-sky-200",
            ].join(" "),
      ].join(" ")}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 top-0 h-px bg-white/65"
        />
      ) : null}

      <span className="relative">
        {label}
      </span>
    </button>
  );
}

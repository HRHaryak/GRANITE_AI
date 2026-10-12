"use client";

import React from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "../../lib/theme";
import { useTranslation, type TranslationKey } from "../../lib/i18n";

type ThemeOption = {
  id: Theme;
  icon: React.ComponentType<{
    size?: number | string;
    className?: string;
    strokeWidth?: number | string;
  }>;
  labelKey: TranslationKey;
};

type ThemeSwitcherProps = {
  className?: string;
};

const OPTIONS: ThemeOption[] = [
  { id: "light", icon: Sun, labelKey: "theme_light" },
  { id: "dark", icon: Moon, labelKey: "theme_dark" },
  { id: "system", icon: Laptop, labelKey: "theme_system" },
];

export default function ThemeSwitcher({
  className = "",
}: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={[
        "flex min-h-10 w-full min-w-0 items-center justify-between gap-1 rounded-xl",
        "border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-sm",
        className,
      ].join(" ")}
    >
      {OPTIONS.map(({ id, icon: Icon, labelKey }) => {
        const active = theme === id;
        const label = t(labelKey);

        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={[
              "grid h-8 min-w-0 flex-1 place-items-center rounded-lg",
              "transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96]",
              active
                ? "bg-[var(--accent)] text-[#17130c] shadow-sm"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            <Icon size={14} strokeWidth={2.1} />
          </button>
        );
      })}
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Camera,
  CircleUserRound,
  LayoutDashboard,
  Mountain,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "../../lib/i18n";

type MobileNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

export default function BottomNavigation() {
  const path = usePathname();
  const { t } = useTranslation();

  const leftItems: MobileNavItem[] = [
    {
      href: "/dashboard",
      label: t("nav_dashboard"),
      icon: <LayoutDashboard size={18} strokeWidth={2} />,
      active: path === "/" || path === "/dashboard",
    },
    {
      href: "/blocks",
      label: t("nav_blocks"),
      icon: <Box size={18} strokeWidth={2} />,
      active: path.startsWith("/blocks"),
    },
    {
      href: "/quarries",
      label: t("nav_quarries"),
      icon: <Mountain size={18} strokeWidth={2} />,
      active: path.startsWith("/quarries"),
    },
  ];

  const rightItems: MobileNavItem[] = [
    {
      href: "/ai-assistant",
      label: t("nav_ai_assistant"),
      icon: <Sparkles size={18} strokeWidth={2} />,
      active: path.startsWith("/ai-assistant"),
    },
    {
      href: "/profile",
      label: t("nav_profile"),
      icon: <CircleUserRound size={18} strokeWidth={2} />,
      active: path.startsWith("/profile"),
    },
  ];

  const captureActive = path.startsWith("/capture");

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="relative mx-auto grid h-[68px] w-full max-w-[680px] grid-cols-[repeat(3,minmax(0,1fr))_64px_repeat(2,minmax(0,1fr))] items-center rounded-[20px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_94%,transparent)] px-1.5 shadow-[0_18px_55px_rgba(11,44,52,0.20)] backdrop-blur-2xl">
        {leftItems.map((item) => (
          <MobileLink key={item.href} {...item} />
        ))}

        <div className="relative flex h-full items-center justify-center">
          <Link
            href="/capture"
            aria-label={t("nav_capture")}
            aria-current={captureActive ? "page" : undefined}
            className={`absolute -top-4 grid h-[58px] w-[58px] place-items-center rounded-[18px] border-[5px] border-[var(--background)] text-white shadow-[0_12px_28px_rgba(21,148,155,0.28)] transition-transform duration-150 active:scale-95 ${
              captureActive
                ? "bg-[var(--accent-hover)]"
                : "bg-[var(--accent)]"
            }`}
          >
            <Camera size={24} strokeWidth={2.35} />
          </Link>

          <span
            className={`absolute bottom-1.5 max-w-[58px] truncate text-[8px] font-bold uppercase tracking-[0.08em] ${
              captureActive
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {t("nav_capture")}
          </span>
        </div>

        {rightItems.map((item) => (
          <MobileLink key={item.href} {...item} />
        ))}
      </div>
    </nav>
  );
}

function MobileLink({
  href,
  label,
  icon,
  active,
}: MobileNavItem) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 transition-colors ${
        active
          ? "text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={`grid h-7 w-8 place-items-center rounded-lg transition-colors ${
          active
            ? "bg-[var(--accent-muted)]"
            : "bg-transparent group-active:bg-[var(--surface-hover)]"
        }`}
      >
        {icon}
      </span>

      <span className="w-full truncate text-center text-[8px] font-bold uppercase tracking-[0.07em]">
        {label}
      </span>

      {active && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 h-0.5 w-4 rounded-full bg-[var(--accent)]"
        />
      )}
    </Link>
  );
}

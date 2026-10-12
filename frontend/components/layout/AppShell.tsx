"use client";

import { usePathname } from "next/navigation";
import React, {
  useEffect,
  useState,
} from "react";

import AppHeader from "./AppHeader";
import BottomNavigation from "./BottomNavigation";
import {
  LanguageProvider,
} from "../../lib/i18n";
import {
  ThemeProvider,
} from "../../lib/theme";

type AppShellProps = {
  children: React.ReactNode;
};

const STORAGE_KEY =
  "granitemeasure.sidebar.collapsed";

export default function AppShell({
  children,
}: AppShellProps) {
  const [
    sidebarCollapsed,
    setSidebarCollapsed,
  ] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(
        window.localStorage.getItem(
          STORAGE_KEY,
        ) === "1",
      );
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        sidebarCollapsed
          ? "1"
          : "0",
      );
    } catch {
      // Local storage can be disabled by the browser.
    }

    const timer =
      window.setTimeout(() => {
        // Forces responsive dashboard cards and R3F canvases
        // to measure the newly available width.
        window.dispatchEvent(
          new Event("resize"),
        );
      }, 340);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      const target =
        event.target as HTMLElement | null;

      const typing =
        target?.tagName ===
          "INPUT" ||
        target?.tagName ===
          "TEXTAREA" ||
        target?.isContentEditable;

      if (
        typing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (
        event.key === "["
      ) {
        event.preventDefault();

        setSidebarCollapsed(
          (value) =>
            !value,
        );
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, []);

  const pathname = usePathname();

  if (pathname === "/m" || pathname.startsWith("/m/")) {
    return <>{children}</>;
  }

  const sidebarWidth =
    sidebarCollapsed
      ? "80px"
      : "276px";

  return (
    <ThemeProvider>
      <LanguageProvider>
        <div
          style={
            {
              "--gm-sidebar-width":
                sidebarWidth,
            } as React.CSSProperties
          }
          className="relative min-h-screen overflow-x-clip bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-200"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 -z-10"
          >
            <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,rgba(21,148,155,0.055),transparent_45%)]" />
          </div>

          <AppHeader
            collapsed={
              sidebarCollapsed
            }
            onCollapsedChange={
              setSidebarCollapsed
            }
          />

          <main
            id="main-content"
            className={[
              "relative min-h-[calc(100vh-4rem)]",
              "pb-[calc(6.5rem+env(safe-area-inset-bottom))]",
              "transition-[margin-left,width] duration-300",
              "ease-[cubic-bezier(0.16,1,0.3,1)]",
              "lg:ml-[var(--gm-sidebar-width)]",
              "lg:w-[calc(100%-var(--gm-sidebar-width))]",
              "lg:min-h-screen lg:pb-10",
            ].join(" ")}
          >
            <div className="min-w-0 animate-enter">
              {children}
            </div>
          </main>

          <BottomNavigation />
        </div>
      </LanguageProvider>
    </ThemeProvider>
  );
}

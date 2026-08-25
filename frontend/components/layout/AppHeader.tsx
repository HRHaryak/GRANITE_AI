"use client";
import React from "react";
import { usePathname } from "next/navigation";

export default function AppHeader({ title }: { title?: string }) {
  const path = usePathname();
  return (
    <header className="w-full py-4 px-4 border-b border-white/6 bg-gradient-to-b from-black/40 to-transparent">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div>
          <div className="text-sm uppercase text-white/80">GraniteMeasure AI</div>
          <div className="text-lg font-semibold text-white">{title || (path === "/" ? "Welcome" : path.replace("/", "").toUpperCase())}</div>
        </div>
      </div>
    </header>
  );
}

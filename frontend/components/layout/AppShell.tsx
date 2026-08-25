"use client";
import React from "react";
import AppHeader from "../layout/AppHeader";
import BottomNavigation from "../layout/BottomNavigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0b0b0b_0%,#0a0a0a_100%)] text-white">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 pb-28">{children}</main>
      <BottomNavigation />
    </div>
  );
}

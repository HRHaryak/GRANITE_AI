"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNavigation() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(680px,calc(100%-32px))] bg-black/60 backdrop-blur rounded-full px-4 py-2 flex items-center justify-between shadow-lg z-50">
      <Link className={`px-3 py-2 rounded ${path === "/" ? "bg-white/8" : "hover:bg-white/5"}`} href="/">Home</Link>
      <Link className={`px-3 py-2 rounded ${path?.startsWith("/blocks") ? "bg-white/8" : "hover:bg-white/5"}`} href="/blocks">Blocks</Link>
      <Link className={`px-4 py-3 rounded-full bg-gradient-to-r from-sky-500 to-teal-400 shadow-md mx-2`} href="/capture">Capture</Link>
      <Link className={`px-3 py-2 rounded ${path?.startsWith("/quarries") ? "bg-white/8" : "hover:bg-white/5"}`} href="/quarries">Quarries</Link>
      <Link className={`px-3 py-2 rounded ${path?.startsWith("/profile") ? "bg-white/8" : "hover:bg-white/5"}`} href="/profile">Profile</Link>
    </nav>
  );
}

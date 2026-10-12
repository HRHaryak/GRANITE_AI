"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Camera,
  Home,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

const TABS = [
  { href: "/m", label: "Home", icon: Home },
  { href: "/m/blocks", label: "Blocks", icon: Boxes },
  { href: "/m/measure", label: "Measure", icon: Camera, fab: true },
  { href: "/m/verify", label: "Verify", icon: ShieldCheck },
  { href: "/m/ask", label: "Ask", icon: MessageCircle },
];

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/m" ? path === "/m" : path.startsWith(href);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#0b2c34] to-slate-900">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f1f5f4] text-slate-800 md:h-[min(880px,96vh)] md:w-[410px] md:rounded-[44px] md:border-[10px] md:border-black md:shadow-2xl">
        <main className="flex-1 overflow-y-auto overscroll-contain pb-24">
          {children}
        </main>
        <nav className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-around border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur">
          {TABS.map(({ href, label, icon: Icon, fab }) =>
            fab ? (
              <Link
                key={href}
                href={href}
                className="-mt-6 flex flex-col items-center"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#15949b] to-[#0f5257] text-white shadow-lg shadow-teal-900/30 ring-4 ring-white active:scale-95">
                  <Icon size={26} />
                </span>
                <span className="mt-0.5 text-[10px] font-semibold text-[#0f5257]">
                  {label}
                </span>
              </Link>
            ) : (
              <Link
                key={href}
                href={href}
                className={`flex w-14 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${active(href) ? "text-[#0f7e84]" : "text-slate-400"}`}
              >
                <Icon size={22} strokeWidth={active(href) ? 2.4 : 1.8} />
                {label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </div>
  );
}

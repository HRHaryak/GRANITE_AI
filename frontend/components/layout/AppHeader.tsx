"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Boxes,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Menu,
  Mountain,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import LanguageSwitcher from "../ui/LanguageSwitcher";
import ThemeSwitcher from "../ui/ThemeSwitcher";
import { useLanguage } from "../../lib/i18n";

type AppHeaderProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "workspace" | "intelligence";
};

type Copy = {
  brandSub: string;
  workspace: string;
  intelligence: string;
  newAnalysis: string;
  newAnalysisSub: string;
  captureRule: string;
  evidenceMode: string;
  evidenceModeSub: string;
  collapse: string;
  expand: string;
  openMenu: string;
  closeMenu: string;
};

const COPY: Record<"en" | "te", Copy> = {
  en: {
    brandSub: "Government Granite Intelligence",
    workspace: "Workspace",
    intelligence: "Intelligence",
    newAnalysis: "New Granite Analysis",
    newAnalysisSub: "Capture photos and create a block",
    captureRule: "5+ accepted views start 3D",
    evidenceMode: "Evidence-first mode",
    evidenceModeSub: "No fabricated measurements",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    openMenu: "Open navigation",
    closeMenu: "Close navigation",
  },
  te: {
    brandSub: "ప్రభుత్వ గ్రానైట్ ఇంటెలిజెన్స్",
    workspace: "వర్క్‌స్పేస్",
    intelligence: "ఇంటెలిజెన్స్",
    newAnalysis: "కొత్త గ్రానైట్ విశ్లేషణ",
    newAnalysisSub: "ఫోటోలు క్యాప్చర్ చేసి బ్లాక్ సృష్టించండి",
    captureRule: "5+ అంగీకరించిన వ్యూలతో 3D ప్రారంభం",
    evidenceMode: "ఎవిడెన్స్-ఫస్ట్ మోడ్",
    evidenceModeSub: "ఫేక్ కొలతలు లేవు",
    collapse: "సైడ్‌బార్ కుదించండి",
    expand: "సైడ్‌బార్ విస్తరించండి",
    openMenu: "నావిగేషన్ తెరవండి",
    closeMenu: "నావిగేషన్ మూసివేయండి",
  },
};

export default function AppHeader({
  collapsed,
  onCollapsedChange,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const copy = COPY[language];

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const items = useMemo<NavItem[]>(
    () => [
      {
        href: "/dashboard",
        label: language === "te" ? "కమాండ్ సెంటర్" : "Command Center",
        description:
          language === "te"
            ? "లైవ్ ఆపరేషన్స్ & మెట్రిక్స్"
            : "Live operations & metrics",
        icon: Activity,
        group: "workspace",
      },
      {
        href: "/capture",
        label: language === "te" ? "కొత్త విశ్లేషణ" : "New Analysis",
        description:
          language === "te"
            ? "ఫోటోలు & ఎవిడెన్స్ క్యాప్చర్"
            : "Capture photos & evidence",
        icon: ScanLine,
        group: "workspace",
      },
      {
        href: "/business-workflow",
        label: language === "te" ? "బ్లాక్ జీవచక్రం" : "Block Lifecycle",
        description:
          language === "te"
            ? "ఎండ్-టు-ఎండ్ గ్రానైట్ ఫ్లో"
            : "End-to-end granite flow",
        icon: Workflow,
        group: "workspace",
      },
      {
        href: "/blocks",
        label: language === "te" ? "గ్రానైట్ బ్లాక్‌లు" : "Granite Blocks",
        description:
          language === "te"
            ? "రికార్డులు & విశ్లేషణ"
            : "Records & analysis",
        icon: Boxes,
        group: "workspace",
      },
      {
        href: "/quarries",
        label: language === "te" ? "క్వారీలు" : "Quarries",
        description:
          language === "te"
            ? "సైట్లు, లీజులు & ప్రొఫైళ్లు"
            : "Sites, leases & profiles",
        icon: Mountain,
        group: "intelligence",
      },
      {
        href: "/ai-assistant",
        label: language === "te" ? "AI సహాయకుడు" : "AI Assistant",
        description:
          language === "te"
            ? "ఎవిడెన్స్ ఆధారిత సహాయం"
            : "Evidence-grounded assistance",
        icon: Sparkles,
        group: "intelligence",
      },
      {
        href: "/profile",
        label: language === "te" ? "ఆపరేటర్" : "Operator",
        description:
          language === "te"
            ? "ప్రొఫైల్ & స్టేషన్"
            : "Profile & station",
        icon: CircleUserRound,
        group: "intelligence",
      },
    ],
    [language],
  );

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const workspace = items.filter((item) => item.group === "workspace");
  const intelligence = items.filter((item) => item.group === "intelligence");

  return (
    <>
      <DesktopSidebar
        collapsed={collapsed}
        copy={copy}
        workspace={workspace}
        intelligence={intelligence}
        isActive={isActive}
        onCollapsedChange={onCollapsedChange}
      />

      <MobileHeader
        copy={copy}
        onOpen={() => setMobileOpen(true)}
      />

      <AnimatePresence>
        {mobileOpen ? (
          <MobileDrawer
            copy={copy}
            items={items}
            isActive={isActive}
            onClose={() => setMobileOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function DesktopSidebar({
  collapsed,
  copy,
  workspace,
  intelligence,
  isActive,
  onCollapsedChange,
}: {
  collapsed: boolean;
  copy: Copy;
  workspace: NavItem[];
  intelligence: NavItem[];
  isActive: (href: string) => boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <aside
      style={{ width: "var(--gm-sidebar-width)" }}
      className={[
        "fixed inset-y-0 left-0 z-50 hidden overflow-hidden",
        "border-r border-[#315B63]",
        "bg-[#0B2C34]",
        "shadow-[14px_0_38px_rgba(5,26,31,.16)]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "lg:flex lg:flex-col",
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_20%_0%,rgba(96,209,187,.08),transparent_58%)]" />
        <div className="absolute bottom-0 right-0 h-56 w-56 bg-[radial-gradient(circle,rgba(21,148,155,.08),transparent_68%)]" />
      </div>

      <div
        className={[
          "relative z-10 flex h-full min-h-0 flex-col",
          collapsed ? "px-2.5 py-3" : "px-3.5 py-3.5",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2">
          <SidebarBrand collapsed={collapsed} copy={copy} />

          {!collapsed ? (
            <button
              type="button"
              aria-label={copy.collapse}
              title={copy.collapse}
              onClick={() => onCollapsedChange(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#315B63] bg-[#123F49] text-[#A9C2C4] transition hover:border-[#60D1BB]/60 hover:bg-[#164B55] hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            aria-label={copy.expand}
            title={copy.expand}
            onClick={() => onCollapsedChange(false)}
            className="mt-3 grid h-11 w-full place-items-center rounded-xl border border-[#315B63] bg-[#123F49] text-[#A9DAD2] transition hover:border-[#60D1BB]/60 hover:bg-[#164B55] hover:text-white"
          >
            <ChevronRight size={17} />
          </button>
        ) : (
          <Link
            href="/capture"
            className="mt-4 flex min-h-[58px] items-center gap-3 rounded-2xl border border-[#315B63] bg-[#103A42] px-3 py-2.5 transition hover:border-[#60D1BB]/55 hover:bg-[#123F49]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#60D1BB]/30 bg-[#60D1BB]/10 text-[#7ADCC8]">
              <Camera size={17} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold leading-4 text-white">
                {copy.newAnalysis}
              </span>
              <span className="mt-1 block truncate text-[10px] font-medium leading-3.5 text-[#A9C2C4]">
                {copy.newAnalysisSub}
              </span>
            </span>

            <ChevronRight className="h-4 w-4 shrink-0 text-[#7ADCC8]" />
          </Link>
        )}

        {!collapsed ? (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[#315B63]/70 bg-[#0F343C] px-3 py-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 rounded-full bg-[#60D1BB]"
                />
              ))}
            </div>
            <span className="truncate text-[9px] font-bold uppercase tracking-[0.07em] text-[#A9C2C4]">
              {copy.captureRule}
            </span>
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SidebarSection
            label={copy.workspace}
            collapsed={collapsed}
            items={workspace}
            isActive={isActive}
          />

          <div className={collapsed ? "my-3 h-px bg-[#315B63]/60" : "my-4"} />

          <SidebarSection
            label={copy.intelligence}
            collapsed={collapsed}
            items={intelligence}
            isActive={isActive}
          />
        </div>

        <SidebarFooter copy={copy} collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  collapsed,
  items,
  isActive,
}: {
  label: string;
  collapsed: boolean;
  items: NavItem[];
  isActive: (href: string) => boolean;
}) {
  return (
    <section>
      {!collapsed ? (
        <div className="mb-2 flex items-center gap-3 px-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#8FADB0]">
            {label}
          </span>
          <span className="h-px flex-1 bg-[#315B63]/75" />
        </div>
      ) : null}

      <div className="space-y-1.5">
        {items.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </section>
  );
}

function SidebarNavItem({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={[
        "group relative flex items-center overflow-hidden rounded-[14px] border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60D1BB]/60",
        collapsed
          ? "min-h-[50px] justify-center px-1"
          : "min-h-[54px] gap-3 px-2.5 py-2",
        active
          ? "border-[#60D1BB]/42 bg-[#60D1BB]/[0.11] shadow-[inset_0_0_0_1px_rgba(96,209,187,.04)]"
          : "border-transparent bg-transparent hover:border-[#315B63] hover:bg-[#164B55]/75",
      ].join(" ")}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#60D1BB]"
        />
      ) : null}

      <span
        className={[
          "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition",
          active
            ? "border-[#60D1BB]/38 bg-[#60D1BB]/14 text-[#86E3D1]"
            : "border-[#315B63] bg-[#123F49] text-[#A9DAD2] group-hover:border-[#60D1BB]/40 group-hover:bg-[#174C56] group-hover:text-white",
        ].join(" ")}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>

      {!collapsed ? (
        <>
          <span className="relative z-10 min-w-0 flex-1">
            <span
              className={[
                "block truncate text-[13px] font-extrabold leading-[17px]",
                active ? "text-white" : "text-[#E3EFED] group-hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </span>

            <span
              className={[
                "mt-0.5 block truncate text-[10px] font-medium leading-[14px]",
                active ? "text-[#BBD8D5]" : "text-[#A9C2C4]",
              ].join(" ")}
            >
              {item.description}
            </span>
          </span>

          <ChevronRight
            className={[
              "relative z-10 h-4 w-4 shrink-0 transition",
              active
                ? "text-[#7ADCC8]"
                : "text-[#6F9297] group-hover:text-[#A9DAD2]",
            ].join(" ")}
          />
        </>
      ) : null}
    </Link>
  );
}

function SidebarBrand({
  collapsed,
  copy,
}: {
  collapsed: boolean;
  copy: Copy;
}) {
  return (
    <Link
      href="/dashboard"
      className={[
        "flex min-w-0 items-center",
        collapsed ? "justify-center" : "gap-3",
      ].join(" ")}
    >
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#60D1BB]/40 bg-[#E6F4F1] text-[#0F7E84] shadow-[0_6px_18px_rgba(0,0,0,.12)]">
        <span className="absolute inset-[5px] rounded-[10px] border border-[#15949B]/20" />
        <ScanLine size={20} strokeWidth={1.9} />
      </span>

      {!collapsed ? (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-black tracking-[-0.025em] text-white">
            GraniteMeasure AI
          </span>
          <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.1em] text-[#8FADB0]">
            {copy.brandSub}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function SidebarFooter({
  copy,
  collapsed,
}: {
  copy: Copy;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <div className="mt-3 flex justify-center">
        <span
          title={`${copy.evidenceMode}: ${copy.evidenceModeSub}`}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#315B63] bg-[#123F49] text-[#60D1BB]"
        >
          <ShieldCheck size={17} />
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#315B63] bg-[#0F343C] p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#60D1BB]/12 text-[#60D1BB]">
          <ShieldCheck size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-extrabold text-[#E3EFED]">
            {copy.evidenceMode}
          </p>
          <p className="mt-0.5 truncate text-[9px] font-medium text-[#A9C2C4]">
            {copy.evidenceModeSub}
          </p>
        </div>

        <span className="h-2 w-2 shrink-0 rounded-full bg-[#39A384] shadow-[0_0_0_4px_rgba(57,163,132,.11)]" />
      </div>

      <div className="my-3 h-px bg-[#315B63]/70" />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="min-w-0 rounded-xl border border-[#315B63] bg-[#123F49] p-1">
          <LanguageSwitcher className="w-full min-w-0 justify-center" />
        </div>

        <div className="rounded-xl border border-[#315B63] bg-[#123F49] p-1">
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );
}

function MobileHeader({
  copy,
  onOpen,
}: {
  copy: Copy;
  onOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#D7E6E3] bg-[#F8FAF9]/95 px-4 backdrop-blur-xl lg:hidden dark:border-[#315B63] dark:bg-[#0B2C34]/95">
      <SidebarBrand collapsed={false} copy={copy} />

      <button
        type="button"
        aria-label={copy.openMenu}
        onClick={onOpen}
        className="grid h-10 w-10 place-items-center rounded-xl border border-[#D7E6E3] bg-white text-[#183B47] shadow-sm dark:border-[#315B63] dark:bg-[#123F49] dark:text-white"
      >
        <Menu size={18} />
      </button>
    </header>
  );
}

function MobileDrawer({
  copy,
  items,
  isActive,
  onClose,
}: {
  copy: Copy;
  items: NavItem[];
  isActive: (href: string) => boolean;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] lg:hidden"
    >
      <button
        type="button"
        aria-label={copy.closeMenu}
        onClick={onClose}
        className="absolute inset-0 bg-[#061D22]/55 backdrop-blur-sm"
      />

      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-full w-[min(90vw,360px)] flex-col overflow-hidden border-r border-[#315B63] bg-[#0B2C34] shadow-[28px_0_70px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#315B63] px-4 py-4">
          <SidebarBrand collapsed={false} copy={copy} />

          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeMenu}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#315B63] bg-[#123F49] text-[#A9C2C4]"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
          <Link
            href="/capture"
            onClick={onClose}
            className="mb-4 flex min-h-[58px] items-center gap-3 rounded-2xl border border-[#315B63] bg-[#103A42] px-3 py-2.5"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#60D1BB]/12 text-[#7ADCC8]">
              <Camera size={17} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-white">
                {copy.newAnalysis}
              </span>
              <span className="mt-1 block truncate text-[10px] text-[#A9C2C4]">
                {copy.newAnalysisSub}
              </span>
            </span>
          </Link>

          <div className="space-y-1.5">
            {items.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                active={isActive(item.href)}
                collapsed={false}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-[#315B63] p-3.5">
          <SidebarFooter copy={copy} collapsed={false} />
        </div>
      </motion.aside>
    </motion.div>
  );
}

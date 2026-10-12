"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Cpu,
  Gem,
  Layers3,
  MapPin,
  Mountain,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Edges,
  Html,
  Line,
  OrbitControls,
} from "@react-three/drei";

import {
  getBlockAnalysis,
  getCapabilities,
  getQuarries,
  listBlocks,
} from "../../lib/api";
import type {
  BlockAnalysis,
  BlockOut,
  CapabilitiesOut,
  Quarry,
} from "../../lib/types";
import { useTranslation } from "../../lib/i18n";

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  newAnalysis: string;
  blocks: string;
  refresh: string;

  metricBlocks: string;
  metricCompleted: string;
  metricProcessing: string;
  metricAttention: string;
  metricQuarries: string;

  controlTower: string;
  controlTowerSub: string;
  latestBlock: string;
  latestBlockSub: string;
  noLatest: string;

  readiness: string;
  readinessSub: string;
  readinessScore: string;
  operational: string;
  limited: string;
  unavailable: string;
  unreported: string;

  flowTitle: string;
  flowSub: string;
  capture: string;
  evidence: string;
  reconstruct: string;
  measure: string;
  inspect: string;
  verify: string;

  recent: string;
  recentSub: string;
  viewAll: string;
  captured: string;
  open: string;

  decisionDock: string;
  decisionDockSub: string;
  captureAction: string;
  blocksAction: string;
  quarriesAction: string;
  assistantAction: string;
  workflowAction: string;

  liveData: string;
  backendOnly: string;
  evidenceGate: string;
  evidenceGateText: string;
  attentionQueue: string;
  attentionQueueText: string;

  loading: string;
  partialError: string;
  retry: string;
  noBlocks: string;
  noBlocksSub: string;

  statusCompleted: string;
  statusProcessing: string;
  statusFailed: string;
  statusReady: string;
  statusSaved: string;
};

const COPY: Record<"en" | "te", Copy> = {
  en: {
    eyebrow: "GRANITE OPERATIONS CONTROL TOWER",
    title: "A sharper command center for every granite decision.",
    subtitle:
      "Track field capture, analysis progress, AI readiness, recent block activity and the next operational move — from one premium control surface.",
    newAnalysis: "New Granite Analysis",
    blocks: "Open Block Register",
    refresh: "Refresh",

    metricBlocks: "Granite Blocks",
    metricCompleted: "Completed",
    metricProcessing: "In Progress",
    metricAttention: "Needs Attention",
    metricQuarries: "Quarries",

    controlTower: "Control Tower",
    controlTowerSub:
      "A real-time operational snapshot built only from current backend records.",
    latestBlock: "Latest Granite Record",
    latestBlockSub:
      "Open the newest block directly from the command center.",
    noLatest: "No block record available yet.",

    readiness: "Digital Twin Readiness",
    readinessSub:
      "Capability readiness calculated only from backend-reported capability states.",
    readinessScore: "Reported readiness",
    operational: "Operational",
    limited: "Limited",
    unavailable: "Unavailable",
    unreported: "Not reported",

    flowTitle: "Granite Intelligence Path",
    flowSub:
      "The complete field-to-verification journey used by this platform.",
    capture: "Capture",
    evidence: "Evidence",
    reconstruct: "3D Reconstruct",
    measure: "Measure",
    inspect: "Inspect",
    verify: "Verify",

    recent: "Recent Block Activity",
    recentSub:
      "The newest granite records and their actual saved state.",
    viewAll: "View All",
    captured: "Captured",
    open: "Open",

    decisionDock: "Decision Dock",
    decisionDockSub:
      "Jump directly to the workspace you need next.",
    captureAction: "Capture New Block",
    blocksAction: "Granite Register",
    quarriesAction: "Quarry Network",
    assistantAction: "AI Evidence Assistant",
    workflowAction: "Business Workflow",

    liveData: "LIVE BACKEND DATA",
    backendOnly: "No dummy operational metrics",
    evidenceGate: "3D Reconstruction Gate",
    evidenceGateText:
      "The first reconstruction attempt can start after 5 accepted multi-side granite photos. Additional views improve coverage.",
    attentionQueue: "Attention Queue",
    attentionQueueText:
      "Failed or rejected block records stay visible here instead of being hidden by a success-only dashboard.",

    loading: "Loading live data…",
    partialError:
      "Some dashboard data could not be loaded. Available backend data is still shown.",
    retry: "Retry",
    noBlocks: "No granite records yet",
    noBlocksSub:
      "Start a new granite analysis. Real records will automatically appear here.",

    statusCompleted: "Completed",
    statusProcessing: "In Progress",
    statusFailed: "Attention",
    statusReady: "Ready",
    statusSaved: "Saved",
  },

  te: {
    eyebrow: "గ్రానైట్ ఆపరేషన్స్ కంట్రోల్ టవర్",
    title: "ప్రతి గ్రానైట్ నిర్ణయానికి మరింత శక్తివంతమైన కమాండ్ సెంటర్.",
    subtitle:
      "ఫీల్డ్ క్యాప్చర్, విశ్లేషణ పురోగతి, AI సిద్ధత, ఇటీవలి బ్లాక్ కార్యకలాపాలు మరియు తదుపరి ఆపరేషనల్ చర్యను ఒకే ప్రీమియం వర్క్‌స్పేస్‌లో చూడండి.",
    newAnalysis: "కొత్త గ్రానైట్ విశ్లేషణ",
    blocks: "బ్లాక్ రిజిస్టర్ తెరవండి",
    refresh: "రిఫ్రెష్",

    metricBlocks: "గ్రానైట్ బ్లాక్‌లు",
    metricCompleted: "పూర్తయ్యాయి",
    metricProcessing: "ప్రాసెస్‌లో",
    metricAttention: "శ్రద్ధ అవసరం",
    metricQuarries: "క్వారీలు",

    controlTower: "కంట్రోల్ టవర్",
    controlTowerSub:
      "ప్రస్తుత బ్యాక్‌ఎండ్ రికార్డుల ఆధారంగా మాత్రమే రూపొందించిన ఆపరేషనల్ వీక్షణ.",
    latestBlock: "తాజా గ్రానైట్ రికార్డ్",
    latestBlockSub:
      "కమాండ్ సెంటర్ నుండి తాజా బ్లాక్‌ను నేరుగా తెరవండి.",
    noLatest: "ఇంకా బ్లాక్ రికార్డ్ లేదు.",

    readiness: "డిజిటల్ ట్విన్ సిద్ధత",
    readinessSub:
      "బ్యాక్‌ఎండ్ తెలిపిన సామర్థ్య స్థితుల ఆధారంగా మాత్రమే సిద్ధత లెక్కించబడుతుంది.",
    readinessScore: "రిపోర్ట్ చేసిన సిద్ధత",
    operational: "పనిచేస్తోంది",
    limited: "పరిమితం",
    unavailable: "అందుబాటులో లేదు",
    unreported: "రిపోర్ట్ కాలేదు",

    flowTitle: "గ్రానైట్ ఇంటెలిజెన్స్ పథం",
    flowSub:
      "ఫీల్డ్ నుండి వెరిఫికేషన్ వరకు ఈ ప్లాట్‌ఫారమ్ ఉపయోగించే పూర్తి ప్రయాణం.",
    capture: "క్యాప్చర్",
    evidence: "ఎవిడెన్స్",
    reconstruct: "3D రీకన్స్ట్రక్ట్",
    measure: "కొలత",
    inspect: "పరిశీలన",
    verify: "వెరిఫై",

    recent: "ఇటీవలి బ్లాక్ కార్యకలాపాలు",
    recentSub:
      "తాజా గ్రానైట్ రికార్డులు మరియు వాటి నిజమైన సేవ్ చేసిన స్థితి.",
    viewAll: "అన్నీ చూడండి",
    captured: "క్యాప్చర్",
    open: "తెరవండి",

    decisionDock: "డెసిషన్ డాక్",
    decisionDockSub:
      "తదుపరి అవసరమైన వర్క్‌స్పేస్‌కు నేరుగా వెళ్లండి.",
    captureAction: "కొత్త బ్లాక్ క్యాప్చర్",
    blocksAction: "గ్రానైట్ రిజిస్టర్",
    quarriesAction: "క్వారీ నెట్‌వర్క్",
    assistantAction: "AI ఎవిడెన్స్ అసిస్టెంట్",
    workflowAction: "బిజినెస్ వర్క్‌ఫ్లో",

    liveData: "లైవ్ బ్యాక్‌ఎండ్ డేటా",
    backendOnly: "డమ్మీ ఆపరేషనల్ మెట్రిక్స్ లేవు",
    evidenceGate: "3D రీకన్స్ట్రక్షన్ గేట్",
    evidenceGateText:
      "5 అంగీకరించిన మల్టీ-సైడ్ గ్రానైట్ ఫోటోల తర్వాత మొదటి రీకన్స్ట్రక్షన్ ప్రయత్నం ప్రారంభమవుతుంది. అదనపు వ్యూలు కవరేజ్‌ను మెరుగుపరుస్తాయి.",
    attentionQueue: "అటెన్షన్ క్యూ",
    attentionQueueText:
      "విఫలమైన లేదా రిజెక్ట్ అయిన బ్లాక్ రికార్డులు సక్సెస్ మెట్రిక్స్ వెనుక దాచబడవు.",

    loading: "లైవ్ డేటా లోడ్ అవుతోంది…",
    partialError:
      "కొంత డ్యాష్‌బోర్డ్ డేటా లోడ్ కాలేదు. అందుబాటులో ఉన్న బ్యాక్‌ఎండ్ డేటా చూపబడుతోంది.",
    retry: "మళ్లీ ప్రయత్నించండి",
    noBlocks: "ఇంకా గ్రానైట్ రికార్డులు లేవు",
    noBlocksSub:
      "కొత్త గ్రానైట్ విశ్లేషణ ప్రారంభించండి. నిజమైన రికార్డులు ఇక్కడ ఆటోమేటిక్‌గా కనిపిస్తాయి.",

    statusCompleted: "పూర్తైంది",
    statusProcessing: "ప్రాసెస్‌లో",
    statusFailed: "శ్రద్ధ",
    statusReady: "సిద్ధం",
    statusSaved: "సేవ్",
  },
};

const COMPLETED = new Set([
  "ANALYZED",
  "VERIFIED",
  "COMPLETED",
]);

const PROCESSING = new Set([
  "READY_FOR_ANALYSIS",
  "ANALYZING",
  "CAPTURE_IN_PROGRESS",
  "QUEUED",
  "PROCESSING",
]);

const FAILED = new Set([
  "FAILED",
  "ERROR",
  "REJECTED",
]);

type CapabilityTone =
  | "good"
  | "limited"
  | "bad"
  | "unknown";

type CapabilityItem = {
  key: string;
  label: string;
  rawStatus: string;
  tone: CapabilityTone;
};

export default function DashboardPage() {
  const { language } = useTranslation();
  const copy = COPY[language];

  const [blocks, setBlocks] =
    useState<BlockOut[] | null>(null);

  const [quarries, setQuarries] =
    useState<Quarry[] | null>(null);

  const [capabilities, setCapabilities] =
    useState<CapabilitiesOut | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [loadError, setLoadError] =
    useState(false);

  const [
    latestAnalysis,
    setLatestAnalysis,
  ] = useState<BlockAnalysis | null>(
    null,
  );

  const [
    latestAnalysisLoading,
    setLatestAnalysisLoading,
  ] = useState(false);

  const loadDashboard = async (
    refresh = false,
  ) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setLoadError(false);

    const [
      blockResult,
      quarryResult,
      capabilityResult,
    ] = await Promise.allSettled([
      listBlocks(),
      getQuarries(),
      getCapabilities(),
    ]);

    setBlocks(
      blockResult.status === "fulfilled"
        ? blockResult.value
        : [],
    );

    setQuarries(
      quarryResult.status === "fulfilled"
        ? quarryResult.value
        : [],
    );

    setCapabilities(
      capabilityResult.status === "fulfilled"
        ? capabilityResult.value
        : null,
    );

    setLoadError(
      blockResult.status === "rejected" ||
        quarryResult.status === "rejected" ||
        capabilityResult.status === "rejected",
    );

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    const latest =
      (blocks ?? [])[0] ?? null;

    if (!latest?.id) {
      setLatestAnalysis(null);
      setLatestAnalysisLoading(false);
      return;
    }

    let active = true;

    setLatestAnalysisLoading(true);

    void getBlockAnalysis(
      latest.id,
      language,
    )
      .then((result) => {
        if (active) {
          setLatestAnalysis(
            result,
          );
        }
      })
      .catch(() => {
        if (active) {
          setLatestAnalysis(
            null,
          );
        }
      })
      .finally(() => {
        if (active) {
          setLatestAnalysisLoading(
            false,
          );
        }
      });

    return () => {
      active = false;
    };
  }, [blocks, language]);

  const metrics = useMemo(() => {
    const items = blocks ?? [];

    return {
      total: items.length,
      completed: items.filter(
        (block) =>
          COMPLETED.has(block.status),
      ).length,
      processing: items.filter(
        (block) =>
          PROCESSING.has(block.status),
      ).length,
      failed: items.filter(
        (block) =>
          FAILED.has(block.status),
      ).length,
      quarries:
        quarries?.length ?? 0,
    };
  }, [blocks, quarries]);

  const capabilityItems =
    useMemo<CapabilityItem[]>(() => {
      if (!capabilities) {
        return [];
      }

      return Object.entries(
        capabilities as unknown as Record<
          string,
          unknown
        >,
      )
        .map(([key, raw]) => {
          const record =
            raw &&
            typeof raw === "object"
              ? (
                  raw as Record<
                    string,
                    unknown
                  >
                )
              : null;

          const rawStatus =
            typeof record?.status ===
            "string"
              ? record.status
              : typeof raw === "string"
                ? raw
                : "";

          return {
            key,
            label:
              humanizeCapability(
                key,
              ),
            rawStatus,
            tone:
              capabilityTone(
                rawStatus,
              ),
          };
        })
        .filter(
          (item) =>
            item.rawStatus,
        )
        .slice(0, 10);
    }, [capabilities]);

  const capabilityStats =
    useMemo(() => {
      const reported =
        capabilityItems.length;

      const operational =
        capabilityItems.filter(
          (item) =>
            item.tone === "good",
        ).length;

      const limited =
        capabilityItems.filter(
          (item) =>
            item.tone ===
            "limited",
        ).length;

      const unavailable =
        capabilityItems.filter(
          (item) =>
            item.tone === "bad",
        ).length;

      const readiness =
        reported > 0
          ? Math.round(
              (operational /
                reported) *
                100,
            )
          : 0;

      return {
        reported,
        operational,
        limited,
        unavailable,
        readiness,
      };
    }, [capabilityItems]);

  const completionRate =
    metrics.total > 0
      ? Math.round(
          (metrics.completed /
            metrics.total) *
            100,
        )
      : 0;

  const recentBlocks =
    useMemo(
      () =>
        (blocks ?? []).slice(
          0,
          7,
        ),
      [blocks],
    );

  const latestBlock =
    recentBlocks[0] ?? null;

  return (
    <main className="min-h-screen bg-[#F8FAF9] text-[#123F49] dark:bg-[#082C34] dark:text-[#F4FBFA]">
      <div className="mx-auto w-full max-w-[1760px] px-3 pb-24 pt-4 sm:px-5 lg:px-7 lg:pt-6">
        <motion.section
          initial={{
            opacity: 0,
            y: 8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.46,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="relative overflow-hidden rounded-[28px] border border-[#D7E6E3]/90 bg-white shadow-[0_22px_60px_rgba(18,59,70,.095)] dark:border-[#315B63]/50 dark:bg-[#0B3037]"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#15949B] via-[#60D1BB] to-[#39A384]" />

          <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#B7D8D1] bg-[#E6F4F1] px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.15em] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
                  <Gem size={10} />
                  {copy.eyebrow}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.13em] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]">
                  <ShieldCheck size={10} />
                  {copy.liveData}
                </span>
              </div>

              <h1 className="mt-3 max-w-[820px] text-[31px] font-black leading-[1.02] tracking-[-0.055em] text-[#123F49] sm:text-[39px] lg:text-[48px] dark:text-white">
                {copy.title}
              </h1>

              <p className="mt-2.5 max-w-2xl text-[11px] leading-5 text-[#6B8A91] sm:text-[12px] dark:text-[#A9C2C4]">
                {copy.subtitle}
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link
                  href="/capture"
                  className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[#0F7E84] px-4 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_24px_rgba(15,138,145,.25)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#0E6B71]"
                >
                  <Camera size={13} />
                  {copy.newAnalysis}
                  <ArrowRight
                    size={11}
                    className="transition group-hover:translate-x-0.5"
                  />
                </Link>

                <Link
                  href="/blocks"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[#D7E6E3] bg-[#F3F8F6] px-4 text-[8px] font-black uppercase tracking-[0.1em] text-[#4B6A70] transition duration-300 hover:-translate-y-0.5 hover:border-[#B7D8D1] hover:bg-[#E6F4F1] hover:text-[#0F7E84] dark:border-[#315B63]/55 dark:bg-[#123F49]/52 dark:text-[#BDD0D3]"
                >
                  <Boxes size={13} />
                  {copy.blocks}
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    void loadDashboard(
                      true,
                    )
                  }
                  disabled={
                    refreshing
                  }
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] px-3 text-[7px] font-black uppercase tracking-[0.1em] text-[#7F9499] transition hover:bg-[#E6F4F1] hover:text-[#4B6A70] disabled:opacity-50 dark:hover:bg-[#123F49]/62 dark:hover:text-[#F4FBFA]"
                >
                  <RefreshCw
                    size={11}
                    className={
                      refreshing
                        ? "animate-spin"
                        : ""
                    }
                  />
                  {copy.refresh}
                </button>
              </div>

              <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2 text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499] dark:text-[#819CA2]">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2
                    size={9}
                    className="text-[#43AE91]"
                  />
                  {
                    copy.backendOnly
                  }
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <ScanLine
                    size={9}
                    className="text-[#218D8E]"
                  />
                  5+ photo reconstruction gate
                </span>
              </div>
            </div>

            <GraniteIdentityBeacon
              block={
                latestBlock
              }
              analysis={
                latestAnalysis
              }
              language={
                language
              }
              copy={copy}
              loading={
                loading ||
                latestAnalysisLoading
              }
            />
          </div>
        </motion.section>

        {loadError ? (
          <section className="mt-4 flex flex-col gap-3 rounded-[18px] border border-[#F3D598] bg-[#FFF4DE] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.07]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-[#D98F12] dark:text-[#F5A623]"
              />
              <p className="text-[10px] leading-5 text-[#56757B] dark:text-[#A8C0C5]">
                {
                  copy.partialError
                }
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadDashboard(
                  true,
                )
              }
              disabled={refreshing}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-[#F3D598] bg-white px-3 text-[8px] font-black uppercase tracking-[0.1em] text-[#B8790D] dark:border-[#F5A623]/22 dark:bg-[#123F49]/60 dark:text-[#FFD07A]"
            >
              <RefreshCw
                size={11}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              {copy.retry}
            </button>
          </section>
        ) : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SignalMetricCard
            icon={
              <Boxes
                size={17}
              />
            }
            label={
              copy.metricBlocks
            }
            value={
              loading
                ? null
                : metrics.total
            }
            foot={
              `${completionRate}% complete`
            }
            accent="sky"
            progress={
              completionRate
            }
            mode="portfolio"
          />

          <SignalMetricCard
            icon={
              <CheckCircle2
                size={17}
              />
            }
            label={
              copy.metricCompleted
            }
            value={
              loading
                ? null
                : metrics.completed
            }
            foot={
              copy.statusCompleted
            }
            accent="emerald"
            progress={
              metrics.total > 0
                ? Math.round(
                    (metrics.completed /
                      metrics.total) *
                      100,
                  )
                : 0
            }
            mode="success"
          />

          <SignalMetricCard
            icon={
              <Activity
                size={17}
              />
            }
            label={
              copy.metricProcessing
            }
            value={
              loading
                ? null
                : metrics.processing
            }
            foot={
              metrics.processing > 0
                ? copy.statusProcessing
                : "No active jobs"
            }
            accent="amber"
            progress={
              metrics.total > 0
                ? Math.round(
                    (metrics.processing /
                      metrics.total) *
                      100,
                  )
                : 0
            }
            mode="active"
          />

          <SignalMetricCard
            icon={
              <XCircle
                size={17}
              />
            }
            label={
              copy.metricAttention
            }
            value={
              loading
                ? null
                : metrics.failed
            }
            foot={
              copy.statusFailed
            }
            accent="rose"
            progress={
              metrics.total > 0
                ? Math.round(
                    (metrics.failed /
                      metrics.total) *
                      100,
                  )
                : 0
            }
            mode="alert"
          />

          <SignalMetricCard
            icon={
              <Mountain
                size={17}
              />
            }
            label={
              copy.metricQuarries
            }
            value={
              loading
                ? null
                : metrics.quarries
            }
            foot={
              copy.metricQuarries
            }
            accent="teal"
            progress={null}
            mode="network"
          />
        </section>

        <section className="mt-5">
          <GraniteReconstructionCore
            language={language}
            loading={loading}
            total={metrics.total}
            processing={metrics.processing}
            completed={metrics.completed}
            capabilityReadiness={capabilityStats.readiness}
          />
        </section>

        <section className="mt-5">
          <LatestMeasurementReference
            block={latestBlock}
            analysis={latestAnalysis}
            loading={
              loading ||
              latestAnalysisLoading
            }
            language={language}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.26fr)_minmax(420px,.74fr)]">
          <ControlTower
            metrics={metrics}
            loading={loading}
            copy={copy}
          />

          <ReadinessPanel
            items={
              capabilityItems
            }
            stats={
              capabilityStats
            }
            loading={loading}
            copy={copy}
          />
        </section>

        <section className="mt-5">
          <JourneyRail
            copy={copy}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(420px,.82fr)]">
          <RecentBlocksPanel
            blocks={
              recentBlocks
            }
            loading={
              loading
            }
            language={
              language
            }
            copy={copy}
          />

          <DecisionDock
            copy={copy}
            failed={
              metrics.failed
            }
          />
        </section>
      </div>
    </main>
  );
}



function LatestMeasurementReference({
  block,
  analysis,
  loading,
  language,
}: {
  block: BlockOut | null;
  analysis: BlockAnalysis | null;
  loading: boolean;
  language: "en" | "te";
}) {
  const copy =
    language === "te"
      ? {
          eyebrow: "తాజా బ్లాక్ కొలతల స్నాప్‌షాట్",
          title: "రెగ్యులర్ 3D డైమెన్షన్ రిఫరెన్స్",
          subtitle:
            "ఈ క్యూబాయిడ్ కేవలం కొలతలను అర్థం చేసుకోవడానికి రిఫరెన్స్ విజువల్ మాత్రమే. అసలు గ్రానైట్ రీకన్స్ట్రక్షన్ జియోమెట్రీ కాదు.",
          latest: "తాజా విశ్లేషణ",
          length: "పొడవు",
          breadth: "వెడల్పు",
          height: "ఎత్తు",
          volume: "వాల్యూమ్",
          confidence: "కొలత విశ్వాసం",
          method: "విశ్లేషణ పద్ధతి",
          unavailable: "ఇంకా అందుబాటులో లేదు",
          awaiting:
            "తాజా బ్లాక్ విశ్లేషణ నుండి వెరిఫై చేయదగిన కొలతలు కోసం వేచి చూస్తోంది.",
          open: "పూర్తి విశ్లేషణ తెరవండి",
          refOnly: "రిఫరెన్స్ జియోమెట్రీ మాత్రమే",
        }
      : {
          eyebrow: "LATEST BLOCK MEASUREMENT SNAPSHOT",
          title: "Regular 3D dimension reference",
          subtitle:
            "This cuboid is a measurement reference visual only. It is not the reconstructed granite geometry.",
          latest: "Latest analysis",
          length: "Length",
          breadth: "Breadth",
          height: "Height",
          volume: "Volume",
          confidence: "Measurement confidence",
          method: "Analysis method",
          unavailable: "Not available yet",
          awaiting:
            "Waiting for measurement values returned by the latest block analysis.",
          open: "Open full analysis",
          refOnly: "Reference geometry only",
        };

  const measurement =
    analysis?.measurement ?? null;

  const lengthCm =
    typeof measurement?.length_cm ===
    "number"
      ? measurement.length_cm
      : typeof measurement?.length_m ===
          "number"
        ? measurement.length_m *
          100
        : null;

  const breadthCm =
    typeof measurement?.breadth_cm ===
    "number"
      ? measurement.breadth_cm
      : typeof measurement?.breadth_m ===
          "number"
        ? measurement.breadth_m *
          100
        : null;

  const heightCm =
    typeof measurement?.height_cm ===
    "number"
      ? measurement.height_cm
      : typeof measurement?.height_m ===
          "number"
        ? measurement.height_m *
          100
        : null;

  const volumeM3 =
    typeof measurement?.volume_m3 ===
    "number"
      ? measurement.volume_m3
      : typeof measurement?.volume_cm3 ===
          "number"
        ? measurement.volume_cm3 /
          1_000_000
        : null;

  const confidence =
    typeof measurement?.measurement_confidence ===
    "number"
      ? measurement.measurement_confidence
      : null;

  const confidencePct =
    confidence === null
      ? null
      : confidence <= 1
        ? confidence * 100
        : confidence;

  const method =
    measurement?.analysis_method ||
    measurement?.calibration_method ||
    null;

  const hasDimensions =
    lengthCm !== null &&
    breadthCm !== null &&
    heightCm !== null;

  const displayCm = (
    value: number | null,
  ) =>
    value === null
      ? copy.unavailable
      : `${value.toFixed(
          value >= 100
            ? 1
            : 2,
        )} cm`;

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.48,
        ease: [
          0.16,
          1,
          0.3,
          1,
        ],
      }}
      className="overflow-hidden rounded-[30px] border border-[#D7E6E3]/90 bg-white shadow-[0_20px_60px_rgba(18,59,70,.085)] dark:border-[#315B63]/50 dark:bg-[#0B3037]"
    >
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[300px_minmax(360px,.85fr)_minmax(0,1.15fr)] xl:items-center">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#218D8E] dark:text-[#76DDC9]">
            {copy.eyebrow}
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#123F49] dark:text-white">
            {copy.title}
          </h2>

          <p className="mt-3 text-[8px] leading-4 text-[#6B8A91] dark:text-[#A9C2C4]">
            {copy.subtitle}
          </p>

          <div className="mt-5 rounded-[16px] border border-[#B7D8D1] bg-[#E2F2EE]/78 p-3 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.06]">
            <div className="flex items-center gap-2">
              <Layers3
                size={13}
                className="text-[#15949B] dark:text-[#76DDC9]"
              />
              <p className="text-[7px] font-black uppercase tracking-[0.1em] text-[#218D8E] dark:text-[#76DDC9]">
                {copy.refOnly}
              </p>
            </div>

            <p className="mt-2 truncate text-[11px] font-black text-[#36545D] dark:text-[#F4FBFA]">
              {block?.block_code ||
                copy.unavailable}
            </p>

            <p className="mt-1 text-[6.5px] font-semibold text-[#7F9499]">
              {copy.latest}
            </p>
          </div>

          {block ? (
            <Link
              href={`/blocks/${block.id}`}
              className="group mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#D7E6E3] bg-[#F3F8F6] px-3.5 text-[7px] font-black uppercase tracking-[0.09em] text-[#56757B] transition hover:border-[#B7D8D1] hover:bg-[#E6F4F1] hover:text-[#0F7E84] dark:border-[#315B63]/50 dark:bg-[#123F49]/52 dark:text-[#A8C0C5]"
            >
              {copy.open}
              <ArrowRight
                size={10}
                className="transition group-hover:translate-x-0.5"
              />
            </Link>
          ) : null}
        </div>

        <div className="relative min-h-[330px] overflow-hidden rounded-[24px] border border-[#D7E6E3] bg-[linear-gradient(145deg,#FFFFFF,#F2F7F5)] dark:border-[#315B63]/50 dark:bg-[linear-gradient(145deg,#123F49,#103A42)]">
          <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-[#B7D8D1] bg-white/90 px-3 py-1.5 text-[6px] font-black uppercase tracking-[0.1em] text-[#0F7E84] shadow-sm backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[#123F49]/92 dark:text-[#76DDC9]">
            <Layers3 size={9} />
            Proportional 3D Measurement Model
          </div>

          <div className="absolute right-4 top-4 z-10 rounded-full border border-[#D7E6E3] bg-white/90 px-3 py-1.5 text-[6px] font-black uppercase tracking-[0.09em] text-[#7F9499] shadow-sm backdrop-blur dark:border-[#315B63]/50 dark:bg-[#123F49]/92 dark:text-[#A9C2C4]">
            Drag to orbit · Scroll to zoom
          </div>

          <div className="h-[330px] w-full">
            <MeasurementCuboid3D
              lengthCm={lengthCm}
              breadthCm={breadthCm}
              heightCm={heightCm}
              displayCm={displayCm}
              hasDimensions={hasDimensions}
            />
          </div>

          {!hasDimensions &&
          !loading ? (
            <div className="absolute inset-x-4 bottom-4 z-10 rounded-[14px] border border-[#F3D598] bg-[#FFF4DE]/90 px-3 py-2 text-center text-[6.5px] font-bold leading-4 text-[#B8790D] shadow-sm backdrop-blur dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.08] dark:text-[#FFD07A]">
              {copy.awaiting}
            </div>
          ) : null}
        </div>

        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MeasurementValue
              label={copy.length}
              value={
                loading
                  ? "—"
                  : displayCm(
                      lengthCm,
                    )
              }
              accent="sky"
            />

            <MeasurementValue
              label={
                copy.breadth
              }
              value={
                loading
                  ? "—"
                  : displayCm(
                      breadthCm,
                    )
              }
              accent="cyan"
            />

            <MeasurementValue
              label={copy.height}
              value={
                loading
                  ? "—"
                  : displayCm(
                      heightCm,
                    )
              }
              accent="violet"
            />

            <MeasurementValue
              label={copy.volume}
              value={
                loading
                  ? "—"
                  : volumeM3 ===
                      null
                    ? copy.unavailable
                    : `${volumeM3.toFixed(
                        3,
                      )} m³`
              }
              accent="emerald"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[16px] border border-[#D7E6E3] bg-[#F3F8F6]/82 p-3 dark:border-[#315B63]/45 dark:bg-[#123F49]/48">
              <p className="text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499]">
                {copy.confidence}
              </p>

              <p className="mt-1 text-lg font-black tracking-[-0.035em] text-[#123F49] dark:text-white">
                {loading
                  ? "—"
                  : confidencePct ===
                      null
                    ? copy.unavailable
                    : `${confidencePct.toFixed(
                        1,
                      )}%`}
              </p>

              {confidencePct !==
              null ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white dark:bg-[#123F49]/66">
                  <motion.div
                    initial={{
                      width: 0,
                    }}
                    animate={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          confidencePct,
                        ),
                      )}%`,
                    }}
                    transition={{
                      duration: 0.75,
                    }}
                    className="h-full rounded-full bg-gradient-to-r from-[#15949B] to-[#39A384]"
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-[16px] border border-[#D7E6E3] bg-[#F3F8F6]/82 p-3 dark:border-[#315B63]/45 dark:bg-[#123F49]/48">
              <p className="text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499]">
                {copy.method}
              </p>

              <p className="mt-1 line-clamp-2 text-[8px] font-black leading-4 text-[#36545D] dark:text-[#F4FBFA]">
                {loading
                  ? "—"
                  : method ||
                    copy.unavailable}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}


function MeasurementCuboid3D({
  lengthCm,
  breadthCm,
  heightCm,
  displayCm,
  hasDimensions,
}: {
  lengthCm: number | null;
  breadthCm: number | null;
  heightCm: number | null;
  displayCm: (value: number | null) => string;
  hasDimensions: boolean;
}) {
  const dimensions = useMemo(() => {
    const safeL =
      lengthCm && lengthCm > 0
        ? lengthCm
        : 220;

    const safeB =
      breadthCm && breadthCm > 0
        ? breadthCm
        : 130;

    const safeH =
      heightCm && heightCm > 0
        ? heightCm
        : 105;

    const maxDimension = Math.max(
      safeL,
      safeB,
      safeH,
    );

    const targetMax = 3.4;

    const x =
      (safeL / maxDimension) *
      targetMax;

    const z =
      (safeB / maxDimension) *
      targetMax;

    const y =
      (safeH / maxDimension) *
      targetMax;

    return {
      x: Math.max(x, 0.75),
      y: Math.max(y, 0.75),
      z: Math.max(z, 0.75),
    };
  }, [
    lengthCm,
    breadthCm,
    heightCm,
  ]);

  return (
    <Canvas
      camera={{
        position: [
          5.3,
          3.8,
          5.8,
        ],
        fov: 34,
        near: 0.1,
        far: 100,
      }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
      }}
    >
      <ambientLight
        intensity={1.45}
      />

      <directionalLight
        position={[4, 7, 5]}
        intensity={2.1}
      />

      <directionalLight
        position={[-4, 3, -3]}
        intensity={0.85}
      />

      <pointLight
        position={[
          -2.5,
          1.8,
          4,
        ]}
        intensity={0.7}
      />

      <group
        position={[
          0,
          dimensions.y *
            0.08,
          0,
        ]}
      >
        <mesh
          castShadow
          receiveShadow
          scale={[
            dimensions.x,
            dimensions.y,
            dimensions.z,
          ]}
        >
          <boxGeometry
            args={[1, 1, 1]}
          />

          <meshStandardMaterial
            color="#A9C2C4"
            roughness={0.78}
            metalness={0.025}
          />

          <Edges
            threshold={12}
            scale={1.002}
            color="#15949B"
          />
        </mesh>

        <mesh
          scale={[
            dimensions.x +
              0.012,
            dimensions.y +
              0.012,
            dimensions.z +
              0.012,
          ]}
        >
          <boxGeometry
            args={[1, 1, 1]}
          />

          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.018}
            wireframe
          />
        </mesh>

        <CuboidDimensionLines
          x={dimensions.x}
          y={dimensions.y}
          z={dimensions.z}
          lengthLabel={
            `L  ${displayCm(
              lengthCm,
            )}`
          }
          breadthLabel={
            `B  ${displayCm(
              breadthCm,
            )}`
          }
          heightLabel={
            `H  ${displayCm(
              heightCm,
            )}`
          }
          muted={
            !hasDimensions
          }
        />
      </group>

      <gridHelper
        args={[
          11,
          22,
          "#7F9499",
          "#D7E6E3",
        ]}
        position={[
          0,
          -dimensions.y /
            2 -
            0.15,
          0,
        ]}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        enablePan={false}
        minDistance={4.2}
        maxDistance={10}
        minPolarAngle={0.45}
        maxPolarAngle={1.48}
        autoRotate
        autoRotateSpeed={0.55}
      />
    </Canvas>
  );
}

function CuboidDimensionLines({
  x,
  y,
  z,
  lengthLabel,
  breadthLabel,
  heightLabel,
  muted,
}: {
  x: number;
  y: number;
  z: number;
  lengthLabel: string;
  breadthLabel: string;
  heightLabel: string;
  muted: boolean;
}) {
  const offset = 0.34;
  const lineColor =
    muted
      ? "#7F9499"
      : "#0F7E84";

  const labelClass =
    muted
      ? "border-[#D7E6E3] bg-white/94 text-[#6B8A91] dark:border-slate-500/30 dark:bg-[#123F49]/94 dark:text-[#A8C0C5]"
      : "border-[#B7D8D1] bg-white/95 text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#123F49]/95 dark:text-[#76DDC9]";

  return (
    <>
      <Line
        points={[
          [
            -x / 2,
            -y / 2 -
              offset,
            z / 2 +
              offset,
          ],
          [
            x / 2,
            -y / 2 -
              offset,
            z / 2 +
              offset,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            -x / 2,
            -y / 2 -
              offset -
              0.08,
            z / 2 +
              offset,
          ],
          [
            -x / 2,
            -y / 2 -
              offset +
              0.08,
            z / 2 +
              offset,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            x / 2,
            -y / 2 -
              offset -
              0.08,
            z / 2 +
              offset,
          ],
          [
            x / 2,
            -y / 2 -
              offset +
              0.08,
            z / 2 +
              offset,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Html
        center
        position={[
          0,
          -y / 2 -
            offset -
            0.12,
          z / 2 +
            offset,
        ]}
        transform
        distanceFactor={6.2}
      >
        <div
          className={`whitespace-nowrap rounded-full border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur ${labelClass}`}
        >
          {lengthLabel}
        </div>
      </Html>

      <Line
        points={[
          [
            x / 2 +
              offset,
            -y / 2,
            -z / 2,
          ],
          [
            x / 2 +
              offset,
            y / 2,
            -z / 2,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            x / 2 +
              offset -
              0.08,
            -y / 2,
            -z / 2,
          ],
          [
            x / 2 +
              offset +
              0.08,
            -y / 2,
            -z / 2,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            x / 2 +
              offset -
              0.08,
            y / 2,
            -z / 2,
          ],
          [
            x / 2 +
              offset +
              0.08,
            y / 2,
            -z / 2,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Html
        center
        position={[
          x / 2 +
            offset +
            0.16,
          0,
          -z / 2,
        ]}
        transform
        distanceFactor={6.2}
      >
        <div
          className={`whitespace-nowrap rounded-full border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur ${labelClass}`}
        >
          {heightLabel}
        </div>
      </Html>

      <Line
        points={[
          [
            -x / 2 -
              offset,
            -y / 2,
            -z / 2,
          ],
          [
            -x / 2 -
              offset,
            -y / 2,
            z / 2,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            -x / 2 -
              offset,
            -y / 2,
            -z / 2 -
              0.08,
          ],
          [
            -x / 2 -
              offset,
            -y / 2,
            -z / 2 +
              0.08,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Line
        points={[
          [
            -x / 2 -
              offset,
            -y / 2,
            z / 2 -
              0.08,
          ],
          [
            -x / 2 -
              offset,
            -y / 2,
            z / 2 +
              0.08,
          ],
        ]}
        color={lineColor}
        lineWidth={1.5}
      />

      <Html
        center
        position={[
          -x / 2 -
            offset -
            0.12,
          -y / 2 -
            0.04,
          0,
        ]}
        transform
        distanceFactor={6.2}
      >
        <div
          className={`whitespace-nowrap rounded-full border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur ${labelClass}`}
        >
          {breadthLabel}
        </div>
      </Html>
    </>
  );
}


function MeasurementValue({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent:
    | "sky"
    | "cyan"
    | "violet"
    | "emerald";
}) {
  const tone = {
    sky: "border-[#B7D8D1] bg-[#E6F4F1]/70 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.06]",
    cyan: "border-[#B7D8D1] bg-[#E2F2EE]/70 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.06]",
    violet:
      "border-[#B7D8D1] bg-[#E2F2EE]/78 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.06]",
    emerald:
      "border-[#BBDDD4] bg-[#E8F4F0]/70 dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.06]",
  }[accent];

  return (
    <div
      className={`rounded-[17px] border p-3.5 ${tone}`}
    >
      <p className="text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499] dark:text-[#819CA2]">
        {label}
      </p>

      <p className="mt-1.5 text-[17px] font-black tracking-[-0.035em] text-[#123F49] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function GraniteReconstructionCore({
  language,
  loading,
  total,
  processing,
  completed,
  capabilityReadiness,
}: {
  language: "en" | "te";
  loading: boolean;
  total: number;
  processing: number;
  completed: number;
  capabilityReadiness: number;
}) {
  const copy =
    language === "te"
      ? {
          eyebrow: "లైవ్ గ్రానైట్ రీకన్స్ట్రక్షన్ కోర్",
          title: "ఫోటో ఎవిడెన్స్ → AI మ్యాచింగ్ → 3D సర్ఫేస్",
          subtitle:
            "డ్యాష్‌బోర్డ్ కోసం ప్రత్యేకంగా రూపొందించిన నిరంతర విజువల్ సిమ్యులేషన్. ఇది నిజమైన బ్లాక్ రీకన్స్ట్రక్షన్ ఫలితం కాదు.",
          evidence: "ఎవిడెన్స్ ఫీడ్",
          matching: "ఫీచర్ మ్యాచింగ్",
          geometry: "జియోమెట్రీ ఫ్యూజన్",
          surface: "సర్ఫేస్ మెష్",
          ready: "డిజిటల్ ట్విన్ సిద్ధత",
          visualOnly: "విజువల్ సిమ్యులేషన్ మాత్రమే",
          total: "బ్లాక్‌లు",
          active: "యాక్టివ్",
          complete: "పూర్తి",
          capability: "AI సిద్ధత",
        }
      : {
          eyebrow: "LIVE GRANITE RECONSTRUCTION CORE",
          title: "Photo evidence → AI matching → 3D surface",
          subtitle:
            "A continuous premium dashboard visualization of the reconstruction pipeline. It is not the actual reconstructed block result.",
          evidence: "Evidence feed",
          matching: "Feature matching",
          geometry: "Geometry fusion",
          surface: "Surface mesh",
          ready: "Digital Twin readiness",
          visualOnly: "Visual simulation only",
          total: "Blocks",
          active: "Active",
          complete: "Complete",
          capability: "AI readiness",
        };



  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-[30px] border border-[#B7D8D1]/90 bg-[linear-gradient(145deg,#FFFFFF_0%,#E6F4F1_48%,#FFFFFF_100%)] shadow-[0_24px_70px_rgba(33,141,142,.11)] dark:border-[#60D1BB]/20 dark:bg-[linear-gradient(145deg,#103A42_0%,#0E353D_48%,#0E353D_100%)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: ["-20%", "115%"],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-y-0 w-[18%] bg-gradient-to-r from-transparent via-white/55 to-transparent blur-2xl dark:via-[#60D1BB]/[0.05]"
        />

        <motion.div
          animate={{
            backgroundPosition: ["0px 0px", "54px 54px"],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 opacity-[0.32] [background-image:linear-gradient(rgba(33,141,142,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,141,142,.08)_1px,transparent_1px)] [background-size:54px_54px] dark:opacity-[0.10]"
        />

        <motion.div
          animate={{
            x: [0, 55, -15, 0],
            y: [0, 22, 48, 0],
            scale: [1, 1.08, 0.94, 1],
          }}
          transition={{
            duration: 19,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -left-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#B7D8D1]/55 blur-[105px] dark:bg-[#60D1BB]/[0.07]"
        />

        <motion.div
          animate={{
            x: [0, -48, 18, 0],
            y: [0, 34, -12, 0],
            scale: [1, 0.95, 1.1, 1],
          }}
          transition={{
            duration: 23,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-28 right-[-60px] h-[390px] w-[390px] rounded-full bg-[#B7D8D1]/55 blur-[115px] dark:bg-[#60D1BB]/[0.06]"
        />
      </div>

      <div className="relative grid gap-6 p-5 sm:p-6 xl:grid-cols-[260px_minmax(0,1fr)_290px] xl:items-center">
        <div>
          <div className="flex items-center gap-2">
            <motion.span
              animate={{
                scale: [1, 1.45, 1],
                opacity: [0.55, 1, 0.55],
              }}
              transition={{
                duration: 1.45,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="h-2 w-2 rounded-full bg-[#39A384] shadow-[0_0_14px_rgba(96,209,187,.62)]"
            />
            <p className="text-[7px] font-black uppercase tracking-[0.17em] text-[#218D8E] dark:text-[#68D5BE]">
              {copy.eyebrow}
            </p>
          </div>

          <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.04em] text-[#123F49] dark:text-white">
            {copy.title}
          </h2>

          <p className="mt-3 text-[8px] leading-4 text-[#6B8A91] dark:text-[#A9C2C4]">
            {copy.subtitle}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <AnimatedCoreStat
              label={copy.total}
              value={loading ? "—" : String(total)}
            />
            <AnimatedCoreStat
              label={copy.active}
              value={loading ? "—" : String(processing)}
            />
            <AnimatedCoreStat
              label={copy.complete}
              value={loading ? "—" : String(completed)}
            />
            <AnimatedCoreStat
              label={copy.capability}
              value={
                loading
                  ? "—"
                  : `${capabilityReadiness}%`
              }
            />
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#D7E6E3] bg-white/80 px-3 py-1.5 text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499] shadow-sm backdrop-blur dark:border-[#315B63]/45 dark:bg-[#123F49]/52 dark:text-[#819CA2]">
            <ShieldCheck size={9} />
            {copy.visualOnly}
          </div>
        </div>

        <div className="relative min-h-[330px] overflow-hidden rounded-[24px] border border-[#B7D8D1]/85 bg-[linear-gradient(145deg,rgba(255,255,255,.78),rgba(239,250,255,.66))] shadow-[inset_0_0_65px_rgba(14,165,233,.075)] backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[#123F49]/55">
          <div className="pointer-events-none absolute inset-0">
            <motion.div
              animate={{
                backgroundPosition: [
                  "0px 0px",
                  "34px 34px",
                ],
              }}
              transition={{
                duration: 12,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(14,165,233,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,.08)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-15"
            />

            <motion.div
              animate={{
                x: ["-20%", "120%"],
              }}
              transition={{
                duration: 6.8,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-y-0 w-[16%] bg-gradient-to-r from-transparent via-[#DDF0EC]/75 to-transparent blur-2xl dark:via-[#DDF0EC]/[0.05]"
            />

            <motion.div
              animate={{
                scale: [0.9, 1.08, 0.9],
                opacity: [0.18, 0.42, 0.18],
              }}
              transition={{
                duration: 4.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute left-1/2 top-1/2 h-[230px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B7D8D1]/45 blur-[80px] dark:bg-[#60D1BB]/[0.06]"
            />
          </div>

          <div className="absolute left-4 top-4 z-20">
            <div className="flex items-center gap-2">
              <motion.span
                animate={{
                  scale: [1, 1.45, 1],
                  opacity: [0.55, 1, 0.55],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="h-1.5 w-1.5 rounded-full bg-[#39A384] shadow-[0_0_12px_rgba(96,209,187,.62)]"
              />
              <p className="text-[6px] font-black uppercase tracking-[0.16em] text-[#218D8E] dark:text-[#68D5BE]">
                MULTI-VIEW SOLVER
              </p>
            </div>

            <p className="mt-1 text-[5.4px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
              Feature tracks → camera pose → observed surface
            </p>
          </div>

          <div className="absolute right-4 top-4 z-20 rounded-full border border-[#B7D8D1] bg-white/88 px-2.5 py-1.5 text-[5.5px] font-black uppercase tracking-[0.09em] text-[#0F7E84] shadow-sm backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[#123F49]/60 dark:text-[#76DDC9]">
            5-view evidence simulation
          </div>

          <svg
            viewBox="0 0 760 330"
            aria-label="Animated photogrammetry and 3D reconstruction visualization"
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <linearGradient
                id="solverMeshFill"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#e9f7fb"
                  stopOpacity="0.88"
                />
                <stop
                  offset="55%"
                  stopColor="#d4edf3"
                  stopOpacity="0.72"
                />
                <stop
                  offset="100%"
                  stopColor="#c4e4eb"
                  stopOpacity="0.60"
                />
              </linearGradient>

              <linearGradient
                id="solverScan"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor="#22d3ee"
                  stopOpacity="0"
                />
                <stop
                  offset="50%"
                  stopColor="#22d3ee"
                  stopOpacity="0.88"
                />
                <stop
                  offset="100%"
                  stopColor="#22d3ee"
                  stopOpacity="0"
                />
              </linearGradient>

              <filter
                id="softGlow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur
                  stdDeviation="3.5"
                  result="blur"
                />
                <feMerge>
                  <feMergeNode
                    in="blur"
                  />
                  <feMergeNode
                    in="SourceGraphic"
                  />
                </feMerge>
              </filter>
            </defs>

            <g
              opacity="0.55"
              stroke="#7dd3fc"
              strokeWidth="1"
              fill="none"
            >
              <motion.path
                d="M110 70 C210 80 265 120 330 155"
                strokeDasharray="6 8"
                animate={{
                  strokeDashoffset: [0, -28],
                  opacity: [0.25, 0.85, 0.25],
                }}
                transition={{
                  duration: 2.7,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <motion.path
                d="M635 76 C555 92 500 120 435 154"
                strokeDasharray="6 8"
                animate={{
                  strokeDashoffset: [0, -28],
                  opacity: [0.25, 0.85, 0.25],
                }}
                transition={{
                  duration: 2.9,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <motion.path
                d="M88 248 C195 230 275 207 335 183"
                strokeDasharray="6 8"
                animate={{
                  strokeDashoffset: [0, -28],
                  opacity: [0.25, 0.85, 0.25],
                }}
                transition={{
                  duration: 3.1,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <motion.path
                d="M665 244 C555 224 505 206 429 181"
                strokeDasharray="6 8"
                animate={{
                  strokeDashoffset: [0, -28],
                  opacity: [0.25, 0.85, 0.25],
                }}
                transition={{
                  duration: 3.3,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <motion.path
                d="M378 45 C378 86 380 112 382 139"
                strokeDasharray="6 8"
                animate={{
                  strokeDashoffset: [0, -28],
                  opacity: [0.25, 0.9, 0.25],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            </g>

            {[
              [110, 70, "LEFT"],
              [635, 76, "RIGHT"],
              [88, 248, "FRONT"],
              [665, 244, "BACK"],
              [378, 45, "TOP"],
            ].map(
              ([x, y, label], index) => (
                <g
                  key={String(label)}
                  transform={`translate(${x} ${y})`}
                >
                  <motion.circle
                    r="18"
                    fill="#ffffff"
                    stroke="#bae6fd"
                    strokeWidth="1.4"
                    animate={{
                      r: [17, 19.5, 17],
                      opacity: [0.76, 1, 0.76],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      delay: index * 0.22,
                      ease: "easeInOut",
                    }}
                  />
                  <path
                    d="M-6 -4 L6 -4 L9 0 L6 4 L-6 4 L-9 0 Z"
                    fill="none"
                    stroke="#0F7E84"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r="2.2"
                    fill="#15949B"
                  />
                  <text
                    x="0"
                    y="31"
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="800"
                    fill="#64748b"
                  >
                    {label}
                  </text>
                </g>
              ),
            )}

            <g
              transform="translate(381 174)"
            >
              <motion.ellipse
                cx="0"
                cy="4"
                rx="148"
                ry="86"
                fill="none"
                stroke="#7dd3fc"
                strokeWidth="1.1"
                strokeDasharray="5 9"
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />

              <motion.ellipse
                cx="0"
                cy="4"
                rx="111"
                ry="66"
                fill="none"
                stroke="#67e8f9"
                strokeWidth="1"
                strokeDasharray="3 7"
                animate={{
                  rotate: -360,
                }}
                transition={{
                  duration: 28,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />

              <motion.path
                d="M-97 -42 L-50 -66 L20 -61 L77 -42 L98 -4 L80 41 L29 65 L-39 58 L-88 32 L-105 -7 Z"
                fill="url(#solverMeshFill)"
                stroke="#0F7E84"
                strokeWidth="1.8"
                strokeLinejoin="round"
                animate={{
                  d: [
                    "M-97 -42 L-50 -66 L20 -61 L77 -42 L98 -4 L80 41 L29 65 L-39 58 L-88 32 L-105 -7 Z",
                    "M-94 -45 L-48 -64 L21 -63 L79 -39 L95 -2 L82 39 L31 67 L-41 56 L-90 29 L-103 -8 Z",
                    "M-97 -42 L-50 -66 L20 -61 L77 -42 L98 -4 L80 41 L29 65 L-39 58 L-88 32 L-105 -7 Z",
                  ],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {[
                ["M-97 -42 L20 -61 L-39 58 Z", 0],
                ["M-50 -66 L77 -42 L20 -2 Z", 0.2],
                ["M20 -61 L98 -4 L20 -2 Z", 0.4],
                ["M-105 -7 L20 -2 L-88 32 Z", 0.6],
                ["M20 -2 L80 41 L29 65 Z", 0.8],
                ["M-39 58 L20 -2 L29 65 Z", 1.0],
                ["M-88 32 L20 -2 L-39 58 Z", 1.2],
                ["M77 -42 L98 -4 L20 -2 Z", 1.4],
              ].map(
                ([d, delay], index) => (
                  <motion.path
                    key={index}
                    d={String(d)}
                    fill="none"
                    stroke={
                      index % 2 === 0
                        ? "#38bdf8"
                        : "#22d3ee"
                    }
                    strokeWidth="1"
                    strokeOpacity="0.72"
                    strokeDasharray="220"
                    initial={{
                      strokeDashoffset: 220,
                      opacity: 0.15,
                    }}
                    animate={{
                      strokeDashoffset: [220, 0, 0],
                      opacity: [0.15, 0.85, 0.45],
                    }}
                    transition={{
                      duration: 3.2,
                      repeat: Infinity,
                      delay: Number(delay),
                      ease: "easeInOut",
                    }}
                  />
                ),
              )}

              {[
                [-73, -30],
                [-45, -48],
                [-17, -31],
                [15, -44],
                [45, -27],
                [72, -15],
                [-82, 1],
                [-52, 8],
                [-20, 2],
                [11, 10],
                [42, 3],
                [71, 15],
                [-62, 34],
                [-25, 40],
                [8, 31],
                [38, 42],
              ].map(
                ([x, y], index) => (
                  <motion.circle
                    key={`${x}-${y}-${index}`}
                    cx={x}
                    cy={y}
                    r="2.6"
                    fill={
                      index % 3 === 0
                        ? "#0F7E84"
                        : "#22d3ee"
                    }
                    filter="url(#softGlow)"
                    animate={{
                      r: [2, 3.8, 2],
                      opacity: [0.35, 1, 0.35],
                    }}
                    transition={{
                      duration: 1.8 + (index % 4) * 0.18,
                      repeat: Infinity,
                      delay: index * 0.08,
                      ease: "easeInOut",
                    }}
                  />
                ),
              )}

              <motion.rect
                x="-112"
                y="-72"
                width="224"
                height="8"
                rx="4"
                fill="url(#solverScan)"
                initial={{
                  y: -65,
                }}
                animate={{
                  y: [-65, 58, -65],
                  opacity: [0.25, 0.95, 0.25],
                }}
                transition={{
                  duration: 3.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </g>

            {[
              [110, 70, 300, 151],
              [635, 76, 458, 151],
              [88, 248, 302, 195],
              [665, 244, 458, 194],
              [378, 45, 382, 139],
            ].map(
              ([sx, sy, ex, ey], index) => (
                <motion.circle
                  key={`track-${index}`}
                  r="3.1"
                  fill="#22d3ee"
                  filter="url(#softGlow)"
                  animate={{
                    cx: [
                      Number(sx),
                      Number(ex),
                      Number(sx),
                    ],
                    cy: [
                      Number(sy),
                      Number(ey),
                      Number(sy),
                    ],
                    opacity: [0.15, 1, 0.15],
                  }}
                  transition={{
                    duration: 2.7 + index * 0.24,
                    repeat: Infinity,
                    delay: index * 0.14,
                    ease: "easeInOut",
                  }}
                />
              ),
            )}
          </svg>

          <div className="absolute bottom-3 left-3 right-3 z-20 grid grid-cols-3 gap-2">
            {[
              ["01", "MATCH", "Keypoints linked"],
              ["02", "POSE", "Cameras solved"],
              ["03", "MESH", "Observed surface"],
            ].map(
              ([number, label, detail], index) => (
                <motion.div
                  key={label}
                  animate={{
                    y: [0, -2, 0],
                    borderColor: [
                      "rgba(186,230,253,.72)",
                      "rgba(34,211,238,.80)",
                      "rgba(186,230,253,.72)",
                    ],
                  }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    delay: index * 0.36,
                    ease: "easeInOut",
                  }}
                  className="rounded-[12px] border border-[#B7D8D1]/75 bg-white/78 px-2 py-2 shadow-sm backdrop-blur-md dark:border-[#68D5BE]/17 dark:bg-[#123F49]/56"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[5px] font-black text-[#AABABC] dark:text-[#56757B]">
                      {number}
                    </span>

                    <span className="text-[5.4px] font-black uppercase tracking-[0.09em] text-[#218D8E] dark:text-[#68D5BE]">
                      {label}
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-[5.2px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
                    {detail}
                  </p>
                </motion.div>
              ),
            )}
          </div>
        </div>

        <motion.div
          whileHover={{
            scale: 1.012,
          }}
          transition={{
            duration: 0.24,
          }}
          className="relative min-h-[330px] overflow-hidden rounded-[24px] border border-[#B7D8D1]/85 bg-[linear-gradient(160deg,rgba(255,255,255,.86)_0%,rgba(235,250,252,.78)_55%,rgba(236,248,255,.84)_100%)] p-3.5 shadow-[0_18px_45px_rgba(6,182,212,.10)] backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[linear-gradient(160deg,#1d3850_0%,#183247_58%,#1b354d_100%)]"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 28,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute -right-20 -top-20 h-[230px] w-[230px] rounded-full border border-dashed border-[#68D5BE]/42 dark:border-[#68D5BE]/[0.09]"
            />

            <motion.div
              animate={{
                scale: [0.84, 1.12, 0.84],
                opacity: [0.18, 0.42, 0.18],
              }}
              transition={{
                duration: 4.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute left-1/2 top-[43%] h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B7D8D1]/55 blur-[60px] dark:bg-[#60D1BB]/[0.06]"
            />

            <motion.div
              animate={{
                y: ["-110%", "360%"],
              }}
              transition={{
                duration: 5.8,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-x-0 h-[16%] bg-gradient-to-b from-transparent via-white/60 to-transparent blur-xl dark:via-[#DDF0EC]/[0.045]"
            />
          </div>

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.45, 1, 0.45],
                  }}
                  transition={{
                    duration: 1.45,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-1.5 w-1.5 rounded-full bg-[#39A384] shadow-[0_0_12px_rgba(96,209,187,.62)]"
                />
                <p className="text-[6px] font-black uppercase tracking-[0.16em] text-[#218D8E] dark:text-[#68D5BE]">
                  TWIN ENGINE
                </p>
              </div>

              <p className="mt-1 text-[5.5px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
                Multi-view intelligence signature
              </p>
            </div>

            <span className="rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-2 py-1 text-[5px] font-black uppercase tracking-[0.08em] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]">
              {loading
                ? "SYNC"
                : `${capabilityReadiness}% READY`}
            </span>
          </div>

          <div className="relative z-10 mt-3 grid min-h-[205px] place-items-center">
            <div className="relative h-[196px] w-[196px]">
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 16,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-0 rounded-full border border-dashed border-[#68D5BE]/65 dark:border-[#60D1BB]/20"
              />

              <motion.div
                animate={{
                  rotate: -360,
                }}
                transition={{
                  duration: 24,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-[16px] rounded-full border border-dotted border-[#68D5BE]/65 dark:border-[#60D1BB]/20"
              />

              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 38,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-[33px] rounded-full border border-[#68D5BE]/50 dark:border-[#68D5BE]/[0.11]"
              />

              <svg
                viewBox="0 0 196 196"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
              >
                <defs>
                  <linearGradient
                    id="twinSignatureFill"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.94" />
                    <stop offset="52%" stopColor="#cffafe" stopOpacity="0.76" />
                    <stop offset="100%" stopColor="#ccfbf1" stopOpacity="0.68" />
                  </linearGradient>

                  <filter
                    id="twinGlow"
                    x="-60%"
                    y="-60%"
                    width="220%"
                    height="220%"
                  >
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <motion.path
                  d="M58 56 L84 42 L121 47 L141 67 L139 111 L120 137 L81 143 L51 126 L42 91 Z"
                  fill="url(#twinSignatureFill)"
                  stroke="#0891b2"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  animate={{
                    d: [
                      "M58 56 L84 42 L121 47 L141 67 L139 111 L120 137 L81 143 L51 126 L42 91 Z",
                      "M56 59 L85 40 L123 49 L143 70 L136 112 L118 140 L79 141 L49 123 L44 88 Z",
                      "M58 56 L84 42 L121 47 L141 67 L139 111 L120 137 L81 143 L51 126 L42 91 Z",
                    ],
                  }}
                  transition={{
                    duration: 5.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                {[
                  ["M58 56 L98 91 L84 42", 0],
                  ["M84 42 L98 91 L121 47", 0.12],
                  ["M121 47 L98 91 L141 67", 0.24],
                  ["M141 67 L98 91 L139 111", 0.36],
                  ["M139 111 L98 91 L120 137", 0.48],
                  ["M120 137 L98 91 L81 143", 0.60],
                  ["M81 143 L98 91 L51 126", 0.72],
                  ["M51 126 L98 91 L42 91", 0.84],
                  ["M42 91 L98 91 L58 56", 0.96],
                ].map(([d, delay], index) => (
                  <motion.path
                    key={index}
                    d={String(d)}
                    fill="none"
                    stroke={index % 2 === 0 ? "#15949B" : "#22d3ee"}
                    strokeWidth="1"
                    strokeDasharray="120"
                    initial={{
                      strokeDashoffset: 120,
                      opacity: 0.1,
                    }}
                    animate={{
                      strokeDashoffset: [120, 0, 0],
                      opacity: [0.1, 0.8, 0.34],
                    }}
                    transition={{
                      duration: 2.8,
                      repeat: Infinity,
                      delay: Number(delay),
                      ease: "easeInOut",
                    }}
                  />
                ))}

                {[
                  [58, 56],
                  [84, 42],
                  [121, 47],
                  [141, 67],
                  [139, 111],
                  [120, 137],
                  [81, 143],
                  [51, 126],
                  [42, 91],
                  [98, 91],
                ].map(([cx, cy], index) => (
                  <motion.circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r="2.8"
                    fill={index === 9 ? "#14b8a6" : "#15949B"}
                    filter="url(#twinGlow)"
                    animate={{
                      r: [2.1, 3.7, 2.1],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 1.7 + (index % 3) * 0.2,
                      repeat: Infinity,
                      delay: index * 0.08,
                      ease: "easeInOut",
                    }}
                  />
                ))}

                <motion.line
                  x1="38"
                  x2="150"
                  y1="64"
                  y2="64"
                  stroke="#22d3ee"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  initial={{
                    translateY: 0,
                  }}
                  animate={{
                    translateY: [0, 70, 0],
                    opacity: [0.22, 0.95, 0.22],
                  }}
                  transition={{
                    duration: 3.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </svg>

              {[
                ["01", "top-[-7px] left-1/2 -translate-x-1/2"],
                ["02", "right-[-7px] top-1/2 -translate-y-1/2"],
                ["03", "bottom-[-7px] left-1/2 -translate-x-1/2"],
                ["04", "left-[-7px] top-1/2 -translate-y-1/2"],
              ].map(([label, className], index) => (
                <motion.span
                  key={label}
                  animate={{
                    scale: [0.92, 1.08, 0.92],
                    opacity: [0.55, 1, 0.55],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: index * 0.32,
                    ease: "easeInOut",
                  }}
                  className={`absolute grid h-7 w-7 place-items-center rounded-[9px] border border-[#B7D8D1] bg-white/92 text-[5.5px] font-black text-[#218D8E] shadow-sm backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[#123F49]/92 dark:text-[#76DDC9] ${className}`}
                >
                  {label}
                </motion.span>
              ))}

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="text-[16px] font-black leading-none tracking-[-0.05em] text-[#123F49] dark:text-white">
                  {loading
                    ? "—"
                    : `${capabilityReadiness}%`}
                </p>
                <p className="mt-1 text-[4.8px] font-black uppercase tracking-[0.10em] text-[#218D8E] dark:text-[#68D5BE]">
                  AI READY
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-4 gap-1.5">
            {[
              ["01", copy.evidence],
              ["02", copy.matching],
              ["03", copy.geometry],
              ["04", copy.surface],
            ].map(([number, label], index) => (
              <motion.div
                key={number}
                animate={{
                  y: [0, -2, 0],
                  borderColor: [
                    "rgba(165,243,252,.55)",
                    "rgba(96,209,187,.90)",
                    "rgba(165,243,252,.55)",
                  ],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  delay: index * 0.28,
                  ease: "easeInOut",
                }}
                className="rounded-[10px] border border-[#B7D8D1]/70 bg-white/70 px-1.5 py-2 text-center shadow-sm backdrop-blur dark:border-[#68D5BE]/15 dark:bg-[#123F49]/48"
              >
                <p className="text-[4.5px] font-black text-[#AABABC] dark:text-[#56757B]">
                  {number}
                </p>
                <p className="mt-0.5 truncate text-[4.9px] font-black uppercase tracking-[0.055em] text-[#56757B] dark:text-[#A8C0C5]">
                  {label}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="relative z-10 mt-2 flex items-center justify-between gap-2 rounded-[11px] border border-[#D7E6E3]/85 bg-white/62 px-2.5 py-2 dark:border-[#315B63]/45 dark:bg-[#123F49]/45">
            <div className="flex items-center gap-1.5">
              <ShieldCheck
                size={10}
                className="text-[#39A384] dark:text-[#68D5BE]"
              />
              <span className="text-[5px] font-black uppercase tracking-[0.08em] text-[#6B8A91] dark:text-[#A9C2C4]">
                {copy.visualOnly}
              </span>
            </div>

            <span className="text-[5px] font-black uppercase tracking-[0.08em] text-[#218D8E] dark:text-[#68D5BE]">
              LIVE SIGNAL
            </span>
          </div>
        </motion.div>

      </div>
    </motion.section>
  );
}

function AnimatedCoreStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#D7E6E3] bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur dark:border-[#315B63]/45 dark:bg-[#123F49]/52">
      <p className="text-[5.5px] font-black uppercase tracking-[0.1em] text-[#7F9499] dark:text-[#819CA2]">
        {label}
      </p>
      <motion.p
        animate={{
          opacity: [0.72, 1, 0.72],
        }}
        transition={{
          duration: 2.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="mt-1 text-lg font-black tracking-[-0.04em] text-[#123F49] dark:text-white"
      >
        {value}
      </motion.p>
    </div>
  );
}

function GraniteIdentityBeacon({
  block,
  analysis,
  language,
  copy,
  loading,
}: {
  block: BlockOut | null;
  analysis: BlockAnalysis | null;
  language: "en" | "te";
  copy: Copy;
  loading: boolean;
}) {
  const measurement =
    analysis?.measurement ?? null;

  const lengthCm =
    typeof measurement?.length_cm ===
    "number"
      ? measurement.length_cm
      : null;

  const breadthCm =
    typeof measurement?.breadth_cm ===
    "number"
      ? measurement.breadth_cm
      : null;

  const heightCm =
    typeof measurement?.height_cm ===
    "number"
      ? measurement.height_cm
      : null;

  const captured =
    block?.capture_date
      ? new Date(
          block.capture_date,
        )
      : null;

  const date =
    captured &&
    !Number.isNaN(
      captured.getTime(),
    )
      ? captured.toLocaleDateString(
          language === "te"
            ? "te-IN"
            : "en-IN",
          {
            day: "2-digit",
            month: "short",
          },
        )
      : "—";

  const state =
    block
      ? blockState(
          block.status,
          copy,
        )
      : null;

  const formatDimension = (
    value: number | null,
  ) =>
    value === null
      ? "—"
      : `${value.toFixed(
          value >= 100
            ? 0
            : 1,
        )} cm`;

  if (loading) {
    return (
      <div className="min-h-[196px] animate-pulse rounded-[22px] border border-[#B7D8D1]/85 bg-[linear-gradient(145deg,#f3fbff,#edf7fb)] dark:border-[#60D1BB]/20 dark:bg-[#123F49]/52" />
    );
  }

  return (
    <Link
      href={
        block
          ? `/blocks/${block.id}`
          : "/capture"
      }
      className="group relative block min-h-[196px] overflow-hidden rounded-[22px] border border-[#B7D8D1]/90 bg-[linear-gradient(145deg,#eefaff_0%,#f8fdff_46%,#ecf8f7_100%)] p-3.5 shadow-[0_16px_38px_rgba(14,165,233,.10)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,138,145,.18)] dark:border-[#60D1BB]/20 dark:bg-[linear-gradient(145deg,#1e3852,#1a3148)]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: [
              "-30%",
              "130%",
            ],
          }}
          transition={{
            duration: 6.5,
            repeat:
              Infinity,
            ease: "linear",
          }}
          className="absolute inset-y-0 w-[16%] bg-gradient-to-r from-transparent via-white/60 to-transparent blur-xl dark:via-[#DDF0EC]/[0.045]"
        />

        <motion.div
          animate={{
            scale: [
              0.9,
              1.08,
              0.9,
            ],
            opacity: [
              0.22,
              0.45,
              0.22,
            ],
          }}
          transition={{
            duration: 4.2,
            repeat:
              Infinity,
            ease:
              "easeInOut",
          }}
          className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-[#B7D8D1]/55 blur-[60px] dark:bg-[#60D1BB]/[0.06]"
        />
      </div>

      <div className="relative grid min-h-[168px] grid-cols-[160px_minmax(0,1fr)] gap-3">
        <div className="relative grid place-items-center overflow-hidden rounded-[17px] border border-[#B7D8D1]/85 bg-white/62 shadow-inner dark:border-[#68D5BE]/17 dark:bg-slate-700/[0.08]">
          <motion.div
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 18,
              repeat:
                Infinity,
              ease: "linear",
            }}
            className="absolute h-[122px] w-[122px] rounded-full border border-dashed border-[#68D5BE]/65 dark:border-[#60D1BB]/20"
          />

          <motion.div
            animate={{
              rotate: -360,
            }}
            transition={{
              duration: 28,
              repeat:
                Infinity,
              ease: "linear",
            }}
            className="absolute h-[96px] w-[132px] rounded-[50%] border border-dotted border-[#68D5BE]/65 dark:border-[#60D1BB]/20"
          />

          <svg
            viewBox="0 0 150 130"
            aria-hidden="true"
            className="relative h-[120px] w-[138px]"
          >
            <defs>
              <linearGradient
                id="granitePassportFace"
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#dce6eb"
                />
                <stop
                  offset="55%"
                  stopColor="#bfcdd5"
                />
                <stop
                  offset="100%"
                  stopColor="#9fb1bd"
                />
              </linearGradient>

              <linearGradient
                id="granitePassportSide"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#b9c9d2"
                />
                <stop
                  offset="100%"
                  stopColor="#8399a8"
                />
              </linearGradient>
            </defs>

            <path
              d="M31 35 L58 19 L112 24 L130 45 L119 97 L91 112 L38 101 L20 78 Z"
              fill="url(#granitePassportFace)"
              stroke="#0F7E84"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />

            <path
              d="M58 19 L112 24 L130 45 L100 51 L48 45 Z"
              fill="#eef5f7"
              stroke="#38bdf8"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />

            <path
              d="M100 51 L130 45 L119 97 L91 112 L86 66 Z"
              fill="url(#granitePassportSide)"
              stroke="#0891b2"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />

            {[
              [43, 56, 2.3],
              [56, 71, 1.7],
              [76, 50, 1.9],
              [86, 83, 2.1],
              [61, 91, 1.5],
              [102, 62, 1.6],
              [45, 81, 1.4],
              [73, 64, 1.2],
            ].map(
              (
                [
                  cx,
                  cy,
                  r,
                ],
                index,
              ) => (
                <circle
                  key={
                    index
                  }
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={
                    index %
                      2 ===
                    0
                      ? "#475569"
                      : "#7F9499"
                  }
                  opacity="0.72"
                />
              ),
            )}

            <motion.line
              x1="18"
              x2="132"
              y1="33"
              y2="33"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{
                translateY: 0,
              }}
              animate={{
                translateY: [
                  0,
                  62,
                  0,
                ],
                opacity: [
                  0.3,
                  1,
                  0.3,
                ],
              }}
              transition={{
                duration: 3,
                repeat:
                  Infinity,
                ease:
                  "easeInOut",
              }}
            />

            <path
              d="M14 31 V20 H25 M125 20 H136 V31 M14 98 V109 H25 M125 109 H136 V98"
              fill="none"
              stroke="#15949B"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>

          <span className="absolute bottom-2 rounded-full border border-[#B7D8D1] bg-white/86 px-2 py-1 text-[5px] font-black uppercase tracking-[0.1em] text-[#218D8E] shadow-sm backdrop-blur dark:border-[#60D1BB]/20 dark:bg-[#123F49]/60 dark:text-[#76DDC9]">
            Granite identity scan
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <motion.span
                  animate={{
                    scale: [
                      1,
                      1.4,
                      1,
                    ],
                    opacity: [
                      0.55,
                      1,
                      0.55,
                    ],
                  }}
                  transition={{
                    duration: 1.6,
                    repeat:
                      Infinity,
                  }}
                  className="h-1.5 w-1.5 rounded-full bg-[#39A384]"
                />

                <p className="text-[6px] font-black uppercase tracking-[0.15em] text-[#218D8E] dark:text-[#68D5BE]">
                  LIVE GRANITE PASSPORT
                </p>
              </div>

              <p className="mt-2 truncate text-[19px] font-black tracking-[-0.04em] text-[#123F49] dark:text-white">
                {
                  block?.block_code ||
                  "Start first block"
                }
              </p>

              <p className="mt-0.5 text-[6px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
                {copy.captured}:{" "}
                {date}
              </p>
            </div>

            {state ? (
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-[5.5px] font-black uppercase tracking-[0.08em] ${state.className}`}
              >
                {state.label}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <PassportMetric
              label="LENGTH"
              value={formatDimension(
                lengthCm,
              )}
            />

            <PassportMetric
              label="BREADTH"
              value={formatDimension(
                breadthCm,
              )}
            />

            <PassportMetric
              label="HEIGHT"
              value={formatDimension(
                heightCm,
              )}
            />
          </div>

          <div className="mt-2.5 rounded-[12px] border border-[#B7D8D1]/75 bg-white/55 px-2.5 py-2 dark:border-[#68D5BE]/15 dark:bg-[#123F49]/45">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Cpu
                  size={10}
                  className="text-[#15949B] dark:text-[#68D5BE]"
                />

                <span className="text-[5.5px] font-black uppercase tracking-[0.09em] text-[#6B8A91] dark:text-[#A9C2C4]">
                  Latest analysis-linked identity
                </span>
              </div>

              <ArrowRight
                size={11}
                className="text-[#15949B] transition group-hover:translate-x-0.5 dark:text-[#68D5BE]"
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PassportMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[11px] border border-[#B7D8D1]/75 bg-white/62 px-2 py-2 shadow-sm dark:border-[#68D5BE]/15 dark:bg-[#123F49]/45">
      <p className="text-[4.8px] font-black uppercase tracking-[0.08em] text-[#7F9499]">
        {label}
      </p>

      <p className="mt-1 truncate text-[8px] font-black text-[#36545D] dark:text-[#F4FBFA]">
        {value}
      </p>
    </div>
  );
}


function SignalMetricCard({
  icon,
  label,
  value,
  foot,
  accent,
  progress,
  mode,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  foot: string;
  accent:
    | "sky"
    | "emerald"
    | "amber"
    | "rose"
    | "teal";
  progress: number | null;
  mode:
    | "portfolio"
    | "success"
    | "active"
    | "alert"
    | "network";
}) {
  const tones = {
    sky: {
      icon:
        "border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
      line:
        "from-[#15949B] via-[#60D1BB] to-[#39A384]",
      glow:
        "bg-[#B7D8D1]/45 dark:bg-[#60D1BB]/[0.06]",
      ring:
        "#15949B",
    },
    emerald: {
      icon:
        "border-[#BBDDD4] bg-[#E8F4F0] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]",
      line:
        "from-[#39A384] via-teal-400 to-[#60D1BB]",
      glow:
        "bg-emerald-200/30 dark:bg-emerald-400/[0.04]",
      ring:
        "#10b981",
    },
    amber: {
      icon:
        "border-[#F3D598] bg-[#FFF4DE] text-[#B8790D] dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.08] dark:text-[#FFD07A]",
      line:
        "from-amber-500 via-orange-400 to-[#60D1BB]",
      glow:
        "bg-amber-200/30 dark:bg-amber-400/[0.035]",
      ring:
        "#f59e0b",
    },
    rose: {
      icon:
        "border-[#F2B4B4] bg-[#FDECEC] text-[#C53F3F] dark:border-[#E05252]/22 dark:bg-[#E05252]/[0.08] dark:text-[#FF9B9B]",
      line:
        "from-[#E05252] via-orange-400 to-amber-400",
      glow:
        "bg-rose-200/28 dark:bg-rose-400/[0.035]",
      ring:
        "#f43f5e",
    },
    teal: {
      icon:
        "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200",
      line:
        "from-teal-500 via-[#60D1BB] to-[#15949B]",
      glow:
        "bg-teal-200/30 dark:bg-teal-400/[0.04]",
      ring:
        "#14b8a6",
    },
  }[accent];

  const clampedProgress =
    progress === null
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            progress,
          ),
        );

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.44,
        ease: [
          0.16,
          1,
          0.3,
          1,
        ],
      }}
      whileHover={{
        y: -5,
        scale: 1.01,
      }}
      className="group relative min-h-[142px] overflow-hidden rounded-[22px] border border-[#D7E6E3]/90 bg-white p-3.5 shadow-[0_12px_34px_rgba(18,59,70,.075)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(14,165,233,.09)] dark:border-[#315B63]/50 dark:bg-[#0B3037]"
    >
      <motion.div
        animate={{
          x: [
            "-180%",
            "420%",
          ],
        }}
        transition={{
          duration:
            mode === "active"
              ? 3.2
              : 6.8,
          repeat:
            Infinity,
          ease: "linear",
        }}
        className="pointer-events-none absolute inset-y-0 w-[20%] bg-gradient-to-r from-transparent via-white/65 to-transparent blur-xl dark:via-[#DDF0EC]/[0.035]"
      />

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-[48px] ${tones.glow}`}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <span
          className={`grid h-9 w-9 place-items-center rounded-[12px] border shadow-sm ${tones.icon}`}
        >
          {icon}
        </span>

        {clampedProgress !== null ? (
          <SignalRing
            value={
              clampedProgress
            }
            color={
              tones.ring
            }
          />
        ) : (
          <NetworkGlyph
            color={
              tones.ring
            }
          />
        )}
      </div>

      <div className="relative z-10 mt-3">
        <p className="text-[6.2px] font-black uppercase tracking-[0.13em] text-[#7F9499] dark:text-[#819CA2]">
          {label}
        </p>

        {value === null ? (
          <div className="mt-1.5 h-8 w-16 animate-pulse rounded-lg bg-[#E6F4F1] dark:bg-[#123F49]/72" />
        ) : (
          <div className="mt-1 flex items-end gap-2">
            <p className="text-[31px] font-black leading-none tracking-[-0.06em] text-[#123F49] dark:text-white">
              {value}
            </p>

            {mode === "active" &&
            value > 0 ? (
              <motion.span
                animate={{
                  opacity: [
                    0.45,
                    1,
                    0.45,
                  ],
                  scale: [
                    0.9,
                    1.15,
                    0.9,
                  ],
                }}
                transition={{
                  duration: 1.35,
                  repeat:
                    Infinity,
                  ease:
                    "easeInOut",
                }}
                className="mb-1 h-1.5 w-1.5 rounded-full bg-[#FFF4DE]0 shadow-[0_0_10px_rgba(245,158,11,.55)]"
              />
            ) : null}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="truncate text-[6px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
            {foot}
          </p>

          {clampedProgress !== null ? (
            <span className="shrink-0 text-[5.5px] font-black uppercase tracking-[0.08em] text-[#AABABC] dark:text-[#56757B]">
              {clampedProgress}%
            </span>
          ) : (
            <span className="shrink-0 text-[5.5px] font-black uppercase tracking-[0.08em] text-teal-600 dark:text-teal-300">
              NETWORK
            </span>
          )}
        </div>

        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#E6F4F1] dark:bg-[#123F49]/66">
          {clampedProgress !== null ? (
            <motion.div
              initial={{
                width: 0,
              }}
              animate={{
                width:
                  `${clampedProgress}%`,
              }}
              transition={{
                duration: 0.78,
                ease: [
                  0.16,
                  1,
                  0.3,
                  1,
                ],
              }}
              className={`h-full rounded-full bg-gradient-to-r ${tones.line}`}
            />
          ) : (
            <motion.div
              animate={{
                x: [
                  "-100%",
                  "330%",
                ],
              }}
              transition={{
                duration: 2.8,
                repeat:
                  Infinity,
                ease: "linear",
              }}
              className={`h-full w-[38%] rounded-full bg-gradient-to-r ${tones.line}`}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SignalRing({
  value,
  color,
}: {
  value: number;
  color: string;
}) {
  const radius = 13;
  const circumference =
    2 *
    Math.PI *
    radius;

  const offset =
    circumference -
    (value / 100) *
      circumference;

  return (
    <div className="relative h-9 w-9 shrink-0">
      <svg
        viewBox="0 0 36 36"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,.18)"
          strokeWidth="3"
        />

        <motion.circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={
            circumference
          }
          initial={{
            strokeDashoffset:
              circumference,
          }}
          animate={{
            strokeDashoffset:
              offset,
          }}
          transition={{
            duration: 0.85,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
        />
      </svg>

      <span className="absolute inset-0 grid place-items-center text-[5px] font-black text-[#7F9499] dark:text-[#819CA2]">
        {value}
      </span>
    </div>
  );
}

function NetworkGlyph({
  color,
}: {
  color: string;
}) {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <svg
        viewBox="0 0 36 36"
        className="h-full w-full"
        aria-hidden="true"
      >
        <motion.path
          d="M8 24 L17 10 L27 22 L8 24 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          strokeDasharray="3 3"
          animate={{
            strokeDashoffset: [
              0,
              -12,
            ],
          }}
          transition={{
            duration: 3.2,
            repeat:
              Infinity,
            ease: "linear",
          }}
        />

        {[
          [8, 24],
          [17, 10],
          [27, 22],
          [18, 20],
        ].map(
          (
            [cx, cy],
            index,
          ) => (
            <motion.circle
              key={
                `${cx}-${cy}`
              }
              cx={cx}
              cy={cy}
              r="2"
              fill={color}
              animate={{
                opacity: [
                  0.4,
                  1,
                  0.4,
                ],
                r: [
                  1.6,
                  2.5,
                  1.6,
                ],
              }}
              transition={{
                duration:
                  1.8 +
                  index *
                    0.15,
                repeat:
                  Infinity,
                delay:
                  index *
                  0.12,
              }}
            />
          ),
        )}
      </svg>
    </div>
  );
}


function ControlTower({
  metrics,
  loading,
  copy,
}: {
  metrics: {
    total: number;
    completed: number;
    processing: number;
    failed: number;
    quarries: number;
  };
  loading: boolean;
  copy: Copy;
}) {
  const completePct =
    metrics.total > 0
      ? Math.round(
          (metrics.completed /
            metrics.total) *
            100,
        )
      : 0;

  const processingPct =
    metrics.total > 0
      ? Math.round(
          (metrics.processing /
            metrics.total) *
            100,
        )
      : 0;

  const failedPct =
    metrics.total > 0
      ? Math.round(
          (metrics.failed /
            metrics.total) *
            100,
        )
      : 0;

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.48,
      }}
      className="overflow-hidden rounded-[28px] border border-[#D7E6E3]/90 bg-white shadow-[0_18px_56px_rgba(18,59,70,.085)] dark:border-[#315B63]/50 dark:bg-[#0B3037]"
    >
      <div className="border-b border-[#D7E6E3]/85 px-5 py-5 sm:px-6 dark:border-[#315B63]/45">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#0F7E84] dark:text-[#68D5BE]">
              {copy.controlTower}
            </p>
            <h2 className="mt-1 max-w-2xl text-xl font-black tracking-[-0.03em] text-[#123F49] dark:text-white">
              {copy.controlTowerSub}
            </h2>
          </div>

          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
            <Activity
              size={17}
            />
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,.78fr)_minmax(0,1.22fr)]">
        <div className="relative overflow-hidden rounded-[22px] border border-[#D7E6E3] bg-[linear-gradient(145deg,#FFFFFF,#E6F4F1)] p-5 dark:border-[#315B63]/50 dark:bg-[linear-gradient(145deg,#123F49,#103A42)]">
          <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-[#B7D8D1]/50 blur-[60px] dark:bg-[#60D1BB]/[0.07]" />

          <div className="relative">
            <p className="text-[7px] font-black uppercase tracking-[0.13em] text-[#7F9499] dark:text-[#819CA2]">
              Portfolio completion
            </p>

            <div className="mt-3 flex items-end gap-3">
              <p className="text-[54px] font-black leading-none tracking-[-0.07em] text-[#123F49] dark:text-white">
                {loading
                  ? "—"
                  : `${completePct}%`}
              </p>

              <span className="mb-1 rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.1em] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]">
                {
                  copy.metricCompleted
                }
              </span>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white shadow-inner dark:bg-[#123F49]/66">
              <motion.div
                initial={{
                  width: 0,
                }}
                animate={{
                  width: `${completePct}%`,
                }}
                transition={{
                  duration: 0.8,
                  ease: [
                    0.16,
                    1,
                    0.3,
                    1,
                  ],
                }}
                className="h-full rounded-full bg-gradient-to-r from-[#15949B] via-[#39A384] to-[#39A384]"
              />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <MiniStat
                label="Total"
                value={
                  loading
                    ? "—"
                    : String(
                        metrics.total,
                      )
                }
              />
              <MiniStat
                label="Active"
                value={
                  loading
                    ? "—"
                    : String(
                        metrics.processing,
                      )
                }
              />
              <MiniStat
                label="Attention"
                value={
                  loading
                    ? "—"
                    : String(
                        metrics.failed,
                      )
                }
              />
            </div>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <StageBar
            label={
              copy.metricCompleted
            }
            value={
              loading
                ? 0
                : completePct
            }
            count={
              loading
                ? "—"
                : String(
                    metrics.completed,
                  )
            }
            tone="emerald"
          />

          <StageBar
            label={
              copy.metricProcessing
            }
            value={
              loading
                ? 0
                : processingPct
            }
            count={
              loading
                ? "—"
                : String(
                    metrics.processing,
                  )
            }
            tone="sky"
          />

          <StageBar
            label={
              copy.metricAttention
            }
            value={
              loading
                ? 0
                : failedPct
            }
            count={
              loading
                ? "—"
                : String(
                    metrics.failed,
                  )
            }
            tone="rose"
          />

          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <InfoFeature
              icon={
                <ScanLine
                  size={15}
                />
              }
              title={
                copy.evidenceGate
              }
              text={
                copy.evidenceGateText
              }
              tone="sky"
            />

            <InfoFeature
              icon={
                <AlertTriangle
                  size={15}
                />
              }
              title={
                copy.attentionQueue
              }
              text={
                copy.attentionQueueText
              }
              tone="amber"
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function ReadinessPanel({
  items,
  stats,
  loading,
  copy,
}: {
  items: CapabilityItem[];
  stats: {
    reported: number;
    operational: number;
    limited: number;
    unavailable: number;
    readiness: number;
  };
  loading: boolean;
  copy: Copy;
}) {
  const ringStyle: React.CSSProperties =
    {
      background:
        `conic-gradient(rgb(21 148 155) ${stats.readiness}%, rgb(215 230 227) ${stats.readiness}% 100%)`,
    };

  return (
    <motion.aside
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.48,
        delay: 0.04,
      }}
      className="rounded-[28px] border border-[#D7E6E3]/90 bg-white p-5 shadow-[0_18px_56px_rgba(18,59,70,.085)] sm:p-6 dark:border-[#315B63]/50 dark:bg-[#0B3037]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#218D8E] dark:text-[#68D5BE]">
            {copy.readiness}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#123F49] dark:text-white">
            {copy.readinessSub}
          </h2>
        </div>

        <span className="grid h-11 w-11 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E2F2EE] text-[#218D8E] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
          <Cpu size={17} />
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
        <div className="mx-auto">
          <div
            style={ringStyle}
            className="grid h-[138px] w-[138px] place-items-center rounded-full p-[9px]"
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(215,230,227,.9)] dark:bg-[#0B3037] dark:shadow-[inset_0_0_0_1px_rgba(88,118,125,.32)]">
              <div className="text-center">
                <p className="text-[32px] font-black leading-none tracking-[-0.06em]">
                  {loading
                    ? "—"
                    : `${stats.readiness}%`}
                </p>
                <p className="mt-1 text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499]">
                  {
                    copy.readinessScore
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ReadinessCount
            label={
              copy.operational
            }
            value={
              loading
                ? "—"
                : String(
                    stats.operational,
                  )
            }
            tone="emerald"
          />

          <ReadinessCount
            label={copy.limited}
            value={
              loading
                ? "—"
                : String(
                    stats.limited,
                  )
            }
            tone="amber"
          />

          <ReadinessCount
            label={
              copy.unavailable
            }
            value={
              loading
                ? "—"
                : String(
                    stats.unavailable,
                  )
            }
            tone="rose"
          />

          <ReadinessCount
            label={
              copy.unreported
            }
            value={
              loading
                ? "—"
                : stats.reported > 0
                  ? "0"
                  : "—"
            }
            tone="slate"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {loading ? (
          <CapabilitySkeleton />
        ) : items.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#C5D8D5] bg-[#F3F8F6] px-4 py-4 text-[8px] font-bold text-[#7F9499] dark:border-[#315B63]/55 dark:bg-[#123F49]/45">
            {copy.unreported}
          </div>
        ) : (
          items
            .slice(0, 6)
            .map((item) => (
              <CapabilityRow
                key={item.key}
                item={item}
                copy={copy}
              />
            ))
        )}
      </div>
    </motion.aside>
  );
}

function JourneyRail({
  copy,
}: {
  copy: Copy;
}) {
  const steps = [
    {
      label: copy.capture,
      icon: Camera,
    },
    {
      label: copy.evidence,
      icon: ScanLine,
    },
    {
      label:
        copy.reconstruct,
      icon: Layers3,
    },
    {
      label: copy.measure,
      icon: CircleGauge,
    },
    {
      label: copy.inspect,
      icon: Sparkles,
    },
    {
      label: copy.verify,
      icon: ShieldCheck,
    },
  ];

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.48,
        delay: 0.08,
      }}
      className="overflow-hidden rounded-[28px] border border-[#D7E6E3]/90 bg-white shadow-[0_18px_56px_rgba(18,59,70,.075)] dark:border-[#315B63]/50 dark:bg-[#0B3037]"
    >
      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[290px_minmax(0,1fr)] xl:items-center">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#218D8E] dark:text-[#76DDC9]">
            {copy.flowTitle}
          </p>

          <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
            {copy.flowSub}
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {steps.map(
            (
              step,
              index,
            ) => {
              const Icon =
                step.icon;

              return (
                <motion.div
                  key={
                    step.label
                  }
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  transition={{
                    delay:
                      0.12 +
                      index *
                        0.055,
                    duration: 0.4,
                  }}
                  whileHover={{
                    y: -4,
                  }}
                  className="group relative rounded-[18px] border border-[#D7E6E3] bg-[#F3F8F6] px-3 py-4 transition hover:border-[#B7D8D1] hover:bg-[#E6F4F1]/70 dark:border-[#315B63]/45 dark:bg-[#123F49]/48 dark:hover:border-[#60D1BB]/25 dark:hover:bg-[#60D1BB]/[0.06]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-[11px] border border-[#B7D8D1] bg-white text-[#15949B] shadow-sm dark:border-[#60D1BB]/20 dark:bg-[#123F49] dark:text-[#76DDC9]">
                      <Icon
                        size={14}
                      />
                    </span>

                    <span className="text-[7px] font-black text-[#AABABC] dark:text-[#56757B]">
                      {String(
                        index + 1,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>
                  </div>

                  <p className="mt-3 text-[8px] font-black text-[#4B6A70] dark:text-[#BDD0D3]">
                    {
                      step.label
                    }
                  </p>

                  {index <
                  steps.length -
                    1 ? (
                    <ChevronRight
                      size={12}
                      className="absolute -right-[8px] top-1/2 z-10 hidden -translate-y-1/2 text-[#AABABC] xl:block dark:text-[#56757B]"
                    />
                  ) : null}
                </motion.div>
              );
            },
          )}
        </div>
      </div>
    </motion.section>
  );
}

function RecentBlocksPanel({
  blocks,
  loading,
  language,
  copy,
}: {
  blocks: BlockOut[];
  loading: boolean;
  language: "en" | "te";
  copy: Copy;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#D7E6E3]/90 bg-white shadow-[0_18px_56px_rgba(18,59,70,.075)] dark:border-[#315B63]/50 dark:bg-[#0B3037]">
      <div className="flex items-end justify-between gap-4 border-b border-[#D7E6E3]/85 px-5 py-5 sm:px-6 dark:border-[#315B63]/45">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#438EAA] dark:text-[#8DD5E8]">
            {copy.recent}
          </p>

          <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
            {copy.recentSub}
          </h2>
        </div>

        <Link
          href="/blocks"
          className="hidden items-center gap-1.5 rounded-xl border border-[#D7E6E3] bg-[#F3F8F6] px-3 py-2 text-[7px] font-black uppercase tracking-[0.1em] text-[#56757B] transition hover:border-[#B7D8D1] hover:text-[#0F7E84] sm:inline-flex dark:border-[#315B63]/50 dark:bg-[#123F49]/52 dark:text-[#A8C0C5]"
        >
          {copy.viewAll}
          <ArrowRight
            size={10}
          />
        </Link>
      </div>

      <div className="p-3 sm:p-4">
        {loading ? (
          <RecentSkeleton />
        ) : blocks.length ===
          0 ? (
          <div className="grid min-h-[360px] place-items-center rounded-[20px] border border-dashed border-[#C5D8D5] bg-[#F3F8F6] p-8 text-center dark:border-[#315B63]/55 dark:bg-[#123F49]/45">
            <div className="max-w-md">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-[#B7D8D1] bg-white text-[#15949B] shadow-sm dark:border-[#60D1BB]/20 dark:bg-[#123F49] dark:text-[#76DDC9]">
                <Layers3
                  size={20}
                />
              </span>

              <h3 className="mt-4 text-lg font-black tracking-[-0.03em]">
                {copy.noBlocks}
              </h3>

              <p className="mt-2 text-[9px] leading-5 text-[#7F9499]">
                {
                  copy.noBlocksSub
                }
              </p>

              <Link
                href="/capture"
                className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0F7E84] px-4 text-[8px] font-black uppercase tracking-[0.1em] text-white"
              >
                <Camera
                  size={12}
                />
                {
                  copy.newAnalysis
                }
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            {blocks.map(
              (
                block,
                index,
              ) => (
                <RecentRow
                  key={block.id}
                  block={block}
                  index={index}
                  language={
                    language
                  }
                  copy={copy}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DecisionDock({
  copy,
  failed,
}: {
  copy: Copy;
  failed: number;
}) {
  const actions = [
    {
      href: "/capture",
      icon: Camera,
      title:
        copy.captureAction,
      description:
        copy.evidenceGateText,
      accent:
        "border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
    },
    {
      href: "/blocks",
      icon: Boxes,
      title:
        copy.blocksAction,
      description:
        copy.recentSub,
      accent:
        "border-[#C4DDE2] bg-[#EAF4F7] text-[#438EAA] dark:border-[#7EC2DC]/20 dark:bg-[#7EC2DC]/[0.07] dark:text-[#8DD5E8]",
    },
    {
      href: "/quarries",
      icon: Mountain,
      title:
        copy.quarriesAction,
      description:
        copy.controlTowerSub,
      accent:
        "border-[#B7D8D1] bg-[#E2F2EE] text-[#218D8E] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
    },
    {
      href: "/ai-assistant",
      icon: Sparkles,
      title:
        copy.assistantAction,
      description:
        copy.readinessSub,
      accent:
        "border-[#B7D8D1] bg-[#E2F2EE] text-[#218D8E] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
    },
    {
      href:
        "/business-workflow",
      icon: Workflow,
      title:
        copy.workflowAction,
      description:
        copy.flowSub,
      accent:
        "border-[#BBDDD4] bg-[#E8F4F0] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]",
    },
  ];

  return (
    <section className="rounded-[28px] border border-[#D7E6E3]/90 bg-white p-5 shadow-[0_18px_56px_rgba(18,59,70,.075)] sm:p-6 dark:border-[#315B63]/50 dark:bg-[#0B3037]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#0F7E84] dark:text-[#68D5BE]">
            {copy.decisionDock}
          </p>

          <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
            {
              copy.decisionDockSub
            }
          </h2>
        </div>

        <span className="grid h-11 w-11 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
          <Zap size={17} />
        </span>
      </div>

      {failed > 0 ? (
        <Link
          href="/blocks"
          className="mt-5 flex items-start justify-between gap-3 rounded-[17px] border border-[#F2B4B4] bg-[#FDECEC] px-3.5 py-3 transition hover:-translate-y-0.5 dark:border-[#E05252]/22 dark:bg-rose-300/[0.045]"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[#F2B4B4] bg-white text-rose-600 dark:border-[#E05252]/22 dark:bg-[#123F49] dark:text-[#FF9B9B]">
              <AlertTriangle
                size={14}
              />
            </span>

            <div>
              <p className="text-[8px] font-black text-[#C53F3F] dark:text-[#FF9B9B]">
                {failed}{" "}
                {
                  copy.metricAttention
                }
              </p>

              <p className="mt-1 text-[7px] leading-4 text-rose-500/80 dark:text-[#FF9B9B]/55">
                {
                  copy.attentionQueueText
                }
              </p>
            </div>
          </div>

          <ArrowRight
            size={12}
            className="mt-1 text-rose-500"
          />
        </Link>
      ) : null}

      <div className="mt-5 grid gap-2.5">
        {actions.map(
          (
            action,
            index,
          ) => {
            const Icon =
              action.icon;

            return (
              <motion.div
                key={
                  action.href
                }
                initial={{
                  opacity: 0,
                  x: 8,
                }}
                animate={{
                  opacity: 1,
                  x: 0,
                }}
                transition={{
                  delay:
                    0.08 +
                    index *
                      0.045,
                  duration: 0.38,
                }}
              >
                <Link
                  href={
                    action.href
                  }
                  className="group flex items-center gap-3 rounded-[17px] border border-[#D7E6E3] bg-[#F3F8F6]/78 p-3 transition duration-300 hover:-translate-y-0.5 hover:border-[#B7D8D1] hover:bg-white hover:shadow-[0_12px_30px_rgba(18,59,70,.09)] dark:border-[#315B63]/45 dark:bg-[#123F49]/48 dark:hover:border-[#60D1BB]/25 dark:hover:bg-[#123F49]/62"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border ${action.accent}`}
                  >
                    <Icon
                      size={15}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] font-black text-[#36545D] dark:text-[#F4FBFA]">
                      {
                        action.title
                      }
                    </p>

                    <p className="mt-1 line-clamp-1 text-[7px] text-[#7F9499] dark:text-[#819CA2]">
                      {
                        action.description
                      }
                    </p>
                  </div>

                  <ArrowRight
                    size={12}
                    className="shrink-0 text-[#AABABC] transition group-hover:translate-x-0.5 group-hover:text-[#15949B] dark:text-[#56757B] dark:group-hover:text-[#68D5BE]"
                  />
                </Link>
              </motion.div>
            );
          },
        )}
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[13px] border border-[#D7E6E3] bg-white/80 px-2 py-2.5 text-center shadow-sm dark:border-[#315B63]/50 dark:bg-[#123F49]/52">
      <p className="text-[6px] font-black uppercase tracking-[0.1em] text-[#7F9499]">
        {label}
      </p>

      <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#36545D] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StageBar({
  label,
  value,
  count,
  tone,
}: {
  label: string;
  value: number;
  count: string;
  tone:
    | "emerald"
    | "sky"
    | "rose";
}) {
  const bar =
    tone === "emerald"
      ? "from-[#39A384] to-[#39A384]"
      : tone === "sky"
        ? "from-[#15949B] to-[#438EAA]"
        : "from-[#E05252] to-[#F5A623]";

  return (
    <div className="rounded-[16px] border border-[#D7E6E3] bg-[#F3F8F6]/78 px-3 py-3 dark:border-[#315B63]/45 dark:bg-[#123F49]/48">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[8px] font-black text-[#4B6A70] dark:text-[#BDD0D3]">
          {label}
        </p>

        <span className="text-[8px] font-black text-[#6B8A91] dark:text-[#A9C2C4]">
          {count}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white shadow-inner dark:bg-[#123F49]/66">
        <motion.div
          initial={{
            width: 0,
          }}
          animate={{
            width:
              `${Math.max(0, Math.min(100, value))}%`,
          }}
          transition={{
            duration: 0.75,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className={`h-full rounded-full bg-gradient-to-r ${bar}`}
        />
      </div>
    </div>
  );
}

function InfoFeature({
  icon,
  title,
  text,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  tone:
    | "sky"
    | "amber";
}) {
  const iconClass =
    tone === "sky"
      ? "border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]"
      : "border-[#F3D598] bg-[#FFF4DE] text-[#B8790D] dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.08] dark:text-[#FFD07A]";

  return (
    <div className="rounded-[17px] border border-[#D7E6E3] bg-white p-3 dark:border-[#315B63]/45 dark:bg-[#123F49]/48">
      <span
        className={`grid h-9 w-9 place-items-center rounded-[11px] border ${iconClass}`}
      >
        {icon}
      </span>

      <p className="mt-3 text-[7px] font-black uppercase tracking-[0.1em] text-[#56757B] dark:text-[#A8C0C5]">
        {title}
      </p>

      <p className="mt-1 text-[7px] leading-4 text-[#7F9499] dark:text-[#819CA2]">
        {text}
      </p>
    </div>
  );
}

function ReadinessCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone:
    | "emerald"
    | "amber"
    | "rose"
    | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-[#BBDDD4] bg-[#E8F4F0] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07]"
      : tone === "amber"
        ? "border-[#F3D598] bg-[#FFF4DE] dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.08]"
        : tone === "rose"
          ? "border-[#F2B4B4] bg-[#FDECEC] dark:border-[#E05252]/22 dark:bg-[#E05252]/[0.08]"
          : "border-[#D7E6E3] bg-[#F3F8F6] dark:border-[#315B63]/45 dark:bg-[#123F49]/48";

  return (
    <div
      className={`rounded-[14px] border px-3 py-3 ${toneClass}`}
    >
      <p className="text-[6px] font-black uppercase tracking-[0.09em] text-[#7F9499] dark:text-[#819CA2]">
        {label}
      </p>

      <p className="mt-1 text-xl font-black tracking-[-0.04em] text-[#284B55] dark:text-white">
        {value}
      </p>
    </div>
  );
}

function CapabilityRow({
  item,
  copy,
}: {
  item: CapabilityItem;
  copy: Copy;
}) {
  const label =
    item.tone === "good"
      ? copy.operational
      : item.tone ===
          "limited"
        ? copy.limited
        : item.tone ===
            "bad"
          ? copy.unavailable
          : copy.unreported;

  const dot =
    item.tone === "good"
      ? "bg-[#39A384]"
      : item.tone ===
          "limited"
        ? "bg-[#FFF4DE]0"
        : item.tone === "bad"
          ? "bg-[#FDECEC]0"
          : "bg-[#C5D8D5]";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#D7E6E3]/85 bg-[#F3F8F6]/78 px-3 py-2.5 dark:border-[#315B63]/45 dark:bg-[#123F49]/48">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
        />

        <p className="truncate text-[8px] font-black text-[#4B6A70] dark:text-[#BDD0D3]">
          {item.label}
        </p>
      </div>

      <span className="shrink-0 text-[6.5px] font-black uppercase tracking-[0.08em] text-[#7F9499] dark:text-[#819CA2]">
        {label}
      </span>
    </div>
  );
}

function RecentRow({
  block,
  index,
  language,
  copy,
}: {
  block: BlockOut;
  index: number;
  language: "en" | "te";
  copy: Copy;
}) {
  const captured =
    block.capture_date
      ? new Date(
          block.capture_date,
        )
      : null;

  const date =
    captured &&
    !Number.isNaN(
      captured.getTime(),
    )
      ? captured.toLocaleDateString(
          language === "te"
            ? "te-IN"
            : "en-IN",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          },
        )
      : "—";

  const state =
    blockState(
      block.status,
      copy,
    );

  return (
    <Link
      href={`/blocks/${block.id}`}
      className="group grid gap-3 rounded-[17px] border border-[#D7E6E3]/85 bg-[#F3F8F6]/74 px-3.5 py-3 transition duration-300 hover:-translate-y-0.5 hover:border-[#B7D8D1] hover:bg-white hover:shadow-[0_12px_30px_rgba(18,59,70,.09)] sm:grid-cols-[44px_minmax(0,1fr)_auto_auto] sm:items-center dark:border-[#315B63]/45 dark:bg-[#123F49]/48 dark:hover:border-[#60D1BB]/25 dark:hover:bg-[#123F49]/58"
    >
      <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-[#D7E6E3] bg-white text-[8px] font-black text-[#7F9499] shadow-sm dark:border-[#315B63]/50 dark:bg-[#123F49]">
        {String(
          index + 1,
        ).padStart(
          2,
          "0",
        )}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[10px] font-black text-[#123F49] dark:text-white">
          {block.block_code}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[6.5px] font-semibold text-[#7F9499] dark:text-[#819CA2]">
          <span className="inline-flex items-center gap-1">
            <MapPin
              size={8}
            />
            {copy.captured}:{" "}
            {date}
          </span>

          <span>
            {block.status}
          </span>
        </div>
      </div>

      <span
        className={`w-fit rounded-full border px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.09em] ${state.className}`}
      >
        {state.label}
      </span>

      <span className="hidden items-center gap-1 text-[6px] font-black uppercase tracking-[0.08em] text-[#AABABC] transition group-hover:text-[#15949B] sm:inline-flex dark:text-[#56757B] dark:group-hover:text-[#68D5BE]">
        {copy.open}
        <ArrowRight
          size={10}
        />
      </span>
    </Link>
  );
}

function CapabilitySkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map(
        (item) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[14px] border border-[#D7E6E3]/78 bg-[#F3F8F6] p-3 dark:border-[#315B63]/40 dark:bg-[#123F49]/45"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#D7E6E3] dark:bg-[#315B63]" />
            <div className="h-2.5 flex-1 animate-pulse rounded bg-[#E6F4F1] dark:bg-[#123F49]/72" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-[#E6F4F1] dark:bg-[#123F49]/72" />
          </div>
        ),
      )}
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map(
        (item) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[17px] border border-[#D7E6E3]/78 bg-[#F3F8F6] p-3 dark:border-[#315B63]/40 dark:bg-[#123F49]/45"
          >
            <div className="h-11 w-11 animate-pulse rounded-[13px] bg-[#E6F4F1] dark:bg-[#123F49]/72" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 animate-pulse rounded bg-[#E6F4F1] dark:bg-[#123F49]/72" />
              <div className="h-2 w-28 animate-pulse rounded bg-[#E6F4F1] dark:bg-[#123F49]/72" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-[#E6F4F1] dark:bg-[#123F49]/72" />
          </div>
        ),
      )}
    </div>
  );
}

function humanizeCapability(
  key: string,
) {
  return key
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function capabilityTone(
  status: string,
): CapabilityTone {
  const value =
    status
      .trim()
      .toLowerCase();

  if (
    [
      "operational",
      "available",
      "ready",
      "enabled",
      "healthy",
      "ok",
      "active",
    ].includes(value)
  ) {
    return "good";
  }

  if (
    [
      "fallback",
      "degraded",
      "limited",
      "optional",
      "partial",
      "warning",
    ].includes(value)
  ) {
    return "limited";
  }

  if (
    [
      "unavailable",
      "failed",
      "error",
      "disabled",
      "not_configured",
      "not configured",
    ].includes(value)
  ) {
    return "bad";
  }

  return "unknown";
}

function blockState(
  status: string,
  copy: Copy,
) {
  if (
    COMPLETED.has(
      status,
    )
  ) {
    return {
      label:
        copy.statusCompleted,
      className:
        "border-[#BBDDD4] bg-[#E8F4F0] text-[#237E6D] dark:border-[#68D5BE]/20 dark:bg-[#68D5BE]/[0.07] dark:text-[#7FDCC9]",
    };
  }

  if (
    PROCESSING.has(
      status,
    )
  ) {
    return {
      label:
        copy.statusProcessing,
      className:
        "border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
    };
  }

  if (
    FAILED.has(
      status,
    )
  ) {
    return {
      label:
        copy.statusFailed,
      className:
        "border-[#F2B4B4] bg-[#FDECEC] text-[#C53F3F] dark:border-[#E05252]/22 dark:bg-[#E05252]/[0.08] dark:text-[#FF9B9B]",
    };
  }

  if (
    [
      "READY",
      "CAPTURED",
    ].includes(status)
  ) {
    return {
      label:
        copy.statusReady,
      className:
        "border-[#B7D8D1] bg-[#E2F2EE] text-[#218D8E] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]",
    };
  }

  return {
    label:
      copy.statusSaved,
    className:
      "border-[#D7E6E3] bg-[#F3F8F6] text-[#6B8A91] dark:border-[#315B63]/45 dark:bg-[#123F49]/52 dark:text-[#A9C2C4]",
  };
}

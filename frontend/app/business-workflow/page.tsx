// BusinessWorkflowPage.tsx
"use client";

import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Cuboid,
  Crosshair,
  FileCheck2,
  Gauge,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  ScanSearch,
  Scissors,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n";

type Language = "en" | "te";

type Step = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  icon: any;
};

const STEPS: Record<Language, Step[]> = {
  en: [
    { id: "arrival", title: "Granite Block", kicker: "REGISTER BLOCK", description: "Start with the physical granite block and establish its identity before analysis.", icon: Upload },
    { id: "capture", title: "Capture Photos", kicker: "COLLECT EVIDENCE", description: "Capture clear, overlapping views from multiple sides of the same block.", icon: Camera },
    { id: "validation", title: "Validate Evidence", kicker: "QUALITY CHECK", description: "Check coverage, clarity and duplicates before the evidence is accepted.", icon: FileCheck2 },
    { id: "calibration", title: "Calibrate Scale", kicker: "SET REFERENCE", description: "Establish a reliable scale so physical dimensions can be calculated correctly.", icon: Gauge },
    { id: "analysis", title: "AI Photo Analysis", kicker: "AI PROCESSING", description: "Find visual features and relationships across all usable image evidence.", icon: ScanSearch },
    { id: "reconstruction", title: "Build 3D Model", kicker: "RECONSTRUCT", description: "Combine supported views into a realistic representation of the irregular block.", icon: Cuboid },
    { id: "measurement", title: "Measure the Block", kicker: "GENERATE METRICS", description: "Calculate length, breadth, height and volume from validated geometry.", icon: Ruler },
    { id: "defects", title: "Detect Defects", kicker: "INSPECT SURFACE", description: "Locate visible cracks, waste zones and other measurable surface conditions.", icon: Crosshair },
    { id: "target", title: "Plan Cutting", kicker: "OPTIMIZE CUT", description: "Define the dressing region and evaluate the usable geometry before cutting.", icon: Target },
    { id: "cutting", title: "Cut & Dress", kicker: "PHYSICAL PROCESS", description: "Execute the cutting plan and progressively convert the raw block into a dressed block.", icon: Scissors },
    { id: "postCapture", title: "Capture After Cutting", kicker: "NEW EVIDENCE", description: "Capture the actual post-cut state instead of assuming the proposed result.", icon: Camera },
    { id: "assessment", title: "Compare & Assess", kicker: "BEFORE / AFTER", description: "Compare the original and dressed states and consolidate the validated results.", icon: Layers3 },
    { id: "verification", title: "Verify Result", kicker: "FINAL CHECK", description: "Confirm that the final record is supported by evidence and validated geometry.", icon: CircleCheck },
    { id: "final", title: "Final Record", kicker: "COMPLETE", description: "Bring identity, evidence, measurements, cutting information and assessment together.", icon: Boxes },
  ],
  te: [
    { id: "arrival", title: "గ్రానైట్ బ్లాక్", kicker: "బ్లాక్ నమోదు", description: "విశ్లేషణకు ముందు అసలు గ్రానైట్ బ్లాక్‌ను నమోదు చేసి దాని గుర్తింపును ఏర్పాటు చేయండి.", icon: Upload },
    { id: "capture", title: "ఫోటోలు తీయండి", kicker: "ఆధారం సేకరణ", description: "అదే బ్లాక్‌కు వేర్వేరు వైపుల నుంచి స్పష్టమైన ఓవర్‌ల్యాప్ ఫోటోలను సేకరించండి.", icon: Camera },
    { id: "validation", title: "ఆధారాన్ని ధృవీకరించండి", kicker: "నాణ్యత తనిఖీ", description: "ఆధారాన్ని అంగీకరించే ముందు కవరేజ్, స్పష్టత మరియు డూప్లికేట్లను పరిశీలించండి.", icon: FileCheck2 },
    { id: "calibration", title: "స్కేల్ కాలిబ్రేషన్", kicker: "రిఫరెన్స్ సెట్", description: "భౌతిక కొలతలు సరిగ్గా లెక్కించేందుకు నమ్మదగిన స్కేల్‌ను ఏర్పాటు చేయండి.", icon: Gauge },
    { id: "analysis", title: "AI ఫోటో విశ్లేషణ", kicker: "AI ప్రాసెసింగ్", description: "ఉపయోగకరమైన ఫోటో ఆధారాల్లో విజువల్ ఫీచర్లు మరియు సంబంధాలను గుర్తించండి.", icon: ScanSearch },
    { id: "reconstruction", title: "3D మోడల్", kicker: "రీకన్‌స్ట్రక్షన్", description: "ఆధారాలతో మద్దతు ఉన్న వీక్షణలను కలిపి అసమాన బ్లాక్ యొక్క వాస్తవిక రూపాన్ని తయారు చేయండి.", icon: Cuboid },
    { id: "measurement", title: "బ్లాక్ కొలత", kicker: "మెట్రిక్స్", description: "ధృవీకరించిన జ్యామితి నుంచి పొడవు, వెడల్పు, ఎత్తు మరియు వాల్యూమ్‌ను లెక్కించండి.", icon: Ruler },
    { id: "defects", title: "లోపాల గుర్తింపు", kicker: "ఉపరితల తనిఖీ", description: "కనిపించే క్రాక్స్, వ్యర్థ ప్రాంతాలు మరియు ఇతర కొలవగల పరిస్థితులను గుర్తించండి.", icon: Crosshair },
    { id: "target", title: "కట్టింగ్ ప్లాన్", kicker: "కట్ ఆప్టిమైజేషన్", description: "కటింగ్‌కు ముందు డ్రెస్సింగ్ ప్రాంతం మరియు ఉపయోగకరమైన జ్యామితిని అంచనా వేయండి.", icon: Target },
    { id: "cutting", title: "కట్ & డ్రెస్సింగ్", kicker: "భౌతిక ప్రక్రియ", description: "కట్టింగ్ ప్లాన్‌ను అమలు చేసి రా బ్లాక్‌ను క్రమంగా డ్రెస్డ్ బ్లాక్‌గా మార్చండి.", icon: Scissors },
    { id: "postCapture", title: "కట్టింగ్ తర్వాత ఫోటోలు", kicker: "కొత్త ఆధారం", description: "ప్రతిపాదిత ఫలితాన్ని ఊహించకుండా వాస్తవ పోస్ట్-కట్ స్థితిని ఫోటోలతో నమోదు చేయండి.", icon: Camera },
    { id: "assessment", title: "పోల్చి అంచనా", kicker: "ముందు / తర్వాత", description: "అసలు మరియు డ్రెస్డ్ స్థితులను పోల్చి ధృవీకరించిన ఫలితాలను సమీకరించండి.", icon: Layers3 },
    { id: "verification", title: "ఫలిత ధృవీకరణ", kicker: "తుది తనిఖీ", description: "తుది రికార్డు ఆధారం మరియు ధృవీకరించిన జ్యామితితో మద్దతు పొందిందని నిర్ధారించండి.", icon: CircleCheck },
    { id: "final", title: "తుది రికార్డు", kicker: "పూర్తి", description: "బ్లాక్ వివరాలు, ఆధారాలు, కొలతలు, కట్టింగ్ సమాచారం మరియు అసెస్‌మెంట్‌ను ఒకచోట చేర్చండి.", icon: Boxes },
  ],
};

const MOMENT_LABELS: Record<string, string[]> = {
  arrival: ["BLOCK ID", "RAW STATE", "READY"],
  capture: ["VIEW 01", "VIEW 02", "VIEW 03", "VIEW 04"],
  validation: ["COVERAGE", "QUALITY", "DUPLICATES"],
  calibration: ["REFERENCE", "SCALE", "LOCKED"],
  analysis: ["FEATURES", "MATCHES", "AI CONFIDENCE"],
  reconstruction: ["POINTS", "SURFACES", "3D READY"],
  measurement: ["LENGTH", "BREADTH", "HEIGHT", "VOLUME"],
  defects: ["CRACKS", "WASTE", "SURFACE"],
  target: ["TARGET", "RECOVERY", "CUT PLAN"],
  cutting: ["CUT 01", "CUT 02", "DRESS"],
  postCapture: ["AFTER VIEW", "NEW EVIDENCE", "RECORDED"],
  assessment: ["BEFORE", "AFTER", "DELTA"],
  verification: ["EVIDENCE", "GEOMETRY", "VALID"],
  final: ["IDENTITY", "METRICS", "RESULT", "ARCHIVED"],
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export default function BusinessWorkflowPage() {
  const { language } = useLanguage();
  const activeLanguage: Language = language === "te" ? "te" : "en";
  const steps = useMemo(() => STEPS[activeLanguage], [activeLanguage]);

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [moment, setMoment] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  const advance = () => setActive((value) => (value + 1) % steps.length);

  useEffect(() => {
    setActive(0);
    setProgress(0);
    setMoment(0);
  }, [activeLanguage]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const started = performance.now();

    timerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - started;
      const p = clamp(elapsed / 4400);
      setProgress(p);

      const count = MOMENT_LABELS[steps[active].id]?.length ?? 3;
      setMoment(Math.min(count - 1, Math.floor(p * count)));

      if (p >= 1) {
        setActive((value) => (value + 1) % steps.length);
      }
    }, 50);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active, playing, steps]);

  const selectStep = (index: number) => {
    setActive(index);
    setProgress(0);
    setMoment(0);
  };

  const reset = () => {
    setActive(0);
    setProgress(0);
    setMoment(0);
    setPlaying(true);
  };

  const current = steps[active];
  const CurrentIcon = current.icon;
  const moments = MOMENT_LABELS[current.id] ?? ["PROCESS", "VALIDATED", "DONE"];

  return (
    <main className="page-wrap max-w-[1450px] pb-12">
      <style>{`
        @keyframes workflowPulse {
          0%,100% { transform: scale(1); opacity:.42; }
          50% { transform: scale(1.12); opacity:.12; }
        }
        @keyframes workflowReveal {
          0% { opacity:0; transform:translateY(12px) scale(.985); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes workflowScan {
          0% { transform:translateX(-120%); opacity:0; }
          20% { opacity:.8; }
          80% { opacity:.8; }
          100% { transform:translateX(120%); opacity:0; }
        }
        @keyframes workflowDot {
          0%,100% { box-shadow:0 0 0 0 rgba(40,180,150,.0); }
          50% { box-shadow:0 0 0 7px rgba(40,180,150,.12); }
        }
        @keyframes workflowDraw {
          from { width:0; }
          to { width:100%; }
        }
        .workflow-reveal { animation:workflowReveal .55s cubic-bezier(.22,1,.36,1) both; }
        .workflow-pulse { animation:workflowPulse 2.2s ease-in-out infinite; }
        .workflow-dot { animation:workflowDot 2s ease-in-out infinite; }
        .workflow-scan { animation:workflowScan 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .workflow-reveal,.workflow-pulse,.workflow-dot,.workflow-scan { animation:none !important; }
        }
      `}</style>

      {/* Header */}
      <header className="mb-7 flex flex-col gap-5 sm:mb-9 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            {activeLanguage === "te" ? "గ్రానైట్ ప్రాసెస్ జర్నీ" : "GRANITE PROCESS JOURNEY"}
          </div>

          <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-[-.035em] text-[var(--text-primary)] sm:text-4xl lg:text-[44px]">
            {activeLanguage === "te"
              ? "ఒక బ్లాక్ — ఆధారం నుండి తుది ఫలితం వరకు"
              : "One Block. One Clear Journey."}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)] sm:text-[15px]">
            {activeLanguage === "te"
              ? "ప్రతి దశను వరుసగా చూడండి. ప్రతి దశ పూర్తయ్యే కొద్దీ తదుపరి దశ సజీవంగా కనిపిస్తుంది."
              : "Follow the block from raw evidence to verified result. Every stage reveals itself in sequence."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe8e2] bg-white px-3 text-xs font-bold text-[var(--text-primary)] shadow-sm transition hover:-translate-y-0.5"
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing
              ? activeLanguage === "te" ? "పాజ్" : "Pause"
              : activeLanguage === "te" ? "ప్లే" : "Play"}
          </button>

          <button
            type="button"
            onClick={reset}
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#dbe8e2] bg-white text-[var(--text-muted)] shadow-sm transition hover:-translate-y-0.5 hover:text-[var(--text-primary)]"
            aria-label="Restart workflow"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      {/* Flow shell */}
      <section className="relative overflow-hidden rounded-[32px] border border-[#dce9e3] bg-[#f5faf7] shadow-[0_24px_70px_rgba(43,75,63,.10)]">
        {/* top progress */}
        <div className="h-1 w-full bg-[var(--border)]">
          <div
            className="h-full transition-[width] duration-75"
            style={{
              width: `${((active + progress) / steps.length) * 100}%`,
              background: "linear-gradient(90deg, var(--accent), #69cbb0)",
            }}
          />
        </div>

        <div className="relative px-4 py-7 sm:px-7 sm:py-9 lg:px-12 lg:py-11 bg-[linear-gradient(135deg,#f8fcfa_0%,#eef8f3_48%,#f8fbf9_100%)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 0%, color-mix(in srgb,var(--accent) 10%,transparent), transparent 32%), linear-gradient(rgba(100,120,110,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(100,120,110,.045) 1px, transparent 1px)",
              backgroundSize: "100% 100%, 36px 36px, 36px 36px",
            }}
          />

          {/* START */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative">
              <span className="workflow-pulse absolute inset-[-9px] rounded-full border border-[var(--accent)]" />
              <div className="grid h-[66px] w-[66px] place-items-center rounded-full border-4 border-[var(--surface)] bg-[#20aa83] text-white shadow-[0_10px_30px_rgba(32,170,131,.24)]">
                <Sparkles size={24} />
              </div>
            </div>
            <span className="mt-2 text-[10px] font-black tracking-[.25em] text-[var(--text-muted)]">
              START
            </span>
          </div>

          <div className="relative z-10 mx-auto h-10 w-px bg-[var(--border-strong)]">
            <ArrowDown
              size={17}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[var(--surface)] text-[var(--text-muted)]"
            />
          </div>

          {/* Sequential rail */}
          <div className="relative z-10 mx-auto max-w-[1120px]">
            <div className="space-y-4 sm:space-y-5">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const activeStep = index === active;
                const done = index < active;

                return (
                  <div
                    key={step.id}
                    className="relative grid grid-cols-[55px_minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_74px_minmax(0,1fr)] md:gap-5"
                  >
                    {/* left */}
                    <div className="hidden md:block">
                      {index % 2 === 0 && (
                        <WorkflowCard
                          step={step}
                          index={index}
                          active={activeStep}
                          done={done}
                          direction="right"
                          onClick={() => selectStep(index)}
                        />
                      )}
                    </div>

                    {/* node */}
                    <button
                      type="button"
                      onClick={() => selectStep(index)}
                      className="workflow-dot relative z-20 grid h-[55px] w-[55px] place-items-center rounded-full border-[4px] border-[var(--surface)] transition-all duration-500 md:h-[64px] md:w-[64px]"
                      style={{
                        background: activeStep
                          ? "var(--accent)"
                          : done
                            ? "#4cae82"
                            : "var(--surface-elevated)",
                        boxShadow: activeStep
                          ? "0 0 0 1px var(--accent), 0 12px 32px rgba(0,0,0,.12)"
                          : "0 5px 18px rgba(0,0,0,.07)",
                      }}
                    >
                      {done ? (
                        <Check size={21} color="#fff" strokeWidth={3} />
                      ) : (
                        <Icon
                          size={21}
                          className={activeStep ? "text-white" : "text-[var(--text-muted)]"}
                        />
                      )}

                      {activeStep && (
                        <span className="absolute inset-[-7px] rounded-full border border-[var(--accent)] opacity-30" />
                      )}
                    </button>

                    {/* mobile card */}
                    <div className="min-w-0 md:hidden">
                      <WorkflowCard
                        step={step}
                        index={index}
                        active={activeStep}
                        done={done}
                        direction="left"
                        onClick={() => selectStep(index)}
                      />
                    </div>

                    {/* right */}
                    <div className="hidden md:block">
                      {index % 2 !== 0 && (
                        <WorkflowCard
                          step={step}
                          index={index}
                          active={activeStep}
                          done={done}
                          direction="left"
                          onClick={() => selectStep(index)}
                        />
                      )}
                    </div>

                    {/* Connector lives only in the gap between this node and the next node.
                        It can never pass behind a workflow card. */}
                    {index < steps.length - 1 && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-[27px] top-[55px] z-0 h-[calc(100%+1.05rem)] w-px md:left-1/2 md:top-[64px] md:-translate-x-1/2"
                      >
                        <div
                          className="h-full w-full"
                          style={{
                            background:
                              index < active
                                ? "linear-gradient(to bottom, #4cae82 0%, #4cae82 72%, #8ac7b2 100%)"
                                : "linear-gradient(to bottom, #c8d9d2 0%, #dbe8e2 100%)",
                          }}
                        />
                        <span
                          className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                          style={{
                            background: index < active ? "#4cae82" : "#c8d9d2",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* END */}
          <div className="relative z-10 mt-9 flex flex-col items-center">
            <div className="mx-auto h-8 w-px bg-[var(--border-strong)]" />
            <div
              className="grid h-[66px] w-[66px] place-items-center rounded-full border-4 bg-[var(--surface)] transition-all duration-500"
              style={{
                borderColor: active === steps.length - 1 ? "var(--accent)" : "var(--border-strong)",
                boxShadow: active === steps.length - 1 ? "0 0 0 8px color-mix(in srgb,var(--accent) 10%,transparent)" : "none",
              }}
            >
              <Check
                size={25}
                strokeWidth={3}
                className={active === steps.length - 1 ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}
              />
            </div>
            <span className="mt-2 text-[10px] font-black tracking-[.25em] text-[var(--text-muted)]">
              END
            </span>
          </div>
        </div>
      </section>

      {/* Live moment panel */}
      <section className="workflow-reveal mt-5 overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--surface)] shadow-sm" key={`${current.id}-${active}`}>
        <div className="grid lg:grid-cols-[1.05fr_.95fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] text-[var(--accent)]">
                <CurrentIcon size={23} />
              </div>

              <div>
                <div className="text-[10px] font-black tracking-[.18em] text-[var(--accent)]">
                  {current.kicker}
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--text-primary)]">
                  {current.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                  {current.description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => selectStep((active - 1 + steps.length) % steps.length)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--surface-elevated)]"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full transition-[width] duration-75"
                  style={{
                    width: `${progress * 100}%`,
                    background: "linear-gradient(90deg,var(--accent),#69cbb0)",
                  }}
                />
              </div>

              <button
                type="button"
                onClick={advance}
                className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-sm transition hover:-translate-y-0.5"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* animated process moment */}
          <div className="relative min-h-[220px] overflow-hidden border-t border-[var(--border)] bg-[#edf7f2] lg:border-l lg:border-t-0">
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage: "linear-gradient(rgba(80,120,100,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(80,120,100,.055) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }} />

            <div className="relative flex h-full flex-col justify-center p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] font-black tracking-[.18em] text-[var(--text-muted)]">
                  {activeLanguage === "te" ? "లైవ్ మూమెంట్" : "LIVE MOMENT"}
                </span>
                <span className="text-[10px] font-bold text-[var(--text-muted)]">
                  {String(active + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                </span>
              </div>

              <div className="relative h-20 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                <div
                  className="workflow-scan absolute inset-y-0 left-1/2 w-16 -translate-x-1/2 skew-x-[-18deg]"
                  style={{ background: "linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 25%,transparent),transparent)" }}
                />

                <div className="flex h-full items-center gap-2 px-4">
                  {moments.map((label, index) => {
                    const visible = index <= moment;
                    const selected = index === moment;

                    return (
                      <div
                        key={`${current.id}-${label}`}
                        className="workflow-reveal flex min-w-0 flex-1 flex-col gap-2"
                        style={{
                          animationDelay: `${index * 80}ms`,
                          opacity: visible ? 1 : 0.22,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full transition-all duration-300"
                            style={{
                              background: visible ? "var(--accent)" : "var(--border-strong)",
                              boxShadow: selected ? "0 0 0 5px color-mix(in srgb,var(--accent) 12%,transparent)" : "none",
                            }}
                          />
                          <span className="truncate text-[9px] font-black tracking-[.1em] text-[var(--text-muted)]">
                            {label}
                          </span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: visible ? "100%" : "0%",
                              background: "var(--accent)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
                <CircleCheck size={14} className="text-[var(--accent)]" />
                {activeLanguage === "te"
                  ? "ఈ దశ పూర్తయిన తర్వాత తదుపరి దశ వెల్లడవుతుంది"
                  : "The next stage reveals only after this moment completes."}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function WorkflowCard({
  step,
  index,
  active,
  done,
  direction,
  onClick,
}: {
  step: Step;
  index: number;
  active: boolean;
  done: boolean;
  direction: "left" | "right";
  onClick: () => void;
}) {
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left"
      aria-current={active ? "step" : undefined}
    >
      <div
        className={[
          "relative z-10 overflow-visible rounded-[22px] border p-4 transition-all duration-500",
          active
            ? "border-[#79cbb0] bg-white shadow-[0_16px_42px_rgba(43,105,82,.12)]"
            : done
              ? "border-[#dbe8e2] bg-white/92"
              : "border-[#dbe8e2] bg-white/90 opacity-85",
          direction === "right" ? "md:text-right" : "md:text-left",
        ].join(" ")}
      >
        {/* Small bridge toward the center node. The card itself remains outside the rail. */}
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute top-1/2 z-20 hidden h-3 w-3 -translate-y-1/2 rotate-45 border bg-white md:block",
            direction === "right"
              ? "-right-1.5 border-l-0 border-b-0"
              : "-left-1.5 border-r-0 border-t-0",
          ].join(" ")}
          style={{
            borderColor: active ? "#79cbb0" : "#dbe8e2",
          }}
        />

        {active && (
          <span
            className="workflow-scan pointer-events-none absolute inset-y-0 left-0 w-24 skew-x-[-18deg]"
            style={{
              background: "linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 12%,transparent),transparent)",
            }}
          />
        )}

        <div className={`relative flex items-start gap-3 ${direction === "right" ? "md:flex-row-reverse" : ""}`}>
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-500"
            style={{
              background: active
                ? "var(--accent)"
                : done
                  ? "color-mix(in srgb,#4cae82 13%,transparent)"
                  : "var(--surface-elevated)",
              color: active ? "#fff" : done ? "#4cae82" : "var(--text-muted)",
            }}
          >
            {done ? <Check size={17} strokeWidth={3} /> : <Icon size={18} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-2 ${direction === "right" ? "md:justify-end" : ""}`}>
              <span className="text-[9px] font-black tracking-[.18em] text-[var(--text-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[9px] font-bold tracking-[.13em] text-[var(--text-muted)]">
                {step.kicker}
              </span>
            </div>

            <h3 className="mt-1 text-[15px] font-extrabold text-[var(--text-primary)]">
              {step.title}
            </h3>

            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
              {step.description}
            </p>
          </div>

          <ArrowRight
            size={15}
            className={[
              "mt-1 hidden shrink-0 transition-all duration-300 md:block",
              active ? "text-[var(--accent)]" : "text-[var(--border-strong)]",
              direction === "right" ? "rotate-180" : "",
            ].join(" ")}
          />
        </div>

        {active && (
          <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full"
              style={{
                width: "100%",
                transformOrigin: direction === "right" ? "right" : "left",
                background: "var(--accent)",
              }}
            />
          </div>
        )}
      </div>
    </button>
  );
}

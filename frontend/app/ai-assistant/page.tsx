"use client";

import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  ChevronDown,
  Command,
  FileSearch,
  Layers3,
  Mic,
  MicOff,
  Ruler,
  Scissors,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  askBlockAssistant,
  blockVoiceAssistant,
  getBlockAnalysis,
  listBlocks,
  synthesizeSpeech,
} from "../../lib/api";
import { useTranslation } from "../../lib/i18n";
import type {
  AIAssistantResponse,
  BlockAnalysis,
  BlockOut,
} from "../../lib/types";

type ChatAnswer = {
  answer?: string;
  fact_type?: string;
  data_fields_referenced?: string[];
  disclaimer?: string;
  suggested_followups?: string[];
  source: "text" | "voice";
};

type ChatItem = {
  id: string;
  question: string;
  answer: ChatAnswer;
};

type VoiceLanguage = "en" | "te";

const COPY = {
  en: {
    title: "Granite AI",
    subtitle: "Evidence reasoning workspace",
    ready: "Context ready",
    waiting: "Select an analyzed block",
    block: "Block context",
    openBlock: "Open block",
    refresh: "Refresh context",
    clear: "Clear conversation",
    evidence: "Evidence",
    hideEvidence: "Hide evidence",
    showEvidence: "Show evidence",
    inputPlaceholder:
      "Ask Granite AI about measurements, reconstruction, defects, cutting, wastage, or limitations...",
    send: "Send",
    thinking: "Analyzing block evidence",
    noAnalysis: "Analysis is not available for this block yet.",
    blockLoadFailed: "Unable to load granite blocks",
    analysisLoadFailed: "Unable to load selected block analysis",
    requestFailed: "Unable to get an answer",
    noAnswer: "No answer was returned for this question.",
    answer: "Granite AI",
    evidenceNote: "Evidence note",
    referenced: "Referenced fields",
    followup: "Continue with",
    starters: "Try asking",
    emptyTitle: "What do you want to know about this block?",
    emptySub:
      "Granite AI reads the selected block analysis and answers only from available evidence. Missing values remain unavailable.",
    shortcut: "Enter to send · Shift + Enter for new line",
    voice: "Voice",
    voiceTitle: "Talk to Granite AI",
    voiceReady: "Tap the microphone and ask naturally.",
    voiceListening: "Listening...",
    voiceProcessing: "Understanding granite evidence...",
    voiceStop: "Tap to stop",
    voiceStart: "Tap to speak",
    voiceNoContext: "Select a block with analysis before starting voice chat.",
    voicePermission: "Microphone access is required for AI audio chat.",
    voiceUnavailable: "Audio recording is not available on this device or browser.",
    autoSpeak: "Speak replies",
    closeVoice: "Close voice mode",
    transcript: "You said",
    contextSignals: "Context signals",
    observedViews: "Observed views",
    measurements: "Measurements",
    reconstruction: "3D evidence",
    defects: "Defects",
    cutting: "Cutting",
    sourceMode: "Evidence-only mode",
    sourceModeSub:
      "No invented dimensions, hidden surfaces, internal defects, or confidence values.",
    prompts: [
      "Summarize this block in simple terms.",
      "What measurements are available and how reliable are they?",
      "Which surfaces were observed and which are still unobserved?",
      "What does the reconstruction evidence actually support?",
      "What visible defects were reported?",
      "Explain the recommended cutting plan and reported wastage.",
    ],
  },
  te: {
    title: "గ్రానైట్ AI",
    subtitle: "ఎవిడెన్స్ రీజనింగ్ వర్క్‌స్పేస్",
    ready: "కాంటెక్స్ట్ సిద్ధంగా ఉంది",
    waiting: "విశ్లేషించిన బ్లాక్ ఎంచుకోండి",
    block: "బ్లాక్ కాంటెక్స్ట్",
    openBlock: "బ్లాక్ తెరవండి",
    refresh: "కాంటెక్స్ట్ రిఫ్రెష్",
    clear: "చాట్ క్లియర్",
    evidence: "ఎవిడెన్స్",
    hideEvidence: "ఎవిడెన్స్ దాచండి",
    showEvidence: "ఎవిడెన్స్ చూపండి",
    inputPlaceholder:
      "కొలతలు, 3D, లోపాలు, కట్టింగ్, వ్యర్థం లేదా పరిమితుల గురించి Granite AIని అడగండి...",
    send: "పంపండి",
    thinking: "బ్లాక్ ఎవిడెన్స్ విశ్లేషిస్తోంది",
    noAnalysis: "ఈ బ్లాక్‌కు విశ్లేషణ ఇంకా అందుబాటులో లేదు.",
    blockLoadFailed: "గ్రానైట్ బ్లాక్‌లను లోడ్ చేయలేకపోయాం",
    analysisLoadFailed: "ఎంచుకున్న బ్లాక్ విశ్లేషణను లోడ్ చేయలేకపోయాం",
    requestFailed: "సమాధానం పొందలేకపోయాం",
    noAnswer: "ఈ ప్రశ్నకు సమాధానం అందలేదు.",
    answer: "గ్రానైట్ AI",
    evidenceNote: "ఎవిడెన్స్ గమనిక",
    referenced: "ఉపయోగించిన ఫీల్డ్స్",
    followup: "ఇంకా అడగండి",
    starters: "ఇవి అడగండి",
    emptyTitle: "ఈ బ్లాక్ గురించి ఏమి తెలుసుకోవాలనుకుంటున్నారు?",
    emptySub:
      "Granite AI ఎంచుకున్న బ్లాక్ విశ్లేషణ నుంచే సమాధానం ఇస్తుంది. లేని విలువలు ఊహించబడవు.",
    shortcut: "Enter పంపడానికి · Shift + Enter కొత్త లైన్",
    voice: "వాయిస్",
    voiceTitle: "Granite AIతో మాట్లాడండి",
    voiceReady: "మైక్రోఫోన్ నొక్కి సహజంగా ప్రశ్న అడగండి.",
    voiceListening: "వింటోంది...",
    voiceProcessing: "గ్రానైట్ ఎవిడెన్స్ అర్థం చేసుకుంటోంది...",
    voiceStop: "ఆపడానికి నొక్కండి",
    voiceStart: "మాట్లాడడానికి నొక్కండి",
    voiceNoContext: "వాయిస్ చాట్ ప్రారంభించే ముందు విశ్లేషణ ఉన్న బ్లాక్‌ను ఎంచుకోండి.",
    voicePermission: "AI ఆడియో చాట్‌కు మైక్రోఫోన్ అనుమతి అవసరం.",
    voiceUnavailable: "ఈ డివైస్ లేదా బ్రౌజర్‌లో ఆడియో రికార్డింగ్ అందుబాటులో లేదు.",
    autoSpeak: "సమాధానాన్ని వినిపించు",
    closeVoice: "వాయిస్ మోడ్ మూసివేయండి",
    transcript: "మీరు అన్నది",
    contextSignals: "కాంటెక్స్ట్ సిగ్నల్స్",
    observedViews: "పరిశీలించిన వ్యూలు",
    measurements: "కొలతలు",
    reconstruction: "3D ఎవిడెన్స్",
    defects: "లోపాలు",
    cutting: "కట్టింగ్",
    sourceMode: "ఎవిడెన్స్-ఓన్లీ మోడ్",
    sourceModeSub:
      "ఊహించిన కొలతలు, దాగిన ఉపరితలాలు, అంతర్గత లోపాలు లేదా confidence విలువలు లేవు.",
    prompts: [
      "ఈ బ్లాక్‌ను సులభంగా సారాంశం చేయండి.",
      "ఏ కొలతలు అందుబాటులో ఉన్నాయి మరియు అవి ఎంత విశ్వసనీయంగా ఉన్నాయి?",
      "ఏ ఉపరితలాలు పరిశీలించబడ్డాయి మరియు ఏవి ఇంకా పరిశీలించబడలేదు?",
      "3D పునర్నిర్మాణ ఎవిడెన్స్ నిజంగా ఏమి నిర్ధారిస్తోంది?",
      "ఏ కనిపించే లోపాలు నివేదించబడ్డాయి?",
      "సిఫార్సు చేసిన కట్టింగ్ ప్లాన్ మరియు వ్యర్థాన్ని వివరించండి.",
    ],
  },
} as const;

export default function AIAssistantPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#eef4f8] p-4 dark:bg-[#102136]">
          <div className="mx-auto h-[calc(100vh-32px)] max-w-[1750px] animate-pulse rounded-[24px] border border-slate-200 bg-white/80 dark:border-slate-600/30 dark:bg-[#172d45]" />
        </div>
      }
    >
      <AIAssistantPage />
    </Suspense>
  );
}

function AIAssistantPage() {
  const searchParams = useSearchParams();
  const initialBlockId = searchParams.get("block_id");
  const { language } = useTranslation();
  const copy = COPY[language];

  const [blocks, setBlocks] = useState<BlockOut[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState(initialBlockId || "");

  const [analysis, setAnalysis] = useState<BlockAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [commandOpen, setCommandOpen] = useState(false);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(
    language === "te" ? "te" : "en",
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const requestCounter = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);

  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    setBlocksError(null);

    try {
      const result = await listBlocks();
      const safeBlocks = Array.isArray(result) ? result : [];

      setBlocks(safeBlocks);
      setSelectedBlockId((current) => {
        if (current && safeBlocks.some((block) => block.id === current)) {
          return current;
        }

        if (
          initialBlockId &&
          safeBlocks.some((block) => block.id === initialBlockId)
        ) {
          return initialBlockId;
        }

        return safeBlocks[0]?.id || "";
      });
    } catch (error) {
      setBlocks([]);
      setBlocksError(
        error instanceof Error ? error.message : COPY.en.blockLoadFailed,
      );
    } finally {
      setBlocksLoading(false);
    }
  }, [initialBlockId]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    if (!selectedBlockId) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    let cancelled = false;

    setLoadingAnalysis(true);
    setAnalysis(null);
    setAnalysisError(null);
    setAssistantError(null);
    setChatHistory([]);

    void getBlockAnalysis(selectedBlockId, language)
      .then((data) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setAnalysisError(
            error instanceof Error ? error.message : copy.analysisLoadFailed,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAnalysis(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy.analysisLoadFailed, language, selectedBlockId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (event.key === "/" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        textareaRef.current?.focus();
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [chatHistory, asking]);


  useEffect(() => {
    setVoiceLanguage(language === "te" ? "te" : "en");
  }, [language]);

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current !== null) {
        window.clearInterval(voiceTimerRef.current);
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      audioRef.current?.pause();

      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
      }
    };
  }, []);

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );

  const evidenceSignals = useMemo(() => {
    const quality = analysis?.reconstruction_quality;

    const observedCount = Array.isArray(quality?.observed_surfaces)
      ? quality.observed_surfaces.length
      : Array.isArray(analysis?.digital_twin?.observed_surfaces)
        ? analysis.digital_twin.observed_surfaces.length
        : 0;

    return [
      {
        key: "measurements",
        label: copy.measurements,
        ready: Boolean(analysis?.measurement),
        icon: Ruler,
      },
      {
        key: "reconstruction",
        label: copy.reconstruction,
        ready: Boolean(
          analysis?.mesh_3d_url ||
            analysis?.points_3d_url ||
            analysis?.geometry ||
            analysis?.digital_twin?.mesh_url ||
            analysis?.digital_twin?.point_cloud_url,
        ),
        icon: Layers3,
      },
      {
        key: "defects",
        label: copy.defects,
        ready: Boolean(analysis?.defects),
        icon: ShieldAlert,
      },
      {
        key: "cutting",
        label: copy.cutting,
        ready: Boolean(analysis?.cutting),
        icon: Scissors,
      },
      {
        key: "views",
        label: copy.observedViews,
        ready: observedCount > 0,
        icon: FileSearch,
        value: observedCount > 0 ? String(observedCount) : undefined,
      },
    ];
  }, [analysis, copy]);

  const availableSignals = evidenceSignals.filter((signal) => signal.ready).length;
  const canAsk = Boolean(selectedBlockId && analysis && !loadingAnalysis);

  async function handleSendQuestion(questionText: string) {
    const trimmed = questionText.trim();

    if (!trimmed || !selectedBlockId || asking || !analysis) return;

    const requestId = ++requestCounter.current;

    setAsking(true);
    setAssistantError(null);

    try {
      const response = await askBlockAssistant(
        selectedBlockId,
        trimmed,
        language,
      );

      if (requestId !== requestCounter.current) return;

      setChatHistory((previous) => [
        ...previous,
        {
          id: `${requestId}-${Date.now()}`,
          question: trimmed,
          answer: normalizeTextAnswer(response),
        },
      ]);
      setQuestion("");
    } catch (error) {
      if (requestId === requestCounter.current) {
        setAssistantError(
          error instanceof Error ? error.message : copy.requestFailed,
        );
      }
    } finally {
      if (requestId === requestCounter.current) {
        setAsking(false);
      }
    }
  }

  function stopVoiceTimer() {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  function releaseMicrophone() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function speakReply(
    answerText: string,
    responseLanguage?: string,
  ) {
    if (!autoSpeak || !answerText.trim()) {
      return;
    }

    try {
      setSpeaking(true);

      audioRef.current?.pause();

      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }

      const safeLanguage =
        responseLanguage === "te" ||
        responseLanguage === "te-IN" ||
        voiceLanguage === "te"
          ? "te"
          : "en";

      const speechBlob = await synthesizeSpeech(
        answerText,
        safeLanguage,
      );

      if (!speechBlob) {
        setSpeaking(false);
        return;
      }

      const objectUrl = URL.createObjectURL(speechBlob);
      audioObjectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(objectUrl);

        if (audioObjectUrlRef.current === objectUrl) {
          audioObjectUrlRef.current = null;
        }
      };

      audio.onerror = () => {
        setSpeaking(false);
      };

      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }

  async function sendVoiceBlob(audioBlob: Blob) {
    if (!selectedBlockId || !analysis) {
      setAssistantError(copy.voiceNoContext);
      return;
    }

    if (audioBlob.size < 256) {
      setAssistantError(copy.voiceUnavailable);
      return;
    }

    setVoiceProcessing(true);
    setAssistantError(null);

    const requestId = ++requestCounter.current;

    try {
      const response = await blockVoiceAssistant(
        selectedBlockId,
        audioBlob,
        {
          language: voiceLanguage,
          contextTab: "AI_ASSISTANT",
        },
      );

      if (requestId !== requestCounter.current) {
        return;
      }

      const transcript =
        typeof response.transcript === "string"
          ? response.transcript.trim()
          : "";

      const answerText =
        typeof response.answer === "string"
          ? response.answer.trim()
          : "";

      const responseLanguage =
        typeof response.language === "string"
          ? response.language
          : voiceLanguage;

      setVoiceTranscript(transcript);

      setChatHistory((previous) => [
        ...previous,
        {
          id: `voice-${requestId}-${Date.now()}`,
          question:
            transcript ||
            (voiceLanguage === "te"
              ? "వాయిస్ ప్రశ్న"
              : "Voice question"),
          answer: normalizeVoiceAnswer(response),
        },
      ]);

      if (answerText) {
        void speakReply(
          answerText,
          responseLanguage,
        );
      }
    } catch (error) {
      if (requestId === requestCounter.current) {
        setAssistantError(
          error instanceof Error
            ? error.message
            : copy.requestFailed,
        );
      }
    } finally {
      if (requestId === requestCounter.current) {
        setVoiceProcessing(false);
      }
    }
  }

  async function startVoiceRecording() {
    if (!canAsk) {
      setAssistantError(copy.voiceNoContext);
      return;
    }

    if (voiceProcessing || recording) {
      return;
    }

    setVoiceOpen(true);
    setVoiceTranscript("");
    setAssistantError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setAssistantError(copy.voiceUnavailable);
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType =
        mimeCandidates.find((candidate) =>
          MediaRecorder.isTypeSupported(candidate),
        ) || "";

      const recorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
          })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        stopVoiceTimer();
        releaseMicrophone();
        setRecording(false);
        setVoiceProcessing(false);
        setAssistantError(copy.voicePermission);
      };

      recorder.onstop = () => {
        stopVoiceTimer();
        releaseMicrophone();
        setRecording(false);

        const blob = new Blob(
          recordingChunksRef.current,
          {
            type:
              recorder.mimeType ||
              mimeType ||
              "audio/webm",
          },
        );

        recordingChunksRef.current = [];

        void sendVoiceBlob(blob);
      };

      recorder.start(250);
      setRecording(true);
      setVoiceSeconds(0);

      stopVoiceTimer();

      voiceTimerRef.current =
        window.setInterval(() => {
          setVoiceSeconds((current) => {
            const next = current + 1;

            if (
              next >= 45 &&
              mediaRecorderRef.current?.state === "recording"
            ) {
              mediaRecorderRef.current.stop();
            }

            return Math.min(next, 45);
          });
        }, 1000);
    } catch (error) {
      releaseMicrophone();
      setRecording(false);

      const message =
        error instanceof Error &&
        error.message
          ? error.message
          : copy.voicePermission;

      setAssistantError(message);
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state === "recording"
    ) {
      recorder.stop();
    }
  }

  function toggleVoiceRecording() {
    if (recording) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording();
  }

  function stopSpeaking() {
    audioRef.current?.pause();
    setSpeaking(false);
  }

  function closeVoiceMode() {
    if (recording) {
      stopVoiceRecording();
    }

    stopSpeaking();
    setVoiceOpen(false);
  }

  function clearChat() {
    requestCounter.current += 1;
    setChatHistory([]);
    setQuestion("");
    setAssistantError(null);
    setAsking(false);
    setVoiceTranscript("");
    stopSpeaking();
  }

  function runPrompt(prompt: string) {
    setCommandOpen(false);
    void handleSendQuestion(prompt);
  }

  const lastChat =
    chatHistory.length > 0
      ? chatHistory[chatHistory.length - 1]
      : null;

  const statusLabel = recording
    ? copy.voiceListening
    : voiceProcessing
      ? copy.voiceProcessing
      : speaking
        ? language === "te"
          ? "సమాధానం వినిపిస్తోంది..."
          : "Speaking..."
        : copy.voiceReady;

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] bg-[#F8FAF9] text-[#183B47] dark:bg-[#082C34] dark:text-[#F4FBF9] lg:min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_2%,rgba(21,148,155,.055),transparent_30rem),radial-gradient(circle_at_8%_88%,rgba(57,163,132,.045),transparent_26rem)]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1720px] flex-col px-2.5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-4 lg:min-h-screen lg:px-5 lg:pb-5 lg:pt-4">
        <header className="flex min-h-[68px] flex-wrap items-center gap-3 rounded-[20px] border border-[#D7E6E3] bg-white/95 px-3.5 py-3 shadow-[0_10px_30px_rgba(11,44,52,.055)] backdrop-blur-xl dark:border-[#315B63] dark:bg-[#0B3037]/96 sm:px-4">
          <div className="flex min-w-[190px] items-center gap-3">
            <motion.div
              animate={{
                boxShadow: canAsk
                  ? [
                      "0 0 0 rgba(21,148,155,0)",
                      "0 0 26px rgba(21,148,155,.16)",
                      "0 0 0 rgba(21,148,155,0)",
                    ]
                  : "0 0 0 rgba(21,148,155,0)",
              }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
              }}
              className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] dark:border-[#60D1BB]/25 dark:bg-[#123F49] dark:text-[#76DDC9]"
            >
              <Bot size={20} />
              <span
                className={[
                  "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#0B3037]",
                  canAsk ? "bg-[#39A384]" : "bg-[#8EA4A7]",
                ].join(" ")}
              />
            </motion.div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-black tracking-[-0.03em] text-[#183B47] dark:text-white">
                  {copy.title}
                </h1>
                <span className="hidden rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-2 py-1 text-[7px] font-black uppercase tracking-[0.09em] text-[#237E6D] sm:inline-flex dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
                  {copy.sourceMode}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-medium text-[#6B8A91] dark:text-[#A9C2C4]">
                {copy.subtitle}
              </p>
            </div>
          </div>

          <div className="min-w-[250px] flex-1">
            <div className="relative">
              <Boxes
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B8A91]"
              />
              <select
                value={selectedBlockId}
                onChange={(event) => setSelectedBlockId(event.target.value)}
                disabled={blocksLoading || blocks.length === 0}
                className="h-11 w-full appearance-none rounded-[13px] border border-[#D7E6E3] bg-[#F3F8F6] pl-10 pr-10 text-[11px] font-extrabold text-[#36545D] outline-none transition focus:border-[#15949B] focus:ring-4 focus:ring-[#15949B]/10 disabled:opacity-50 dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#D5E5E3]"
              >
                {blocks.length === 0 ? (
                  <option value="">{copy.waiting}</option>
                ) : null}

                {blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.block_code || block.id} ·{" "}
                    {String(block.status || "UNKNOWN").replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B8A91]"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setVoiceOpen(true);

                if (!recording && !voiceProcessing && canAsk) {
                  void startVoiceRecording();
                }
              }}
              disabled={!canAsk}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[13px] bg-[#15949B] px-4 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[0_8px_20px_rgba(21,148,155,.18)] transition hover:bg-[#0F7E84] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Mic size={15} />
              {copy.voice}
            </button>

            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              disabled={!canAsk}
              className="hidden h-11 items-center gap-2 rounded-[13px] border border-[#D7E6E3] bg-white px-3.5 text-[9px] font-black uppercase tracking-[0.08em] text-[#58767D] transition hover:border-[#B7D8D1] hover:bg-[#E6F4F1] hover:text-[#0F7E84] disabled:opacity-35 dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#A9C2C4] md:inline-flex"
            >
              <Command size={13} />
              Prompts
            </button>

            {chatHistory.length > 0 ? (
              <button
                type="button"
                onClick={clearChat}
                disabled={asking}
                title={copy.clear}
                className="grid h-11 w-11 place-items-center rounded-[13px] border border-[#D7E6E3] bg-white text-[#6B8A91] transition hover:border-[#F2B4B4] hover:bg-[#FDECEC] hover:text-[#C53F3F] disabled:opacity-40 dark:border-[#315B63] dark:bg-[#123F49]"
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        </header>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-[#D7E6E3] bg-white shadow-[0_18px_52px_rgba(11,44,52,.065)] dark:border-[#315B63] dark:bg-[#0B3037]">
          <div className="flex min-h-[50px] flex-wrap items-center justify-between gap-2 border-b border-[#E5EEEC] bg-[#FBFDFC] px-4 py-2 dark:border-[#315B63] dark:bg-[#0E353D]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {canAsk ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#39A384] opacity-25" />
                ) : null}
                <span
                  className={[
                    "relative inline-flex h-2.5 w-2.5 rounded-full",
                    canAsk ? "bg-[#39A384]" : "bg-[#8EA4A7]",
                  ].join(" ")}
                />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#56757B] dark:text-[#A9C2C4]">
                {canAsk ? copy.ready : copy.waiting}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {evidenceSignals.map((signal) => {
                const Icon = signal.icon;

                return (
                  <span
                    key={signal.key}
                    className={[
                      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[7px] font-black uppercase tracking-[0.05em]",
                      signal.ready
                        ? "border-[#BBDDD4] bg-[#E8F4F0] text-[#237E6D] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]"
                        : "border-[#D7E6E3] bg-[#F3F8F6] text-[#AABABC] dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#647F84]",
                    ].join(" ")}
                  >
                    <Icon size={10} />
                    <span className="hidden sm:inline">{signal.label}</span>
                    {signal.value ? <span>{signal.value}</span> : null}
                  </span>
                );
              })}
            </div>
          </div>

          {(blocksError || analysisError || assistantError) ? (
            <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-[14px] border border-[#F2B4B4] bg-[#FDECEC] px-3 py-2.5 text-[#C53F3F] dark:border-[#E05252]/25 dark:bg-[#E05252]/[0.08] dark:text-[#FF9B9B]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p className="text-[10px] font-semibold leading-5">
                {blocksError || analysisError || assistantError}
              </p>
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[980px] px-3 pb-40 pt-5 sm:px-5 sm:pt-7">
              {loadingAnalysis ? (
                <div className="flex min-h-[42vh] items-center justify-center">
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#15949B]"
                    >
                      <WandSparkles size={22} />
                    </motion.div>
                    <p className="mt-4 text-[12px] font-extrabold text-[#36545D] dark:text-[#D5E5E3]">
                      {copy.thinking}
                    </p>
                  </div>
                </div>
              ) : chatHistory.length === 0 ? (
                <AssistantWelcome
                  canAsk={canAsk}
                  copy={copy}
                  selectedBlock={selectedBlock}
                  availableSignals={availableSignals}
                  prompts={[...copy.prompts]}
                  onPrompt={(prompt) => void handleSendQuestion(prompt)}
                  onVoice={() => {
                    setVoiceOpen(true);
                    if (canAsk && !recording && !voiceProcessing) {
                      void startVoiceRecording();
                    }
                  }}
                />
              ) : (
                <div className="space-y-7">
                  {chatHistory.map((item) => (
                    <ConversationTurn
                      key={item.id}
                      item={item}
                      copy={copy}
                      asking={asking}
                      onFollowup={(followup) => void handleSendQuestion(followup)}
                    />
                  ))}

                  {asking ? (
                    <AssistantThinking copy={copy} />
                  ) : null}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/98 to-white/0 px-3 pb-3 pt-10 dark:from-[#0B3037] dark:via-[#0B3037]/98 dark:to-[#0B3037]/0 sm:px-5 sm:pb-4">
              <div className="mx-auto max-w-[980px]">
                <div className="rounded-[20px] border border-[#C5D8D5] bg-white p-2 shadow-[0_14px_40px_rgba(11,44,52,.10)] dark:border-[#315B63] dark:bg-[#103A42]">
                  <textarea
                    ref={textareaRef}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void handleSendQuestion(question);
                      }
                    }}
                    disabled={!canAsk || asking}
                    rows={2}
                    placeholder={copy.inputPlaceholder}
                    className="max-h-36 min-h-[58px] w-full resize-none bg-transparent px-3 py-2.5 text-[12px] font-medium leading-5 text-[#183B47] outline-none placeholder:text-[#8EA4A7] disabled:opacity-50 dark:text-white dark:placeholder:text-[#647F84]"
                  />

                  <div className="flex items-center justify-between gap-2 border-t border-[#E5EEEC] px-1.5 pt-2 dark:border-[#315B63]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceOpen(true);
                          if (speaking) {
                            stopSpeaking();
                          }
                          if (canAsk && !recording && !voiceProcessing) {
                            void startVoiceRecording();
                          }
                        }}
                        disabled={!canAsk || voiceProcessing}
                        className="grid h-9 w-9 place-items-center rounded-xl border border-[#B7D8D1] bg-[#E6F4F1] text-[#0F7E84] transition hover:bg-[#DFF1EC] disabled:opacity-35 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]"
                        title={copy.voice}
                      >
                        <Mic size={15} />
                      </button>

                      <span className="hidden text-[8px] font-semibold text-[#8EA4A7] sm:inline">
                        {copy.shortcut}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSendQuestion(question)}
                      disabled={!canAsk || asking || !question.trim()}
                      className="inline-flex h-10 items-center gap-2 rounded-[13px] bg-[#15949B] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#0F7E84] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Send size={14} />
                      {copy.send}
                    </button>
                  </div>
                </div>

                <p className="mt-2 text-center text-[8px] font-semibold text-[#8EA4A7] dark:text-[#647F84]">
                  {copy.sourceModeSub}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {voiceOpen ? (
          <VoiceAssistantOverlay
            copy={copy}
            language={language}
            voiceLanguage={voiceLanguage}
            setVoiceLanguage={setVoiceLanguage}
            recording={recording}
            processing={voiceProcessing}
            speaking={speaking}
            seconds={voiceSeconds}
            transcript={voiceTranscript}
            lastAnswer={lastChat?.answer.answer || ""}
            statusLabel={statusLabel}
            autoSpeak={autoSpeak}
            setAutoSpeak={setAutoSpeak}
            canAsk={canAsk}
            onClose={closeVoiceMode}
            onMic={() => {
              if (speaking) {
                stopSpeaking();
                void startVoiceRecording();
                return;
              }

              toggleVoiceRecording();
            }}
            onStopSpeaking={stopSpeaking}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {commandOpen ? (
          <PromptPalette
            copy={copy}
            prompts={[...copy.prompts]}
            onClose={() => setCommandOpen(false)}
            onPrompt={runPrompt}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function normalizeTextAnswer(
  response: AIAssistantResponse,
): ChatAnswer {
  return {
    answer:
      response.answer,
    fact_type:
      response.fact_type,
    data_fields_referenced:
      Array.isArray(
        response.data_fields_referenced,
      )
        ? response.data_fields_referenced
        : undefined,
    disclaimer:
      response.disclaimer,
    suggested_followups:
      Array.isArray(
        response.suggested_followups,
      )
        ? response.suggested_followups
        : undefined,
    source: "text",
  };
}

function normalizeVoiceAnswer(
  response: {
    answer?: unknown;
    fact_type?: unknown;
    data_fields_referenced?: unknown;
    disclaimer?: unknown;
    suggested_followups?: unknown;
    [key: string]: unknown;
  },
): ChatAnswer {
  const stringArray = (
    value: unknown,
  ) =>
    Array.isArray(value)
      ? value.filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
      : undefined;

  return {
    answer:
      typeof response.answer ===
      "string"
        ? response.answer
        : undefined,
    fact_type:
      typeof response.fact_type ===
      "string"
        ? response.fact_type
        : "VOICE_ASSISTANT",
    data_fields_referenced:
      stringArray(
        response.data_fields_referenced,
      ),
    disclaimer:
      typeof response.disclaimer ===
      "string"
        ? response.disclaimer
        : undefined,
    suggested_followups:
      stringArray(
        response.suggested_followups,
      ),
    source: "voice",
  };
}

function formatVoiceSeconds(
  seconds: number,
) {
  const safe =
    Math.max(
      0,
      Math.floor(seconds),
    );

  const minutes =
    Math.floor(
      safe / 60,
    );

  const remainder =
    safe % 60;

  return `${String(
    minutes,
  ).padStart(
    2,
    "0",
  )}:${String(
    remainder,
  ).padStart(
    2,
    "0",
  )}`;
}


function AssistantWelcome({
  canAsk,
  copy,
  selectedBlock,
  availableSignals,
  prompts,
  onPrompt,
  onVoice,
}: {
  canAsk: boolean;
  copy: (typeof COPY)["en"] | (typeof COPY)["te"];
  selectedBlock: BlockOut | null;
  availableSignals: number;
  prompts: string[];
  onPrompt: (prompt: string) => void;
  onVoice: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[52vh] max-w-[850px] flex-col justify-center py-8">
      <div className="text-center">
        <motion.div
          animate={{
            y: [0, -5, 0],
            boxShadow: [
              "0 0 0 rgba(21,148,155,0)",
              "0 18px 45px rgba(21,148,155,.14)",
              "0 0 0 rgba(21,148,155,0)",
            ],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#15949B] dark:border-[#60D1BB]/25 dark:bg-[#123F49] dark:text-[#76DDC9]"
        >
          <Bot size={27} />
        </motion.div>

        <h2 className="mt-5 text-[24px] font-black tracking-[-0.045em] text-[#183B47] sm:text-[30px] dark:text-white">
          {copy.emptyTitle}
        </h2>

        <p className="mx-auto mt-2 max-w-[650px] text-[11px] font-medium leading-5 text-[#6B8A91] dark:text-[#A9C2C4]">
          {copy.emptySub}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-[#D7E6E3] bg-[#F3F8F6] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] text-[#56757B] dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#A9C2C4]">
            {selectedBlock?.block_code || copy.block}
          </span>

          <span className="rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.08em] text-[#237E6D] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
            {availableSignals}/5 evidence signals
          </span>
        </div>

        <button
          type="button"
          disabled={!canAsk}
          onClick={onVoice}
          className="mt-6 inline-flex min-h-12 items-center gap-2.5 rounded-full bg-[#15949B] px-6 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_rgba(21,148,155,.20)] transition hover:-translate-y-0.5 hover:bg-[#0F7E84] disabled:opacity-35"
        >
          <Mic size={17} />
          {copy.voiceTitle}
        </button>
      </div>

      <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
        {prompts.slice(0, 4).map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            disabled={!canAsk}
            onClick={() => onPrompt(prompt)}
            className="group flex min-h-[62px] items-center gap-3 rounded-[16px] border border-[#D7E6E3] bg-[#FBFDFC] px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#B7D8D1] hover:bg-[#F3F8F6] disabled:opacity-40 dark:border-[#315B63] dark:bg-[#103A42] dark:hover:bg-[#123F49]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#B7D8D1] bg-[#E6F4F1] text-[9px] font-black text-[#0F7E84] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
              {index + 1}
            </span>
            <span className="text-[10px] font-bold leading-4 text-[#36545D] group-hover:text-[#183B47] dark:text-[#D5E5E3]">
              {prompt}
            </span>
            <ArrowRight size={13} className="ml-auto shrink-0 text-[#AABABC] group-hover:text-[#15949B]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationTurn({
  item,
  copy,
  asking,
  onFollowup,
}: {
  item: ChatItem;
  copy: (typeof COPY)["en"] | (typeof COPY)["te"];
  asking: boolean;
  onFollowup: (followup: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="ml-auto flex max-w-[88%] justify-end gap-2.5">
        <div className="rounded-[20px] rounded-br-[6px] bg-[#0F7E84] px-4 py-3 text-white shadow-[0_8px_22px_rgba(15,126,132,.14)]">
          <p className="whitespace-pre-wrap break-words text-[12px] font-semibold leading-5">
            {item.question}
          </p>
        </div>

        <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[13px] border border-[#D7E6E3] bg-[#F3F8F6] text-[#58767D] dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#A9C2C4]">
          <UserRound size={15} />
        </span>
      </div>

      <div className="flex max-w-[96%] gap-3">
        <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#15949B] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
          <Bot size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black text-[#183B47] dark:text-white">
              {copy.answer}
            </p>
            <span className="rounded-full border border-[#BBDDD4] bg-[#E8F4F0] px-2 py-1 text-[7px] font-black uppercase tracking-[0.06em] text-[#237E6D] dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]">
              {item.answer.source === "voice" ? "VOICE" : "TEXT"} ·{" "}
              {item.answer.fact_type || "EVIDENCE"}
            </span>
          </div>

          <div className="mt-2 text-[12px] font-medium leading-6 text-[#36545D] dark:text-[#D5E5E3]">
            <p className="whitespace-pre-wrap break-words">
              {item.answer.answer?.trim() || copy.noAnswer}
            </p>
          </div>

          {Array.isArray(item.answer.data_fields_referenced) &&
          item.answer.data_fields_referenced.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.answer.data_fields_referenced.slice(0, 6).map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-[#D7E6E3] bg-[#F3F8F6] px-2.5 py-1 text-[7px] font-bold text-[#6B8A91] dark:border-[#315B63] dark:bg-[#123F49] dark:text-[#A9C2C4]"
                >
                  {field}
                </span>
              ))}
            </div>
          ) : null}

          {item.answer.disclaimer ? (
            <div className="mt-3 rounded-[14px] border border-[#F3D598] bg-[#FFF4DE] px-3 py-2.5 dark:border-[#F5A623]/22 dark:bg-[#F5A623]/[0.07]">
              <p className="text-[8px] font-black uppercase tracking-[0.08em] text-[#B8790D] dark:text-[#FFD07A]">
                {copy.evidenceNote}
              </p>
              <p className="mt-1 text-[9px] font-medium leading-4 text-[#6B8A91] dark:text-[#D5E5E3]">
                {item.answer.disclaimer}
              </p>
            </div>
          ) : null}

          {Array.isArray(item.answer.suggested_followups) &&
          item.answer.suggested_followups.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.answer.suggested_followups.slice(0, 3).map((followup) => (
                <button
                  key={followup}
                  type="button"
                  disabled={asking}
                  onClick={() => onFollowup(followup)}
                  className="rounded-full border border-[#B7D8D1] bg-[#E6F4F1] px-3 py-2 text-[8px] font-bold text-[#0F7E84] transition hover:bg-[#DFF1EC] disabled:opacity-40 dark:border-[#60D1BB]/20 dark:bg-[#60D1BB]/[0.07] dark:text-[#76DDC9]"
                >
                  {followup}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssistantThinking({
  copy,
}: {
  copy: (typeof COPY)["en"] | (typeof COPY)["te"];
}) {
  return (
    <div className="flex max-w-[90%] gap-3">
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-[#B7D8D1] bg-[#E6F4F1] text-[#15949B]"
      >
        <WandSparkles size={16} />
      </motion.span>

      <div className="pt-2">
        <p className="text-[11px] font-black text-[#36545D] dark:text-[#D5E5E3]">
          {copy.thinking}
        </p>
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: index * 0.16,
              }}
              className="h-2 w-2 rounded-full bg-[#15949B]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function VoiceAssistantOverlay({
  copy,
  language,
  voiceLanguage,
  setVoiceLanguage,
  recording,
  processing,
  speaking,
  seconds,
  transcript,
  lastAnswer,
  statusLabel,
  autoSpeak,
  setAutoSpeak,
  canAsk,
  onClose,
  onMic,
  onStopSpeaking,
}: {
  copy: (typeof COPY)["en"] | (typeof COPY)["te"];
  language: "en" | "te";
  voiceLanguage: VoiceLanguage;
  setVoiceLanguage: React.Dispatch<React.SetStateAction<VoiceLanguage>>;
  recording: boolean;
  processing: boolean;
  speaking: boolean;
  seconds: number;
  transcript: string;
  lastAnswer: string;
  statusLabel: string;
  autoSpeak: boolean;
  setAutoSpeak: React.Dispatch<React.SetStateAction<boolean>>;
  canAsk: boolean;
  onClose: () => void;
  onMic: () => void;
  onStopSpeaking: () => void;
}) {
  const active = recording || processing || speaking;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#082C34]/94 p-3 backdrop-blur-2xl sm:p-5"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [0.9, 1.08, 0.9],
            opacity: [0.18, 0.34, 0.18],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-[42%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(96,209,187,.32),rgba(21,148,155,.10)_38%,transparent_70%)] blur-3xl"
        />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-24px)] max-w-[1100px] flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#76DDC9]">
              {copy.voiceTitle}
            </p>
            <p className="mt-1 text-[11px] font-medium text-[#A9C2C4]">
              {language === "te"
                ? "సహజంగా మాట్లాడండి — సమాధానం ఆటోమేటిక్‌గా వినిపిస్తుంది."
                : "Speak naturally — Granite AI will understand, answer and speak back."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full border border-[#315B63] bg-[#123F49] text-[#A9C2C4] transition hover:bg-[#164B55] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.13em] text-[#76DDC9]">
            {statusLabel}
          </p>

          {recording ? (
            <p className="mt-2 font-mono text-[10px] font-bold text-[#8FADB0]">
              {formatVoiceSeconds(seconds)}
            </p>
          ) : null}

          <div className="relative mt-7 grid h-[240px] w-[240px] place-items-center sm:h-[300px] sm:w-[300px]">
            <motion.div
              animate={{
                scale: active ? [0.92, 1.07, 0.92] : [0.98, 1.02, 0.98],
                opacity: active ? [0.28, 0.65, 0.28] : [0.18, 0.32, 0.18],
              }}
              transition={{
                duration: recording ? 1.2 : speaking ? 1.5 : 2.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 rounded-full border border-[#60D1BB]/25"
            />

            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: processing ? 3.5 : 9,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-5 rounded-full border border-dashed border-[#60D1BB]/30"
            />

            <motion.button
              type="button"
              disabled={!canAsk || processing}
              onClick={onMic}
              whileTap={{ scale: 0.96 }}
              animate={{
                scale: recording ? [1, 1.05, 1] : 1,
                boxShadow: active
                  ? [
                      "0 0 35px rgba(96,209,187,.18)",
                      "0 0 78px rgba(96,209,187,.36)",
                      "0 0 35px rgba(96,209,187,.18)",
                    ]
                  : "0 0 28px rgba(96,209,187,.16)",
              }}
              transition={{
                duration: 1.5,
                repeat: active ? Infinity : 0,
              }}
              className={[
                "relative grid h-36 w-36 place-items-center rounded-full border text-white sm:h-44 sm:w-44",
                recording
                  ? "border-[#FF8E8E]/60 bg-[radial-gradient(circle_at_32%_28%,#F06A6A,#B93636)]"
                  : processing
                    ? "border-[#60D1BB]/40 bg-[radial-gradient(circle_at_32%_28%,#1BA5A8,#0B5B62)]"
                    : speaking
                      ? "border-[#60D1BB]/55 bg-[radial-gradient(circle_at_32%_28%,#39A384,#0F7E84)]"
                      : "border-[#60D1BB]/45 bg-[radial-gradient(circle_at_32%_28%,#24AAB0,#0F7E84)]",
              ].join(" ")}
            >
              {processing ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                >
                  <WandSparkles size={42} />
                </motion.span>
              ) : recording ? (
                <MicOff size={42} />
              ) : speaking ? (
                <Volume2 size={42} />
              ) : (
                <Mic size={42} />
              )}
            </motion.button>

            <div className="pointer-events-none absolute bottom-3 flex h-12 items-end justify-center gap-1">
              {Array.from({ length: 13 }).map((_, index) => (
                <motion.span
                  key={index}
                  animate={{
                    height: active
                      ? [8, 14 + ((index * 7) % 25), 7 + ((index * 3) % 14), 8]
                      : 8,
                    opacity: active ? [0.35, 1, 0.5, 0.35] : 0.25,
                  }}
                  transition={{
                    duration: 0.85 + (index % 4) * 0.12,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.035,
                  }}
                  className="w-1 rounded-full bg-[#76DDC9]"
                />
              ))}
            </div>
          </div>

          <p className="mt-6 max-w-[700px] text-[14px] font-black tracking-[-0.025em] text-white sm:text-[18px]">
            {recording
              ? copy.voiceStop
              : speaking
                ? language === "te"
                  ? "మధ్యలోనే మైక్ నొక్కి కొత్త ప్రశ్న అడగండి"
                  : "Tap the mic anytime to interrupt and ask something else"
                : copy.voiceStart}
          </p>

          {transcript ? (
            <div className="mt-5 w-full max-w-[720px] rounded-[18px] border border-[#315B63] bg-[#103A42]/92 p-4 text-left">
              <p className="text-[8px] font-black uppercase tracking-[0.1em] text-[#8FADB0]">
                {copy.transcript}
              </p>
              <p className="mt-2 text-[12px] font-semibold leading-5 text-[#E3EFED]">
                {transcript}
              </p>
            </div>
          ) : null}

          {lastAnswer && !recording ? (
            <div className="mt-3 w-full max-w-[720px] rounded-[18px] border border-[#315B63] bg-[#0F343C]/88 p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[8px] font-black uppercase tracking-[0.1em] text-[#76DDC9]">
                  {copy.answer}
                </p>
                {speaking ? (
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#315B63] bg-[#123F49] px-2.5 py-1.5 text-[7px] font-black text-[#A9C2C4]"
                  >
                    <VolumeX size={11} />
                    Stop audio
                  </button>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-4 text-[11px] font-medium leading-5 text-[#D5E5E3]">
                {lastAnswer}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mx-auto mb-2 flex w-full max-w-[720px] flex-wrap items-center justify-center gap-2 rounded-[18px] border border-[#315B63] bg-[#0F343C]/88 p-2.5">
          <div className="flex rounded-xl border border-[#315B63] bg-[#123F49] p-1">
            {(["en", "te"] as VoiceLanguage[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setVoiceLanguage(item)}
                className={[
                  "min-h-8 rounded-lg px-3 text-[8px] font-black uppercase tracking-[0.08em] transition",
                  voiceLanguage === item
                    ? "bg-[#15949B] text-white"
                    : "text-[#A9C2C4] hover:text-white",
                ].join(" ")}
              >
                {item === "en" ? "English" : "తెలుగు"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAutoSpeak((current) => !current)}
            className={[
              "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-[8px] font-black uppercase tracking-[0.07em] transition",
              autoSpeak
                ? "border-[#60D1BB]/35 bg-[#60D1BB]/10 text-[#76DDC9]"
                : "border-[#315B63] bg-[#123F49] text-[#A9C2C4]",
            ].join(" ")}
          >
            {autoSpeak ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {copy.autoSpeak}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PromptPalette({
  copy,
  prompts,
  onClose,
  onPrompt,
}: {
  copy: (typeof COPY)["en"] | (typeof COPY)["te"];
  prompts: string[];
  onClose: () => void;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-start justify-center bg-[#082C34]/45 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <motion.div
        initial={{ y: 18, scale: 0.985, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, scale: 0.985, opacity: 0 }}
        className="w-full max-w-[720px] overflow-hidden rounded-[22px] border border-[#D7E6E3] bg-white shadow-[0_28px_80px_rgba(5,26,31,.22)] dark:border-[#315B63] dark:bg-[#0B3037]"
      >
        <div className="flex items-center justify-between border-b border-[#E5EEEC] px-4 py-3 dark:border-[#315B63]">
          <div>
            <p className="text-[11px] font-black text-[#183B47] dark:text-white">
              {copy.starters}
            </p>
            <p className="mt-0.5 text-[8px] font-medium text-[#8EA4A7]">
              Ctrl K
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[#D7E6E3] bg-[#F3F8F6] text-[#6B8A91] dark:border-[#315B63] dark:bg-[#123F49]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-3">
          {prompts.map((prompt, index) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="group flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[#F3F8F6] dark:hover:bg-[#123F49]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#B7D8D1] bg-[#E6F4F1] text-[8px] font-black text-[#0F7E84]">
                {index + 1}
              </span>
              <span className="text-[10px] font-bold leading-4 text-[#36545D] group-hover:text-[#183B47] dark:text-[#D5E5E3] dark:group-hover:text-white">
                {prompt}
              </span>
              <ArrowRight size={13} className="ml-auto text-[#AABABC] group-hover:text-[#15949B]" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}


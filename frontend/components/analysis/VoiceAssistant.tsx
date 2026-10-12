"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, VolumeX, X, Play, Square, Globe } from "lucide-react";
import { useTranslation } from "../../lib/i18n";
import { blockVoiceAssistant, synthesizeSpeech } from "../../lib/api";

interface VoiceAssistantProps {
  blockId: string;
  activeTab?: string;
  selectedCutIndex?: number;
  selectedDefectId?: string;
  selectedCavityId?: string;
  selectedPhotoId?: string;
  isOpen: boolean;
  onClose: () => void;
}

type VoiceState = 
  | 'IDLE' 
  | 'REQUESTING_PERMISSION' 
  | 'LISTENING' 
  | 'PROCESSING_AUDIO' 
  | 'THINKING' 
  | 'SPEAKING' 
  | 'ERROR';

type LanguageMode = "AUTO" | "EN" | "TE";

const hasBrowserSTT = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
const hasBrowserTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

export default function VoiceAssistant({
  blockId,
  activeTab,
  selectedCutIndex,
  isOpen,
  onClose,
}: VoiceAssistantProps) {
  const { t, language: appLang } = useTranslation();
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [langMode, setLangMode] = useState<LanguageMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("granitemeasure.voice_lang");
      if (stored === "EN" || stored === "TE" || stored === "AUTO") {
        return stored as LanguageMode;
      }
    }
    return appLang === "te" ? "TE" : "AUTO";
  });
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("granitemeasure.voice_lang", langMode);
    }
  }, [langMode]);

  useEffect(() => {
    if (!isOpen) {
      stopAll();
    }
  }, [isOpen]);

  const stopAll = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignored
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (hasBrowserTTS) {
      window.speechSynthesis.cancel();
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    setState('IDLE');
  };

  const getActiveLangCode = () => {
    if (langMode === "TE") return "te-IN";
    if (langMode === "EN") return "en-IN";
    return appLang === "te" ? "te-IN" : "en-US";
  };

  const speakAnswer = async (textToSpeak: string, forceLangCode?: string) => {
    if (!textToSpeak) return;
    setState('SPEAKING');

    const targetLang = forceLangCode || getActiveLangCode();

    if (hasBrowserTTS) {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.lang.startsWith(targetLang));
      
      if (!selectedVoice && targetLang.startsWith("te")) {
        // Fallback STT or handle logic
      }

      if (selectedVoice || targetLang.startsWith("en")) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = targetLang;
        if (selectedVoice) utterance.voice = selectedVoice;
        
        utterance.onend = () => {
          if (state === 'SPEAKING') setState('IDLE');
        };
        utterance.onerror = () => {
          if (state === 'SPEAKING') setState('IDLE');
        };
        
        window.speechSynthesis.speak(utterance);
        return;
      }
    }

    // Server fallback
    try {
      const audioBlob = await synthesizeSpeech(textToSpeak, targetLang.split("-")[0]);
      if (audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioElementRef.current = audio;
        audio.onended = () => {
          if (state === 'SPEAKING') setState('IDLE');
          URL.revokeObjectURL(url);
        };
        audio.play();
      } else {
        setState('IDLE');
      }
    } catch {
      setState('IDLE');
    }
  };

  const sendAudioToAssistant = async (audioBlob: Blob) => {
    setState('THINKING');
    try {
      const response = await blockVoiceAssistant(blockId, audioBlob, {
        language: langMode === "TE" ? "te" : langMode === "EN" ? "en" : appLang,
        contextTab: activeTab,
        contextCutIndex: selectedCutIndex,
      });

      if (response && response.answer) {
        setAnswer(response.answer);
        if (response.transcript) {
          setTranscript(response.transcript);
        }
        await speakAnswer(response.answer, response.language === "te" ? "te-IN" : "en-US");
      } else {
        throw new Error("Empty response");
      }
    } catch {
      setErrorMessage(t('voice_error_transcription'));
      setState('ERROR');
    }
  };

  const startListening = async () => {
    stopAll();
    setTranscript("");
    setAnswer("");
    setErrorMessage("");
    setState('REQUESTING_PERMISSION');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setState('LISTENING');

      if (hasBrowserSTT && false) { // Skip browser STT for direct audio upload for this demo
        // Would normally use SpeechRecognition here
      } else {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          if (state === 'LISTENING') {
            setState('PROCESSING_AUDIO');
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            sendAudioToAssistant(audioBlob);
          }
        };

        mediaRecorder.start();
      }
    } catch {
      setErrorMessage(t('voice_mic_permission'));
      setState('ERROR');
    }
  };

  const handleStopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.95 }}
        className="fixed bottom-6 right-4 lg:right-6 z-50 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[28px] border border-[#b98b38]/20 bg-white/90 p-5 shadow-[0_32px_80px_rgba(66,43,4,.15)] backdrop-blur-2xl dark:border-[#d8b66d]/15 dark:bg-[#0b0e12]/95 dark:shadow-[0_40px_100px_rgba(0,0,0,.6)]"
      >
        <div className="flex items-center justify-between border-b border-[#9e7a36]/15 pb-4">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-[#9a7128]">
            <Mic className="h-4 w-4" />
            {t('voice_assistant')}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-black/40 hover:bg-black/5 hover:text-black/80 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-4 flex items-center gap-2">
          {["AUTO", "EN", "TE"].map((mode) => (
            <button
              key={mode}
              onClick={() => setLangMode(mode as LanguageMode)}
              className={`rounded-full px-3 py-1 text-[10px] font-bold transition-colors ${
                langMode === mode
                  ? "bg-[#d8b66d]/20 text-[#8b6322] dark:text-[#e6c77e]"
                  : "bg-black/5 text-black/40 hover:bg-black/10 dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10"
              }`}
            >
              {mode === "AUTO" ? t('voice_language_auto') : mode === "EN" ? "EN" : "తెలుగు"}
            </button>
          ))}
        </div>

        <div className="relative mb-6 min-h-[120px] rounded-2xl bg-black/5 p-4 dark:bg-white/5">
          {state === 'ERROR' ? (
            <div className="text-center text-sm text-red-500">{errorMessage}</div>
          ) : state === 'IDLE' && !transcript && !answer ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-black/40 dark:text-white/40">
              <Globe className="mb-2 h-6 w-6 opacity-50" />
              {t('voice_ask_about_block')}
            </div>
          ) : (
            <div className="space-y-4">
              {transcript && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30">
                    {t('voice_transcript')}
                  </div>
                  <div className="mt-1 text-sm italic text-black/70 dark:text-white/70">
                    &ldquo;{transcript}&rdquo;
                  </div>
                </div>
              )}
              {answer && (
                <div>
                  <div className="text-sm font-medium text-black/90 dark:text-white/90">
                    {answer}
                  </div>
                </div>
              )}
              {state === 'THINKING' && (
                <div className="text-sm animate-pulse text-amber-600 dark:text-amber-400">
                  {t('voice_processing')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-3">
          {state === 'LISTENING' ? (
            <button
              onClick={handleStopListening}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg animate-pulse"
            >
              <Square className="h-5 w-5 fill-current" />
            </button>
          ) : state === 'SPEAKING' ? (
            <button
              onClick={stopAll}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg"
            >
              <VolumeX className="h-5 w-5" />
            </button>
          ) : (
            <button
              onMouseDown={startListening}
              onTouchStart={startListening}
              onMouseUp={handleStopListening}
              onTouchEnd={handleStopListening}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg hover:shadow-xl transition-transform active:scale-95"
            >
              <Mic className="h-6 w-6" />
            </button>
          )}

          {answer && state === 'IDLE' && (
            <button
              onClick={() => speakAnswer(answer)}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-[#b98b38]/20 bg-black/5 text-[#8b6322] hover:bg-black/10 dark:bg-white/5 dark:text-[#e6c77e] dark:hover:bg-white/10"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          )}
        </div>
        <div className="mt-3 text-center text-[10px] text-black/40 dark:text-white/40">
          {state === 'LISTENING' ? t('voice_listening') : t('voice_tap_to_speak')}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

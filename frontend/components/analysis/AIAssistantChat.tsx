"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, HelpCircle, Send, ShieldCheck, User } from "lucide-react";
import { askAIAssistant } from "../../lib/api";
import type { AIAssistantResponse } from "../../lib/types";
import { useTranslation } from "../../lib/i18n";

interface AIAssistantChatProps {
  blockId: string;
  initialSummary?: string | null;
}

type Message = {
  id: string;
  sender: "user" | "ai";
  text: string;
  factType?: string | null;
  dataFields?: string[];
  suggestedFollowups?: string[];
  timestamp: string;
  kind?: "answer" | "system" | "error";
};

const PROMPT_SUGGESTIONS_EN = [
  "What measurement evidence is available?",
  "What measurement limitations were reported?",
  "What cutting recommendation was returned?",
  "What visible defect findings were reported?",
  "What wastage values were returned?",
  "What can I do to improve the next capture?",
];

const PROMPT_SUGGESTIONS_TE = [
  "ఏ కొలత ఆధారాలు అందుబాటులో ఉన్నాయి?",
  "కొలతలకు ఏ పరిమితులు నివేదించబడ్డాయి?",
  "ఏ కట్టింగ్ సిఫార్సు వచ్చింది?",
  "ఏ కనిపించే లోపాల వివరాలు నివేదించబడ్డాయి?",
  "ఏ వ్యర్థ విలువలు నివేదించబడ్డాయి?",
  "తదుపరి క్యాప్చర్‌ను ఎలా మెరుగుపరచాలి?",
];

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWelcome(isTe: boolean, initialSummary?: string | null): Message {
  if (initialSummary?.trim()) {
    return {
      id: `summary-${Date.now()}`,
      sender: "ai",
      text: initialSummary,
      factType: isTe ? "విశ్లేషణ సారాంశం" : "Analysis summary",
      timestamp: nowLabel(),
      kind: "system",
    };
  }

  return {
    id: `welcome-${Date.now()}`,
    sender: "ai",
    text: isTe
      ? "ఈ బ్లాక్‌కు బ్యాక్‌ఎండ్ విశ్లేషణలో అందుబాటులో ఉన్న ఆధారాల గురించి ప్రశ్నలు అడగండి. కొలతలు, పునర్నిర్మాణం, కనిపించే లోపాల వివరాలు, కట్టింగ్ మరియు వ్యర్థాలపై నివేదించబడిన సమాచారాన్ని వివరించగలను. నివేదించని విలువలను నేను ఊహించను."
      : "Ask about evidence returned for this block: measurements, reconstruction, visible defect findings, cutting, wastage, and analysis limitations. I will not treat missing values as measured facts.",
    factType: isTe ? "ఆధార-ఆధారిత సహాయకుడు" : "Evidence-aware assistant",
    timestamp: nowLabel(),
    kind: "system",
  };
}

export default function AIAssistantChat({
  blockId,
  initialSummary,
}: AIAssistantChatProps) {
  const { language } = useTranslation();
  const isTe = language === "te";
  const promptSuggestions = isTe
    ? PROMPT_SUGGESTIONS_TE
    : PROMPT_SUGGESTIONS_EN;

  const [messages, setMessages] = useState<Message[]>(() => [
    buildWelcome(isTe, initialSummary),
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([buildWelcome(isTe, initialSummary)]);
  }, [initialSummary, isTe]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  const assistantLabel = isTe
    ? "గ్రానైట్ విశ్లేషణ సహాయకుడు"
    : "Granite Analysis Assistant";

  const subtitle = isTe
    ? "ఈ బ్లాక్‌కు నివేదించబడిన విశ్లేషణ ఆధారాల గురించి అడగండి"
    : "Ask about analysis evidence reported for this block";

  const placeholder = isTe
    ? "కొలతలు, లోపాలు, కట్టింగ్ లేదా పరిమితుల గురించి అడగండి..."
    : "Ask about measurements, findings, cutting, or limitations...";

  const referencedLabel = isTe ? "సూచించిన ఫీల్డ్స్" : "Referenced fields";
  const followupLabel = isTe ? "తదుపరి ప్రశ్నలు" : "Follow-up questions";
  const promptsLabel = isTe ? "సూచనలు" : "Prompts";
  const askLabel = isTe ? "అడగండి" : "Ask";

  const canSend = Boolean(blockId && input.trim() && !loading);

  const handleSend = async (questionText: string) => {
    const question = questionText.trim();
    if (!question || loading || !blockId) return;

    const requestId = ++requestRef.current;
    setMessages((previous) => [
      ...previous,
      {
        id: `user-${requestId}-${Date.now()}`,
        sender: "user",
        text: question,
        timestamp: nowLabel(),
      },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response: AIAssistantResponse = await askAIAssistant(
        blockId,
        question,
        language,
      );

      if (requestId !== requestRef.current) return;

      const answer =
        typeof response.answer === "string" && response.answer.trim()
          ? response.answer.trim()
          : isTe
            ? "ఈ ప్రశ్నకు బ్యాక్‌ఎండ్ సమాధానం ఇవ్వలేదు."
            : "The backend did not return an answer for this question.";

      setMessages((previous) => [
        ...previous,
        {
          id: `ai-${requestId}-${Date.now()}`,
          sender: "ai",
          text: answer,
          factType: response.fact_type || null,
          dataFields: Array.isArray(response.data_fields_referenced)
            ? response.data_fields_referenced.filter(Boolean)
            : [],
          suggestedFollowups: Array.isArray(response.suggested_followups)
            ? response.suggested_followups.filter(Boolean)
            : [],
          timestamp: nowLabel(),
          kind: "answer",
        },
      ]);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setMessages((previous) => [
        ...previous,
        {
          id: `error-${requestId}-${Date.now()}`,
          sender: "ai",
          text: isTe
            ? `ప్రశ్నను ప్రాసెస్ చేయలేకపోయాం: ${
                error instanceof Error ? error.message : "సేవ అందుబాటులో లేదు."
              }`
            : `Unable to process the question: ${
                error instanceof Error ? error.message : "Assistant service unavailable."
              }`,
          timestamp: nowLabel(),
          kind: "error",
        },
      ]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const latestFollowups = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const followups = messages[index].suggestedFollowups;
      if (followups?.length) return followups;
    }
    return [];
  }, [messages]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
            <Bot size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {assistantLabel}
              </h4>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
                title={
                  isTe
                    ? "సమాధానాలు బ్యాక్‌ఎండ్ సహాయక సేవ నుండి వస్తాయి; ఈ బ్యాడ్జ్ పూర్తి ఖచ్చితత్వ హామీ కాదు."
                    : "Answers come from the backend assistant service; this badge is not a guarantee of factual completeness."
                }
              >
                <ShieldCheck size={10} />
                {isTe ? "బ్లాక్ సందర్భం" : "Block context"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {subtitle}
            </p>
          </div>
        </div>
      </header>

      <div
        className="max-h-[420px] space-y-4 overflow-y-auto p-4"
        aria-live="polite"
        aria-busy={loading}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.sender === "ai" && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
                <Bot size={14} />
              </span>
            )}

            <div
              className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed sm:max-w-[82%] ${
                message.sender === "user"
                  ? "rounded-br-md bg-[var(--accent)] font-semibold text-[#121416]"
                  : message.kind === "error"
                    ? "rounded-bl-md border border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--text-primary)]"
                    : "rounded-bl-md border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {message.factType && (
                  <span className="rounded-md border border-[var(--accent)]/25 bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                    {message.factType}
                  </span>
                )}
                <span className="text-[10px] text-[var(--text-muted)]">
                  {message.timestamp}
                </span>
              </div>

              <p className="whitespace-pre-wrap break-words">{message.text}</p>

              {message.dataFields && message.dataFields.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {referencedLabel}:
                  </span>
                  {message.dataFields.map((field) => (
                    <code
                      key={field}
                      className="rounded border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]"
                    >
                      {field}
                    </code>
                  ))}
                </div>
              )}

              {message.suggestedFollowups &&
                message.suggestedFollowups.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
                    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      <HelpCircle size={11} className="text-[var(--accent)]" />
                      {followupLabel}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {message.suggestedFollowups.map((followup) => (
                        <button
                          key={followup}
                          type="button"
                          disabled={loading}
                          onClick={() => void handleSend(followup)}
                          className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-muted)] px-2.5 py-1 text-left text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
                        >
                          {followup} →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {message.sender === "user" && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-hover)] text-[var(--text-primary)]">
                <User size={14} />
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
              <Bot size={14} />
            </span>
            <div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                {isTe
                  ? "ఈ బ్లాక్‌కు అందుబాటులో ఉన్న విశ్లేషణ సందర్భాన్ని పరిశీలిస్తోంది..."
                  : "Reviewing available analysis context for this block..."}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {promptsLabel}:
        </span>
        {promptSuggestions.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={loading}
            onClick={() => void handleSend(prompt)}
            className="whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      {latestFollowups.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          {isTe
            ? "పై సమాధానానికి బ్యాక్‌ఎండ్ సూచించిన తదుపరి ప్రశ్నలు సందేశంలో చూపబడుతున్నాయి."
            : "Backend-suggested follow-up questions are shown with the relevant answer."}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend(input);
        }}
        className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--surface-raised)] p-3"
      >
        <label className="sr-only" htmlFor="granite-assistant-question">
          {placeholder}
        </label>
        <textarea
          id="granite-assistant-question"
          rows={1}
          value={input}
          disabled={loading || !blockId}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) void handleSend(input);
            }
          }}
          placeholder={placeholder}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-[#121416] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
          <span className="hidden sm:inline">{askLabel}</span>
        </button>
      </form>
    </section>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Languages,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  UserCheck,
  Users,
} from "lucide-react";
import { listDemoUsers } from "../../lib/api";
import { getSelectedUserId, setSelectedUserId } from "../../lib/storage";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import type { DemoUser } from "../../lib/types";
import { useTranslation } from "../../lib/i18n";

type PingState = {
  status: "idle" | "testing" | "ok" | "failed";
  latency?: number;
  error?: string;
};

const API_ENDPOINT = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const COPY = {
  en: {
    title: "Profile",
    subtitle: "Choose the current user, language, and check the app connection.",
    currentUser: "Current user",
    chooseUser: "Choose a user",
    noUser: "No user selected",
    active: "ACTIVE",
    inactive: "INACTIVE",
    switchUser: "Change user",
    users: "Users",
    refreshUsers: "Refresh users",
    loadingUsers: "Loading users...",
    noUsers: "No users are available.",
    language: "Language",
    languageHint: "Choose the language used in the app.",
    connection: "App connection",
    connectionHint: "Check whether the app can reach the backend service.",
    notChecked: "Connection not checked yet.",
    connected: "Connected",
    unavailable: "Not connected",
    testConnection: "Test connection",
    testing: "Checking...",
    retry: "Try again",
  },
  te: {
    title: "ప్రొఫైల్",
    subtitle: "ప్రస్తుత యూజర్, భాషను ఎంచుకుని యాప్ కనెక్షన్‌ను తనిఖీ చేయండి.",
    currentUser: "ప్రస్తుత యూజర్",
    chooseUser: "యూజర్‌ను ఎంచుకోండి",
    noUser: "యూజర్ ఎంచుకోలేదు",
    active: "యాక్టివ్",
    inactive: "ఇనాక్టివ్",
    switchUser: "యూజర్ మార్చండి",
    users: "యూజర్లు",
    refreshUsers: "యూజర్లను మళ్లీ లోడ్ చేయండి",
    loadingUsers: "యూజర్లు లోడ్ అవుతున్నారు...",
    noUsers: "యూజర్లు అందుబాటులో లేరు.",
    language: "భాష",
    languageHint: "యాప్‌లో ఉపయోగించాల్సిన భాషను ఎంచుకోండి.",
    connection: "యాప్ కనెక్షన్",
    connectionHint: "యాప్ బ్యాక్‌ఎండ్ సేవను చేరగలదో తనిఖీ చేయండి.",
    notChecked: "కనెక్షన్ ఇంకా తనిఖీ చేయలేదు.",
    connected: "కనెక్ట్ అయింది",
    unavailable: "కనెక్ట్ కాలేదు",
    testConnection: "కనెక్షన్ తనిఖీ చేయండి",
    testing: "తనిఖీ చేస్తోంది...",
    retry: "మళ్లీ ప్రయత్నించండి",
  },
} as const;

export default function ProfilePage() {
  const router = useRouter();
  const { language, setLanguage } = useTranslation();
  const copy = COPY[language];

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<PingState>({ status: "idle" });

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setDirectoryError(null);

    try {
      const items = await listDemoUsers();
      const safeItems = Array.isArray(items) ? items : [];
      setUsers(safeItems);

      const storedId = getSelectedUserId();
      setSelectedId(
        storedId && safeItems.some((item) => item.id === storedId)
          ? storedId
          : null,
      );
    } catch (error) {
      setUsers([]);
      setDirectoryError(
        error instanceof Error ? error.message : "Unable to load users.",
      );
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const user = useMemo(
    () => users.find((item) => item.id === selectedId) ?? null,
    [selectedId, users],
  );

  async function handlePing() {
    setPingResult({ status: "testing" });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const startedAt = performance.now();

    try {
      const response = await fetch(`${API_ENDPOINT}/health`, {
        signal: controller.signal,
        cache: "no-store",
      });

      const latency = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        setPingResult({ status: "failed", error: `HTTP ${response.status}` });
        return;
      }

      setPingResult({ status: "ok", latency });
    } catch (error) {
      setPingResult({
        status: "failed",
        error: error instanceof Error ? error.message : "Connection check failed.",
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId);
    setSelectedId(userId);
  }

  function clearUser() {
    setSelectedUserId(null);
    setSelectedId(null);
    router.push("/");
  }

  return (
    <div className="page-wrap max-w-[980px]">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
          {copy.subtitle}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card padding="none" className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {copy.currentUser}
              </h2>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-muted)] text-sm font-bold text-[var(--accent)]">
                  {user?.avatar_initials || "—"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-[var(--text-primary)]">
                    {user?.name || copy.noUser}
                  </p>
                  {user?.role ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                      {user.role}
                    </p>
                  ) : null}
                </div>

                {user && typeof user.is_active === "boolean" ? (
                  <StatusBadge
                    status={user.is_active ? "operational" : "unavailable"}
                    label={user.is_active ? copy.active : copy.inactive}
                    size="sm"
                  />
                ) : null}
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="mt-5 w-full"
                onClick={clearUser}
                disabled={!user}
              >
                <LogOut size={14} />
                <span>{copy.switchUser}</span>
              </Button>
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Users size={16} className="text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {copy.users}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={loadingUsers}
                aria-label={copy.refreshUsers}
                title={copy.refreshUsers}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <RefreshCw size={13} className={loadingUsers ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="p-4">
              {loadingUsers ? (
                <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                  {copy.loadingUsers}
                </p>
              ) : directoryError ? (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-3">
                  <div className="flex gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs text-[var(--danger)]">{directoryError}</p>
                      <button
                        type="button"
                        onClick={() => void loadUsers()}
                        className="mt-2 text-xs font-semibold text-[var(--text-primary)] underline underline-offset-2"
                      >
                        {copy.retry}
                      </button>
                    </div>
                  </div>
                </div>
              ) : users.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                  {copy.noUsers}
                </p>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {users.map((item) => {
                    const active = selectedId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectUser(item.id)}
                        aria-pressed={active}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                            : "border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">
                            {item.avatar_initials || "—"}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {item.name}
                            </p>
                            {item.role ? (
                              <p className="truncate text-xs text-[var(--text-muted)]">{item.role}</p>
                            ) : null}
                          </div>
                        </div>
                        {active ? <UserCheck size={16} className="shrink-0 text-[var(--accent)]" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-5 py-4">
              <Languages size={17} className="text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">{copy.language}</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-[var(--text-muted)]">{copy.languageHint}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={language === "en"}
                  onClick={() => setLanguage("en")}
                  className={`rounded-xl border p-4 text-center transition ${
                    language === "en"
                      ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                      : "border-[var(--border)] bg-[var(--surface-raised)]"
                  }`}
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">English</span>
                </button>
                <button
                  type="button"
                  aria-pressed={language === "te"}
                  onClick={() => setLanguage("te")}
                  className={`rounded-xl border p-4 text-center transition ${
                    language === "te"
                      ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                      : "border-[var(--border)] bg-[var(--surface-raised)]"
                  }`}
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">తెలుగు</span>
                </button>
              </div>
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Server size={17} className="text-[var(--accent)]" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">{copy.connection}</h2>
              </div>
              {pingResult.status === "ok" ? (
                <StatusBadge status="operational" label={copy.connected} size="sm" />
              ) : pingResult.status === "failed" ? (
                <StatusBadge status="unavailable" label={copy.unavailable} size="sm" />
              ) : null}
            </div>

            <div className="space-y-4 p-5">
              <p className="text-sm leading-6 text-[var(--text-muted)]">{copy.connectionHint}</p>

              {pingResult.status === "idle" ? (
                <p className="text-xs text-[var(--text-muted)]">{copy.notChecked}</p>
              ) : null}

              {pingResult.status === "ok" ? (
                <div className="flex gap-2 rounded-xl border border-[var(--success)]/20 bg-[var(--success-muted)] p-3">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  <p className="text-xs text-[var(--text-secondary)]">
                    {copy.connected}
                    {typeof pingResult.latency === "number" ? ` • ${pingResult.latency} ms` : ""}
                  </p>
                </div>
              ) : null}

              {pingResult.status === "failed" ? (
                <div className="flex gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                  <p className="break-words text-xs text-[var(--danger)]">
                    {pingResult.error || copy.unavailable}
                  </p>
                </div>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={pingResult.status === "testing"}
                loadingLabel={copy.testing}
                onClick={handlePing}
              >
                <Radio size={14} />
                <span>{copy.testConnection}</span>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listDemoUsers } from "../lib/api";
import { setSelectedUserId, getSelectedUserId } from "../lib/storage";
import type { DemoUser } from "../lib/types";
import Button from "../components/ui/Button";

export default function Home() {
  const router = useRouter();
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);

  async function checkHealth() {
    setHealthChecking(true);
    setHealthOk(null);
    try {
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Health check returned ${res.status}`);
      const body = await res.json().catch(() => ({}));
      setHealthOk(true);
      setError(null);
      return body;
    } catch (e: unknown) {
      setHealthOk(false);
      setError(String(e));
      return null;
    } finally {
      setHealthChecking(false);
    }
  }

  useEffect(() => {
    const local = getSelectedUserId();
    if (local) {
      // quick continue
      setSelected(local);
    }

    // Check backend health first, then load users
    (async () => {
      const ok = await checkHealth();
      if (ok) {
        listDemoUsers()
          .then((u) => setUsers(u))
          .catch((e) => setError(String(e)))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    })();
  }, []);

  function onContinue() {
    if (!selected) return alert("Select a user");
    setSelectedUserId(selected);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="text-4xl font-bold">GraniteMeasure AI</div>
          <div className="text-sm text-white/80 mt-1">Premium mobile-first capture and analysis for quarries</div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 space-y-4">
          <h3 className="text-lg font-semibold">Select Your User</h3>

          {healthChecking && <div className="text-sm text-white/70">Checking backend health…</div>}

          {healthOk === false && (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <div>Backend unreachable: {error ?? ""}</div>
              <button className="underline" onClick={() => checkHealth()}>Retry health check</button>
            </div>
          )}

          {healthOk === true && <div className="text-sm text-emerald-400">Backend reachable</div>}

          {loading && <div className="text-sm text-white/70">Loading users…</div>}

          {error && (
            <div className="text-sm text-red-400">
              Unable to load users. <button className="underline" onClick={() => location.reload()}>Retry</button>
            </div>
          )}

          {!loading && users && users.length === 0 && (
            <div className="text-sm">No demo users available on the server.</div>
          )}

          {!loading && users && users.length > 0 && (
            <div className="space-y-2">
              {users.map((u) => (
                <label key={u.id} className={`flex items-center justify-between p-3 rounded-lg border ${selected === u.id ? "border-sky-500 bg-white/6" : "border-white/6"}`}>
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-white/70">{u.role}</div>
                  </div>
                  <input type="radio" name="selected_user" checked={selected === u.id} onChange={() => setSelected(u.id)} />
                </label>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-3">
            <Button onClick={() => router.push("/dashboard")} className="flex-1">Continue as Guest</Button>
            <Button onClick={onContinue} className="flex-1">Continue</Button>
          </div>
        </div>

        <div className="text-center text-sm text-white/60 mt-6">No login required — just select your name to begin.</div>
      </div>
    </div>
  );
}

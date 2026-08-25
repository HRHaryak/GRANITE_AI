"use client";
import React, { useEffect, useState } from "react";
import { getSelectedUserId } from "../../lib/storage";
import { listBlocks } from "../../lib/api";
import type { BlockOut } from "../../lib/types";
import Link from "next/link";

export default function DashboardPage() {
  const [blocks, setBlocks] = useState<BlockOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = getSelectedUserId();

  useEffect(() => {
    listBlocks()
      .then((b) => setBlocks(b))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-white/70">Hello{userId ? ", operator" : ""}</div>
          <div className="text-2xl font-semibold">Dashboard</div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 p-4 rounded-lg">
            <div className="text-sm text-white/80">Total Blocks</div>
            <div className="text-2xl font-bold">{blocks ? blocks.length : "—"}</div>
          </div>
          <div className="bg-white/5 p-4 rounded-lg">
            <div className="text-sm text-white/80">Recent Capture</div>
            <div className="text-2xl font-bold">{blocks && blocks[0] ? blocks[0].block_code : "—"}</div>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold">Recent Blocks</div>
            <Link href="/capture" className="text-sm underline">Capture New</Link>
          </div>

          {loading && <div>Loading blocks…</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
          {!loading && blocks && blocks.length === 0 && <div className="text-sm">No granite blocks captured yet.</div>}
          {!loading && blocks && blocks.length > 0 && (
            <div className="space-y-2">
              {blocks.slice(0, 6).map((b) => (
                <Link key={b.id} href={`/blocks/${b.id}`} className="block p-3 bg-white/5 rounded-lg">
                  <div className="font-medium">{b.block_code}</div>
                  <div className="text-xs text-white/70">{new Date(b.capture_date).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

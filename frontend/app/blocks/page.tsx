"use client";
import React, { useEffect, useState } from "react";
import { listBlocks } from "../../lib/api";
import Link from "next/link";
import type { BlockOut } from "../../lib/types";

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<BlockOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBlocks()
      .then((b) => setBlocks(b))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="py-6">
      <div className="text-lg font-semibold mb-4">Blocks</div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && blocks && blocks.length === 0 && <div className="text-sm">No blocks yet.</div>}

      {!loading && blocks && blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((b) => (
            <Link key={b.id} href={`/blocks/${b.id}`} className="block p-3 bg-white/5 rounded-lg">
              <div className="font-medium">{b.block_code}</div>
              <div className="text-xs text-white/70">{new Date(b.capture_date).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

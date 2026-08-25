"use client";
import React, { useEffect, useState } from "react";
import { getBlock } from "../../../lib/api";
import { useParams, useRouter } from "next/navigation";
import type { BlockOut } from "../../../lib/types";

export default function BlockDetail() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [block, setBlock] = useState<BlockOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    getBlock(id)
      .then((b) => setBlock(b))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return <div className="py-6">Block ID missing</div>;

  return (
    <div className="py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-semibold">Block {block?.block_code || id}</div>
        <button onClick={() => router.back()} className="text-sm underline">Back</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
      {block && (
        <div className="space-y-2">
          <div className="p-4 bg-white/5 rounded-lg">
            <div className="text-sm text-white/70">Status</div>
            <div className="font-medium">{block.status}</div>
          </div>

          <div className="p-4 bg-white/5 rounded-lg">
            <div className="text-sm text-white/70">Details</div>
            <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(block, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

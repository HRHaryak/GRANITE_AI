"use client";
import React, { useEffect, useState } from "react";
import { getQuarries } from "../../lib/api";
import type { Quarry } from "../../lib/types";

export default function QuarriesPage() {
  const [quarries, setQuarries] = useState<Quarry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuarries()
      .then((q) => setQuarries(q))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="py-6">
      <div className="text-lg font-semibold mb-4">Quarries</div>
      {loading && <div>Loading…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
      {!loading && quarries && quarries.length === 0 && <div className="text-sm">No quarries configured.</div>}
      {!loading && quarries && (
        <div className="space-y-2">
          {quarries.map((q) => (
            <div key={q.id} className="p-3 bg-white/5 rounded-lg">
              <div className="font-medium">{q.quarry_name}</div>
              <div className="text-xs text-white/70">{q.quarry_code}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

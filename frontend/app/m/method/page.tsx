"use client";

import { Header } from "../../../components/m/ui";
import { MethodCard } from "../../../components/m/MethodCard";
import { useSettings } from "../../../lib/m/store";

export default function MethodPage() {
  const s = useSettings();
  return (
    <div>
      <Header title="How it works" subtitle="Measurement and useful-block method" back="/m" />
      <div className="p-4">
        <MethodCard v={{ allowanceCm: s.dressingCm, density: s.density, tolerancePct: s.tolerancePct }} />
      </div>
    </div>
  );
}

import { Sparkles } from "lucide-react";

export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="surface rounded-2xl py-16 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[#e8b45e]/30 bg-[#e8b45e]/10 text-[#e8b45e]"><Sparkles size={20} /></div>
      <div className="text-lg font-medium">{title}</div>
      {subtitle && <div className="mx-auto mt-2 max-w-sm text-sm text-white/40">{subtitle}</div>}
    </div>
  );
}

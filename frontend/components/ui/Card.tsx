export default function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/5 rounded-xl p-4 shadow-sm border border-white/6 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "text-slate-100",
  className = "",
  valueClassName = "text-2xl font-semibold",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center ${className}`.trim()}
    >
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-1 tabular-nums ${valueClassName} ${accent}`.trim()}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

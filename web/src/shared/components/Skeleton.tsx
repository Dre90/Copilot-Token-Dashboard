import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function SkeletonCard({
  lines = 2,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/40 p-3 ${className}`.trim()}>
      <Skeleton className="h-3 w-24 rounded" />
      <Skeleton className="mt-3 h-8 w-28 rounded" />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} className="mt-2 h-3 w-full rounded" />
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-slate-800/70">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-3 py-2">
              <Skeleton className="h-3 w-full rounded" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/40 p-4 ${className}`.trim()}
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-36 rounded" />
      <Skeleton className="mt-3 h-64 w-full rounded-xl" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full rounded mt-2 first:mt-0" />
      ))}
    </div>
  );
}

export function SkeletonBlock({ children }: { children?: ReactNode }) {
  return <div className="animate-pulse-subtle">{children}</div>;
}

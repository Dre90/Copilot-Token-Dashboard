import { useEffect, useState } from "react";
import { api, openStream, type Summary, type StreamEvent } from "../../../api/client";
import { Skeleton, SkeletonCard, SkeletonList } from "../../../shared/components";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function LiveDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [connected, setConnected] = useState(false);
  const [recent, setRecent] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api.summary();
        if (!cancelled) setSummary(s);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const close = openStream(
      (ev) => setRecent((prev) => [ev, ...prev].slice(0, 30)),
      (open) => setConnected(open),
    );
    return close;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span
          className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        {connected ? "Live connected" : "Disconnected"}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          <>
            <SkeletonCard className="h-[96px]" />
            <SkeletonCard className="h-[96px]" />
            <SkeletonCard className="h-[96px]" />
            <SkeletonCard className="h-[96px]" />
          </>
        ) : (
          <>
            <Tile label="Spans (5 min)" value={summary ? String(summary.spans) : "–"} />
            <Tile
              label="Avg latency"
              value={summary ? `${summary.avgSpanMs.toFixed(0)} ms` : "–"}
            />
            <Tile label="Events (5 min)" value={summary ? String(summary.events) : "–"} />
            <Tile
              label="Tokens (5 min)"
              value={summary ? summary.tokens.toLocaleString("nb-NO") : "–"}
              hint="metrics with 'token' in name"
            />
          </>
        )}
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-2">Latest events</h2>
        {loading ? (
          <SkeletonList rows={8} />
        ) : (
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900 max-h-96 overflow-auto">
            {recent.length === 0 && (
              <li className="p-4 text-sm text-slate-500">Waiting for data from VS Code Copilot…</li>
            )}
            {recent.map((ev, i) => (
              <li key={i} className="p-3 text-sm flex gap-3 items-baseline">
                <span
                  className={
                    ev.type === "span"
                      ? "text-sky-400"
                      : ev.type === "metric"
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }
                >
                  {ev.type}
                </span>
                <span className="text-slate-300 truncate">
                  {ev.type === "span" && `${ev.data.name} · ${ev.data.durationMs.toFixed(1)}ms`}
                  {ev.type === "metric" && `${ev.data.name} = ${ev.data.value}`}
                  {ev.type === "event" && JSON.stringify(ev.data).slice(0, 160)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {loading && <Skeleton className="h-1 w-full" />}
    </div>
  );
}

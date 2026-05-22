import { useEffect, useState } from "react";
import { api, type Span } from "../../../api/client";
import { Skeleton, SkeletonList, SkeletonTableRows } from "../../../shared/components";

function formatTs(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toLocaleString("nb-NO");
}

export function TraceTable() {
  const [spans, setSpans] = useState<Span[]>([]);
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [detail, setDetail] = useState<Span[]>([]);
  const [loadingSpans, setLoadingSpans] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setLoadingSpans(true);
    api
      .traces(200)
      .then(setSpans)
      .catch(() => {})
      .finally(() => setLoadingSpans(false));
    const id = setInterval(
      () =>
        api
          .traces(200)
          .then(setSpans)
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!openTrace) {
      setDetail([]);
      setLoadingDetail(false);
      return;
    }
    setLoadingDetail(true);
    api
      .trace(openTrace)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [openTrace]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left px-3 py-2">Start</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-right px-3 py-2">Duration</th>
              <th className="text-left px-3 py-2">Trace</th>
            </tr>
          </thead>
          <tbody className="bg-slate-950">
            {loadingSpans && <SkeletonTableRows rows={8} cols={4} />}
            {!loadingSpans && spans.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No spans yet.
                </td>
              </tr>
            )}
            {spans.map((s) => (
              <tr
                key={s.span_id}
                onClick={() => setOpenTrace(s.trace_id)}
                className="border-t border-slate-800 hover:bg-slate-900 cursor-pointer"
              >
                <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                  {formatTs(s.start_ns)}
                </td>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.duration_ms.toFixed(1)} ms</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {s.trace_id.slice(0, 12)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openTrace && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Trace {openTrace.slice(0, 16)}…</h3>
            <button
              onClick={() => setOpenTrace(null)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
          {loadingDetail ? (
            <SkeletonList rows={6} />
          ) : (
            <ul className="space-y-1 text-sm font-mono">
              {detail.map((s) => (
                <li key={s.span_id} className="flex gap-3">
                  <span className="text-slate-500">{s.duration_ms.toFixed(1).padStart(8)} ms</span>
                  <span>
                    {s.parent_span_id ? "↳" : "•"} {s.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loadingSpans && <Skeleton className="h-1 w-full" />}
    </div>
  );
}

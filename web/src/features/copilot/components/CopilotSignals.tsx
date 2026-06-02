import { useEffect, useMemo, useState } from "react";
import {
  copilotApi,
  type CopilotSignalsHookRow,
  type CopilotSignalsRepoRow,
  type CopilotSignalsResponse,
  type CopilotSignalsToolRow,
} from "../../../api/copilot";
import { LoadingStatus, Skeleton } from "../../../shared/components";

const WINDOWS = ["24h", "7d", "30d", "90d"] as const;

function fmtInt(n: number): string {
  return n.toLocaleString("nb-NO");
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  const cents = n * 100;
  if (cents >= 0.001) return `${cents.toFixed(3)}¢`;
  return "<0.001¢";
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function TopList<T>({
  rows,
  render,
  empty,
}: {
  rows: T[];
  render: (row: T) => React.ReactNode;
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="text-xs text-slate-500">{empty}</div>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row, i) => (
        <li key={i}>{render(row)}</li>
      ))}
    </ul>
  );
}

export function CopilotSignalsPage() {
  const [windowSel, setWindowSel] = useState<(typeof WINDOWS)[number]>("7d");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [data, setData] = useState<CopilotSignalsResponse | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void copilotApi
      .signals(windowSel, "all", 8)
      .then((res) => {
        if (!active) return;
        setData(res);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [windowSel]);

  const repoTop = useMemo(() => data?.repos.slice(0, 5) ?? [], [data]);
  const toolTop = useMemo(() => data?.tools.slice(0, 5) ?? [], [data]);
  const hookTop = useMemo(() => data?.hooks.slice(0, 5) ?? [], [data]);

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Copilot Signals</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Window</span>
          <select
            value={windowSel}
            onChange={(e) => setWindowSel(e.target.value as (typeof WINDOWS)[number])}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
            disabled={loading}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-slate-400">
        {failed ? (
          <span className="text-rose-300">Failed to load signal aggregates.</span>
        ) : loading || !data ? (
          <LoadingStatus loading text="Loading signals..." />
        ) : (
          <span>
            {fmtInt(data.calls_with_signals)} signal-tagged calls of {fmtInt(data.total_calls)}{" "}
            total calls
          </span>
        )}
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Repo Context</div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-20 rounded" />
              ) : (
                <div className="mt-2 text-3xl font-semibold text-amber-300 tabular-nums">
                  {fmtInt(data?.repos.length ?? 0)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">Distinct repos</div>
          </div>

          {!loading && (
            <TopList<CopilotSignalsRepoRow>
              rows={repoTop}
              empty="No repo attributes found yet."
              render={(row) => (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs">
                  <div className="text-slate-200 truncate">{row.repo}</div>
                  <div className="mt-1 flex items-center justify-between text-slate-400 tabular-nums">
                    <span>{fmtInt(row.calls)} calls</span>
                    <span>{fmtPct(row.share_pct)}</span>
                    <span className="text-amber-300">{fmtCost(row.total_cost)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Tools</div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-20 rounded" />
              ) : (
                <div className="mt-2 text-3xl font-semibold text-cyan-300 tabular-nums">
                  {fmtInt(data?.tools.length ?? 0)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">Distinct tools</div>
          </div>

          {!loading && (
            <TopList<CopilotSignalsToolRow>
              rows={toolTop}
              empty="No tool attributes found yet."
              render={(row) => (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs">
                  <div className="text-slate-200 truncate">{row.tool}</div>
                  <div className="mt-1 flex items-center justify-between text-slate-400 tabular-nums">
                    <span>{fmtInt(row.calls)} calls</span>
                    <span>{fmtMs(row.avg_duration_ms)}</span>
                    <span className="text-cyan-300">{fmtCost(row.total_cost)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Hooks</div>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-20 rounded" />
              ) : (
                <div className="mt-2 text-3xl font-semibold text-emerald-300 tabular-nums">
                  {fmtInt(data?.hooks.length ?? 0)}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">Distinct hooks</div>
          </div>

          {!loading && (
            <TopList<CopilotSignalsHookRow>
              rows={hookTop}
              empty="No hook attributes found yet."
              render={(row) => (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs">
                  <div className="text-slate-200 truncate">{row.hook}</div>
                  <div className="mt-1 flex items-center justify-between text-slate-400 tabular-nums">
                    <span>
                      {fmtInt(row.success)}/{fmtInt(row.total)} success
                    </span>
                    <span
                      className={row.success_rate_pct >= 90 ? "text-emerald-300" : "text-amber-300"}
                    >
                      {fmtPct(row.success_rate_pct)}
                    </span>
                  </div>
                </div>
              )}
            />
          )}
        </article>
      </section>
    </main>
  );
}

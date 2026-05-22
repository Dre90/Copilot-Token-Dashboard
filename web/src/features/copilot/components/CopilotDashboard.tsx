import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  copilotApi,
  openCopilotStream,
  type CopilotCall,
  type CopilotSummary,
} from "../../../api/copilot";
import {
  LoadingStatus,
  Skeleton,
  SkeletonCard,
  SkeletonTableRows,
  StatCard,
} from "../../../shared/components";

const WINDOWS = [
  { value: "5m", label: "5 min" },
  { value: "1h", label: "1 h" },
  { value: "today", label: "Today" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
];

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
function fmtTime(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toLocaleTimeString("nb-NO", { hour12: false });
}

function fmtTodaySpan(nowMs: number): string {
  const now = new Date(nowMs);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = nowMs - start.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return `00:00 -> now (${hours}h ${mins}m)`;
}

export function CopilotDashboard() {
  const [windowSel, setWindowSel] = useState("today");
  const [agent, setAgent] = useState("all");
  const [agents, setAgents] = useState<string[]>([]);
  const [summary, setSummary] = useState<CopilotSummary | null>(null);
  const [calls, setCalls] = useState<CopilotCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const reloadTimer = useRef<number | null>(null);
  const requestSeq = useRef(0);

  const reload = useCallback(
    async (showLoading = false) => {
      const seq = ++requestSeq.current;
      if (showLoading) {
        setLoading(true);
        setSummary(null);
        setCalls([]);
      }
      try {
        const [s, c, a] = await Promise.all([
          copilotApi.summary(windowSel, agent),
          copilotApi.calls(windowSel, agent, 500),
          copilotApi.agents(),
        ]);
        if (seq !== requestSeq.current) return;
        setSummary(s);
        setCalls(c);
        setAgents(a);
      } catch {
        /* ignore */
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [windowSel, agent],
  );

  useEffect(() => {
    void reload(true);
  }, [reload]);

  useEffect(() => {
    return openCopilotStream(() => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(reload, 400);
    }, setConnected);
  }, [reload]);

  const onReset = () => {
    setAgent("all");
    setWindowSel("today");
  };
  const onClearAll = async () => {
    if (!confirm("Delete ALL telemetry from the database. Are you sure?")) return;
    await copilotApi.clear();
    await reload();
  };

  const inputFresh = summary?.input_fresh_tokens ?? 0;
  const inputTotal = summary?.input_total_tokens ?? 0;

  const totalCalls = summary?.calls ?? 0;

  const visibleCalls = useMemo(() => calls, [calls]);
  const todaySpanHint = useMemo(() => {
    if (windowSel !== "today") return "";
    return fmtTodaySpan(Date.now());
  }, [windowSel, summary]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-base font-semibold tracking-tight">Copilot Token Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm w-full md:w-auto">
            <span className="text-slate-400">Agent</span>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm min-w-0 w-full sm:w-[220px] md:w-auto md:min-w-[140px]"
              disabled={loading}
            >
              <option value="all">All agents</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              value={windowSel}
              onChange={(e) => setWindowSel(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm w-full sm:w-auto"
              disabled={loading}
            >
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>

            {todaySpanHint && (
              <span className="hidden sm:inline text-xs text-slate-500 tabular-nums">
                {todaySpanHint}
              </span>
            )}

            <LoadingStatus loading={loading} />

            <span
              className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`}
              title={connected ? "Live connected" : "Disconnected"}
            />

            <button
              onClick={onReset}
              className="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 whitespace-nowrap"
              disabled={loading}
            >
              Reset
            </button>
            <button
              onClick={onClearAll}
              className="px-2 py-1 rounded border border-rose-700 text-rose-300 hover:bg-rose-900/40 whitespace-nowrap"
              disabled={loading}
            >
              Clear All
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {loading ? (
            <>
              <SkeletonCard className="h-[108px]" />
              <SkeletonCard className="h-[108px]" />
              <SkeletonCard className="h-[108px]" />
              <SkeletonCard className="h-[108px]" />
              <SkeletonCard className="h-[108px]" />
            </>
          ) : (
            <>
              <StatCard
                label="Input (Fresh)"
                value={fmtInt(inputFresh)}
                sub={`of ${fmtInt(inputTotal)} input`}
                accent="text-sky-400"
                className="rounded-xl bg-slate-900/70 p-4"
                valueClassName="text-3xl font-bold"
              />
              <StatCard
                label="Cache Read"
                value={fmtInt(summary?.cache_read_tokens ?? 0)}
                sub="~90% discount"
                accent="text-cyan-400"
                className="rounded-xl bg-slate-900/70 p-4"
                valueClassName="text-3xl font-bold"
              />
              <StatCard
                label="Cache Creation"
                value={fmtInt(summary?.cache_creation_tokens ?? 0)}
                sub="Anthropic write"
                accent="text-pink-400"
                className="rounded-xl bg-slate-900/70 p-4"
                valueClassName="text-3xl font-bold"
              />
              <StatCard
                label="Output"
                value={fmtInt(summary?.output_tokens ?? 0)}
                sub={`${totalCalls} calls`}
                accent="text-emerald-400"
                className="rounded-xl bg-slate-900/70 p-4"
                valueClassName="text-3xl font-bold"
              />
              <StatCard
                label="Cost"
                value={summary ? `$${summary.total_cost.toFixed(4)}` : "$0"}
                sub={summary ? `${summary.credits.toFixed(2)} credits` : undefined}
                accent="text-amber-300"
                className="rounded-xl bg-slate-900/70 p-4"
                valueClassName="text-3xl font-bold"
              />
            </>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-normal">Time</th>
                  <th className="text-left px-3 py-2 font-normal">Model</th>
                  <th className="text-left px-3 py-2 font-normal">Agent</th>
                  <th className="text-right px-3 py-2 font-normal">Input</th>
                  <th className="text-right px-3 py-2 font-normal">Cache Read</th>
                  <th className="text-right px-3 py-2 font-normal">Cache Write</th>
                  <th className="text-right px-3 py-2 font-normal">Output</th>
                  <th className="text-right px-3 py-2 font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {loading && <SkeletonTableRows rows={8} cols={8} />}
                {!loading && visibleCalls.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      <div className="space-y-3">
                        <div>No LLM calls recorded yet. Use Copilot Chat to generate data.</div>
                        {summary && !summary.has_any_telemetry && (
                          <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100">
                            If you expect telemetry here and nothing appears, enable OTel in VS
                            Code:
                            <div className="mt-2 font-mono text-xs text-amber-200">
                              "github.copilot.chat.otel.enabled": true
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  visibleCalls.map((c) => (
                    <tr
                      key={c.span_id}
                      className="border-t border-slate-800/70 hover:bg-slate-800/40 relative"
                      onMouseEnter={() => setHoverId(c.span_id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <td className="px-3 py-2 text-slate-500 font-mono text-xs">
                        {fmtTime(c.start_ns)}
                      </td>
                      <td className="px-3 py-2 text-amber-200 font-mono text-xs">
                        {c.model || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-300 truncate max-w-[180px]">
                        {c.agent || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-sky-400">
                        ↓ {fmtInt(c.input_tokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-cyan-400">
                        {c.cache_read_tokens ? `↻ ${fmtInt(c.cache_read_tokens)}` : "·"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-pink-400">
                        {c.cache_creation_tokens ? `+ ${fmtInt(c.cache_creation_tokens)}` : "·"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                        ↑ {fmtInt(c.output_tokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-300 relative">
                        {fmtCost(c.total_cost)}
                        {hoverId === c.span_id && (
                          <div className="hidden md:block absolute right-2 top-full mt-1 z-10 rounded border border-slate-700 bg-slate-950 p-3 text-left font-mono text-xs space-y-0.5 w-56 shadow-xl">
                            <div>Fresh input : {fmtCost(c.input_cost)}</div>
                            <div>Cache read : {fmtCost(c.cache_read_cost)}</div>
                            <div>Cache write : {fmtCost(c.cache_creation_cost)}</div>
                            <div>Output : {fmtCost(c.output_cost)}</div>
                            <div className="border-t border-slate-700 mt-1 pt-1">
                              Total : {fmtCost(c.total_cost)}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {loading && <Skeleton className="h-1 w-full" />}
        </section>
      </main>
    </div>
  );
}

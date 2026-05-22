import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api, type Span } from "../../../api/client";
import { copilotApi, type CopilotBucket, type CopilotCall } from "../../../api/copilot";
import {
  buildCacheImpact,
  buildForecast,
  buildHourlyHeatmap,
  buildModelPerformance,
  buildModelEfficiency,
  buildOperationsByDay,
  buildToolUsage,
  detectAnomalies,
  summarizeToday,
} from "../lib/copilotInsights";
import { CopilotHistoryToolbar, type HistoryBucket, type HistoryView } from "./";
import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonList,
  SkeletonTableRows,
  StatCard,
} from "../../../shared/components";

const BUCKETS: Array<{ value: HistoryBucket; label: string }> = [
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
  { value: "year", label: "Per year" },
];

function fmtInt(n: number): string {
  return n.toLocaleString("nb-NO");
}
function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  const c = n * 100;
  if (c >= 0.001) return `${c.toFixed(3)}¢`;
  return "<0.001¢";
}
function fmtTime(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toLocaleTimeString("nb-NO", { hour12: false });
}
function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function CopilotHistory({
  agent,
  agents,
  onAgentChange,
}: {
  agent: string;
  agents: string[];
  onAgentChange: (a: string) => void;
}) {
  const [view, setView] = useState<HistoryView>("today");
  const [bucket, setBucket] = useState<HistoryBucket>("day");
  const [data, setData] = useState<CopilotBucket[]>([]);
  const [todayCalls, setTodayCalls] = useState<CopilotCall[]>([]);
  const [baselineCalls, setBaselineCalls] = useState<CopilotCall[]>([]);
  const [analysisCalls, setAnalysisCalls] = useState<CopilotCall[]>([]);
  const [analysisSpans, setAnalysisSpans] = useState<Span[]>([]);
  const [dailyCost, setDailyCost] = useState<CopilotBucket[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const trendsRequestSeq = useRef(0);
  const detailsRequestSeq = useRef(0);

  useEffect(() => {
    const seq = ++trendsRequestSeq.current;
    setTrendsLoading(true);
    setData([]);
    copilotApi
      .timeseries(bucket, agent)
      .then((rows) => {
        if (seq !== trendsRequestSeq.current) return;
        setData(rows);
      })
      .catch(() => {
        if (seq !== trendsRequestSeq.current) return;
        setData([]);
      })
      .finally(() => {
        if (seq === trendsRequestSeq.current) setTrendsLoading(false);
      });
  }, [bucket, agent]);

  useEffect(() => {
    const seq = ++detailsRequestSeq.current;
    setDetailsLoading(true);
    setTodayCalls([]);
    setBaselineCalls([]);
    setAnalysisCalls([]);
    setDailyCost([]);
    setAnalysisSpans([]);
    Promise.all([
      copilotApi.calls("today", agent, 5000),
      copilotApi.calls("7d", agent, 5000),
      copilotApi.calls("30d", agent, 5000),
      copilotApi.timeseries("day", agent, "62d"),
      api.traces(
        2000,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
      ),
    ])
      .then(([today, baseline, analysis, daySeries, spans]) => {
        if (seq !== detailsRequestSeq.current) return;
        setTodayCalls(today);
        setBaselineCalls(baseline);
        setAnalysisCalls(analysis);
        setDailyCost(daySeries);
        setAnalysisSpans(spans);
      })
      .catch(() => {
        if (seq !== detailsRequestSeq.current) return;
        setTodayCalls([]);
        setBaselineCalls([]);
        setAnalysisCalls([]);
        setDailyCost([]);
        setAnalysisSpans([]);
      })
      .finally(() => {
        if (seq === detailsRequestSeq.current) setDetailsLoading(false);
      });
  }, [agent]);

  const totals = data.reduce(
    (a, b) => ({
      calls: a.calls + b.calls,
      input: a.input + b.input_tokens,
      output: a.output + b.output_tokens,
      cacheR: a.cacheR + b.cache_read_tokens,
      cacheC: a.cacheC + b.cache_creation_tokens,
      cost: a.cost + b.cost,
    }),
    { calls: 0, input: 0, output: 0, cacheR: 0, cacheC: 0, cost: 0 },
  );

  const todayTotals = useMemo(() => summarizeToday(todayCalls), [todayCalls]);

  const anomalyData = useMemo(
    () => detectAnomalies(todayCalls, baselineCalls),
    [baselineCalls, todayCalls],
  );

  const forecast = useMemo(() => buildForecast(dailyCost), [dailyCost]);
  const heatmap = useMemo(() => buildHourlyHeatmap(analysisCalls), [analysisCalls]);
  const modelEfficiency = useMemo(
    () => buildModelEfficiency(analysisCalls).slice(0, 12),
    [analysisCalls],
  );
  const modelPerformance = useMemo(
    () => buildModelPerformance(analysisCalls).slice(0, 10),
    [analysisCalls],
  );
  const operationsByDay = useMemo(() => buildOperationsByDay(analysisSpans), [analysisSpans]);
  const toolUsage = useMemo(() => buildToolUsage(analysisSpans), [analysisSpans]);
  const topTools = useMemo(() => toolUsage.slice(0, 10), [toolUsage]);
  const cacheImpact = useMemo(() => buildCacheImpact(analysisCalls), [analysisCalls]);
  const cacheTrend = useMemo(() => dailyCost.slice(-30), [dailyCost]);

  const executive = useMemo(() => {
    const totalInput = analysisCalls.reduce((sum, c) => sum + c.input_tokens, 0);
    const totalOutput = analysisCalls.reduce((sum, c) => sum + c.output_tokens, 0);
    const toolCalls = toolUsage.reduce((sum, t) => sum + t.count, 0);
    const totalOps = operationsByDay.reduce((sum, d) => sum + d.chat + d.tool + d.other, 0);
    const avgLatency = analysisCalls.length
      ? analysisCalls.reduce((sum, c) => sum + c.duration_ms, 0) / analysisCalls.length
      : 0;
    const ttftValues = analysisCalls
      .map((c) => c.ttft_ms)
      .filter((n): n is number => typeof n === "number" && n > 0);
    const avgTtft = ttftValues.length
      ? ttftValues.reduce((sum, n) => sum + n, 0) / ttftValues.length
      : 0;

    return {
      totalOps,
      totalInput,
      totalOutput,
      toolCalls,
      avgLatency,
      avgTtft,
    };
  }, [analysisCalls, operationsByDay, toolUsage]);

  const heatColor = (intensity: number): string => {
    if (intensity <= 0) return "rgba(51, 65, 85, 0.25)";
    return `rgba(56, 189, 248, ${0.2 + intensity * 0.75})`;
  };

  return (
    <div className="space-y-6">
      <CopilotHistoryToolbar
        agent={agent}
        agents={agents}
        onAgentChange={onAgentChange}
        view={view}
        onViewChange={setView}
        bucket={bucket}
        onBucketChange={setBucket}
        bucketOptions={BUCKETS}
        controlsDisabled={detailsLoading || trendsLoading}
        bucketDisabled={trendsLoading}
        loading={view === "trends" ? trendsLoading : detailsLoading}
        summary={
          view === "trends" && trendsLoading ? (
            <Skeleton className="h-4 w-48 rounded" />
          ) : view !== "trends" && detailsLoading ? (
            <Skeleton className="h-4 w-52 rounded" />
          ) : view === "trends" ? (
            <>
              {fmtInt(totals.calls)} calls ·{" "}
              {fmtInt(totals.input + totals.cacheR + totals.cacheC + totals.output)} tokens ·{" "}
              <span className="text-amber-300">{fmtCost(totals.cost)}</span>
            </>
          ) : (
            <>
              {fmtInt(todayTotals.calls)} calls today · {fmtInt(todayTotals.tokens)} tokens ·{" "}
              <span className="text-amber-300">{fmtCost(todayTotals.cost)}</span>
            </>
          )
        }
      />

      {view === "today" && (
        <>
          {detailsLoading ? (
            <>
              <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
              </section>
              <SkeletonList rows={5} />
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <SkeletonTableRows rows={6} cols={6} />
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <>
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Today</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <StatCard label="Calls" value={fmtInt(todayTotals.calls)} />
                  <StatCard
                    label="Tokens"
                    value={fmtInt(todayTotals.tokens)}
                    accent="text-sky-300"
                  />
                  <StatCard
                    label="Cost today"
                    value={fmtCost(todayTotals.cost)}
                    accent="text-amber-300"
                  />
                  <StatCard
                    label="Avg latency"
                    value={
                      todayTotals.calls ? fmtMs(todayTotals.duration / todayTotals.calls) : "0ms"
                    }
                    accent="text-emerald-300"
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Spikes today
                </h2>
                <div className="text-xs text-slate-500 mb-3">
                  Baseline (7d): median cost {fmtCost(anomalyData.costMedian)} · median latency{" "}
                  {fmtMs(anomalyData.latencyMedian)}
                </div>
                <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/50">
                  {anomalyData.rows.length === 0 && (
                    <li className="p-3 text-sm text-slate-500">
                      No significant spikes detected today.
                    </li>
                  )}
                  {anomalyData.rows.map(({ call, reason }) => (
                    <li
                      key={call.span_id}
                      className="p-3 text-sm grid grid-cols-[90px_1fr_auto] gap-3 items-baseline"
                    >
                      <span className="text-slate-500 font-mono text-xs">
                        {fmtTime(call.start_ns)}
                      </span>
                      <span className="text-slate-300 truncate">
                        {reason} · {call.model || "unknown model"} · {call.agent || "unknown agent"}
                      </span>
                      <span className="text-amber-300 tabular-nums">
                        {fmtCost(call.total_cost)} · {fmtMs(call.duration_ms)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800 text-sm uppercase tracking-widest text-slate-500">
                  Today's timeline
                </div>
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 font-normal">Time</th>
                      <th className="text-left px-3 py-2 font-normal">Model</th>
                      <th className="text-left px-3 py-2 font-normal">Agent</th>
                      <th className="text-right px-3 py-2 font-normal">Tokens</th>
                      <th className="text-right px-3 py-2 font-normal">Latency</th>
                      <th className="text-right px-3 py-2 font-normal">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayCalls.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                          No calls recorded today.
                        </td>
                      </tr>
                    )}
                    {todayCalls.slice(0, 120).map((c) => (
                      <tr
                        key={c.span_id}
                        className="border-t border-slate-800/70 hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">
                          {fmtTime(c.start_ns)}
                        </td>
                        <td className="px-3 py-2 text-amber-200 font-mono text-xs truncate max-w-[220px]">
                          {c.model || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-300 truncate max-w-[180px]">
                          {c.agent || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                          {fmtInt(
                            c.input_tokens +
                              c.cache_read_tokens +
                              c.cache_creation_tokens +
                              c.output_tokens,
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                          {fmtMs(c.duration_ms)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {fmtCost(c.total_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}

      {view === "insights" && (
        <>
          {detailsLoading ? (
            <>
              <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
                <SkeletonCard className="h-[104px]" />
              </section>
              <SkeletonChart />
              <SkeletonChart />
              <SkeletonChart />
              <SkeletonList rows={8} />
            </>
          ) : (
            <>
              <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Total operations
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                    {fmtInt(executive.totalOps)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Total input tokens
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-sky-300 tabular-nums">
                    {fmtInt(executive.totalInput)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Total output tokens
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-300 tabular-nums">
                    {fmtInt(executive.totalOutput)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Tool calls
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-pink-300 tabular-nums">
                    {fmtInt(executive.toolCalls)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Avg response time
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-amber-300 tabular-nums">
                    {fmtMs(executive.avgLatency)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    Avg TTFT
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-orange-300 tabular-nums">
                    {executive.avgTtft > 0 ? fmtMs(executive.avgTtft) : "n/a"}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Operations over time (30d)
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={operationsByDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--chart-tooltip-bg)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--chart-tooltip-text)",
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="chat" name="Chat" stackId="o" fill="#38bdf8" />
                      <Bar dataKey="tool" name="Tool" stackId="o" fill="#a855f7" />
                      <Bar dataKey="other" name="Other" stackId="o" fill="#22c55e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Model performance
                </h2>
                <div className="text-xs text-slate-500 mb-3">
                  Avg/P90 response duration and P50/P90 TTFT by model.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead className="text-slate-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-3 py-2 font-normal">Model</th>
                        <th className="text-right px-3 py-2 font-normal">Calls</th>
                        <th className="text-right px-3 py-2 font-normal">Avg duration</th>
                        <th className="text-right px-3 py-2 font-normal">P90 duration</th>
                        <th className="text-right px-3 py-2 font-normal">P50 TTFT</th>
                        <th className="text-right px-3 py-2 font-normal">P90 TTFT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelPerformance.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                            No model performance data available.
                          </td>
                        </tr>
                      )}
                      {modelPerformance.map((m) => (
                        <tr
                          key={m.model}
                          className="border-t border-slate-800/70 hover:bg-slate-800/40"
                        >
                          <td className="px-3 py-2 text-slate-300">{m.model}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(m.calls)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmtMs(m.avgLatency)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmtMs(m.p90Latency)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.p50Ttft > 0 ? fmtMs(m.p50Ttft) : "n/a"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.p90Ttft > 0 ? fmtMs(m.p90Ttft) : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Tool usage analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topTools} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis type="number" stroke="#64748b" fontSize={11} />
                        <YAxis
                          type="category"
                          dataKey="tool"
                          stroke="#64748b"
                          fontSize={11}
                          width={180}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--chart-tooltip-bg)",
                            border: "1px solid var(--chart-tooltip-border)",
                            color: "var(--chart-tooltip-text)",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" name="Invocations" fill="#a855f7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 overflow-auto max-h-72">
                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                      Top tools
                    </div>
                    <ul className="space-y-1 text-sm">
                      {topTools.length === 0 && (
                        <li className="text-slate-500">No tool spans found.</li>
                      )}
                      {topTools.map((t) => (
                        <li key={t.tool} className="flex justify-between gap-3">
                          <span className="text-slate-300 truncate">{t.tool}</span>
                          <span className="tabular-nums text-slate-400">{fmtInt(t.count)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">Forecast</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-widest">
                      This month
                    </div>
                    <div className="mt-1 text-xl tabular-nums text-amber-300">
                      {fmtCost(forecast.currentMonthCost)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-widest">
                      Month forecast
                    </div>
                    <div className="mt-1 text-xl tabular-nums text-amber-200">
                      {fmtCost(forecast.projectedMonthCost)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-widest">
                      Avg per day
                    </div>
                    <div className="mt-1 text-xl tabular-nums text-slate-200">
                      {fmtCost(forecast.avgPerDay)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-widest">
                      Previous month
                    </div>
                    <div className="mt-1 text-xl tabular-nums text-slate-200">
                      {fmtCost(forecast.prevMonthCost)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Anomaly thresholds
                </h2>
                <div className="text-sm text-slate-300">
                  Cost threshold:{" "}
                  <span className="text-amber-300 tabular-nums">
                    {fmtCost(anomalyData.costThreshold)}
                  </span>{" "}
                  · Latency threshold:{" "}
                  <span className="text-emerald-300 tabular-nums">
                    {" "}
                    {fmtMs(anomalyData.latencyThreshold)}
                  </span>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Activity heatmap (30d)
                </h2>
                <div className="text-xs text-slate-500 mb-3">
                  Color shows tokens per weekday/hour. Darker cells = more activity.
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[64px_repeat(24,minmax(20px,1fr))] gap-1 text-[10px] text-slate-500 mb-1">
                      <div />
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="text-center">
                          {h}
                        </div>
                      ))}
                    </div>
                    {Array.from({ length: 7 }, (_, weekday) => (
                      <div
                        key={weekday}
                        className="grid grid-cols-[64px_repeat(24,minmax(20px,1fr))] gap-1 mb-1"
                      >
                        <div className="text-[11px] text-slate-400 self-center">
                          {heatmap.cells.find((c) => c.weekday === weekday)?.weekdayLabel}
                        </div>
                        {Array.from({ length: 24 }, (_, hour) => {
                          const cell = heatmap.cells.find(
                            (c) => c.weekday === weekday && c.hour === hour,
                          );
                          return (
                            <div
                              key={`${weekday}-${hour}`}
                              className="h-5 rounded-sm border border-slate-800"
                              style={{
                                backgroundColor: heatColor(cell?.intensity ?? 0),
                              }}
                              title={`${cell?.weekdayLabel ?? ""} ${hour}:00 · ${fmtInt(cell?.calls ?? 0)} calls · ${fmtInt(cell?.tokens ?? 0)} tokens · ${fmtCost(cell?.cost ?? 0)}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Model efficiency (30d)
                </h2>
                <div className="text-xs text-slate-500 mb-3">
                  X = avg latency, Y = avg cost per call, bubble size = number of calls.
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        type="number"
                        dataKey="avgLatency"
                        name="Latency"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `${Math.round(v)}ms`}
                      />
                      <YAxis
                        type="number"
                        dataKey="avgCost"
                        name="Cost"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => fmtCost(v)}
                      />
                      <ZAxis type="number" dataKey="calls" range={[50, 500]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={{
                          background: "var(--chart-tooltip-bg)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--chart-tooltip-text)",
                          fontSize: 12,
                        }}
                        formatter={(value, key) => {
                          const n = toNumber(value);
                          if (key === "avgCost") return fmtCost(n);
                          if (key === "avgLatency") return fmtMs(n);
                          return fmtInt(n);
                        }}
                        labelFormatter={(_, p) =>
                          p?.[0]?.payload?.model ? `Model: ${p[0].payload.model}` : ""
                        }
                      />
                      <Scatter data={modelEfficiency} fill="#f59e0b" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-400">
                  {modelEfficiency.map((m) => (
                    <div
                      key={m.model}
                      className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1"
                    >
                      {m.model} · {m.calls} calls · {fmtMs(m.avgLatency)} · {fmtCost(m.avgCost)} /
                      call
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Cache impact (30d)
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center mb-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Cache Read
                    </div>
                    <div className="mt-1 text-xl font-semibold text-cyan-300 tabular-nums">
                      {fmtInt(cacheImpact.cacheReadTokens)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Cache Write
                    </div>
                    <div className="mt-1 text-xl font-semibold text-pink-300 tabular-nums">
                      {fmtInt(cacheImpact.cacheWriteTokens)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Cache Read Cost
                    </div>
                    <div className="mt-1 text-xl font-semibold text-amber-300 tabular-nums">
                      {fmtCost(cacheImpact.cacheReadCost)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Estimated savings
                    </div>
                    <div className="mt-1 text-xl font-semibold text-emerald-300 tabular-nums">
                      {fmtCost(cacheImpact.estimatedSavedCost)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Cache share
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-200 tabular-nums">
                      {cacheImpact.cachedSharePct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cacheTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--chart-tooltip-bg)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--chart-tooltip-text)",
                          fontSize: 12,
                        }}
                        formatter={(v) => fmtInt(toNumber(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="input_tokens" name="Fresh input" stackId="c" fill="#38bdf8" />
                      <Bar
                        dataKey="cache_read_tokens"
                        name="Cache read"
                        stackId="c"
                        fill="#22d3ee"
                      />
                      <Bar
                        dataKey="cache_creation_tokens"
                        name="Cache write"
                        stackId="c"
                        fill="#ec4899"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {view === "trends" && (
        <>
          {trendsLoading ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <SkeletonTableRows rows={8} cols={7} />
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <>
              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Tokens per {bucket}
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--chart-tooltip-bg)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--chart-tooltip-text)",
                          fontSize: 12,
                        }}
                        formatter={(v) => fmtInt(toNumber(v))}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="input_tokens" name="Input" stackId="t" fill="#38bdf8" />
                      <Bar
                        dataKey="cache_read_tokens"
                        name="Cache Read"
                        stackId="t"
                        fill="#22d3ee"
                      />
                      <Bar
                        dataKey="cache_creation_tokens"
                        name="Cache Write"
                        stackId="t"
                        fill="#ec4899"
                      />
                      <Bar dataKey="output_tokens" name="Output" stackId="t" fill="#34d399" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">
                  Cost per {bucket}
                </h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#64748b" fontSize={11} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--chart-tooltip-bg)",
                          border: "1px solid var(--chart-tooltip-border)",
                          color: "var(--chart-tooltip-text)",
                          fontSize: 12,
                        }}
                        formatter={(v) => fmtCost(toNumber(v))}
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        name="Cost"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 font-normal">Bucket</th>
                      <th className="text-right px-3 py-2 font-normal">Calls</th>
                      <th className="text-right px-3 py-2 font-normal">Input</th>
                      <th className="text-right px-3 py-2 font-normal">Cache R</th>
                      <th className="text-right px-3 py-2 font-normal">Cache W</th>
                      <th className="text-right px-3 py-2 font-normal">Output</th>
                      <th className="text-right px-3 py-2 font-normal">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                          No data in the selected interval.
                        </td>
                      </tr>
                    )}
                    {[...data].reverse().map((r) => (
                      <tr
                        key={r.bucket}
                        className="border-t border-slate-800/70 hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.bucket}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-400">
                          {fmtInt(r.input_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-cyan-400">
                          {fmtInt(r.cache_read_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-pink-400">
                          {fmtInt(r.cache_creation_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                          {fmtInt(r.output_tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {fmtCost(r.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

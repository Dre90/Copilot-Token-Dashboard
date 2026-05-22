import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
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
import type { HistoryPrefetchedData } from "../lib/historyRouteLoader";
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

const TODAY_DEFAULT_SORTING: SortingState = [{ id: "time", desc: true }];
const MODEL_PERF_DEFAULT_SORTING: SortingState = [{ id: "calls", desc: true }];
const TRENDS_DEFAULT_SORTING: SortingState = [{ id: "bucket", desc: true }];

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

function sortIndicator(sorted: false | "asc" | "desc"): string {
  if (sorted === "asc") return "▲";
  if (sorted === "desc") return "▼";
  return "↕";
}

export function CopilotHistory({
  agent,
  agents,
  onAgentChange,
  view,
  onViewChange,
  initialBucket,
  onBucketChange,
  prefetched,
}: {
  agent: string;
  agents: string[];
  onAgentChange: (a: string) => void;
  view: HistoryView;
  onViewChange: (next: HistoryView) => void;
  initialBucket?: HistoryBucket;
  onBucketChange?: (next: HistoryBucket) => void;
  prefetched?: HistoryPrefetchedData;
}) {
  const [bucket, setBucket] = useState<HistoryBucket>(initialBucket ?? "day");
  const hasPrefetchedTrends = prefetched?.trendsDay !== undefined;
  const hasPrefetchedDetails =
    prefetched?.todayCalls !== undefined &&
    prefetched?.baselineCalls !== undefined &&
    prefetched?.analysisCalls !== undefined &&
    prefetched?.dailyCost !== undefined &&
    prefetched?.analysisSpans !== undefined;
  const [data, setData] = useState<CopilotBucket[]>(() => prefetched?.trendsDay ?? []);
  const [todayCalls, setTodayCalls] = useState<CopilotCall[]>(() => prefetched?.todayCalls ?? []);
  const [baselineCalls, setBaselineCalls] = useState<CopilotCall[]>(
    () => prefetched?.baselineCalls ?? [],
  );
  const [analysisCalls, setAnalysisCalls] = useState<CopilotCall[]>(
    () => prefetched?.analysisCalls ?? [],
  );
  const [analysisSpans, setAnalysisSpans] = useState<Span[]>(() => prefetched?.analysisSpans ?? []);
  const [dailyCost, setDailyCost] = useState<CopilotBucket[]>(() => prefetched?.dailyCost ?? []);
  const [trendsLoading, setTrendsLoading] = useState(
    () => view === "trends" && !hasPrefetchedTrends,
  );
  const [detailsLoading, setDetailsLoading] = useState(
    () => view !== "trends" && !hasPrefetchedDetails,
  );
  const trendsRequestSeq = useRef(0);
  const detailsRequestSeq = useRef(0);
  const skipInitialTrendsFetch = useRef(hasPrefetchedTrends);
  const skipInitialDetailsFetch = useRef(hasPrefetchedDetails);

  useEffect(() => {
    if (view !== "trends") {
      setTrendsLoading(false);
      return;
    }

    if (skipInitialTrendsFetch.current && bucket === "day") {
      skipInitialTrendsFetch.current = false;
      setTrendsLoading(false);
      return;
    }
    skipInitialTrendsFetch.current = false;

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
  }, [bucket, agent, view]);

  useEffect(() => {
    if (view === "trends") {
      setDetailsLoading(false);
      return;
    }

    if (skipInitialDetailsFetch.current) {
      skipInitialDetailsFetch.current = false;
      setDetailsLoading(false);
      return;
    }
    skipInitialDetailsFetch.current = false;

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
  }, [agent, view]);

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

  useEffect(() => {
    setBucket(initialBucket ?? "day");
  }, [initialBucket]);

  const handleBucketChange = (next: HistoryBucket) => {
    setBucket(next);
    onBucketChange?.(next);
  };

  const [todaySorting, setTodaySorting] = useState<SortingState>([...TODAY_DEFAULT_SORTING]);
  const [modelPerfSorting, setModelPerfSorting] = useState<SortingState>([
    ...MODEL_PERF_DEFAULT_SORTING,
  ]);
  const [trendsSorting, setTrendsSorting] = useState<SortingState>([...TRENDS_DEFAULT_SORTING]);
  const [todayPage, setTodayPage] = useState(1);
  const [todayPageSize, setTodayPageSize] = useState(25);
  const [trendsPage, setTrendsPage] = useState(1);
  const [trendsPageSize, setTrendsPageSize] = useState(25);

  const todayTimelineRows = useMemo(() => todayCalls.slice(0, 120), [todayCalls]);
  const todayColumns = useMemo<ColumnDef<CopilotCall>[]>(
    () => [
      {
        accessorFn: (row) => Number(BigInt(row.start_ns) / 1_000_000n),
        id: "time",
        header: "Time",
      },
      { accessorKey: "model", header: "Model" },
      { accessorKey: "agent", header: "Agent" },
      {
        accessorFn: (row) =>
          row.input_tokens + row.cache_read_tokens + row.cache_creation_tokens + row.output_tokens,
        id: "tokens",
        header: "Tokens",
      },
      { accessorKey: "duration_ms", header: "Latency" },
      { accessorKey: "total_cost", header: "Cost" },
    ],
    [],
  );
  const todayTable = useReactTable({
    data: todayTimelineRows,
    columns: todayColumns,
    state: { sorting: todaySorting },
    onSortingChange: setTodaySorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const todaySortedRows = todayTable.getRowModel().rows;
  const todayTotalPages = Math.max(1, Math.ceil(todaySortedRows.length / todayPageSize));
  const todayPagedRows = todaySortedRows.slice(
    (todayPage - 1) * todayPageSize,
    todayPage * todayPageSize,
  );

  const modelPerfColumns = useMemo<ColumnDef<(typeof modelPerformance)[number]>[]>(
    () => [
      { accessorKey: "model", header: "Model" },
      { accessorKey: "calls", header: "Calls" },
      { accessorKey: "avgLatency", header: "Avg duration" },
      { accessorKey: "p90Latency", header: "P90 duration" },
      { accessorKey: "p50Ttft", header: "P50 TTFT" },
      { accessorKey: "p90Ttft", header: "P90 TTFT" },
    ],
    [],
  );
  const modelPerformanceTable = useReactTable({
    data: modelPerformance,
    columns: modelPerfColumns,
    state: { sorting: modelPerfSorting },
    onSortingChange: setModelPerfSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const trendsRows = useMemo(() => [...data].reverse(), [data]);
  const trendsColumns = useMemo<ColumnDef<CopilotBucket>[]>(
    () => [
      { accessorKey: "bucket", header: "Bucket" },
      { accessorKey: "calls", header: "Calls" },
      { accessorKey: "input_tokens", header: "Input" },
      { accessorKey: "cache_read_tokens", header: "Cache R" },
      { accessorKey: "cache_creation_tokens", header: "Cache W" },
      { accessorKey: "output_tokens", header: "Output" },
      { accessorKey: "cost", header: "Cost" },
    ],
    [],
  );
  const trendsTable = useReactTable({
    data: trendsRows,
    columns: trendsColumns,
    state: { sorting: trendsSorting },
    onSortingChange: setTrendsSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const trendsSortedRows = trendsTable.getRowModel().rows;
  const trendsTotalPages = Math.max(1, Math.ceil(trendsSortedRows.length / trendsPageSize));
  const trendsPagedRows = trendsSortedRows.slice(
    (trendsPage - 1) * trendsPageSize,
    trendsPage * trendsPageSize,
  );

  useEffect(() => {
    setTodayPage(1);
  }, [todaySorting, todayCalls.length, todayPageSize]);

  useEffect(() => {
    setTrendsPage(1);
  }, [trendsSorting, trendsRows.length, trendsPageSize]);

  useEffect(() => {
    setTodayPage((p) => Math.min(Math.max(1, p), todayTotalPages));
  }, [todayTotalPages]);

  useEffect(() => {
    setTrendsPage((p) => Math.min(Math.max(1, p), trendsTotalPages));
  }, [trendsTotalPages]);

  return (
    <div className="space-y-6">
      <CopilotHistoryToolbar
        agent={agent}
        agents={agents}
        onAgentChange={onAgentChange}
        view={view}
        onViewChange={onViewChange}
        bucket={bucket}
        onBucketChange={handleBucketChange}
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
                      className="p-3 text-sm grid grid-cols-1 sm:grid-cols-[90px_1fr_auto] gap-2 sm:gap-3 items-baseline"
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
                <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-sm uppercase tracking-widest text-slate-500">
                    Today's timeline
                  </div>
                  <button
                    type="button"
                    onClick={() => setTodaySorting([...TODAY_DEFAULT_SORTING])}
                    className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Reset sort
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-slate-500 text-xs uppercase tracking-wider">
                      {todayTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header, idx) => (
                            <th
                              key={header.id}
                              className={`${idx <= 2 ? "text-left" : "text-right"} px-3 py-2 font-normal`}
                            >
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="inline-flex items-center gap-1 hover:text-slate-200"
                              >
                                <span>
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {sortIndicator(header.column.getIsSorted())}
                                </span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {todayTimelineRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                            No calls recorded today.
                          </td>
                        </tr>
                      )}
                      {todayPagedRows.map(({ original: c }) => (
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
                </div>
                {todaySortedRows.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
                    <div>
                      Showing {(todayPage - 1) * todayPageSize + 1}-
                      {Math.min(todayPage * todayPageSize, todaySortedRows.length)} of{" "}
                      {todaySortedRows.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="history-today-page-size" className="text-slate-500">
                        Rows
                      </label>
                      <select
                        id="history-today-page-size"
                        value={todayPageSize}
                        onChange={(e) => setTodayPageSize(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                      >
                        {[25, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setTodayPage((p) => Math.max(1, p - 1))}
                        disabled={todayPage <= 1}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span className="tabular-nums text-slate-300 min-w-16 text-center">
                        {todayPage}/{todayTotalPages}
                      </span>
                      <button
                        onClick={() => setTodayPage((p) => Math.min(todayTotalPages, p + 1))}
                        disabled={todayPage >= todayTotalPages}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-sm uppercase tracking-widest text-slate-500">
                    Model performance
                  </h2>
                  <button
                    type="button"
                    onClick={() => setModelPerfSorting([...MODEL_PERF_DEFAULT_SORTING])}
                    className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Reset sort
                  </button>
                </div>
                <div className="text-xs text-slate-500 mb-3">
                  Avg/P90 response duration and P50/P90 TTFT by model.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead className="text-slate-500 text-xs uppercase tracking-wider">
                      {modelPerformanceTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header, idx) => (
                            <th
                              key={header.id}
                              className={`${idx === 0 ? "text-left" : "text-right"} px-3 py-2 font-normal`}
                            >
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="inline-flex items-center gap-1 hover:text-slate-200"
                              >
                                <span>
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {sortIndicator(header.column.getIsSorted())}
                                </span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {modelPerformance.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                            No model performance data available.
                          </td>
                        </tr>
                      )}
                      {modelPerformanceTable.getRowModel().rows.map(({ original: m }) => (
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
                <div className="flex items-center justify-end border-b border-slate-800 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setTrendsSorting([...TRENDS_DEFAULT_SORTING])}
                    className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Reset sort
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <tbody>
                      <SkeletonTableRows rows={8} cols={7} />
                    </tbody>
                  </table>
                </div>
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-slate-500 text-xs uppercase tracking-wider">
                      {trendsTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header, idx) => (
                            <th
                              key={header.id}
                              className={`${idx === 0 ? "text-left" : "text-right"} px-3 py-2 font-normal`}
                            >
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="inline-flex items-center gap-1 hover:text-slate-200"
                              >
                                <span>
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {sortIndicator(header.column.getIsSorted())}
                                </span>
                              </button>
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {trendsRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                            No data in the selected interval.
                          </td>
                        </tr>
                      )}
                      {trendsPagedRows.map(({ original: r }) => (
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
                </div>
                {trendsSortedRows.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
                    <div>
                      Showing {(trendsPage - 1) * trendsPageSize + 1}-
                      {Math.min(trendsPage * trendsPageSize, trendsSortedRows.length)} of{" "}
                      {trendsSortedRows.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="history-trends-page-size" className="text-slate-500">
                        Rows
                      </label>
                      <select
                        id="history-trends-page-size"
                        value={trendsPageSize}
                        onChange={(e) => setTrendsPageSize(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                      >
                        {[25, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setTrendsPage((p) => Math.max(1, p - 1))}
                        disabled={trendsPage <= 1}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span className="tabular-nums text-slate-300 min-w-16 text-center">
                        {trendsPage}/{trendsTotalPages}
                      </span>
                      <button
                        onClick={() => setTrendsPage((p) => Math.min(trendsTotalPages, p + 1))}
                        disabled={trendsPage >= trendsTotalPages}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
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

const LIVE_DEFAULT_SORTING: SortingState = [{ id: "time", desc: true }];

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
const NOK_RATE = 9.26;
function fmtNok(usd: number): string {
  return `kr ${(usd * NOK_RATE).toFixed(2)}`;
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

function sortIndicator(sorted: false | "asc" | "desc"): string {
  if (sorted === "asc") return "▲";
  if (sorted === "desc") return "▼";
  return "↕";
}

export function CopilotDashboard() {
  const [windowSel, setWindowSel] = useState("today");
  const [agent, setAgent] = useState("all");
  const [agents, setAgents] = useState<string[]>([]);
  const [summary, setSummary] = useState<CopilotSummary | null>(null);
  const [calls, setCalls] = useState<CopilotCall[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([...LIVE_DEFAULT_SORTING]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    call: CopilotCall;
    x: number;
    y: number;
  } | null>(null);
  const reloadTimer = useRef<number | null>(null);
  const requestSeq = useRef(0);

  const placeTooltip = (clientX: number, clientY: number) => {
    const pad = 12;
    const width = 224;
    const height = 128;
    const x = Math.max(pad, Math.min(clientX + 14, window.innerWidth - width - pad));
    const y = Math.max(pad, Math.min(clientY + 14, window.innerHeight - height - pad));
    return { x, y };
  };

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

  const tableColumns = useMemo<ColumnDef<CopilotCall>[]>(
    () => [
      {
        accessorFn: (row) => Number(BigInt(row.start_ns) / 1_000_000n),
        id: "time",
        header: "Time",
      },
      { accessorKey: "model", header: "Model" },
      { accessorKey: "agent", header: "Agent" },
      { accessorKey: "input_tokens", header: "Input" },
      { accessorKey: "cache_read_tokens", header: "Cache Read" },
      { accessorKey: "cache_creation_tokens", header: "Cache Write" },
      { accessorKey: "output_tokens", header: "Output" },
      { accessorKey: "total_cost", header: "Cost" },
    ],
    [],
  );

  const table = useReactTable({
    data: calls,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const visibleCalls = useMemo(
    () => table.getRowModel().rows.map((row) => row.original),
    [table, calls, sorting],
  );
  const totalPages = Math.max(1, Math.ceil(visibleCalls.length / pageSize));
  const pagedCalls = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleCalls.slice(start, start + pageSize);
  }, [visibleCalls, page, pageSize]);
  const todaySpanHint = useMemo(() => {
    if (windowSel !== "today") return "";
    return fmtTodaySpan(Date.now());
  }, [windowSel, summary]);

  useEffect(() => {
    setPage(1);
  }, [windowSel, agent, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

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
                sub={
                  summary
                    ? `${summary.credits.toFixed(2)} credits · ${fmtNok(summary.total_cost)}`
                    : undefined
                }
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
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header, idx) => {
                      const sorted = header.column.getIsSorted();
                      const alignClass = idx <= 2 ? "text-left" : "text-right";
                      return (
                        <th key={header.id} className={`${alignClass} px-3 py-2 font-normal`}>
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-slate-200"
                          >
                            <span>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {sortIndicator(sorted)}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                ))}
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
                  pagedCalls.map((c) => (
                    <tr
                      key={c.span_id}
                      className="border-t border-slate-800/70 hover:bg-slate-800/40 relative"
                      onMouseEnter={(e) => {
                        setHoverId(c.span_id);
                        const { x, y } = placeTooltip(e.clientX, e.clientY);
                        setHoverTooltip({ call: c, x, y });
                      }}
                      onMouseMove={(e) => {
                        if (hoverId !== c.span_id) return;
                        const { x, y } = placeTooltip(e.clientX, e.clientY);
                        setHoverTooltip({ call: c, x, y });
                      }}
                      onMouseLeave={() => {
                        setHoverId(null);
                        setHoverTooltip(null);
                      }}
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
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!loading && visibleCalls.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
              <div className="tabular-nums">
                Showing {fmtInt((page - 1) * pageSize + 1)}-
                {fmtInt(Math.min(page * pageSize, visibleCalls.length))} of{" "}
                {fmtInt(visibleCalls.length)}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="live-page-size" className="text-slate-500">
                  Rows
                </label>
                <select
                  id="live-page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setSorting([...LIVE_DEFAULT_SORTING])}
                  className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Reset sort
                </button>

                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="tabular-nums text-slate-300 min-w-20 text-center">
                  Page {fmtInt(page)} / {fmtInt(totalPages)}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {hoverTooltip && (
            <div
              className="hidden md:block pointer-events-none fixed z-40 rounded border border-slate-700 bg-slate-950 p-3 text-left font-mono text-xs space-y-0.5 w-56 shadow-xl"
              style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
            >
              <div>Fresh input : {fmtCost(hoverTooltip.call.input_cost)}</div>
              <div>Cache read : {fmtCost(hoverTooltip.call.cache_read_cost)}</div>
              <div>Cache write : {fmtCost(hoverTooltip.call.cache_creation_cost)}</div>
              <div>Output : {fmtCost(hoverTooltip.call.output_cost)}</div>
              <div className="border-t border-slate-700 mt-1 pt-1">
                Total : {fmtCost(hoverTooltip.call.total_cost)}
              </div>
            </div>
          )}
          {loading && <Skeleton className="h-1 w-full" />}
        </section>
      </main>
    </div>
  );
}

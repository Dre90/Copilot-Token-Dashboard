import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { toBlob } from "html-to-image";
import {
  copilotApi,
  type CopilotLeaderboardResponse,
  type CopilotLeaderboardRow,
} from "../../../api/copilot";
import { Skeleton, SkeletonTableRows } from "../../../shared/components";

type Theme = "dark" | "light";

type CombinedRow = {
  model: string;
  week?: CopilotLeaderboardRow;
  prevWeek?: CopilotLeaderboardRow;
  month?: CopilotLeaderboardRow;
  weekRank: number | null;
  monthRank: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TEAM_COMPARE_DEFAULT_SORTING: SortingState = [{ id: "weekCost", desc: true }];

function fmtInt(n: number): string {
  return n.toLocaleString("nb-NO");
}

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  const cents = n * 100;
  if (cents >= 0.001) return `${cents.toFixed(3)}¢`;
  return "<0.001¢";
}

function fromNsToDate(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toLocaleDateString("en-GB");
}

function totalTokens(row?: CopilotLeaderboardRow): number {
  if (!row) return 0;
  return row.input_tokens + row.cache_read_tokens + row.cache_creation_tokens + row.output_tokens;
}

function avgCostPerCall(row?: CopilotLeaderboardRow): number {
  if (!row || row.calls === 0) return 0;
  return row.total_cost / row.calls;
}

function cacheShare(row?: CopilotLeaderboardRow): number {
  if (!row) return 0;
  const inputSide = row.input_tokens + row.cache_read_tokens + row.cache_creation_tokens;
  if (inputSide === 0) return 0;
  return (row.cache_read_tokens / inputSide) * 100;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtSignedPct(n: number | null): string {
  if (n === null) return "new";
  if (n === 0) return "0.0%";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function sortIndicator(sorted: false | "asc" | "desc"): string {
  if (sorted === "asc") return "▲";
  if (sorted === "desc") return "▼";
  return "↕";
}

function TeamCompareHeader({
  capturing,
  onCopyScreenshot,
  shareMessage,
  showActions,
}: {
  capturing: boolean;
  onCopyScreenshot?: () => void;
  shareMessage: string;
  showActions: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Compare</h1>
          <p className="mt-1 text-sm text-slate-300 max-w-3xl">
            Share your local weekly and month-to-date Copilot usage with the team. This page is
            optimized for screenshot sharing in Slack so everyone can compare their own results.
          </p>
          {showActions && shareMessage && (
            <p className="mt-2 text-xs text-emerald-300">{shareMessage}</p>
          )}
        </div>
        {showActions && (
          <button
            type="button"
            onClick={onCopyScreenshot}
            disabled={capturing}
            className="px-3 py-1.5 text-sm rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-60"
          >
            {capturing ? "Capturing..." : "Copy Screenshot for Slack"}
          </button>
        )}
      </div>
    </section>
  );
}

function TeamCompareSummary({
  highlights,
  loading,
  month,
  monthTotal,
  week,
  weekTotal,
}: {
  highlights: {
    weekAvgCostPerCall: number;
    weekAvgTokensPerCall: number;
    weekCacheShare: number;
    weekOverWeekDelta: number | null;
  };
  loading: boolean;
  month: CopilotLeaderboardResponse | null;
  monthTotal: number;
  week: CopilotLeaderboardResponse | null;
  weekTotal: number;
}) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">Last 7 days</div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-28 rounded" />
        ) : (
          <div className="mt-2 text-3xl font-semibold text-amber-300 tabular-nums">
            {fmtCost(weekTotal)}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">
          {week?.from_ns && week?.to_ns && week.from_ns !== "0"
            ? `${fromNsToDate(week.from_ns)} -> ${fromNsToDate(week.to_ns)}`
            : "No data range"}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">Month to date</div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-28 rounded" />
        ) : (
          <div className="mt-2 text-3xl font-semibold text-cyan-300 tabular-nums">
            {fmtCost(monthTotal)}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">
          {month?.from_ns && month?.to_ns && month.from_ns !== "0"
            ? `${fromNsToDate(month.from_ns)} -> ${fromNsToDate(month.to_ns)}`
            : "No data range"}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">Avg cost / call</div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-28 rounded" />
        ) : (
          <div className="mt-2 text-3xl font-semibold text-emerald-300 tabular-nums">
            {fmtCost(highlights.weekAvgCostPerCall)}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">Average across your own last 7 days</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">Cache share / WoW</div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-28 rounded" />
        ) : (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <div className="text-3xl font-semibold text-sky-300 tabular-nums">
              {fmtPct(highlights.weekCacheShare)}
            </div>
            <div
              className={`text-sm font-medium tabular-nums ${
                highlights.weekOverWeekDelta === null
                  ? "text-slate-400"
                  : highlights.weekOverWeekDelta > 0
                    ? "text-rose-300"
                    : highlights.weekOverWeekDelta < 0
                      ? "text-emerald-300"
                      : "text-slate-300"
              }`}
            >
              {fmtSignedPct(highlights.weekOverWeekDelta)}
            </div>
          </div>
        )}
        <div className="mt-1 text-xs text-slate-500">
          Avg tokens/call: {loading ? "..." : fmtInt(Math.round(highlights.weekAvgTokensPerCall))}
        </div>
      </div>
    </section>
  );
}

function TeamCompareGuide() {
  const items = [
    { term: "7d", description: "The last 7 days." },
    {
      term: "MTD",
      description: "Month to date, from the first day of the current month until now.",
    },
    { term: "Avg/call", description: "Average cost per call for that period." },
    { term: "Cache %", description: "Share of input-side tokens served from cache." },
    { term: "WoW", description: "Week over week change compared with the previous 7-day period." },
    { term: "Tokens", description: "Combined input, cache read, cache write, and output tokens." },
  ];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm uppercase tracking-widest text-slate-500">Metric Guide</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.term} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-sm font-semibold text-amber-200">{item.term}</div>
            <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamCompareTable({
  captureMode,
  combined,
  loading,
  sorting,
  onSortingChange,
  showControls,
  onResetSorting,
}: {
  captureMode: boolean;
  combined: CombinedRow[];
  loading: boolean;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  showControls: boolean;
  onResetSorting?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const columns = useMemo<ColumnDef<CombinedRow>[]>(
    () => [
      { accessorKey: "model", header: "Model" },
      { accessorKey: "weekRank", header: "7d rank" },
      { accessorFn: (row) => row.week?.total_cost ?? 0, id: "weekCost", header: "7d cost" },
      { accessorFn: (row) => row.week?.calls ?? 0, id: "weekCalls", header: "7d calls" },
      {
        accessorFn: (row) => avgCostPerCall(row.week),
        id: "weekAvgCost",
        header: "7d avg/call",
      },
      {
        accessorFn: (row) => cacheShare(row.week),
        id: "weekCache",
        header: "7d cache %",
      },
      { accessorKey: "monthRank", header: "MTD rank" },
      { accessorFn: (row) => row.month?.total_cost ?? 0, id: "monthCost", header: "MTD cost" },
      { accessorFn: (row) => row.month?.calls ?? 0, id: "monthCalls", header: "MTD calls" },
      {
        accessorFn: (row) => avgCostPerCall(row.month),
        id: "monthAvgCost",
        header: "MTD avg/call",
      },
      {
        accessorFn: (row) =>
          pctDelta(row.week?.total_cost ?? 0, row.prevWeek?.total_cost ?? 0) ?? -999999,
        id: "wowCost",
        header: "WoW cost",
      },
    ],
    [],
  );

  const table = useReactTable({
    data: combined,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const rowsToRender = captureMode ? sortedRows : pagedRows;

  useEffect(() => {
    setPage(1);
  }, [sorting, combined.length, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      {showControls && (
        <div className="flex items-center justify-end border-b border-slate-800 px-3 py-2">
          <button
            type="button"
            onClick={onResetSorting}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Reset sort
          </button>
        </div>
      )}
      <div className={captureMode ? "" : "overflow-x-auto"}>
        <table className={`w-full ${captureMode ? "text-[13px]" : "min-w-[980px] text-sm"}`}>
          <thead className="text-slate-500 text-xs uppercase tracking-wider">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, idx) => {
                  const sorted = header.column.getIsSorted();
                  const alignClass = idx === 0 ? "text-left" : "text-right";
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
                        <span className="text-[10px] text-slate-500">{sortIndicator(sorted)}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && <SkeletonTableRows rows={8} cols={11} />}
            {!loading && combined.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  No team data available yet.
                </td>
              </tr>
            )}
            {!loading &&
              rowsToRender.map(({ original: row }) => {
                const wow = pctDelta(row.week?.total_cost ?? 0, row.prevWeek?.total_cost ?? 0);

                return (
                  <tr key={row.model} className="border-t border-slate-800/70">
                    <td className="px-3 py-2 text-slate-200 max-w-[260px] truncate">{row.model}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {row.weekRank ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                      {fmtCost(row.week?.total_cost ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {fmtInt(row.week?.calls ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                      {fmtCost(avgCostPerCall(row.week))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {fmtPct(cacheShare(row.week))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {row.monthRank ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-cyan-300">
                      {fmtCost(row.month?.total_cost ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {fmtInt(row.month?.calls ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                      {fmtCost(avgCostPerCall(row.month))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {wow === null ? (
                        <span className="text-slate-500">new</span>
                      ) : wow > 0 ? (
                        <span className="text-rose-300">+{fmtPct(wow)}</span>
                      ) : wow < 0 ? (
                        <span className="text-emerald-300">{fmtPct(wow)}</span>
                      ) : (
                        <span className="text-slate-300">0.0%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {showControls && !loading && sortedRows.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
          <div>
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sortedRows.length)} of{" "}
            {sortedRows.length}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="team-compare-page-size" className="text-slate-500">
              Rows
            </label>
            <select
              id="team-compare-page-size"
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="tabular-nums text-slate-300 min-w-16 text-center">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function TeamComparePage() {
  const [week, setWeek] = useState<CopilotLeaderboardResponse | null>(null);
  const [prevWeek, setPrevWeek] = useState<CopilotLeaderboardResponse | null>(null);
  const [month, setMonth] = useState<CopilotLeaderboardResponse | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  });
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [tableSorting, setTableSorting] = useState<SortingState>([...TEAM_COMPARE_DEFAULT_SORTING]);
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(root.getAttribute("data-theme") === "light" ? "light" : "dark");
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const now = Date.now();
    const weekFrom = new Date(now - 7 * DAY_MS).toISOString();
    const weekTo = new Date(now).toISOString();
    const prevWeekFrom = new Date(now - 14 * DAY_MS).toISOString();
    const prevWeekTo = new Date(now - 7 * DAY_MS).toISOString();

    Promise.all([
      copilotApi.leaderboardRange(weekFrom, weekTo, 30),
      copilotApi.leaderboardRange(prevWeekFrom, prevWeekTo, 30),
      copilotApi.leaderboard("mtd", 30),
    ])
      .then(([w, pw, m]) => {
        if (!active) return;
        setWeek(w);
        setPrevWeek(pw);
        setMonth(m);
      })
      .catch(() => {
        if (!active) return;
        setWeek({ window: "7d", from_ns: "0", to_ns: "0", rows: [] });
        setPrevWeek({ window: "7d", from_ns: "0", to_ns: "0", rows: [] });
        setMonth({ window: "mtd", from_ns: "0", to_ns: "0", rows: [] });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const combined = useMemo<CombinedRow[]>(() => {
    const weekRows = week?.rows ?? [];
    const prevWeekRows = prevWeek?.rows ?? [];
    const monthRows = month?.rows ?? [];

    const weekRank = new Map<string, number>();
    const monthRank = new Map<string, number>();
    const prevWeekByModel = new Map<string, CopilotLeaderboardRow>();
    weekRows.forEach((r, i) => weekRank.set(r.model, i + 1));
    monthRows.forEach((r, i) => monthRank.set(r.model, i + 1));
    prevWeekRows.forEach((r) => prevWeekByModel.set(r.model, r));

    const merged = new Map<string, CombinedRow>();

    for (const row of weekRows) {
      merged.set(row.model, {
        model: row.model,
        week: row,
        prevWeek: prevWeekByModel.get(row.model),
        month: undefined,
        weekRank: weekRank.get(row.model) ?? null,
        monthRank: monthRank.get(row.model) ?? null,
      });
    }

    for (const row of monthRows) {
      const current = merged.get(row.model);
      merged.set(row.model, {
        model: row.model,
        week: current?.week,
        prevWeek: current?.prevWeek ?? prevWeekByModel.get(row.model),
        month: row,
        weekRank: weekRank.get(row.model) ?? null,
        monthRank: monthRank.get(row.model) ?? null,
      });
    }

    return Array.from(merged.values()).sort((a, b) => {
      const aCost = (a.week?.total_cost ?? 0) + (a.month?.total_cost ?? 0);
      const bCost = (b.week?.total_cost ?? 0) + (b.month?.total_cost ?? 0);
      return bCost - aCost;
    });
  }, [month, prevWeek, week]);

  const weekTotal = useMemo(
    () => (week?.rows ?? []).reduce((sum, row) => sum + row.total_cost, 0),
    [week],
  );
  const monthTotal = useMemo(
    () => (month?.rows ?? []).reduce((sum, row) => sum + row.total_cost, 0),
    [month],
  );
  const weekCalls = useMemo(
    () => (week?.rows ?? []).reduce((sum, row) => sum + row.calls, 0),
    [week],
  );
  const weekTokens = useMemo(
    () => (week?.rows ?? []).reduce((sum, row) => sum + totalTokens(row), 0),
    [week],
  );
  const weekInputSideTokens = useMemo(
    () =>
      (week?.rows ?? []).reduce(
        (sum, row) => sum + row.input_tokens + row.cache_read_tokens + row.cache_creation_tokens,
        0,
      ),
    [week],
  );
  const prevWeekTotal = useMemo(
    () => (prevWeek?.rows ?? []).reduce((sum, row) => sum + row.total_cost, 0),
    [prevWeek],
  );
  const highlights = useMemo(
    () => ({
      weekAvgCostPerCall: weekCalls > 0 ? weekTotal / weekCalls : 0,
      weekAvgTokensPerCall: weekCalls > 0 ? weekTokens / weekCalls : 0,
      weekCacheShare:
        weekInputSideTokens > 0
          ? ((week?.rows ?? []).reduce((sum, row) => sum + row.cache_read_tokens, 0) /
              weekInputSideTokens) *
            100
          : 0,
      weekOverWeekDelta: pctDelta(weekTotal, prevWeekTotal),
    }),
    [prevWeekTotal, week, weekCalls, weekInputSideTokens, weekTokens, weekTotal],
  );

  const onCopyScreenshot = async () => {
    if (!captureRef.current || capturing) return;
    setCapturing(true);
    setShareMessage("");

    try {
      const blob = await toBlob(captureRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: theme === "light" ? "#f8fafc" : "#020617",
      });

      if (!blob) throw new Error("capture_failed");

      const canCopyImage =
        typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

      if (canCopyImage) {
        try {
          const item = new ClipboardItem({ "image/png": blob });
          await navigator.clipboard.write([item]);
          setShareMessage("Screenshot copied. You can paste directly into Slack.");
          return;
        } catch {
          // Fallback below for browsers with limited clipboard image support.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-compare-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setShareMessage(
        "Clipboard image copy is not available in this browser. PNG downloaded instead.",
      );
    } catch {
      setShareMessage("Screenshot capture failed. Falling back to print.");
      window.print();
    } finally {
      setCapturing(false);
    }
  };

  return (
    <>
      <div className="fixed left-[-10000px] top-0 pointer-events-none opacity-100">
        <div
          ref={captureRef}
          data-export-theme={theme}
          className="w-[1400px] bg-slate-950 text-slate-100 p-8 space-y-6"
        >
          <TeamCompareHeader capturing={capturing} shareMessage="" showActions={false} />
          <TeamCompareSummary
            highlights={highlights}
            loading={loading}
            month={month}
            monthTotal={monthTotal}
            week={week}
            weekTotal={weekTotal}
          />
          <TeamCompareTable
            captureMode={true}
            combined={combined}
            loading={loading}
            sorting={tableSorting}
            onSortingChange={setTableSorting}
            showControls={false}
          />
          <TeamCompareGuide />
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6">
        <TeamCompareHeader
          capturing={capturing}
          onCopyScreenshot={() => void onCopyScreenshot()}
          shareMessage={shareMessage}
          showActions={true}
        />
        <TeamCompareSummary
          highlights={highlights}
          loading={loading}
          month={month}
          monthTotal={monthTotal}
          week={week}
          weekTotal={weekTotal}
        />
        <TeamCompareTable
          captureMode={false}
          combined={combined}
          loading={loading}
          sorting={tableSorting}
          onSortingChange={setTableSorting}
          showControls={true}
          onResetSorting={() => setTableSorting([...TEAM_COMPARE_DEFAULT_SORTING])}
        />
        <TeamCompareGuide />
      </main>
    </>
  );
}

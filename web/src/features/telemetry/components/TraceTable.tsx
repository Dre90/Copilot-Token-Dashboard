import { useEffect, useState } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { api, type Span } from "../../../api/client";
import { Skeleton, SkeletonList, SkeletonTableRows } from "../../../shared/components";

const TRACE_DEFAULT_SORTING: SortingState = [{ id: "start", desc: true }];

function formatTs(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n);
  return new Date(ms).toLocaleString("nb-NO");
}

function sortIndicator(sorted: false | "asc" | "desc"): string {
  if (sorted === "asc") return "▲";
  if (sorted === "desc") return "▼";
  return "↕";
}

export function TraceTable() {
  const [spans, setSpans] = useState<Span[]>([]);
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [detail, setDetail] = useState<Span[]>([]);
  const [loadingSpans, setLoadingSpans] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([...TRACE_DEFAULT_SORTING]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const columns: ColumnDef<Span>[] = [
    {
      accessorFn: (row) => Number(BigInt(row.start_ns) / 1_000_000n),
      id: "start",
      header: "Start",
    },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "duration_ms", header: "Duration" },
    { accessorKey: "trace_id", header: "Trace" },
  ];

  const table = useReactTable({
    data: spans,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [sorting, spans.length, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

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
        <div className="flex items-center justify-end border-b border-slate-800 px-3 py-2">
          <button
            type="button"
            onClick={() => setSorting([...TRACE_DEFAULT_SORTING])}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Reset sort
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, idx) => {
                  const sorted = header.column.getIsSorted();
                  const alignClass = idx === 2 ? "text-right" : "text-left";
                  return (
                    <th key={header.id} className={`${alignClass} px-3 py-2`}>
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
          <tbody className="bg-slate-950">
            {loadingSpans && <SkeletonTableRows rows={8} cols={4} />}
            {!loadingSpans && spans.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No spans yet.
                </td>
              </tr>
            )}
            {pagedRows.map(({ original: s }) => (
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
        {!loadingSpans && sortedRows.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
            <div>
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, sortedRows.length)} of{" "}
              {sortedRows.length}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="trace-page-size" className="text-slate-500">
                Rows
              </label>
              <select
                id="trace-page-size"
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

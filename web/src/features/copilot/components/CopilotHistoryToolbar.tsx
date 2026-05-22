import type { ReactNode } from "react";
import { LoadingStatus } from "../../../shared/components";

export type HistoryView = "today" | "trends" | "insights";
export type HistoryBucket = "day" | "week" | "month" | "year";

export function CopilotHistoryToolbar({
  agent,
  agents,
  onAgentChange,
  view,
  onViewChange,
  bucket,
  onBucketChange,
  bucketOptions,
  controlsDisabled,
  bucketDisabled,
  loading,
  summary,
}: {
  agent: string;
  agents: string[];
  onAgentChange: (next: string) => void;
  view: HistoryView;
  onViewChange: (next: HistoryView) => void;
  bucket: HistoryBucket;
  onBucketChange: (next: HistoryBucket) => void;
  bucketOptions: Array<{ value: HistoryBucket; label: string }>;
  controlsDisabled: boolean;
  bucketDisabled: boolean;
  loading: boolean;
  summary: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
      <span className="text-slate-400">Agent</span>
      <select
        value={agent}
        onChange={(e) => onAgentChange(e.target.value)}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm min-w-0 w-full sm:w-[220px] md:w-auto md:min-w-[140px]"
        disabled={controlsDisabled}
      >
        <option value="all">All agents</option>
        {agents.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <div className="inline-flex rounded border border-slate-700 overflow-hidden w-full sm:w-auto">
        {[
          { value: "today", label: "Today" },
          { value: "trends", label: "Trends" },
          { value: "insights", label: "Insights" },
        ].map((v) => (
          <button
            key={v.value}
            onClick={() => onViewChange(v.value as HistoryView)}
            disabled={controlsDisabled}
            className={`px-3 py-1 text-sm flex-1 sm:flex-none ${
              view === v.value
                ? "bg-amber-500/20 text-amber-200"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "trends" && (
        <>
          <span className="text-slate-400 sm:ml-3">Bucket</span>
          <div className="inline-flex rounded border border-slate-700 overflow-hidden w-full sm:w-auto">
            {bucketOptions.map((b) => (
              <button
                key={b.value}
                onClick={() => onBucketChange(b.value)}
                disabled={bucketDisabled}
                className={`px-3 py-1 text-sm flex-1 sm:flex-none ${
                  bucket === b.value
                    ? "bg-amber-500/20 text-amber-200"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="w-full sm:w-auto sm:ml-auto text-xs text-slate-400 tabular-nums">
        {summary}
      </div>
      <LoadingStatus loading={loading} />
    </div>
  );
}

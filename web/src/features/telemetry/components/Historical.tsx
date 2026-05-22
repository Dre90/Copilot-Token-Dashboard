import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api, type MetricBucket, type MetricInfo, type MetricSeries } from "../../../api/client";
import { Skeleton } from "../../../shared/components";

const BUCKETS: { value: MetricBucket; label: string; rangeMs: number }[] = [
  { value: "hour", label: "Time", rangeMs: 24 * 60 * 60 * 1000 },
  { value: "day", label: "Day", rangeMs: 30 * 24 * 60 * 60 * 1000 },
  { value: "month", label: "Month", rangeMs: 365 * 24 * 60 * 60 * 1000 },
  { value: "year", label: "Year", rangeMs: 5 * 365 * 24 * 60 * 60 * 1000 },
];

export function Historical() {
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [bucket, setBucket] = useState<MetricBucket>("hour");
  const [series, setSeries] = useState<MetricSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(true);

  useEffect(() => {
    setLoadingList(true);
    api
      .metricsList()
      .then((list) => {
        setMetrics(list);
        if (list.length && !selected) setSelected(list[0].name);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingList(false));
  }, []);

  const range = useMemo(() => BUCKETS.find((b) => b.value === bucket)!, [bucket]);

  useEffect(() => {
    if (!selected) return;
    setLoadingSeries(true);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - range.rangeMs).toISOString();
    api
      .metricSeries(selected, bucket, from, to)
      .then(setSeries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingSeries(false));
  }, [selected, bucket, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-slate-400">Metric:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
          disabled={loadingList}
        >
          {metrics.length === 0 && <option value="">(none yet)</option>}
          {metrics.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.type})
            </option>
          ))}
        </select>

        <div className="flex rounded overflow-hidden border border-slate-700">
          {BUCKETS.map((b) => (
            <button
              key={b.value}
              onClick={() => setBucket(b.value)}
              className={`px-3 py-1 text-sm ${
                bucket === b.value
                  ? "bg-sky-600 text-white"
                  : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-rose-400 text-sm">{error}</div>}

      <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 h-96">
        {loadingSeries ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : series && series.points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--chart-tooltip-bg)",
                  border: "1px solid var(--chart-tooltip-border)",
                  color: "var(--chart-tooltip-text)",
                }}
              />
              <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-slate-500 text-sm">
            {selected ? "No data points in the selected period." : "Select a metric."}
          </div>
        )}
      </div>

      {series && (
        <div className="text-xs text-slate-500">
          Aggregation: {series.agg} · {series.points.length} buckets · window: {range.label}
        </div>
      )}
    </div>
  );
}

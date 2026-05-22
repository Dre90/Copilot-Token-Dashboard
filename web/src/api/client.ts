export type MetricInfo = { name: string; type: string; unit: string; count: number };
export type MetricBucket = "hour" | "day" | "month" | "year";
export type MetricSeries = {
  name: string;
  bucket: MetricBucket;
  agg: "SUM" | "AVG";
  points: { bucket: string; value: number; samples: number }[];
};
export type Span = {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: number;
  start_ns: string;
  end_ns: string;
  duration_ms: number;
  status_code: number;
  attributes: string;
};
export type EventRow = {
  id: number;
  timestamp_ns: string;
  severity: string;
  body: string;
  attributes: string;
  trace_id: string | null;
  span_id: string | null;
};
export type Summary = {
  windowMinutes: number;
  spans: number;
  avgSpanMs: number;
  events: number;
  tokens: number;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => get<Summary>("/api/summary"),
  metricsList: () => get<MetricInfo[]>("/api/metrics/list"),
  metricSeries: (name: string, bucket: MetricBucket, from?: string, to?: string) => {
    const p = new URLSearchParams({ name, bucket });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return get<MetricSeries>(`/api/metrics?${p.toString()}`);
  },
  traces: (limit = 100, from?: string, to?: string) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return get<Span[]>(`/api/traces?${p.toString()}`);
  },
  trace: (traceId: string) => get<Span[]>(`/api/traces/${traceId}`),
  events: (limit = 100) => get<EventRow[]>(`/api/events?limit=${limit}`),
};

export type StreamEvent =
  | {
      type: "span";
      data: {
        spanId: string;
        traceId: string;
        name: string;
        startNs: string;
        durationMs: number;
        statusCode: number;
      };
    }
  | { type: "metric"; data: { name: string; type: string; value: number; timestampNs: string } }
  | { type: "event"; data: Record<string, unknown> };

export function openStream(
  onEvent: (ev: StreamEvent) => void,
  onState?: (open: boolean) => void,
): () => void {
  const es = new EventSource("/api/stream");
  es.addEventListener("open", () => onState?.(true));
  es.addEventListener("error", () => onState?.(false));
  const handle = (type: StreamEvent["type"]) => (e: MessageEvent) => {
    try {
      onEvent({ type, data: JSON.parse(e.data) } as StreamEvent);
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("span", handle("span"));
  es.addEventListener("metric", handle("metric"));
  es.addEventListener("event", handle("event"));
  return () => es.close();
}

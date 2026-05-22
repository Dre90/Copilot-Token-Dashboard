export type CopilotCall = {
  span_id: string;
  trace_id: string;
  start_ns: string;
  duration_ms: number;
  ttft_ms?: number | null;
  model: string;
  agent: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_creation_cost: number;
  total_cost: number;
};

export type CopilotSummary = {
  calls: number;
  input_fresh_tokens: number;
  input_total_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  output_tokens: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_creation_cost: number;
  total_cost: number;
  credits: number;
  has_any_telemetry: boolean;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type CopilotBucket = {
  bucket: string;
  ts: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost: number;
};

export type CopilotLeaderboardRow = {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_cost: number;
  credits: number;
};

export type CopilotLeaderboardResponse = {
  window: string;
  from_ns: string;
  to_ns: string;
  rows: CopilotLeaderboardRow[];
};

export const copilotApi = {
  summary: (window = "24h", agent = "all") =>
    get<CopilotSummary>(`/api/copilot/summary?window=${window}&agent=${encodeURIComponent(agent)}`),
  calls: (window = "24h", agent = "all", limit = 500) =>
    get<CopilotCall[]>(
      `/api/copilot/calls?window=${window}&agent=${encodeURIComponent(agent)}&limit=${limit}`,
    ),
  agents: () => get<string[]>("/api/copilot/agents"),
  timeseries: (bucket: "day" | "week" | "month" | "year", agent = "all", window?: string) => {
    const qs = new URLSearchParams({ bucket, agent });
    if (window) qs.set("window", window);
    return get<CopilotBucket[]>(`/api/copilot/timeseries?${qs}`);
  },
  leaderboard: (window: "7d" | "mtd", limit = 25) =>
    get<CopilotLeaderboardResponse>(
      `/api/copilot/leaderboard?window=${window}&limit=${Math.max(1, Math.min(limit, 100))}`,
    ),
  leaderboardRange: (from: string, to: string, limit = 25) => {
    const qs = new URLSearchParams({ from, to, limit: String(Math.max(1, Math.min(limit, 100))) });
    return get<CopilotLeaderboardResponse>(`/api/copilot/leaderboard?${qs.toString()}`);
  },
  clear: async () => {
    const res = await fetch("/api/copilot/clear", { method: "DELETE" });
    if (!res.ok) throw new Error("clear failed");
  },
};

export function openCopilotStream(
  onSpan: () => void,
  onState?: (open: boolean) => void,
): () => void {
  const es = new EventSource("/api/stream");
  es.addEventListener("open", () => onState?.(true));
  es.addEventListener("error", () => onState?.(false));
  es.addEventListener("span", () => onSpan());
  return () => es.close();
}

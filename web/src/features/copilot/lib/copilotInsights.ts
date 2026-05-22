import type { Span } from "../../../api/client";
import type { CopilotBucket, CopilotCall } from "../../../api/copilot";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function totalTokens(c: CopilotCall): number {
  return c.input_tokens + c.cache_read_tokens + c.cache_creation_tokens + c.output_tokens;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function summarizeToday(calls: CopilotCall[]): {
  calls: number;
  tokens: number;
  cost: number;
  duration: number;
} {
  return calls.reduce(
    (a, c) => ({
      calls: a.calls + 1,
      tokens:
        a.tokens + c.input_tokens + c.cache_read_tokens + c.cache_creation_tokens + c.output_tokens,
      cost: a.cost + c.total_cost,
      duration: a.duration + c.duration_ms,
    }),
    { calls: 0, tokens: 0, cost: 0, duration: 0 },
  );
}

export function detectAnomalies(
  todayCalls: CopilotCall[],
  baselineCalls: CopilotCall[],
): {
  rows: Array<{ call: CopilotCall; reason: string; severity: number }>;
  costMedian: number;
  latencyMedian: number;
  costThreshold: number;
  latencyThreshold: number;
} {
  const sample = baselineCalls.slice(0, 3000);
  const costMedian = median(sample.map((c) => c.total_cost).filter((n) => n > 0));
  const latencyMedian = median(sample.map((c) => c.duration_ms).filter((n) => n > 0));
  const costThreshold = Math.max(costMedian * 3, 0.001);
  const latencyThreshold = Math.max(latencyMedian * 2.5, 4000);

  const rows = todayCalls
    .filter((c) => c.total_cost >= costThreshold || c.duration_ms >= latencyThreshold)
    .map((c) => {
      const costFactor = costMedian > 0 ? c.total_cost / costMedian : 0;
      const latencyFactor = latencyMedian > 0 ? c.duration_ms / latencyMedian : 0;
      return {
        call: c,
        reason:
          c.total_cost >= costThreshold && c.duration_ms >= latencyThreshold
            ? "High cost and latency"
            : c.total_cost >= costThreshold
              ? "Cost spike"
              : "Latency spike",
        severity: Math.max(costFactor || 0, latencyFactor || 0),
      };
    })
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8);

  return { rows, costMedian, latencyMedian, costThreshold, latencyThreshold };
}

export function buildForecast(
  dailyCost: CopilotBucket[],
  now = new Date(),
): {
  currentMonthCost: number;
  prevMonthCost: number;
  projectedMonthCost: number;
  avgPerDay: number;
} {
  const currentKey = monthKey(now);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prevMonthDate);

  const currentMonthCost = dailyCost
    .filter((d) => d.bucket.startsWith(currentKey))
    .reduce((sum, d) => sum + d.cost, 0);

  const prevMonthCost = dailyCost
    .filter((d) => d.bucket.startsWith(prevKey))
    .reduce((sum, d) => sum + d.cost, 0);

  const elapsedDays = Math.max(now.getDate(), 1);
  const avgPerDay = currentMonthCost / elapsedDays;
  const projectedMonthCost = avgPerDay * daysInMonth(now);

  return { currentMonthCost, prevMonthCost, projectedMonthCost, avgPerDay };
}

export type HeatmapCell = {
  weekday: number;
  weekdayLabel: string;
  hour: number;
  calls: number;
  tokens: number;
  cost: number;
  avgLatency: number;
  intensity: number;
};

export function buildHourlyHeatmap(calls: CopilotCall[]): {
  cells: HeatmapCell[];
  maxTokens: number;
} {
  const map = new Map<
    string,
    {
      weekday: number;
      hour: number;
      calls: number;
      tokens: number;
      cost: number;
      latency: number;
    }
  >();

  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      map.set(`${weekday}-${hour}`, {
        weekday,
        hour,
        calls: 0,
        tokens: 0,
        cost: 0,
        latency: 0,
      });
    }
  }

  for (const c of calls) {
    const ms = Number(BigInt(c.start_ns) / 1_000_000n);
    const d = new Date(ms);
    const weekday = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const key = `${weekday}-${hour}`;
    const row = map.get(key);
    if (!row) continue;
    row.calls += 1;
    row.tokens += totalTokens(c);
    row.cost += c.total_cost;
    row.latency += c.duration_ms;
  }

  const raw = Array.from(map.values()).map((r) => ({
    weekday: r.weekday,
    weekdayLabel: WEEKDAYS[r.weekday],
    hour: r.hour,
    calls: r.calls,
    tokens: r.tokens,
    cost: r.cost,
    avgLatency: r.calls ? r.latency / r.calls : 0,
  }));

  const maxTokens = raw.reduce((max, r) => Math.max(max, r.tokens), 0);
  const cells = raw.map((r) => ({
    ...r,
    intensity: maxTokens > 0 ? r.tokens / maxTokens : 0,
  }));

  return { cells, maxTokens };
}

export type ModelEfficiencyRow = {
  model: string;
  calls: number;
  avgLatency: number;
  avgCost: number;
  totalCost: number;
  totalTokens: number;
  tokensPerDollar: number;
};

export type ModelPerformanceRow = {
  model: string;
  calls: number;
  avgLatency: number;
  p90Latency: number;
  p50Ttft: number;
  p90Ttft: number;
};

export type OperationsByDayRow = {
  day: string;
  chat: number;
  tool: number;
  other: number;
};

export type ToolUsageRow = {
  tool: string;
  count: number;
};

function toDayKey(startNs: string): string {
  const ms = Number(BigInt(startNs) / 1_000_000n);
  return new Date(ms).toISOString().slice(0, 10);
}

function isToolSpanName(name: string): boolean {
  return /tool|invoke_tool|execute_tool|function\.call|tool_call/i.test(name);
}

function extractToolName(span: Span): string | null {
  if (isToolSpanName(span.name)) return span.name;
  try {
    const attrs = JSON.parse(span.attributes ?? "{}");
    const candidate =
      attrs["tool.name"] ??
      attrs["gen_ai.tool.name"] ??
      attrs["copilot.tool.name"] ??
      attrs["function.name"];
    if (candidate && typeof candidate === "string") return candidate;
  } catch {
    // Ignore malformed attributes.
  }
  return null;
}

export function buildModelPerformance(calls: CopilotCall[]): ModelPerformanceRow[] {
  const map = new Map<string, { latency: number[]; ttft: number[] }>();

  for (const c of calls) {
    const model = c.model || "unknown";
    const row = map.get(model) ?? { latency: [], ttft: [] };
    row.latency.push(c.duration_ms);
    if (typeof c.ttft_ms === "number" && c.ttft_ms > 0) row.ttft.push(c.ttft_ms);
    map.set(model, row);
  }

  return Array.from(map.entries())
    .map(([model, row]) => ({
      model,
      calls: row.latency.length,
      avgLatency: row.latency.length
        ? row.latency.reduce((sum, n) => sum + n, 0) / row.latency.length
        : 0,
      p90Latency: percentile(row.latency, 90),
      p50Ttft: percentile(row.ttft, 50),
      p90Ttft: percentile(row.ttft, 90),
    }))
    .sort((a, b) => b.calls - a.calls);
}

export function buildOperationsByDay(spans: Span[]): OperationsByDayRow[] {
  const map = new Map<string, OperationsByDayRow>();

  for (const s of spans) {
    const day = toDayKey(s.start_ns);
    const row = map.get(day) ?? { day, chat: 0, tool: 0, other: 0 };
    if (/chat/i.test(s.name)) row.chat += 1;
    else if (extractToolName(s)) row.tool += 1;
    else row.other += 1;
    map.set(day, row);
  }

  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export function buildToolUsage(spans: Span[]): ToolUsageRow[] {
  const map = new Map<string, number>();

  for (const s of spans) {
    const tool = extractToolName(s);
    if (!tool) continue;
    map.set(tool, (map.get(tool) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildModelEfficiency(calls: CopilotCall[]): ModelEfficiencyRow[] {
  const map = new Map<
    string,
    {
      calls: number;
      latency: number;
      totalCost: number;
      totalTokens: number;
    }
  >();

  for (const c of calls) {
    const model = c.model || "unknown";
    const row = map.get(model) ?? {
      calls: 0,
      latency: 0,
      totalCost: 0,
      totalTokens: 0,
    };
    row.calls += 1;
    row.latency += c.duration_ms;
    row.totalCost += c.total_cost;
    row.totalTokens += totalTokens(c);
    map.set(model, row);
  }

  return Array.from(map.entries())
    .map(([model, r]) => ({
      model,
      calls: r.calls,
      avgLatency: r.calls ? r.latency / r.calls : 0,
      avgCost: r.calls ? r.totalCost / r.calls : 0,
      totalCost: r.totalCost,
      totalTokens: r.totalTokens,
      tokensPerDollar: r.totalCost > 0 ? r.totalTokens / r.totalCost : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
}

export function buildCacheImpact(calls: CopilotCall[]): {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  estimatedSavedCost: number;
  cachedSharePct: number;
} {
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let cacheReadCost = 0;
  let cacheWriteCost = 0;
  let estimatedSavedCost = 0;
  let allInputSideTokens = 0;

  for (const c of calls) {
    cacheReadTokens += c.cache_read_tokens;
    cacheWriteTokens += c.cache_creation_tokens;
    cacheReadCost += c.cache_read_cost;
    cacheWriteCost += c.cache_creation_cost;
    allInputSideTokens += c.input_tokens + c.cache_read_tokens + c.cache_creation_tokens;

    if (c.input_tokens > 0 && c.input_cost > 0 && c.cache_read_tokens > 0) {
      const unitInputCost = c.input_cost / c.input_tokens;
      const noCacheEquivalent = c.cache_read_tokens * unitInputCost;
      estimatedSavedCost += Math.max(noCacheEquivalent - c.cache_read_cost, 0);
    }
  }

  return {
    cacheReadTokens,
    cacheWriteTokens,
    cacheReadCost,
    cacheWriteCost,
    estimatedSavedCost,
    cachedSharePct: allInputSideTokens > 0 ? (cacheReadTokens / allInputSideTokens) * 100 : 0,
  };
}

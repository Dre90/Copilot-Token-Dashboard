import { describe, expect, it } from "vitest";
import type { Span } from "../../../api/client";
import type { CopilotBucket, CopilotCall } from "../../../api/copilot";
import {
  buildCacheImpact,
  buildForecast,
  buildHourlyHeatmap,
  buildModelPerformance,
  buildModelEfficiency,
  buildOperationsByDay,
  buildToolUsage,
  daysInMonth,
  detectAnomalies,
  median,
  monthKey,
  percentile,
  summarizeToday,
} from "./copilotInsights";

function mkCall(overrides: Partial<CopilotCall> = {}): CopilotCall {
  return {
    span_id: "s",
    trace_id: "t",
    start_ns: "1000000000",
    duration_ms: 500,
    ttft_ms: 120,
    model: "gpt-5-mini",
    agent: "workspace",
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: 10,
    cache_creation_tokens: 0,
    input_cost: 0.0001,
    output_cost: 0.0002,
    cache_read_cost: 0.00001,
    cache_creation_cost: 0,
    total_cost: 0.00031,
    ...overrides,
  };
}

describe("copilotInsights", () => {
  it("computes median", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("computes percentile", () => {
    expect(percentile([], 90)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBe(5);
  });

  it("formats month key and days in month", () => {
    expect(monthKey(new Date("2026-05-21T00:00:00.000Z"))).toBe("2026-05");
    expect(daysInMonth(new Date("2026-02-21T00:00:00.000Z"))).toBe(28);
  });

  it("summarizes today calls", () => {
    const res = summarizeToday([
      mkCall(),
      mkCall({
        input_tokens: 200,
        output_tokens: 100,
        total_cost: 0.001,
        duration_ms: 1200,
      }),
    ]);
    expect(res.calls).toBe(2);
    expect(res.tokens).toBe(470);
    expect(res.duration).toBe(1700);
    expect(res.cost).toBeCloseTo(0.00131, 8);
  });

  it("detects anomalies from baseline medians", () => {
    const baseline = Array.from({ length: 10 }, (_, i) =>
      mkCall({
        span_id: `b${i}`,
        total_cost: 0.001,
        duration_ms: 600,
      }),
    );
    const today = [
      mkCall({ span_id: "n1", total_cost: 0.001, duration_ms: 800 }),
      mkCall({ span_id: "n2", total_cost: 0.01, duration_ms: 600 }),
      mkCall({ span_id: "n3", total_cost: 0.001, duration_ms: 5000 }),
    ];

    const out = detectAnomalies(today, baseline);
    expect(out.costMedian).toBe(0.001);
    expect(out.latencyMedian).toBe(600);
    expect(out.rows.map((r) => r.call.span_id)).toEqual(["n2", "n3"]);
  });

  it("builds monthly forecast from day buckets", () => {
    const buckets: CopilotBucket[] = [
      {
        bucket: "2026-05-01",
        ts: 1,
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost: 1,
      },
      {
        bucket: "2026-05-02",
        ts: 2,
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost: 2,
      },
      {
        bucket: "2026-04-30",
        ts: 3,
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cost: 4,
      },
    ];

    const now = new Date("2026-05-10T00:00:00.000Z");
    const out = buildForecast(buckets, now);
    expect(out.currentMonthCost).toBe(3);
    expect(out.prevMonthCost).toBe(4);
    expect(out.avgPerDay).toBe(0.3);
    expect(out.projectedMonthCost).toBeCloseTo(9.3, 10);
  });

  it("builds hourly heatmap with normalized intensity", () => {
    const calls = [
      mkCall({
        start_ns: String(BigInt(Date.parse("2026-05-19T08:00:00.000Z")) * 1_000_000n),
        input_tokens: 100,
      }),
      mkCall({
        start_ns: String(BigInt(Date.parse("2026-05-19T08:20:00.000Z")) * 1_000_000n),
        input_tokens: 200,
      }),
    ];

    const out = buildHourlyHeatmap(calls);
    expect(out.cells.length).toBe(7 * 24);
    expect(out.maxTokens).toBeGreaterThan(0);
    const active = out.cells.find((c) => c.calls === 2);
    expect(active).toBeDefined();
    expect(active?.intensity).toBe(1);
  });

  it("builds model efficiency aggregates", () => {
    const out = buildModelEfficiency([
      mkCall({ model: "gpt-5-mini", total_cost: 0.01, duration_ms: 1000 }),
      mkCall({ model: "gpt-5-mini", total_cost: 0.02, duration_ms: 2000 }),
      mkCall({ model: "claude-sonnet", total_cost: 0.03, duration_ms: 500 }),
    ]);

    expect(out[0]?.model).toBe("gpt-5-mini");
    expect(out[0]?.calls).toBe(2);
    expect(out[0]?.avgLatency).toBe(1500);
    expect(out[0]?.avgCost).toBeCloseTo(0.015, 12);
  });

  it("builds model performance with duration and ttft percentiles", () => {
    const rows = buildModelPerformance([
      mkCall({ model: "m1", duration_ms: 1000, ttft_ms: 100 }),
      mkCall({ model: "m1", duration_ms: 2000, ttft_ms: 300 }),
      mkCall({ model: "m2", duration_ms: 500, ttft_ms: null }),
    ]);

    expect(rows[0]?.model).toBe("m1");
    expect(rows[0]?.avgLatency).toBe(1500);
    expect(rows[0]?.p90Latency).toBe(2000);
    expect(rows[0]?.p50Ttft).toBe(100);
    expect(rows[0]?.p90Ttft).toBe(300);
  });

  it("builds operations timeline and tool usage from spans", () => {
    const mkNs = (iso: string) => String(BigInt(Date.parse(iso)) * 1_000_000n);
    const spans: Span[] = [
      {
        span_id: "1",
        trace_id: "t1",
        parent_span_id: null,
        name: "chat",
        kind: 0,
        start_ns: mkNs("2026-05-20T10:00:00.000Z"),
        end_ns: mkNs("2026-05-20T10:00:01.000Z"),
        duration_ms: 1000,
        status_code: 0,
        attributes: "{}",
      },
      {
        span_id: "2",
        trace_id: "t1",
        parent_span_id: null,
        name: "invoke_tool",
        kind: 0,
        start_ns: mkNs("2026-05-20T10:10:00.000Z"),
        end_ns: mkNs("2026-05-20T10:10:01.000Z"),
        duration_ms: 1000,
        status_code: 0,
        attributes: "{}",
      },
      {
        span_id: "3",
        trace_id: "t2",
        parent_span_id: null,
        name: "other_span",
        kind: 0,
        start_ns: mkNs("2026-05-21T10:00:00.000Z"),
        end_ns: mkNs("2026-05-21T10:00:01.000Z"),
        duration_ms: 1000,
        status_code: 0,
        attributes: '{"tool.name":"search"}',
      },
    ];

    const ops = buildOperationsByDay(spans);
    expect(ops.length).toBe(2);
    expect(ops[0]?.chat).toBe(1);
    expect(ops[0]?.tool).toBe(1);

    const tools = buildToolUsage(spans);
    expect(tools[0]?.tool).toBe("invoke_tool");
    expect(tools[0]?.count).toBe(1);
    expect(tools[1]?.tool).toBe("search");
  });

  it("builds cache impact including estimated savings", () => {
    const out = buildCacheImpact([
      mkCall({
        input_tokens: 100,
        input_cost: 0.01,
        cache_read_tokens: 50,
        cache_read_cost: 0.002,
        cache_creation_tokens: 10,
        cache_creation_cost: 0.001,
      }),
      mkCall({
        input_tokens: 0,
        input_cost: 0,
        cache_read_tokens: 20,
        cache_read_cost: 0.001,
      }),
    ]);

    expect(out.cacheReadTokens).toBe(70);
    expect(out.cacheWriteTokens).toBe(10);
    expect(out.cacheReadCost).toBeCloseTo(0.003, 12);
    expect(out.cacheWriteCost).toBeCloseTo(0.001, 12);
    expect(out.estimatedSavedCost).toBeCloseTo(0.003, 12);
    expect(out.cachedSharePct).toBeGreaterThan(0);
  });
});

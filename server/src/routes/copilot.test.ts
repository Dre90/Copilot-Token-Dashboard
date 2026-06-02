import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bucketKey,
  bucketStartMs,
  nextBucketMs,
  num,
  pick,
  priceFor,
  rowToCall,
  timeRange,
} from "./copilot.js";

describe("copilot helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches model pricing with fallback", () => {
    expect(priceFor("gpt-5-mini")).toEqual({
      input: 0.25,
      output: 2.0,
      cache_read: 0.025,
      cache_creation: 0,
    });
    expect(priceFor("gpt-5.3-codex")).toEqual({
      input: 1.75,
      output: 14.0,
      cache_read: 0.175,
      cache_creation: 0,
    });
    expect(priceFor("gpt-5.4-mini")).toEqual({
      input: 0.75,
      output: 4.5,
      cache_read: 0.075,
      cache_creation: 0,
    });
    expect(priceFor("gemini-3.1-pro")).toEqual({
      input: 2.0,
      output: 12.0,
      cache_read: 0.2,
      cache_creation: 0,
    });
    expect(priceFor("claude-opus-4.8")).toEqual({
      input: 5.0,
      output: 25.0,
      cache_read: 0.5,
      cache_creation: 6.25,
    });
    expect(priceFor("unknown-model")).toEqual({
      input: 0,
      output: 0,
      cache_read: 0,
      cache_creation: 0,
    });
  });

  it("picks first defined key", () => {
    const attrs = { a: null, b: 2, c: 3 };
    expect(pick(attrs, "a", "b", "c")).toBe(2);
    expect(pick(attrs, "x", "y")).toBeUndefined();
  });

  it("normalizes numeric inputs", () => {
    expect(num("42")).toBe(42);
    expect(num(1.5)).toBe(1.5);
    expect(num("bad")).toBe(0);
  });

  it("parses window and today time ranges", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T10:30:00.000Z"));

    const today = timeRange({ window: "today" });
    const localMidnight = new Date(2026, 4, 21, 0, 0, 0, 0).getTime();
    expect(today.fromNs).toBe(String(BigInt(localMidnight) * 1_000_000n));
    expect(today.toNs).toBe(String(BigInt(Date.parse("2026-05-21T10:30:00.000Z")) * 1_000_000n));

    const oneHour = timeRange({ window: "1h" });
    expect(oneHour.fromNs).toBe(
      String(BigInt(Date.parse("2026-05-21T09:30:00.000Z")) * 1_000_000n),
    );
    expect(oneHour.toNs).toBe(String(BigInt(Date.parse("2026-05-21T10:30:00.000Z")) * 1_000_000n));
  });

  it("builds bucket boundaries and labels", () => {
    const ms = Date.parse("2026-05-21T10:30:00.000Z");

    expect(bucketKey(bucketStartMs(ms, "day"), "day")).toBe("2026-05-21");
    expect(bucketKey(bucketStartMs(ms, "month"), "month")).toBe("2026-05");
    expect(bucketKey(bucketStartMs(ms, "year"), "year")).toBe("2026");

    const nextDay = nextBucketMs(bucketStartMs(ms, "day"), "day");
    const d = new Date(nextDay);
    expect(d.getDate()).toBe(22);
  });

  it("maps row attributes to call shape with computed costs", () => {
    const row = {
      span_id: "s1",
      trace_id: "t1",
      start_ns: "1000",
      duration_ms: 120,
      attributes: JSON.stringify({
        "gen_ai.response.model": "gpt-5-mini",
        "copilot.chat.agent": "workspace",
        "gen_ai.usage.input_tokens": 1000,
        "gen_ai.usage.output_tokens": 500,
        "gen_ai.usage.cache_read_input_tokens": 200,
      }),
    };

    const call = rowToCall(row);
    expect(call.model).toBe("gpt-5-mini");
    expect(call.agent).toBe("workspace");
    expect(call.input_tokens).toBe(1000);
    expect(call.output_tokens).toBe(500);
    expect(call.cache_read_tokens).toBe(200);
    expect(call.total_cost).toBeGreaterThan(0);
    expect(call.total_cost).toBeCloseTo(
      call.input_cost + call.output_cost + call.cache_read_cost + call.cache_creation_cost,
      12,
    );
  });
});

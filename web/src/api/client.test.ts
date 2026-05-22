import { afterEach, describe, expect, it, vi } from "vitest";
import { api, openStream } from "./client";

describe("otel api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds traces and metrics URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ points: [] }) });

    vi.stubGlobal("fetch", fetchMock);

    await api.traces(50, "2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z");
    await api.metricSeries(
      "tokens.total",
      "hour",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/traces?limit=50&from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-02T00%3A00%3A00.000Z",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/metrics?name=tokens.total&bucket=hour&from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-02T00%3A00%3A00.000Z",
    );
  });

  it("openStream maps valid JSON and ignores bad JSON", () => {
    const listeners = new Map<string, Function[]>();
    const close = vi.fn();

    class MockEventSource {
      addEventListener(type: string, cb: Function) {
        const arr = listeners.get(type) ?? [];
        arr.push(cb);
        listeners.set(type, arr);
      }
      close = close;
      constructor(public readonly _url: string) {}
    }

    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);

    const onEvent = vi.fn();
    const onState = vi.fn();
    const dispose = openStream(onEvent, onState);

    listeners.get("open")?.[0]?.({});
    listeners.get("span")?.[0]?.({ data: '{"spanId":"s1"}' });
    listeners.get("metric")?.[0]?.({ data: "not-json" });
    listeners.get("error")?.[0]?.({});

    expect(onState).toHaveBeenNthCalledWith(1, true);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: "span",
      data: { spanId: "s1" },
    });
    expect(onState).toHaveBeenNthCalledWith(2, false);

    dispose();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

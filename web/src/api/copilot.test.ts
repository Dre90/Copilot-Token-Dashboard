import { afterEach, describe, expect, it, vi } from "vitest";
import { copilotApi, openCopilotStream } from "./copilot";

describe("copilotApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds summary and calls URLs with encoded agent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ calls: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    vi.stubGlobal("fetch", fetchMock);

    await copilotApi.summary("today", "my agent");
    await copilotApi.calls("7d", "my agent", 123);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/copilot/summary?window=today&agent=my%20agent",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/copilot/calls?window=7d&agent=my%20agent&limit=123",
    );
  });

  it("builds timeseries URL and clear uses DELETE", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal("fetch", fetchMock);

    await copilotApi.timeseries("week", "all", "12w");
    await copilotApi.clear();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/copilot/timeseries?bucket=week&agent=all&window=12w",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/copilot/clear", {
      method: "DELETE",
    });
  });

  it("openCopilotStream forwards open/error/span events", () => {
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

    const onSpan = vi.fn();
    const onState = vi.fn();
    const dispose = openCopilotStream(onSpan, onState);

    listeners.get("open")?.[0]?.({});
    listeners.get("span")?.[0]?.({});
    listeners.get("error")?.[0]?.({});

    expect(onState).toHaveBeenNthCalledWith(1, true);
    expect(onSpan).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenNthCalledWith(2, false);

    dispose();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

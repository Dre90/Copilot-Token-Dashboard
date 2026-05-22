/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopilotDashboard } from "./CopilotDashboard";
import type { CopilotCall, CopilotSummary } from "../../../api/copilot";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  calls: vi.fn(),
  agents: vi.fn(),
  clear: vi.fn(),
  openCopilotStream: vi.fn(),
}));

vi.mock("../../../api/copilot", () => ({
  copilotApi: {
    summary: mocks.summary,
    calls: mocks.calls,
    agents: mocks.agents,
    clear: mocks.clear,
  },
  openCopilotStream: mocks.openCopilotStream,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSummary(calls: number, hasAnyTelemetry = true): CopilotSummary {
  return {
    calls,
    input_fresh_tokens: 100,
    input_total_tokens: 100,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    output_tokens: 20,
    input_cost: 0.001,
    output_cost: 0.002,
    cache_read_cost: 0,
    cache_creation_cost: 0,
    total_cost: 0.003,
    credits: 0.3,
    has_any_telemetry: hasAnyTelemetry,
  };
}

function makeCall(spanId: string, model: string): CopilotCall {
  return {
    span_id: spanId,
    trace_id: `${spanId}-trace`,
    start_ns: "1000000000",
    duration_ms: 120,
    model,
    agent: "workspace",
    input_tokens: 100,
    output_tokens: 20,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    input_cost: 0.001,
    output_cost: 0.002,
    cache_read_cost: 0,
    cache_creation_cost: 0,
    total_cost: 0.003,
  };
}

describe("CopilotDashboard", () => {
  beforeEach(() => {
    mocks.summary.mockReset();
    mocks.calls.mockReset();
    mocks.agents.mockReset();
    mocks.clear.mockReset();
    mocks.openCopilotStream.mockReset();
    mocks.openCopilotStream.mockImplementation((_onSpan, onState) => {
      onState?.(true);
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides stale rows while loading a new range", async () => {
    mocks.summary.mockResolvedValueOnce(makeSummary(1));
    mocks.calls.mockResolvedValueOnce([makeCall("old-span", "old-model")]);
    mocks.agents.mockResolvedValue(["workspace"]);

    const nextSummary = deferred<CopilotSummary>();
    const nextCalls = deferred<CopilotCall[]>();
    mocks.summary.mockReturnValueOnce(nextSummary.promise);
    mocks.calls.mockReturnValueOnce(nextCalls.promise);

    render(<CopilotDashboard />);

    expect(await screen.findByText("old-model")).toBeTruthy();

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "7d" } });

    await waitFor(() => expect(screen.getByText("Loading new range...")).toBeTruthy());
    expect(screen.queryByText("old-model")).toBeNull();

    nextSummary.resolve(makeSummary(2));
    nextCalls.resolve([makeCall("new-span", "new-model")]);

    expect(await screen.findByText("new-model")).toBeTruthy();
  });

  it("shows the VS Code OTel hint only when backend reports no telemetry has been received", async () => {
    mocks.summary.mockResolvedValueOnce(makeSummary(0, false));
    mocks.calls.mockResolvedValueOnce([]);
    mocks.agents.mockResolvedValue(["workspace"]);

    const { unmount } = render(<CopilotDashboard />);

    expect(await screen.findByText(/enable OTel in VS Code/i)).toBeTruthy();
    expect(screen.getByText(/github\.copilot\.chat\.otel\.enabled/i)).toBeTruthy();

    mocks.summary.mockResolvedValueOnce(makeSummary(0, true));
    mocks.calls.mockResolvedValueOnce([]);
    mocks.agents.mockResolvedValue(["workspace"]);

    unmount();
    render(<CopilotDashboard />);

    await waitFor(() => {
      expect(screen.queryByText(/enable OTel in VS Code/i)).toBeNull();
    });
  });
});

import { api, type Span } from "../../../api/client";
import { copilotApi, type CopilotBucket, type CopilotCall } from "../../../api/copilot";

export type HistoryPrefetchedData = {
  trendsDay?: CopilotBucket[];
  todayCalls?: CopilotCall[];
  baselineCalls?: CopilotCall[];
  analysisCalls?: CopilotCall[];
  dailyCost?: CopilotBucket[];
  analysisSpans?: Span[];
};

export async function loadHistoryAgents(): Promise<string[]> {
  return copilotApi.agents();
}

export async function loadHistoryTrendsPrefetch(agent = "all"): Promise<HistoryPrefetchedData> {
  const trendsDay = await copilotApi.timeseries("day", agent);
  return { trendsDay };
}

export async function loadHistoryDetailsPrefetch(agent = "all"): Promise<HistoryPrefetchedData> {
  const [todayCalls, baselineCalls, analysisCalls, dailyCost, analysisSpans] = await Promise.all([
    copilotApi.calls("today", agent, 5000),
    copilotApi.calls("7d", agent, 5000),
    copilotApi.calls("30d", agent, 5000),
    copilotApi.timeseries("day", agent, "62d"),
    api.traces(
      2000,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      new Date().toISOString(),
    ),
  ]);

  return {
    todayCalls,
    baselineCalls,
    analysisCalls,
    dailyCost,
    analysisSpans,
  };
}

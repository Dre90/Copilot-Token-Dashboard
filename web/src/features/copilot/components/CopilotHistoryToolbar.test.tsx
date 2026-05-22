/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { CopilotHistoryToolbar } from "./CopilotHistoryToolbar";

afterEach(() => {
  cleanup();
});

describe("CopilotHistoryToolbar", () => {
  it("renders trend controls and fires callbacks", () => {
    const onAgentChange = vi.fn();
    const onViewChange = vi.fn();
    const onBucketChange = vi.fn();

    render(
      <CopilotHistoryToolbar
        agent="all"
        agents={["workspace", "review"]}
        onAgentChange={onAgentChange}
        view="trends"
        onViewChange={onViewChange}
        bucket="week"
        onBucketChange={onBucketChange}
        bucketOptions={[
          { value: "day", label: "Per day" },
          { value: "week", label: "Per week" },
          { value: "month", label: "Per month" },
          { value: "year", label: "Per year" },
        ]}
        controlsDisabled={false}
        bucketDisabled={false}
        loading={true}
        summary={<span>12 calls</span>}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    fireEvent.click(screen.getByRole("button", { name: "Per month" }));

    expect(onAgentChange).toHaveBeenCalledWith("workspace");
    expect(onViewChange).toHaveBeenCalledWith("insights");
    expect(onBucketChange).toHaveBeenCalledWith("month");
    expect(screen.getByText("12 calls")).toBeTruthy();
    expect(screen.getByText("Loading new range...")).toBeTruthy();
  });

  it("hides bucket controls outside trends and disables controls when requested", () => {
    render(
      <CopilotHistoryToolbar
        agent="all"
        agents={[]}
        onAgentChange={() => {}}
        view="today"
        onViewChange={() => {}}
        bucket="day"
        onBucketChange={() => {}}
        bucketOptions={[{ value: "day", label: "Per day" }]}
        controlsDisabled={true}
        bucketDisabled={true}
        loading={false}
        summary={<span>summary</span>}
      />,
    );

    expect(screen.queryByRole("button", { name: "Per day" })).toBeNull();
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Today" })).toHaveProperty("disabled", true);
  });
});

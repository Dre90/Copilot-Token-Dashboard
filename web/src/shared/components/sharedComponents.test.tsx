/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingStatus, Skeleton, StatCard } from "./";

afterEach(() => {
  cleanup();
});

describe("shared components", () => {
  it("renders loading status only when active", () => {
    const { rerender } = render(<LoadingStatus loading={false} />);
    expect(screen.queryByText("Loading new range...")).toBeNull();

    rerender(<LoadingStatus loading text="Updating data..." />);
    expect(screen.getByText("Updating data...")).toBeTruthy();
  });

  it("renders stat card label, value and optional subtext", () => {
    render(<StatCard label="Calls" value="42" sub="today" accent="text-sky-300" />);

    expect(screen.getByText("Calls")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("today")).toBeTruthy();
  });

  it("marks skeleton blocks as aria-hidden", () => {
    const { container } = render(<Skeleton className="h-4 w-12" />);
    const el = container.querySelector(".skeleton");
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });
});

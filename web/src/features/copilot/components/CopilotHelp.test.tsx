/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { CopilotHelp } from "./CopilotHelp";

afterEach(() => {
  cleanup();
});

describe("CopilotHelp", () => {
  it("renders onboarding and glossary content", () => {
    render(<CopilotHelp />);

    expect(screen.getByText(/How to Read the Copilot Token Dashboard/i)).toBeTruthy();
    expect(screen.getByText("Getting Started")).toBeTruthy();
    expect(screen.getByText("Glossary")).toBeTruthy();
    expect(screen.getByText("Input (Fresh)")).toBeTruthy();
    expect(screen.getByText("TTFT")).toBeTruthy();
  });
});

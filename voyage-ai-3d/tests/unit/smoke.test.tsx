import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "@/lib/utils";

/**
 * Phase 0 smoke test: proves the Vitest + Testing Library + jsdom toolchain
 * is wired up correctly. Real coverage arrives with the agent core (Phase 2).
 */
describe("toolchain smoke test", () => {
  it("merges class names with cn()", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("renders a React component into jsdom", () => {
    render(<button type="button">Hello Voyage</button>);
    expect(
      screen.getByRole("button", { name: "Hello Voyage" }),
    ).toBeInTheDocument();
  });
});

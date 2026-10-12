/**
 * The control edge (U1, WAVE5.md D1): every control that draws its own
 * boundary reads `--border-control` — the outline Button (button.test.tsx),
 * the Segmented's container (segmented.test.tsx), and here the Input, the
 * Select trigger and the Toggle's outline flavour. Panels and dividers keep
 * `--border`; the dark fills keep `--input`.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";
import { Select, SelectTrigger, SelectValue } from "./select";
import { toggleVariants } from "./toggle";

const tokensOf = (cls: string) => cls.split(/\s+/);

describe("the control edge", () => {
  it("Input draws its line on the token and keeps the dark fill on --input", () => {
    render(<Input aria-label="Deck name" />);
    const cls = tokensOf(screen.getByRole("textbox", { name: "Deck name" }).className);
    expect(cls).toContain("border-(--border-control)");
    expect(cls).not.toContain("border-input");
    expect(cls).toContain("dark:bg-input/30");
  });

  it("the Select trigger draws its line on the token", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Sort">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const trigger = document.querySelector<HTMLElement>("[data-slot=select-trigger]")!;
    const cls = tokensOf(trigger.className);
    expect(cls).toContain("border-(--border-control)");
    expect(cls).not.toContain("border-input");
  });

  it("the Toggle's outline flavour draws its line on the token", () => {
    const cls = tokensOf(toggleVariants({ variant: "outline" }));
    expect(cls).toContain("border-(--border-control)");
    expect(cls).not.toContain("border-input");
  });
});

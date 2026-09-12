/**
 * Button (R6, touch targets): ONE base rule grows every size to 44 px on a
 * coarse pointer — `pointer-coarse:min-h-11` (and min-w) on the text sizes,
 * `pointer-coarse:size-11` on the icon sizes — while the mouse density
 * (h-8 / h-7 / h-6, size-8 / 7 / 6) stays as authored.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";

describe("Button touch targets", () => {
  it.each([
    ["default", "h-8"],
    ["xs", "h-6"],
    ["sm", "h-7"],
    ["lg", "h-9"],
  ] as const)("text size %s keeps %s and grows to 44 px on a coarse pointer", (size, mouse) => {
    const cls = buttonVariants({ size });
    expect(cls).toContain(mouse);
    expect(cls).toContain("pointer-coarse:min-h-11");
    expect(cls).toContain("pointer-coarse:min-w-11");
  });

  it.each([
    ["icon", "size-8"],
    ["icon-xs", "size-6"],
    ["icon-sm", "size-7"],
    ["icon-lg", "size-9"],
  ] as const)("icon size %s keeps %s and grows to 44 × 44 on a coarse pointer", (size, mouse) => {
    const cls = buttonVariants({ size });
    expect(cls).toContain(mouse);
    expect(cls).toContain("pointer-coarse:size-11");
  });

  it("the rendered element carries the rule", () => {
    render(<Button size="sm">Keep</Button>);
    const el = document.querySelector<HTMLElement>("[data-slot=button]")!;
    expect(el.className).toContain("pointer-coarse:min-h-11");
  });
});

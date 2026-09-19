/**
 * Button (R6, touch targets): ONE base rule grows every size to 44 px on a
 * coarse pointer — `pointer-coarse:min-h-11` (and min-w) on the text sizes,
 * `pointer-coarse:size-11` on the icon sizes — while the mouse density
 * (h-8 / h-7 / h-6, size-8 / 7 / 6) stays as authored.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";
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

/**
 * Primary hairline (W1, WAVE2.md D0): the default variant's gold border is
 * STRUCTURAL — the green fill is 1.84:1 on the dark page, so a primary
 * button that loses its border is invisible there. The variant class must
 * beat the base string's border-transparent through cn()'s tailwind-merge,
 * exactly the path the component takes.
 */
describe("Primary button hairline", () => {
  it("the default variant carries border-gold/70 and it survives cn()", () => {
    const cls = cn(buttonVariants({ variant: "default" }));
    expect(cls).toContain("border-gold/70");
    // tailwind-merge resolved the conflict toward the hairline.
    expect(cls).not.toContain("border-transparent");
  });

  it.each(["outline", "secondary", "ghost", "destructive", "link"] as const)(
    "the %s variant has no hairline",
    (variant) => {
      expect(cn(buttonVariants({ variant }))).not.toContain("border-gold/70");
    },
  );

  it("hover lightens with the house color-mix idiom, never bg-primary/80", () => {
    const cls = buttonVariants({ variant: "default" });
    expect(cls).toContain("hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]");
    expect(cls).not.toContain("hover:bg-primary/80");
  });

  it("the rendered default button keeps the hairline", () => {
    render(<Button>Save</Button>);
    const el = document.querySelector<HTMLElement>("[data-slot=button]")!;
    expect(el.className).toContain("border-gold/70");
    expect(el.className).not.toContain("border-transparent");
  });
});

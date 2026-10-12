/**
 * Button (R6, touch targets): ONE base rule grows every size to 44 px on a
 * coarse pointer — `pointer-coarse:min-h-11` (and min-w) on the text sizes,
 * `pointer-coarse:size-11` on the icon sizes — while the mouse density
 * (h-8 / h-7 / h-6, size-8 / 7 / 6) stays as authored.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

/** A class string as exact tokens (`hover:x` must not match inside `dark:hover:x`). */
const tokensOf = (cls: string) => cls.split(/\s+/);

/**
 * U1 (WAVE5.md D1): the design lab's quiet rows with its refined states. The
 * base names its 120 ms transition list — `translate` and `scale` included,
 * because Tailwind v4 moves the press through those properties, so U2's
 * scale needs no list change — and carries tabular numerals, the aria-busy
 * cursor and the aria-disabled look. Outline is a bare line on the control
 * edge token; ghost rests in muted ink; the destructive hover is the
 * measured step; an open menu holds each variant's hover look.
 */
describe("Button recipe (U1)", () => {
  it("the base names its 120 ms transition list and carries A's states", () => {
    const cls = tokensOf(buttonVariants());
    expect(cls).toContain(
      "transition-[color,background-color,border-color,box-shadow,transform,translate,scale]",
    );
    expect(cls).toContain("duration-[120ms]");
    expect(cls).not.toContain("transition-all");
    expect(cls).toContain("tabular-nums");
    expect(cls).toContain("aria-busy:cursor-progress");
    expect(cls).toContain("aria-disabled:cursor-not-allowed");
    expect(cls).toContain("aria-disabled:opacity-50");
  });

  it("aria-busy reaches the element, where the base's cursor rule reads it", () => {
    render(<Button aria-busy>Rolling…</Button>);
    const el = screen.getByRole("button", { name: "Rolling…" });
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.className).toContain("aria-busy:cursor-progress");
  });

  it("outline is a bare line on --border-control with no plate, and the edge survives cn()", () => {
    const cls = tokensOf(cn(buttonVariants({ variant: "outline" })));
    expect(cls).toContain("border-(--border-control)");
    expect(cls).toContain("bg-transparent");
    expect(cls).not.toContain("border-transparent");
    for (const plate of [
      "border-border",
      "bg-background",
      "dark:border-input",
      "dark:bg-input/30",
    ]) {
      expect(cls).not.toContain(plate);
    }
    render(<Button variant="outline">Fork</Button>);
    expect(screen.getByRole("button", { name: "Fork" }).className).toContain(
      "border-(--border-control)",
    );
  });

  it("ghost rests in muted ink and comes forward on hover; a call site's own color still wins", () => {
    const cls = tokensOf(buttonVariants({ variant: "ghost" }));
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("hover:text-foreground");
    // games-dialog's red "Delete game" passes its own color.
    const red = tokensOf(cn(buttonVariants({ variant: "ghost", className: "text-destructive" })));
    expect(red).toContain("text-destructive");
    expect(red).not.toContain("text-muted-foreground");
  });

  it("the destructive hover is the measured step and stays heavier than rest in both themes (F16)", () => {
    const cls = tokensOf(buttonVariants({ variant: "destructive" }));
    for (const c of [
      "bg-destructive/10",
      "hover:bg-destructive/15",
      "dark:bg-destructive/15",
      "dark:hover:bg-destructive/20",
    ]) {
      expect(cls).toContain(c);
    }
    // The steps that measured under 4.5:1 for the label on hover.
    expect(cls).not.toContain("hover:bg-destructive/20");
    expect(cls).not.toContain("dark:hover:bg-destructive/30");
  });

  it("an open menu holds each variant's hover look (aria-expanded parity)", () => {
    const has = (variant: Parameters<typeof buttonVariants>[0], c: string) =>
      expect(tokensOf(buttonVariants(variant))).toContain(c);
    has(
      { variant: "default" },
      "aria-expanded:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]",
    );
    has({ variant: "default" }, "aria-expanded:border-gold/90");
    has({ variant: "default" }, "hover:border-gold/90");
    has(
      { variant: "secondary" },
      "aria-expanded:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
    );
    has({ variant: "outline" }, "aria-expanded:bg-muted");
    has({ variant: "ghost" }, "aria-expanded:text-foreground");
    has({ variant: "destructive" }, "aria-expanded:bg-destructive/15");
    has({ variant: "link" }, "aria-expanded:underline");
  });

  it("the small sizes and every icon size share one 9.6 px radius; sm labels are 13 px", () => {
    for (const size of ["xs", "sm", "icon", "icon-xs", "icon-sm", "icon-lg"] as const) {
      const cls = tokensOf(cn(buttonVariants({ size })));
      expect(cls, size).toContain("rounded-md");
      expect(
        cls.some((c) => c.startsWith("rounded-[")),
        size,
      ).toBe(false);
      expect(
        cls.some((c) => c.startsWith("in-data-[slot=button-group]")),
        size,
      ).toBe(false);
    }
    const sm = tokensOf(cn(buttonVariants({ size: "sm" })));
    expect(sm).toContain("text-[0.8125rem]");
    expect(sm).not.toContain("text-[0.8rem]");
  });
});

/**
 * Disabled with a reason (U1, WAVE5.md D1; WAVE2.md D0 "Disabled = visible,
 * with the reason in title/hint"): `disabled` + `title` is the whole API — no
 * new prop. Such a Button keeps hover and focus (Base UI's
 * focusableWhenDisabled: `aria-disabled`, no native attribute) so the title
 * can show, and still ignores the click. Without a title, native `disabled`.
 */
describe("Disabled with a reason (U1)", () => {
  it("disabled + title: aria-disabled, no native attribute, focusable, the title kept, clicks ignored", () => {
    const onClick = vi.fn();
    render(
      <Button disabled title="Import a collection first" onClick={onClick}>
        Only mine
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Only mine" });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("title")).toBe("Import a collection first");
    el.focus();
    expect(document.activeElement).toBe(el);
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled with no title keeps the native attribute", () => {
    render(<Button disabled>Save</Button>);
    const el = screen.getByRole("button", { name: "Save" });
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.hasAttribute("aria-disabled")).toBe(false);
  });

  it("a title on an enabled Button changes nothing", () => {
    const onClick = vi.fn();
    render(
      <Button title="Copy this deck into your account" onClick={onClick}>
        Fork
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Fork" });
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("an explicit focusableWhenDisabled={false} keeps the native attribute even with a title", () => {
    render(
      <Button disabled title="Busy" focusableWhenDisabled={false}>
        Apply
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Apply" });
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.hasAttribute("aria-disabled")).toBe(false);
  });
});

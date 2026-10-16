/**
 * The stepper and chip primitives (U10b, WAVE5.md D10): ButtonGroup joins
 * its children on the group's outer corners only (D1: the radius rule lives
 * on the group, not the Button sizes), ButtonGroupText is the count without
 * a plate; Chip is the one chip in two shapes (filter `rounded-md`, tag
 * `rounded-full`, never a third) on the edge token (U1), 24 px and 44 on a
 * coarse pointer, with the press (U2, LATER row 219) scoped to a button or a
 * link and the R5a pressed look; ChipRemove is a tag's × at 44 px on touch.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ButtonGroup, ButtonGroupText } from "./button-group";
import { Chip, ChipRemove } from "./chip";

const tokensOf = (el: Element) => el.className.split(/\s+/);

describe("ButtonGroup", () => {
  it("is a role=group slot that squares the inner corners and drops the inner borders", () => {
    render(
      <ButtonGroup aria-label="Quantity">
        <Button size="icon-xs" aria-label="One fewer">
          −
        </Button>
        <ButtonGroupText>4</ButtonGroupText>
        <Button size="icon-xs" aria-label="One more">
          +
        </Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole("group", { name: "Quantity" });
    expect(group.dataset.slot).toBe("button-group");
    expect(group.dataset.orientation).toBe("horizontal");
    const cls = tokensOf(group);
    expect(cls).toEqual(
      expect.arrayContaining([
        "[&>*:not(:first-child)]:rounded-l-none",
        "[&>*:not(:last-child)]:rounded-r-none",
        "[&>*:not(:first-child)]:border-l-0",
        "[&>*]:focus-visible:z-10",
      ]),
    );
    // The Buttons keep their own 9.6 px radius: the group squares only the inner corners.
    expect(tokensOf(screen.getByRole("button", { name: "One fewer" }))).toContain("rounded-md");
  });

  it("ButtonGroupText is the count's type with no plate; a caller's data-slot wins", () => {
    const { rerender } = render(<ButtonGroupText>4</ButtonGroupText>);
    let text = screen.getByText("4");
    expect(text.dataset.slot).toBe("button-group-text");
    const cls = tokensOf(text);
    expect(cls).toEqual(expect.arrayContaining(["text-sm", "font-medium", "tabular-nums"]));
    for (const plate of ["border", "bg-muted", "shadow-xs", "px-4"])
      expect(cls).not.toContain(plate);
    rerender(<ButtonGroupText data-slot="qty">4</ButtonGroupText>);
    text = screen.getByText("4");
    expect(text.dataset.slot).toBe("qty");
  });
});

describe("Chip", () => {
  it("two shapes: filter rounded-md, tag rounded-full, each with data-slot and data-shape", () => {
    render(
      <>
        <Chip>Filter</Chip>
        <Chip shape="tag">Tag</Chip>
      </>,
    );
    const filter = screen.getByText("Filter");
    const tag = screen.getByText("Tag");
    expect(filter.tagName).toBe("SPAN");
    expect(filter.dataset.slot).toBe("chip");
    expect(filter.dataset.shape).toBe("filter");
    expect(tokensOf(filter)).toContain("rounded-md");
    expect(tokensOf(filter)).not.toContain("rounded-full");
    expect(tag.dataset.shape).toBe("tag");
    expect(tokensOf(tag)).toContain("rounded-full");
    expect(tokensOf(tag)).not.toContain("rounded-md");
  });

  it("draws its line on the edge token at 24 px, 44 on a coarse pointer; muted is a fill with no line", () => {
    const { rerender } = render(<Chip>Year</Chip>);
    let cls = tokensOf(screen.getByText("Year"));
    expect(cls).toEqual(
      expect.arrayContaining([
        "border-(--border-control)",
        "h-6",
        "pointer-coarse:min-h-11",
        "pointer-coarse:px-3",
      ]),
    );
    expect(cls).not.toContain("border-input");
    rerender(<Chip variant="muted">Year</Chip>);
    cls = tokensOf(screen.getByText("Year"));
    expect(cls).toEqual(expect.arrayContaining(["border-transparent", "bg-muted"]));
  });

  it("the press and the held hover color are scoped to a button or a link, motion-safe", () => {
    render(<Chip render={<button type="button" />}>Red</Chip>);
    const chip = screen.getByRole("button", { name: "Red" });
    const cls = tokensOf(chip);
    expect(cls).toEqual(
      expect.arrayContaining([
        "[&:is(a,button)]:motion-safe:active:scale-[0.98]",
        "[&:is(a,button)]:hover:bg-muted",
        "[&:is(a,button)]:active:bg-muted",
        "ease-settle-120",
      ]),
    );
    // No unscoped press or tint: a static span never squeezes.
    expect(cls.some((c) => /^(motion-safe:)?active:/.test(c) || /^hover:/.test(c))).toBe(false);
  });

  it("renders as a Link or a button with the site's ARIA; pressed is the R5a look", () => {
    const onClick = vi.fn();
    render(
      <>
        <Chip render={<Link href="/commanders" />} aria-current="page" pressed>
          All
        </Chip>
        <Chip render={<button type="button" />} aria-pressed={false} onClick={onClick}>
          Blue
        </Chip>
      </>,
    );
    const all = screen.getByRole("link", { name: "All" });
    expect(all.getAttribute("href")).toBe("/commanders");
    expect(all.getAttribute("aria-current")).toBe("page");
    expect(tokensOf(all)).toEqual(
      expect.arrayContaining(["bg-muted", "font-medium", "ring-2", "ring-accent-game"]),
    );
    const blue = screen.getByRole("button", { name: "Blue" });
    expect(blue.getAttribute("type")).toBe("button");
    expect(blue.getAttribute("aria-pressed")).toBe("false");
    expect(blue.className).not.toContain("ring-accent-game");
    fireEvent.click(blue);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aria-disabled draws the dashed edge in muted ink", () => {
    render(<Chip aria-disabled="true">One Piece (soon)</Chip>);
    expect(tokensOf(screen.getByText("One Piece (soon)"))).toEqual(
      expect.arrayContaining([
        "aria-disabled:border-dashed",
        "aria-disabled:text-muted-foreground",
      ]),
    );
  });

  it("ChipRemove is a named button, 44 px on touch, and its chip gives up the trailing padding", () => {
    const onClick = vi.fn();
    render(
      <Chip shape="tag" size="sm" variant="muted">
        ramp
        <ChipRemove aria-label="Remove tag ramp" onClick={onClick} />
      </Chip>,
    );
    const remove = screen.getByRole("button", { name: "Remove tag ramp" });
    expect(remove.getAttribute("type")).toBe("button");
    expect(remove.dataset.slot).toBe("chip-remove");
    expect(tokensOf(remove)).toEqual(
      expect.arrayContaining([
        "size-4",
        "pointer-coarse:size-11",
        "motion-safe:active:scale-[0.96]",
      ]),
    );
    expect(tokensOf(remove.parentElement!)).toEqual(
      expect.arrayContaining([
        "has-data-[slot=chip-remove]:pr-1",
        "pointer-coarse:has-data-[slot=chip-remove]:pr-0",
      ]),
    );
    fireEvent.click(remove);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

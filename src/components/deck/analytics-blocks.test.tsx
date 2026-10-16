/**
 * AnalyticsBlocks (R6 — G6 / G9 / status never color-only): every histogram
 * bar keeps its rounded top and value label and carries the motion-safe
 * grow-in from a `starting:` state; a block with a `target` draws one
 * aria-hidden outline per nonzero target bucket, scaled on the same max as
 * the bars, and one visible legend naming the target; a block without one
 * draws nothing extra; a stat's tone gains a visible word. U6: the share
 * variant's thin curve and stacked breakdowns, no tracks.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnalyticsBlock } from "@/lib/games/types";
import {
  AnalyticsBlocks,
  HISTOGRAM_BAR_MOTION_CLASS,
  STACK_REST_COLOR,
  STAT_TONE_WORD,
} from "./analytics-blocks";

const curve: Extract<AnalyticsBlock, { kind: "histogram" }> = {
  kind: "histogram",
  id: "mana-curve",
  title: "Mana curve",
  buckets: [0, 3, 6, 4, 2, 0, 0, 1].map((value, i) => ({
    label: i === 7 ? "7+" : String(i),
    value,
  })),
  target: { label: "Curve template", values: [2, 8, 13, 13, 10, 7, 5, 4] },
};

const bars = () => [...document.querySelectorAll<HTMLElement>("[data-slot=histogram-bar]")];
const ghosts = () => [...document.querySelectorAll<HTMLElement>("[data-slot=histogram-target]")];

describe("AnalyticsBlocks — histogram", () => {
  it("bars keep rounded tops and value labels and grow in motion-safe from a starting state (G6)", () => {
    render(<AnalyticsBlocks blocks={[{ ...curve, target: undefined }]} />);
    expect(bars()).toHaveLength(8);
    for (const bar of bars()) {
      expect(bar.className).toContain("rounded-t-sm");
      expect(bar.className).toContain(HISTOGRAM_BAR_MOTION_CLASS);
    }
    // Every motion token is motion-safe; the resting state is explicit.
    for (const token of HISTOGRAM_BAR_MOTION_CLASS.split(" ")) {
      if (/transition|duration|ease|starting/.test(token)) expect(token).toMatch(/^motion-safe:/);
    }
    expect(HISTOGRAM_BAR_MOTION_CLASS).toContain("motion-safe:starting:scale-y-0");
    expect(HISTOGRAM_BAR_MOTION_CLASS).toContain("scale-y-100");
    expect(HISTOGRAM_BAR_MOTION_CLASS).toContain("motion-safe:duration-400");
    // Labels above the bars: blank for zero, the count otherwise; the tallest bar fills the track.
    const labels = bars().map((bar) => bar.parentElement!.previousElementSibling!.textContent);
    expect(labels).toEqual([" ", "3", "6", "4", "2", " ", " ", "1"]);
    expect(bars()[2].style.height).toBe("100%");
    expect(bars()[0].style.height).toBe("0px");
    expect(ghosts()).toHaveLength(0);
    expect(document.querySelector("[data-slot=histogram-legend]")).toBeNull();
  });

  it("a target draws aria-hidden outlines scaled with the bars and one visible legend (G9)", () => {
    render(<AnalyticsBlocks blocks={[curve]} />);
    expect(ghosts()).toHaveLength(8);
    for (const ghost of ghosts()) {
      expect(ghost.getAttribute("aria-hidden")).toBe("true");
      expect(ghost.className).toContain("border-dashed");
    }
    // The shared max is the template's 13, so the tallest bar (6) is 6/13 and
    // the 13-bucket ghosts fill the track — nothing overflows a small deck.
    expect(ghosts()[2].style.height).toBe("100%");
    expect(bars()[2].style.height).toBe(`${(6 / 13) * 100}%`);
    const legend = document.querySelector<HTMLElement>("[data-slot=histogram-legend]")!;
    expect(legend.textContent).toBe("Curve template");
    expect(legend.className).not.toContain("sr-only");
  });

  it("a zero target bucket draws no outline", () => {
    render(
      <AnalyticsBlocks
        blocks={[{ ...curve, target: { label: "T", values: [0, 1, 0, 0, 0, 0, 0, 0] } }]}
      />,
    );
    expect(ghosts()).toHaveLength(1);
  });
});

describe("AnalyticsBlocks — stat tone", () => {
  it("a toned stat carries a visible word beside the number, an untoned one nothing", () => {
    render(
      <AnalyticsBlocks
        blocks={[
          { kind: "stat", id: "a", title: "Lands", value: "37" },
          { kind: "stat", id: "b", title: "Counters", value: "3", tone: "warn" },
          { kind: "stat", id: "c", title: "Blockers", value: "0", tone: "bad" },
          { kind: "stat", id: "d", title: "Curve", value: "ok", tone: "ok" },
        ]}
      />,
    );
    const words = [...document.querySelectorAll<HTMLElement>("[data-slot=stat-tone]")];
    expect(words.map((w) => w.textContent)).toEqual([
      STAT_TONE_WORD.warn,
      STAT_TONE_WORD.bad,
      STAT_TONE_WORD.ok,
    ]);
    for (const w of words) expect(w.className).not.toContain("sr-only");
    expect(screen.getByText("Problem")).toBeTruthy();
  });
});

describe("AnalyticsBlocks — the share variant (U6, WAVE5 D7)", () => {
  const types: Extract<AnalyticsBlock, { kind: "breakdown" }> = {
    kind: "breakdown",
    id: "types",
    title: "Card types",
    slices: [
      { label: "Land", value: 37 },
      { label: "Instant", value: 34 },
      { label: "Artifact", value: 9 },
      { label: "Sorcery", value: 9 },
      { label: "Creature", value: 8 },
      { label: "Enchantment", value: 2 },
      { label: "Battle", value: 0 },
    ],
  };
  const colors: Extract<AnalyticsBlock, { kind: "breakdown" }> = {
    kind: "breakdown",
    id: "colors",
    title: "Colors",
    slices: [
      { label: "Blue", value: 55, colorVar: "--mana-u" },
      { label: "Colorless", value: 8, colorVar: "--mana-c" },
    ],
  };

  it("a breakdown is ONE stacked bar, a segment per nonzero slice in proportion, then its legend; no track", () => {
    render(<AnalyticsBlocks blocks={[types]} variant="share" />);
    const bar = document.querySelector<HTMLElement>("[data-slot=breakdown-bar]")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("gap-px");
    const segments = [...bar.querySelectorAll<HTMLElement>("[data-slot=breakdown-segment]")];
    expect(segments.map((el) => el.style.flexGrow)).toEqual(["37", "34", "9", "9", "8", "2"]);
    // The chart colors largest first; past the fifth, muted ink at 40 % (oklab).
    expect(segments.map((el) => el.style.background)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      STACK_REST_COLOR,
    ]);
    expect(STACK_REST_COLOR).toBe("color-mix(in oklab, var(--muted-foreground) 40%, transparent)");
    for (const el of segments) expect(el.className).toContain("ring-inset");
    const legend = document.querySelector<HTMLElement>("[data-slot=breakdown-legend]")!;
    expect([...legend.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Land37",
      "Instant34",
      "Artifact9",
      "Sorcery9",
      "Creature8",
      "Enchantment2",
    ]);
    expect(screen.getByRole("heading", { level: 3, name: "Card types" })).toBeTruthy();
    expect(document.querySelector(".bg-muted")).toBeNull();
  });

  it("a slice's own color wins (Colors keeps the mana colors)", () => {
    render(<AnalyticsBlocks blocks={[colors]} variant="share" />);
    const segments = [...document.querySelectorAll<HTMLElement>("[data-slot=breakdown-segment]")];
    expect(segments.map((el) => el.style.background)).toEqual(["var(--mana-u)", "var(--mana-c)"]);
  });

  it("the curve is thin bars over no baseline, in the brand's chart color; a target is a thin outline behind its bar", () => {
    render(<AnalyticsBlocks blocks={[curve]} variant="share" />);
    expect(bars()).toHaveLength(8);
    for (const bar of bars()) {
      expect(bar.className).toContain("w-2.5");
      expect(bar.className).toContain(HISTOGRAM_BAR_MOTION_CLASS);
      expect(bar.style.background).toBe("var(--chart-1)");
      expect(bar.parentElement!.className).not.toContain("border-b");
    }
    expect(bars()[0].parentElement!.parentElement!.parentElement!.className).toContain("max-w-md");
    for (const ghost of ghosts()) {
      expect(ghost.className).toContain("w-4");
      expect(ghost.className).toContain("border-dashed");
    }
    expect(document.querySelector("[data-slot=histogram-legend]")?.textContent).toBe(
      "Curve template",
    );
  });

  it("the panel (the editor, the hub) is unchanged: a row per slice on its track, full-width bars on a baseline", () => {
    render(<AnalyticsBlocks blocks={[types, { ...curve, target: undefined }]} />);
    expect(document.querySelector("[data-slot=breakdown-bar]")).toBeNull();
    expect(document.querySelectorAll(".bg-muted")).toHaveLength(7);
    for (const bar of bars()) {
      expect(bar.className).toContain("w-full");
      expect(bar.style.background).toBe("var(--chart-2)");
      expect(bar.parentElement!.className).toContain("border-b");
    }
  });
});

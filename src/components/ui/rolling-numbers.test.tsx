/**
 * ROLLING-NUMBERS — the component: plain text at rest and on mount; a change
 * rolls the digits that changed as aria-hidden columns beside one hidden
 * copy of the number, then the plain text returns; the jump path, reduced
 * motion, the interlude (`hold`) and the lead's wrapper.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROLL_MS } from "@/lib/motion/rolling";

import { RollingNumbers } from "./rolling-numbers";

function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** What a screen reader gets: the text outside aria-hidden subtrees. */
function spoken(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
  return Array.from(node.childNodes, spoken).join("");
}

const rolling = (root: ParentNode) => root.querySelectorAll("[data-slot=rolling-number]");
/** The columns of a rolling number, as `char<from` (moving) or `char` (standing). */
const columns = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-c]"), (cell) =>
    cell.dataset.from === undefined ? cell.dataset.c : `${cell.dataset.c}<${cell.dataset.from}`,
  );

beforeEach(() => {
  vi.useFakeTimers();
  motion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RollingNumbers", () => {
  it("renders the line as plain text at rest, and nothing rolls on mount", () => {
    const { container } = render(<p>{<RollingNumbers text="est. $148 of your $150" />}</p>);
    expect(container.innerHTML).toBe("<p>est. $148 of your $150</p>");
  });

  it("a change rolls the digits that changed: aria-hidden columns, one hidden copy, then plain text again", () => {
    const { container, rerender } = render(
      <p>
        <RollingNumbers text="est. $172 of your $150" />
      </p>,
    );
    rerender(
      <p>
        <RollingNumbers text="est. $148 of your $150" />
      </p>,
    );
    const p = container.querySelector("p")!;
    const [number] = rolling(p);
    expect(rolling(p)).toHaveLength(1);
    // The dollar sign and the hundreds stand; the tens and the ones roll down.
    expect(columns(number)).toEqual(["$", "1", "4<7", "8<2"]);
    expect(number.querySelectorAll("[data-roll=down]")).toHaveLength(2);
    expect(number.querySelector("[data-roll=up]")).toBeNull();
    // Said once: the line reads exactly, and the columns hold no text.
    expect(p.textContent).toBe("est. $148 of your $150");
    expect(spoken(p)).toBe("est. $148 of your $150");
    const visual = number.querySelector("[aria-hidden=true]")!;
    expect(visual.textContent).toBe("");
    expect(number.querySelector(".sr-only")!.textContent).toBe("$148");
    // No live region of its own.
    expect(p.querySelector("[aria-live]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ROLL_MS + 50);
    });
    expect(p.innerHTML).toBe("est. $148 of your $150");
  });

  it("the columns: U2's dw-in, one line up or down, no fade, motion-safe only, clipped to the line", () => {
    const { container, rerender } = render(<RollingNumbers text="62 / 100" threshold={5} />);
    rerender(<RollingNumbers text="99 / 100" threshold={5} />);
    const moving = container.querySelectorAll<HTMLElement>("[data-roll]");
    expect(columns(container)).toEqual(["9<6", "9<2"]);
    for (const cell of moving) {
      expect(cell.dataset.roll).toBe("up");
      expect(cell.className).toContain("motion-safe:animate-dw-in");
      expect(cell.className).toContain("[--dw-opacity:1]");
      expect(cell.className).toContain("data-[roll=up]:[--dw-y:100%]");
      expect(cell.className).toContain("data-[roll=down]:[--dw-y:-100%]");
      expect(cell.className).toContain("after:content-[attr(data-from)]");
      expect(cell.className).not.toMatch(/(^|\s)animate-/);
    }
    const window = container.querySelector("[aria-hidden=true]")!;
    expect(window.className).toContain("[clip-path:inset(0_-0.25em)]");
    expect(window.className).toContain("whitespace-nowrap");
  });

  it("the jump path: a change at or under the threshold lands at once", () => {
    const { container, rerender } = render(<RollingNumbers text="62 / 100" threshold={5} />);
    rerender(<RollingNumbers text="63 / 100" threshold={5} />);
    expect(container.innerHTML).toBe("63 / 100");
    rerender(<RollingNumbers text="58 / 100" threshold={5} />);
    expect(container.innerHTML).toBe("58 / 100");
    rerender(<RollingNumbers text="100 / 100" threshold={5} />);
    expect(rolling(container)).toHaveLength(1);
  });

  it("reduced motion: the plain text, at once, whatever the change", () => {
    motion(true);
    const { container, rerender } = render(<RollingNumbers text="est. $300 of your $150" />);
    rerender(<RollingNumbers text="est. $148 of your $150" />);
    expect(container.innerHTML).toBe("est. $148 of your $150");
  });

  it("a change mid-roll starts again from the last line: the newest digits, fresh columns", () => {
    const { container, rerender } = render(<RollingNumbers text="cost $12.34." />);
    rerender(<RollingNumbers text="cost $15.34." />);
    const first = container.querySelector("[data-roll]");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<RollingNumbers text="cost $9.80." />);
    // From $15.34, the last line: the tens it no longer has leave at once.
    expect(columns(container)).toEqual(["$", "9<5", ".", "8<3", "0<4"]);
    expect(container.contains(first)).toBe(false);
    expect(container.textContent).toBe("cost $9.80.");
    // The first roll's timer is gone with it: the second plays its whole length.
    act(() => {
      vi.advanceTimersByTime(ROLL_MS);
    });
    expect(rolling(container)).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(container.innerHTML).toBe("cost $9.80.");
  });

  it("a hold shows its text as it is; the next line rolls from the last one shown without it", () => {
    const { container, rerender } = render(<RollingNumbers text="At least Bracket 3 (Upgraded)" />);
    rerender(<RollingNumbers text="Checking combos…" hold />);
    expect(container.innerHTML).toBe("Checking combos…");
    rerender(<RollingNumbers text="At least Bracket 4 (Optimized)" />);
    expect(columns(container)).toEqual(["4<3"]);
    expect(container.querySelector("[data-roll]")!.getAttribute("data-roll")).toBe("up");
    expect(container.textContent).toBe("At least Bracket 4 (Optimized)");
  });

  it("a line that changes while held never rolls, and a held mount has nothing to roll from", () => {
    const { container, rerender } = render(
      <RollingNumbers text="Bracket: add 34 more cards" hold />,
    );
    rerender(<RollingNumbers text="Bracket: add 33 more cards" hold />);
    expect(container.innerHTML).toBe("Bracket: add 33 more cards");
    rerender(<RollingNumbers text="At least Bracket 3 (Upgraded)" />);
    expect(container.innerHTML).toBe("At least Bracket 3 (Upgraded)");
  });

  it("className: the span only while there is text, and the memory kept while there is none", () => {
    const { container, rerender } = render(
      <RollingNumbers text="Your target: Bracket 2" className="text-foreground font-medium" />,
    );
    expect(container.innerHTML).toBe(
      '<span class="text-foreground font-medium">Your target: Bracket 2</span>',
    );
    rerender(<RollingNumbers text="" hold className="text-foreground font-medium" />);
    expect(container.innerHTML).toBe("");
    rerender(
      <RollingNumbers text="Your target: Bracket 3" className="text-foreground font-medium" />,
    );
    const span = container.querySelector("span.font-medium")!;
    expect(columns(span)).toEqual(["3<2"]);
    expect(span.textContent).toBe("Your target: Bracket 3");
  });
});

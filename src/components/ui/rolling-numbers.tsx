"use client";

/**
 * Rolling numbers (ROLLING-NUMBERS; the rules are src/lib/motion/rolling.ts):
 * a line of copy whose numbers roll when the line changes. At rest it
 * renders the line as plain text, the same DOM as before this existed, so
 * the server HTML, every text pin and a screen reader's reading are
 * unchanged. Only while a roll plays (ROLL_MS) does a number that changed
 * become digit columns, each turning one place on U2's dw-in (settle-250,
 * 250 ms, `--dw-y` one line up or down, no fade) under `motion-safe:`,
 * clipped to the line by its window, then the plain text returns.
 *
 * Said once, never per digit: while it rolls the number is one visually
 * hidden copy of its text, and the columns, drawn from `data-*` attributes
 * by generated content, are aria-hidden and hold no text, so `textContent`
 * and a copied selection read the line exactly. It adds no live region:
 * whether a line announces stays that line's own decision (the bracket line
 * deliberately doesn't). The digits take the line's figures, so every home
 * sets `tabular-nums` on the line; a window's width is then the plain
 * number's, and nothing beside it moves when a roll starts or ends. The
 * window and its cells are one em tall (`leading-none`): the digit's height,
 * not the line's, so the digits pass each other inside the slot the way an
 * odometer's do and an outgoing digit never shows whole above or below the
 * line (with the line's height, twice a digit's, it did). The slot sits on
 * the line's baseline inside the line box, which keeps its height.
 *
 * Nothing rolls on mount (no count on page load), under reduced motion
 * (read when the line changes, as useCountUp read it), or within
 * `threshold`. `hold` marks an interlude, the bracket line's "Checking
 * combos…": the text shows as it is, and the next line rolls from the last
 * one shown without a hold, so a level that changed behind the interlude
 * still rolls. `className` wraps the text in a span only while there is
 * text, and the instance keeps its memory while there is none.
 */
import { Fragment, useEffect, useState } from "react";

import { planRoll, ROLL_MS, type RollingRun, type RollPart } from "@/lib/motion/rolling";
import { prefersReducedMotion } from "@/lib/theme/motion";

/** A character drawn from its `data-c` (generated content holds no text), one em tall. */
const CELL = "inline-block leading-none before:content-[attr(data-c)]";
/**
 * A digit that changed: the new one in place, the old one (`data-from`) one
 * em above it (rolling up) or below it (rolling down), the pair moving one
 * em on dw-in from the old digit's place to rest.
 */
const ROLLING_CELL = `relative ${CELL} after:absolute after:inset-x-0 after:content-[attr(data-from)] data-[roll=up]:after:bottom-full data-[roll=down]:after:top-full motion-safe:animate-dw-in [--dw-opacity:1] data-[roll=up]:[--dw-y:100%] data-[roll=down]:[--dw-y:-100%]`;
/** The window: one em tall (the digit's height), a little wider than the digits so no glyph's edge is cut. */
const WINDOW = "inline-block leading-none whitespace-nowrap [clip-path:inset(0_-0.25em)]";

export function RollingNumbers({
  text,
  threshold = 0,
  hold = false,
  className,
}: {
  text: string;
  /** Changes at or under this jump (the deck total's 5: a ±1 edit never rolls). */
  threshold?: number;
  /** An interlude: shown as it is, and never what the next line rolls from. */
  hold?: boolean;
  /** A span around the text with this class, rendered only while there is text. */
  className?: string;
}) {
  const [seen, setSeen] = useState({ text, hold });
  const [basis, setBasis] = useState<string | null>(hold ? null : text);
  const [roll, setRoll] = useState<{ id: number; parts: RollPart[] } | null>(null);

  // The "previous render" pattern (useCountUp's): state adjusted during
  // render, only when the line changed, so the first render never rolls.
  if (text !== seen.text || hold !== seen.hold) {
    setSeen({ text, hold });
    if (hold) {
      setRoll(null);
    } else {
      const parts =
        basis !== null && basis !== text && !prefersReducedMotion()
          ? planRoll(basis, text, threshold)
          : null;
      setRoll(parts ? { id: (roll?.id ?? 0) + 1, parts } : null);
      setBasis(text);
    }
  }

  // Back to plain text once the roll has played (a hidden tab included).
  useEffect(() => {
    if (!roll) return;
    const id = setTimeout(() => setRoll(null), ROLL_MS + 50);
    return () => clearTimeout(id);
  }, [roll]);

  const body = roll ? (
    <Fragment key={roll.id}>
      {roll.parts.map((part, i) =>
        typeof part === "string" ? part : <RollingRunView key={i} run={part} />,
      )}
    </Fragment>
  ) : (
    text
  );
  if (className === undefined) return body;
  return text === "" ? null : <span className={className}>{body}</span>;
}

function RollingRunView({ run }: { run: RollingRun }) {
  return (
    <span data-slot="rolling-number">
      <span className="sr-only">{run.text}</span>
      <span aria-hidden className={WINDOW}>
        {run.cells.map((cell, i) =>
          cell.from === null ? (
            <span key={i} data-c={cell.char} className={CELL} />
          ) : (
            <span
              key={i}
              data-c={cell.char}
              data-from={cell.from}
              data-roll={run.dir}
              className={ROLLING_CELL}
            />
          ),
        )}
      </span>
    </span>
  );
}

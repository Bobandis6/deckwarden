/**
 * Rolling numbers (ROLLING-NUMBERS, 2026-11-03; DESIGN-REFERENCES-2026-11-02.md
 * idea 4, after Aceternity's "Speed Counter" for the one idea in it: the
 * digits move and nothing else does, and not its sideways smear). Where a
 * number is the feedback for an action (a sheet's price as swaps are
 * checked, the bracket number, the deck total), each digit that changed
 * rolls from its old value to its new one, every column turning the way the
 * number went: up when it grew, down when it fell. The currency sign, the
 * separators, the decimal point, the digits that kept their value and the
 * words around them stand still.
 *
 * Pure: `numberRuns` finds the numbers in a line of copy and `planRoll` says
 * which of them roll from an older line, and how. The line stays the copy
 * function's own string, never split in the copy: a number rolls only while
 * the line keeps its count of numbers (a line that changed shape changes at
 * once), the k-th number from the k-th, and a change at or under the
 * threshold jumps (useCountUp's rule, R3 F10). Digits pair by place, whole
 * digits from the right and decimals from the left, so $99 to $100 rolls
 * the tens and the ones and brings the hundreds in from blank.
 */

/** The roll's length: settle-250's slot (U2), which dw-in defaults to. */
export const ROLL_MS = 250;

/** A dollar sign, digits with their thousands commas, then the decimals. */
const NUMBER = /\$?\d+(?:,\d{3})*(?:\.\d+)?/g;

/** A number inside a line: its text, its value and where it starts. */
export interface NumberRun {
  text: string;
  value: number;
  at: number;
}

export function numberRuns(text: string): NumberRun[] {
  return Array.from(text.matchAll(NUMBER), (match) => ({
    text: match[0],
    value: Number(match[0].replace(/[$,]/g, "")),
    at: match.index,
  }));
}

/**
 * One character of a rolling number. `from` is the digit this place showed
 * before ("" for a place the old number didn't have); null stands still.
 */
export interface RollCell {
  char: string;
  from: string | null;
}

export interface RollingRun {
  /** The new number as the line writes it. */
  text: string;
  dir: "up" | "down";
  cells: RollCell[];
}

/** The new line in order: plain text, and the numbers that roll. */
export type RollPart = string | RollingRun;

/** A digit's place: `w0` the ones, `w1` the tens…, `f0` the first decimal. */
function placesOf(run: string): Map<string, string> {
  const point = run.indexOf(".");
  const whole = (point === -1 ? run : run.slice(0, point)).replace(/\D/g, "");
  const fraction = point === -1 ? "" : run.slice(point + 1);
  const places = new Map<string, string>();
  for (let i = 0; i < whole.length; i++) places.set(`w${whole.length - 1 - i}`, whole[i]);
  for (let i = 0; i < fraction.length; i++) places.set(`f${i}`, fraction[i]);
  return places;
}

function cellsOf(run: string, before: ReadonlyMap<string, string>): RollCell[] {
  const point = run.indexOf(".");
  let whole = (point === -1 ? run : run.slice(0, point)).replace(/\D/g, "").length;
  let decimal = 0;
  return Array.from(run, (char, i) => {
    if (!/\d/.test(char)) return { char, from: null };
    const place = point !== -1 && i > point ? `f${decimal++}` : `w${--whole}`;
    const was = before.get(place) ?? "";
    return { char, from: was === char ? null : was };
  });
}

/**
 * How `to` rolls from `from`: the new line's parts, or null when nothing
 * rolls (the count of numbers changed, or every number kept its text or
 * moved by no more than `threshold`).
 */
export function planRoll(from: string, to: string, threshold = 0): RollPart[] | null {
  const before = numberRuns(from);
  const after = numberRuns(to);
  if (after.length === 0 || before.length !== after.length) return null;
  const parts: RollPart[] = [];
  const push = (text: string) => {
    if (text === "") return;
    const last = parts.at(-1);
    if (typeof last === "string") parts[parts.length - 1] = last + text;
    else parts.push(text);
  };
  let rolled = false;
  let cursor = 0;
  after.forEach((run, i) => {
    push(to.slice(cursor, run.at));
    cursor = run.at + run.text.length;
    const was = before[i];
    if (was.text === run.text || Math.abs(run.value - was.value) <= threshold) {
      push(run.text);
      return;
    }
    rolled = true;
    parts.push({
      text: run.text,
      dir: run.value > was.value ? "up" : "down",
      cells: cellsOf(run.text, placesOf(was.text)),
    });
  });
  push(to.slice(cursor));
  return rolled ? parts : null;
}

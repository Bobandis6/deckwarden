/**
 * The Moxfield-shape commander guess (P2.8b). Moxfield's "Plain text" export
 * puts the commander(s) FIRST, unmarked — no header, no *CMDR*, no blank
 * line — with the other lines alphabetized under a locale collation. The
 * guess is POSITIONAL and SHAPE-GATED, never card-alone: guess the first
 * k lines (k = 1, then 2 — the commander zone's max) only when
 *   (i)   no line anywhere carries a commander zone hint,
 *   (ii)  lines 0..k-1 are unhinted, resolved, and commander-eligible,
 *   (iii) line k-1 sorts AFTER the next unhinted line (the break a
 *         leading commander makes in an otherwise sorted list), and
 *   (iv)  the remaining unhinted lines are non-decreasing.
 * (iv) skips hinted lines, so a trailing "SIDEBOARD:" section neither breaks
 * nor rescues the shape. The comparator must be Intl.Collator("en") —
 * Moxfield sorts "Sokka, Swordmaster" before "Sokka's Charge", which a
 * code-unit comparison inverts (`,` < `'` in code units only).
 *
 * Known miss, by design: a commander that happens to sort first (no break)
 * is not guessed — the honest failure is the old behavior, and the review
 * step discloses every guess before apply. Pure; pins in import-guess.test.ts.
 */
import { isEligibleCommander } from "./validate";

interface GuessLine {
  rawName: string;
  qty: number;
  zoneHint?: string;
}

type GuessCard = { name: string; isLeaderCandidate: boolean } | null | undefined;

export function mtgImportLeaderGuess(
  lines: readonly GuessLine[],
  cards: readonly GuessCard[],
): number[] {
  // (i) An explicit commander hint anywhere = the paste declares its zones.
  if (lines.some((l) => l.zoneHint === "commander")) return [];

  const unhinted = lines.map((_, i) => i).filter((i) => !lines[i].zoneHint);
  const collator = new Intl.Collator("en");
  const cmp = (a: number, b: number) => collator.compare(lines[a].rawName, lines[b].rawName);

  // k = 1 first: a lone commander's break at line 1 (Toph > Aang) decides
  // before the pair shape is ever consulted, so an eligible line 2 in a
  // sorted run (Aang < Abandoned) is never dragged along.
  for (const k of [1, 2]) {
    if (unhinted.length <= k) continue;
    // (ii) positional: the guessed lines are literally lines 0..k-1.
    if (unhinted[k - 1] !== k - 1) continue;
    const leaders = unhinted.slice(0, k);
    if (
      !leaders.every((i) => {
        const card = cards[i];
        return card != null && isEligibleCommander(card);
      })
    )
      continue;
    const rest = unhinted.slice(k);
    if (cmp(k - 1, rest[0]) <= 0) continue; // (iii) no break — sorted through
    let sorted = true;
    for (let j = 1; j < rest.length; j++) {
      if (cmp(rest[j - 1], rest[j]) > 0) {
        sorted = false;
        break;
      }
    }
    if (!sorted) continue; // (iv)
    return leaders;
  }
  return [];
}

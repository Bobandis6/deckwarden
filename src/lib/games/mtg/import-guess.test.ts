import { describe, expect, it } from "vitest";

import { parseMtgDecklist } from "./decklist";
import { mtgImportLeaderGuess } from "./import-guess";
import { card, MOXFIELD_TLA_PASTE } from "./test-fixtures";

/** Eligible-commander wire per rawName; only the named ones are eligible. */
function cardsFor(rawNames: readonly string[], eligible: readonly string[]) {
  return rawNames.map((name) => card({ name, isLeaderCandidate: eligible.includes(name) }));
}

function guessNames(text: string, eligible: readonly string[]): string[] {
  const { lines } = parseMtgDecklist(text);
  const cards = cardsFor(
    lines.map((l) => l.rawName),
    eligible,
  );
  return mtgImportLeaderGuess(lines, cards).map((i) => lines[i].rawName);
}

describe("mtgImportLeaderGuess — the Moxfield-shape commander guess (P2.8b)", () => {
  it("re-measures the owner's paste through the real tokenizer", () => {
    const { lines, warnings } = parseMtgDecklist(MOXFIELD_TLA_PASTE);
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(80);
    expect(lines.every((l) => !l.zoneHint)).toBe(true);
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(100);
    // Decision 6: Moxfield's single slash arrives widened to " // ".
    expect(lines.map((l) => l.rawName)).toContain("The Legend of Kyoshi // Avatar Kyoshi");
  });

  it("guesses exactly Toph from the owner's paste — Aang (eligible, line 2) is NOT promoted", () => {
    // The Sokka canary rides along: "Sokka, Swordmaster" precedes
    // "Sokka's Charge" only under the locale collator ("," sorts before "'"
    // in code units) — a code-unit comparator would fail the sorted-run
    // check and kill the guess for the whole paste.
    expect(
      guessNames(MOXFIELD_TLA_PASTE, ["Toph, the First Metalbender", "Aang, Airbending Master"]),
    ).toEqual(["Toph, the First Metalbender"]);
  });

  it("guesses a partner pair (two eligible first lines, sorted remainder)", () => {
    const text = [
      "1 Thrasios, Triton Hero",
      "1 Tymna the Weaver",
      "1 Arcane Signet",
      "1 Command Tower",
      "1 Sol Ring",
    ].join("\n");
    expect(guessNames(text, ["Thrasios, Triton Hero", "Tymna the Weaver"])).toEqual([
      "Thrasios, Triton Hero",
      "Tymna the Weaver",
    ]);
  });

  it("no guess when the commander sorts first alphabetically — the known miss", () => {
    const text = ["1 Aang, Airbending Master", "1 Abandoned Air Temple", "1 Sol Ring"].join("\n");
    expect(guessNames(text, ["Aang, Airbending Master"])).toEqual([]);
  });

  it("no guess for an unsorted hand-typed list", () => {
    const text = ["1 Toph, the First Metalbender", "1 Sol Ring", "1 Arcane Signet"].join("\n");
    expect(guessNames(text, ["Toph, the First Metalbender"])).toEqual([]);
  });

  it("any commander header or marker disables the guess — the hint path owns it", () => {
    const header = ["Commander", "1 Toph, the First Metalbender", "1 Arcane Signet"].join("\n");
    expect(guessNames(header, ["Toph, the First Metalbender"])).toEqual([]);
    const marker = ["1 Toph, the First Metalbender *CMDR*", "1 Arcane Signet"].join("\n");
    expect(guessNames(marker, ["Toph, the First Metalbender"])).toEqual([]);
  });

  it("a section header like SIDEBOARD: neither breaks nor rescues the sorted run", () => {
    // The existing "Moxfield text export" tokenizer fixture's shape: the
    // sorted-run check (iv) runs over UNHINTED lines only.
    const text = [
      "1 Atraxa, Praetors' Voice (2X2) 190 *F*",
      "1 Arcane Signet (AFC) 95",
      "1 Beast Within (PIP) 96",
      "10 Forest (SLD) 106",
      "",
      "SIDEBOARD:",
      "1 Swords to Plowshares (STA) 10",
    ].join("\n");
    expect(guessNames(text, ["Atraxa, Praetors' Voice"])).toEqual(["Atraxa, Praetors' Voice"]);
  });

  it("no guess when line 1 is unresolved or not commander-eligible", () => {
    const { lines } = parseMtgDecklist(MOXFIELD_TLA_PASTE);
    const names = lines.map((l) => l.rawName);
    // Not eligible:
    expect(mtgImportLeaderGuess(lines, cardsFor(names, []))).toEqual([]);
    // Unresolved:
    const cards = cardsFor(names, ["Toph, the First Metalbender"]).map((c, i) =>
      i === 0 ? null : c,
    );
    expect(mtgImportLeaderGuess(lines, cards)).toEqual([]);
  });
});

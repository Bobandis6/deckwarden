/**
 * PRECON-OWNED's copy guard (the BRACKET_COPY guard's pattern): every
 * string PRECON_COPY can produce, its builders called with real product
 * names (the catalog's longest, a colon, a comma, parentheses, and the
 * three that begin with "The"), under U9's policy: no em or en dash, no
 * middle dot, never a multi-dot line, no notation, and a precon named so
 * that "The" never follows "the".
 */
import { describe, expect, it } from "vitest";

import { ownershipMethod } from "./ownership";
import { PRECON_COPY } from "./precon-copy";

/** The table's word-builders: the guard calls each one (a new one must join it here). */
const BUILDERS = ["ask", "owned", "notOwned"];

/** Product names from the dev branch's 182 precons (2026-10-24). */
const NAMES = [
  "Breed Lethality",
  "Angels: They're Just Like Us but Cooler and with Wings",
  "Scions & Spellcraft (FINAL FANTASY XIV)",
  "Heads I Win, Tails You Lose",
  "The Hosts of Mordor",
  "The Fantastic Four",
  "The Ruinous Powers",
];

function everyString(): string[] {
  const C = PRECON_COPY;
  return [
    ...Object.values(C).flatMap((v) => (typeof v === "string" ? [v] : [])),
    ...NAMES.flatMap((name) => [C.ask(name), C.owned(name), C.notOwned(name)]),
    ownershipMethod({ collection: false, precon: true }),
    ownershipMethod({ collection: true, precon: true }),
  ];
}

describe("PRECON_COPY — the line's words", () => {
  it("unanswered: the precon's name and the brief's question; Yes and No", () => {
    expect(PRECON_COPY.ask("Breed Lethality")).toBe(
      "Started from Breed Lethality, a precon. Do you own it?",
    );
    expect([PRECON_COPY.yes, PRECON_COPY.no]).toEqual(["Yes", "No"]);
  });

  it("answered: a quiet line naming the precon, and Change", () => {
    expect(PRECON_COPY.owned("Breed Lethality")).toBe(
      "Started from Breed Lethality, a precon you own.",
    );
    expect(PRECON_COPY.notOwned("Breed Lethality")).toBe(
      "Started from Breed Lethality, a precon you don't own.",
    );
    expect(PRECON_COPY.change).toBe("Change");
  });

  it("the method's sentence: copies, up to the precon's own quantities", () => {
    expect(PRECON_COPY.method).toBe(
      "Cards from the precon you own count as owned, up to the precon's own quantities.",
    );
  });

  it("a name that begins with The reads as a name: never 'the The'", () => {
    expect(PRECON_COPY.ask("The Hosts of Mordor")).toBe(
      "Started from The Hosts of Mordor, a precon. Do you own it?",
    );
    expect(everyString().filter((s) => /\bthe The\b/.test(s))).toEqual([]);
  });
});

describe("copy guard (U9)", () => {
  it("reads every string the table has: each plain string and each builder", () => {
    const builders = Object.entries(PRECON_COPY)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    expect(builders.sort()).toEqual([...BUILDERS].sort());
    expect(everyString().length).toBeGreaterThan(Object.keys(PRECON_COPY).length);
  });

  it("no em or en dash, no middle dot, never a multi-dot line", () => {
    const words = everyString();
    expect(words.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(words.filter((w) => w.includes("·"))).toEqual([]);
    expect(words.filter((w) => /\.\./.test(w))).toEqual([]);
  });

  it("plain words, never notation: no '+', no 'est.', no '=' in the precon's own sentences", () => {
    const own = [
      ...Object.values(PRECON_COPY).flatMap((v) => (typeof v === "string" ? [v] : [])),
      ...NAMES.flatMap((n) => [PRECON_COPY.ask(n), PRECON_COPY.owned(n), PRECON_COPY.notOwned(n)]),
    ];
    expect(own.filter((s) => /\d\+|est\.|=/i.test(s))).toEqual([]);
  });

  it("every sentence ends: a period or the question mark, the controls aside", () => {
    const sentences = everyString().filter(
      (s) => ![PRECON_COPY.yes, PRECON_COPY.no, PRECON_COPY.change].includes(s as never),
    );
    expect(sentences.filter((s) => !/[.?]$/.test(s))).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { mtgBuy } from "@/lib/games/mtg/buy";
import { card } from "@/lib/games/mtg/test-fixtures";

import {
  MASS_ENTRY_URL_MAX,
  bareMassEntryUrl,
  deckBuyOptions,
  massEntryHref,
  massEntryUrl,
  withPartner,
} from "./links";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("massEntryUrl", () => {
  it("matches the live-verified shape exactly", () => {
    // Round-tripped against tcgplayer.com/massentry 2026-09-20: pre-fills
    // "1 Sol Ring" + "33 Mountain" and selects Magic: The Gathering.
    expect(massEntryUrl("Magic", ["1 Sol Ring", "33 Mountain"])).toBe(
      "https://www.tcgplayer.com/massentry?productline=Magic&c=1%20Sol%20Ring%7C%7C33%20Mountain",
    );
  });

  it("keeps split-card slashes distinct from the || separator", () => {
    expect(massEntryUrl("Magic", ["1 Wear // Tear"])).toContain("c=1%20Wear%20%2F%2F%20Tear");
  });
});

describe("withPartner", () => {
  it("is the identity while the env var is empty (Hobby posture)", () => {
    expect(withPartner("https://www.tcgplayer.com/massentry?productline=Magic")).toBe(
      "https://www.tcgplayer.com/massentry?productline=Magic",
    );
  });

  it("wraps and double-encodes once set (the affiliate day)", () => {
    vi.stubEnv("NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE", "https://partner.example/c/1/2?u=");
    expect(withPartner("https://www.tcgplayer.com/massentry?c=1%20Sol%20Ring")).toBe(
      "https://partner.example/c/1/2?u=https%3A%2F%2Fwww.tcgplayer.com%2Fmassentry%3Fc%3D1%2520Sol%2520Ring",
    );
  });
});

describe("massEntryHref", () => {
  const longLines = Array.from(
    { length: 99 },
    (_, i) => `9 Extremely Long Card Name ${i} of Verbose Grandeur, the Unabridged Edition`,
  );

  it("stays a link under the cliff", () => {
    const href = massEntryHref("Magic", ["1 Sol Ring"]);
    expect(href).toEqual({
      kind: "link",
      url: "https://www.tcgplayer.com/massentry?productline=Magic&c=1%20Sol%20Ring",
    });
  });

  it("becomes the copy-list path over the cliff, with the bare form URL", () => {
    const href = massEntryHref("Magic", longLines);
    expect(href.kind).toBe("copy");
    if (href.kind !== "copy") throw new Error("unreachable");
    expect(href.text).toBe(longLines.join("\n"));
    expect(href.bareUrl).toBe("https://www.tcgplayer.com/massentry?productline=Magic");
    expect(massEntryUrl("Magic", longLines).length).toBeGreaterThan(MASS_ENTRY_URL_MAX);
  });

  it("measures the cliff on the FINAL url — the partner wrap can push it over", () => {
    // A list that fits bare but not after the wrap's double encoding.
    const lines = Array.from(
      { length: 60 },
      (_, i) => `9 Long Card Name Number ${i} With Padding Words`,
    );
    expect(massEntryHref("Magic", lines).kind).toBe("link");
    vi.stubEnv(
      "NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE",
      `https://partner.example/c/1/2?u=${"x".repeat(1000)}`,
    );
    const wrapped = massEntryHref("Magic", lines);
    expect(wrapped.kind).toBe("copy");
    if (wrapped.kind !== "copy") throw new Error("unreachable");
    // The copy path's bare form target still goes through the partner.
    expect(wrapped.bareUrl.startsWith("https://partner.example/")).toBe(true);
  });
});

describe("deckBuyOptions", () => {
  const solRing = card({ name: "Sol Ring", attrs: { type_line: "Artifact", oracle_text: "" } });
  const mountain = card({
    name: "Mountain",
    attrs: { type_line: "Basic Land — Mountain", oracle_text: "" },
  });
  const bolt = card({
    name: "Lightning Bolt",
    attrs: { type_line: "Instant", oracle_text: "" },
  });
  const cards = new Map([
    [solRing.id, solRing],
    [mountain.id, mountain],
    [bolt.id, bolt],
  ]);
  const entries = [
    { cardId: solRing.id, qty: 1 },
    { cardId: mountain.id, qty: 33 },
    { cardId: bolt.id, qty: 1 },
  ];

  it("returns Whole deck + Without basic lands with per-copy counts", () => {
    const options = deckBuyOptions(mtgBuy, entries, cards);
    expect(options.map((o) => [o.id, o.label, o.count])).toEqual([
      ["all", "Whole deck", 35],
      ["nonbasic", "Without basic lands", 2],
    ]);
    expect(options[0].lines).toEqual(["1 Sol Ring", "33 Mountain", "1 Lightning Bolt"]);
    expect(options[1].lines).toEqual(["1 Sol Ring", "1 Lightning Bolt"]);
  });

  it("adds Only cards I'm missing exactly when owned is present, per-copy math", () => {
    expect(deckBuyOptions(mtgBuy, entries, cards).some((o) => o.id === "missing")).toBe(false);
    // Owns Sol Ring only → missing = 33 Mountains + 1 Bolt = 34 copies,
    // the same math as the page's "You own 1/35".
    const withOwned = deckBuyOptions(mtgBuy, entries, cards, new Set([solRing.id]));
    const missing = withOwned.find((o) => o.id === "missing");
    expect(missing).toMatchObject({ label: "Only cards I'm missing", count: 34 });
    expect(missing?.lines).toEqual(["33 Mountain", "1 Lightning Bolt"]);
    // Owns everything → the option exists with an honest zero.
    const all = new Set([solRing.id, mountain.id, bolt.id]);
    expect(deckBuyOptions(mtgBuy, entries, cards, all).find((o) => o.id === "missing")?.count).toBe(
      0,
    );
  });

  it("skips entries whose card is not in the map", () => {
    const options = deckBuyOptions(mtgBuy, [...entries, { cardId: "ghost", qty: 4 }], cards);
    expect(options[0].count).toBe(35);
  });

  it("bareMassEntryUrl keeps the product line", () => {
    expect(bareMassEntryUrl("Magic")).toBe("https://www.tcgplayer.com/massentry?productline=Magic");
  });
});

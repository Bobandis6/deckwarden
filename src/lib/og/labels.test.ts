import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GAME_ID } from "@/db/seed-data";
import { declaredLabel } from "@/lib/brackets/copy";
import { getAdapter } from "@/lib/games/registry";

import { deckOgLabels } from "./labels";

describe("deckOgLabels", () => {
  it("MTG unfurls keep the P2.6 vocabulary and fetch art", () => {
    const { declared, ...words } = deckOgLabels(GAME_ID.mtg);
    expect(words).toEqual({
      kicker: "Commander deck",
      curveLabel: "Mana curve",
      fetchArt: true,
      accent: "#b5a2ff",
    });
    expect(declared).toBeTypeOf("function");
  });

  it("Y5: the declared target's stat is core's declaredLabel over the adapter's noun, 1–5 only", () => {
    const { declared } = deckOgLabels(GAME_ID.mtg);
    const brackets = getAdapter("mtg").brackets!;
    for (const { level } of brackets.levels) {
      expect(declared!(level)).toBe(declaredLabel(brackets, level));
    }
    expect(declared!(3)).toBe("Bracket 3 (declared)");
    expect([declared!(0), declared!(6), declared!(2.5)]).toEqual([null, null, null]);
    // One Piece has no brackets: no stat, whatever a row holds.
    expect(deckOgLabels(GAME_ID.optcg).declared).toBeUndefined();
  });

  it("OP unfurls are game-true and ARTLESS — the P4.1/P4.4 posture extends to decks", () => {
    expect(deckOgLabels(GAME_ID.optcg)).toEqual({
      kicker: "One Piece deck",
      curveLabel: "Cost curve",
      fetchArt: false,
      accent: "#62d6c5",
    });
  });

  it("an unmapped game gets neutral words and no assumed art source", () => {
    expect(deckOgLabels(GAME_ID.azuki)).toEqual({
      kicker: "Deck",
      curveLabel: "Cost curve",
      fetchArt: false,
      accent: "#c9a96a",
    });
  });
});

describe("the deck unfurl never computes a read (Y5, D6)", () => {
  it("the OG route and its reads import no adapter, engine or bracket module", () => {
    const files = [
      "src/app/(site)/d/[publicId]/opengraph-image.tsx",
      "src/lib/og/data.ts",
      "src/lib/og/labels.ts",
      "src/lib/decks/collections.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      expect(
        imports.filter((i) => /lib\/(games|brackets)|registry/.test(i)),
        file,
      ).toEqual([]);
    }
  });
});

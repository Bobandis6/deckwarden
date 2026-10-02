/**
 * Y3a — the ruleset watch: the nightly's check that Scryfall's Game Changers
 * still match the ruleset's pin, and its exact failure sentence (WAVE4 D3).
 */
import { describe, expect, it } from "vitest";

import { BRACKET_RULESET } from "./bracket-ruleset";
import { GAME_CHANGERS_CHANGED, watchGameChangers, type WatchedRun } from "./ruleset-watch";

const pinned = { asOf: "2026-02-09", count: 53, md5: "38ff92800a67529ee6b9fa81f4203033" };

function run(stats: unknown): WatchedRun {
  return { id: 250, startedAt: "2026-10-02T10:40:00.000Z", stats };
}

describe("the pinned ruleset", () => {
  it("pins the Game Changers measured on 2026-10-01 against Wizards' 2026-02-09 list", () => {
    expect(BRACKET_RULESET.version).toBe(1);
    expect(BRACKET_RULESET.gameChangers).toEqual(pinned);
  });
});

describe("watchGameChangers", () => {
  it("passes when Scryfall's set matches the pin", () => {
    const result = watchGameChangers(run({ game_changers: { count: 53, md5: pinned.md5 } }));
    expect(result).toEqual({
      ok: true,
      message:
        "Game Changers match the ruleset: 53 cards as of 2026-02-09 (run #250 of 2026-10-02T10:40:00.000Z).",
    });
  });

  it("fails with D3's sentence, then both counts and hashes, when the set changed", () => {
    const result = watchGameChangers(run({ game_changers: { count: 54, md5: "f".repeat(32) } }));
    expect(GAME_CHANGERS_CHANGED).toBe(
      "The Game Changers list changed on Scryfall — read Wizards' announcement, then update the ruleset's as-of date and hash.",
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      `${GAME_CHANGERS_CHANGED}\nScryfall: 54 cards (md5 ${"f".repeat(32)}) in run #250 of ` +
        `2026-10-02T10:40:00.000Z · the ruleset: 53 cards as of 2026-02-09 (md5 ${pinned.md5}).`,
    );
  });

  it("a same-size swap still fails: the hash is the check, not the count", () => {
    const result = watchGameChangers(run({ game_changers: { count: 53, md5: "0".repeat(32) } }));
    expect(result.ok).toBe(false);
  });

  it("fails when the latest successful run recorded no Game Changers", () => {
    for (const stats of [{}, null, { game_changers: { count: "53" } }, { game_changers: null }]) {
      const result = watchGameChangers(run(stats));
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/recorded no Game Changers/);
    }
  });

  it("fails when there is no successful run at all", () => {
    expect(watchGameChangers(null)).toEqual({
      ok: false,
      message: "No successful Scryfall run to compare yet.",
    });
  });
});

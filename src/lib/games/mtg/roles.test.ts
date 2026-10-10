/**
 * Y7a — Swap Lab's role whitelist (WAVE4 D8): declared by Tagger UUID,
 * keyed by our own stable words, and exactly what the overrides file
 * switches.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isMtgRoleKey, MTG_ROLE_KEYS, MTG_ROLES, mtgRole, taggerTagUrl } from "./roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("MTG_ROLES", () => {
  it("is the measured whitelist of 17, in display order", () => {
    expect(MTG_ROLE_KEYS).toEqual([
      "ramp",
      "mana-rock",
      "mana-dork",
      "land-ramp",
      "card-draw",
      "tutor",
      "creature-removal",
      "artifact-removal",
      "enchantment-removal",
      "spot-removal",
      "board-wipe",
      "counterspell",
      "burn",
      "protection",
      "recursion",
      "token-maker",
      "sacrifice-outlet",
    ]);
  });

  it("pins every tag by a distinct UUID, keys and labels in our own plain words", () => {
    const ids = MTG_ROLES.flatMap((r) => [
      r.tag.id,
      ...("except" in r ? r.except.map((e) => e.id) : []),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const role of MTG_ROLES) {
      expect(role.tag.id).toMatch(UUID);
      expect(role.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(role.label).toBe(role.key.replace(/-/g, " "));
      expect(role.tag.slug).toMatch(/^[a-z0-9-]+$/);
    }
    // The two parts of Tagger's tree that do a different job.
    expect(mtgRole("tutor").except?.map((e) => e.slug)).toEqual(["tutor-land"]);
    expect(mtgRole("recursion").except?.map((e) => e.slug)).toEqual([
      "recursion-self",
      "recursion-land",
    ]);
  });

  it("is exactly what the overrides file switches", () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/mtg/tagger-overrides.json"), "utf8"),
    ) as { roles: Record<string, unknown> };
    expect(Object.keys(raw.roles)).toEqual([...MTG_ROLE_KEYS]);
  });

  it("knows its keys, and links a tag by slug", () => {
    expect(isMtgRoleKey("mana-rock")).toBe(true);
    expect(isMtgRoleKey("lifegain")).toBe(false);
    expect(isMtgRoleKey(3)).toBe(false);
    expect(taggerTagUrl("mana-rock")).toBe("https://tagger.scryfall.com/tags/card/mana-rock");
  });
});

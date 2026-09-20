import { describe, expect, it } from "vitest";

import fixture from "./mtgjson-map.fixture.json";
import {
  collectorsEditionBaseName,
  colorPhrase,
  isCollectorsEdition,
  mapPrecon,
  preconDescription,
  preconHashPayload,
  preconSlug,
} from "./mtgjson-map";

/** The real captured file's data object (see fixture __capture note). */
const DATA = fixture.data;

describe("mapPrecon on the captured Timey-Wimey file", () => {
  it("maps the partner pair to the commander zone and the rest to main", () => {
    const result = mapPrecon(DATA);
    if (!result.ok) throw new Error(`expected ok, got skip=${result.skip}`);
    const { precon } = result;
    expect(precon.setCode).toBe("WHO");
    expect(precon.name).toBe("Timey-Wimey");
    expect(precon.releaseDate).toBe("2023-10-13");

    const commanders = precon.entries.filter((e) => e.zone === "commander");
    expect(commanders.map((e) => e.name)).toEqual(["The Tenth Doctor", "Rose Tyler"]);
    expect(commanders.every((e) => e.qty === 1)).toBe(true);
    // Oracle id rides through untouched — it IS external_key at resolve time.
    expect(commanders[0].oracleId).toBe("23af0a0a-1d12-47c7-b191-2bd3f84eea93");
    expect(commanders[0].scryfallId).toBe("f1499f49-793b-4265-9ad0-883a431941ab");
  });

  it("merges two printings of the same basic into one entry (deck_cards PK is per identity)", () => {
    const result = mapPrecon(DATA);
    if (!result.ok) throw new Error("expected ok");
    const plains = result.precon.entries.filter((e) => e.name === "Plains");
    expect(plains).toHaveLength(1);
    expect(plains[0].qty).toBe(3); // #196 x2 + #197 x1
    // The higher-count printing represents the merged entry, whatever the row order.
    expect(plains[0].scryfallId).toBe("2c4d8ef3-2b26-4376-a00e-ccd58e3ea2eb");
  });

  it("keeps a split card as one row with the full A // B name", () => {
    const result = mapPrecon(DATA);
    if (!result.ok) throw new Error("expected ok");
    const split = result.precon.entries.filter((e) => e.name === "Coward // Killer");
    expect(split).toHaveLength(1);
    expect(split[0].qty).toBe(1);
  });

  it("warns about planes and ignores them (WHO ships planechase extras)", () => {
    const result = mapPrecon(DATA);
    if (!result.ok) throw new Error("expected ok");
    expect(result.precon.warnings).toContain("planes: 1 row(s) ignored");
    expect(
      result.precon.entries.find((e) => e.name === "The Lux Foundation Library"),
    ).toBeUndefined();
  });

  it("dedupes a two-row DFC-side shape by oracle id without doubling quantity", () => {
    // Defensive branch: no live file shows it, but a second row of the SAME
    // printing must collapse to one card, not two.
    const doubled = {
      ...DATA,
      mainBoard: [...DATA.mainBoard, { ...DATA.mainBoard[1], side: "b" }],
    };
    const result = mapPrecon(doubled);
    if (!result.ok) throw new Error("expected ok");
    const split = result.precon.entries.filter((e) => e.name === "Coward // Killer");
    expect(split).toHaveLength(1);
    expect(split[0].qty).toBe(1);
  });

  it("moves commander overflow (>2) to main with a warning", () => {
    const third = { ...DATA.mainBoard[0] };
    const overloaded = { ...DATA, commander: [...DATA.commander, third] };
    const result = mapPrecon(overloaded);
    if (!result.ok) throw new Error("expected ok");
    const commanders = result.precon.entries.filter((e) => e.zone === "commander");
    expect(commanders).toHaveLength(2);
    const moved = result.precon.entries.filter(
      (e) => e.zone === "main" && e.name === "Wilfred Mott",
    );
    expect(moved).toHaveLength(1);
    expect(moved[0].qty).toBe(2); // the main-board copy + the overflow copy
    expect(result.precon.warnings.some((w) => w.includes("commander overflow"))).toBe(true);
  });

  it("skips non-Commander types and rows without oracle ids", () => {
    expect(mapPrecon({ ...DATA, type: "Theme Deck" })).toMatchObject({
      ok: false,
      skip: "not_commander_deck",
    });
    const broken = {
      ...DATA,
      mainBoard: [{ name: "Mystery", count: 1, identifiers: {} }],
    };
    expect(mapPrecon(broken)).toMatchObject({
      ok: false,
      skip: "missing_oracle_id",
      detail: "Mystery",
    });
    expect(mapPrecon({ ...DATA, commander: [] })).toMatchObject({
      ok: false,
      skip: "no_commander",
    });
    expect(mapPrecon(null)).toMatchObject({ ok: false, skip: "parse" });
  });
});

describe("preconHashPayload", () => {
  it("is row-order independent and quantity sensitive", () => {
    const a = mapPrecon(DATA);
    const b = mapPrecon({ ...DATA, mainBoard: [...DATA.mainBoard].reverse() });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(preconHashPayload(a.precon)).toBe(preconHashPayload(b.precon));

    const bumped = {
      ...DATA,
      mainBoard: DATA.mainBoard.map((r, i) => (i === 0 ? { ...r, count: 2 } : r)),
    };
    const c = mapPrecon(bumped);
    if (!c.ok) throw new Error("expected ok");
    expect(preconHashPayload(c.precon)).not.toBe(preconHashPayload(a.precon));
  });
});

describe("preconSlug", () => {
  it("suffixes the set code (anthology reprints collide on bare names)", () => {
    expect(preconSlug("Breed Lethality", "C16")).toBe("breed_lethality_c16");
    expect(preconSlug("Evasive Maneuvers", "CMA")).toBe("evasive_maneuvers_cma");
    expect(preconSlug("Evasive Maneuvers", "C13")).toBe("evasive_maneuvers_c13");
  });

  it("drops franchise parentheticals and stays within the 30-char budget", () => {
    expect(preconSlug("Scions & Spellcraft (FINAL FANTASY XIV)", "FIC")).toBe(
      "scions_spellcraft_fic",
    );
    const long = preconSlug("Forces of the Imperium and Friends Forever", "40K");
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith("_40k")).toBe(true);
    expect(`p_${long}`).toMatch(/^[a-z0-9_]{4,32}$/);
  });

  it("every emitted slug fits the public_id regex", () => {
    for (const [name, set] of [
      ["Timey-Wimey", "WHO"],
      ["The Ruinous Powers", "40K"],
      ["Ahoy Mateys", "LCC"],
    ] as const) {
      expect(`p_${preconSlug(name, set)}`).toMatch(/^[a-z0-9_]{4,32}$/);
    }
  });
});

describe("Collector's Edition detection", () => {
  it("matches trailing and mid-name phrases", () => {
    expect(isCollectorsEdition("Forces of the Imperium Collector's Edition")).toBe(true);
    expect(isCollectorsEdition("Limit Break Collector's Edition (FINAL FANTASY VII)")).toBe(true);
    expect(isCollectorsEdition("Forces of the Imperium")).toBe(false);
  });

  it("recovers the regular sibling's name", () => {
    expect(collectorsEditionBaseName("Forces of the Imperium Collector's Edition")).toBe(
      "Forces of the Imperium",
    );
    expect(collectorsEditionBaseName("Limit Break Collector's Edition (FINAL FANTASY VII)")).toBe(
      "Limit Break (FINAL FANTASY VII)",
    );
  });
});

describe("preconDescription", () => {
  it("is factual: colors, commanders, set, release, count", () => {
    expect(
      preconDescription({
        ciMask: 1 | 2 | 8, // W U R
        commanderNames: ["The Tenth Doctor", "Rose Tyler"],
        setName: "Doctor Who",
        setCode: "WHO",
        releaseDate: "2023-10-13",
        cardCount: 100,
      }),
    ).toBe(
      "White-Blue-Red Commander precon led by The Tenth Doctor and Rose Tyler. " +
        "Official Doctor Who (WHO) product list, released October 2023. 100 cards.",
    );
  });

  it("names the degenerate color cases", () => {
    expect(colorPhrase(0)).toBe("Colorless");
    expect(colorPhrase(31)).toBe("Five-color");
    expect(colorPhrase(16)).toBe("Green");
  });
});

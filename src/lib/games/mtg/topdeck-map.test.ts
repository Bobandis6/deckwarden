import { describe, expect, it } from "vitest";

import {
  commanderNamesFrom,
  hasCardList,
  mapTournament,
  MIN_EVENT_PLAYERS,
  TOP_PLACEMENT,
  type TopdeckStanding,
  type TopdeckTournament,
} from "./topdeck-map";

/** A plausible embedded mainboard: N distinct card-name keys. */
function mainboard(n: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`Card ${i}`, 1]));
}

/** name_norm → id, as the ingest script builds from card_identities. */
const NORM_TO_ID: Record<string, string> = {
  "kinnan, bonder prodigy": "id-kinnan",
  "tymna the weaver": "id-tymna",
  "thrasios, triton hero": "id-thrasios",
  "kraum, ludevic's opus": "id-kraum",
};
const resolve = (norm: string) => NORM_TO_ID[norm];

/** Modeled on the documented POST /v2/tournaments bulk shape (docs 2026-09-01). */
function standing(overrides: Partial<TopdeckStanding> = {}): TopdeckStanding {
  return {
    standing: 1,
    name: "Some Player",
    decklist: "https://moxfield.com/decks/abc123",
    deckObj: { Commanders: { "Kinnan, Bonder Prodigy": { count: 1 } }, Mainboard: {} },
    wins: 4,
    draws: 1,
    losses: 0,
    ...overrides,
  };
}

/** MIN_EVENT_PLAYERS standings; index i places i+1 unless overridden. */
function tournament(overrides: Partial<TopdeckTournament> = {}): TopdeckTournament {
  return {
    TID: "tid-1",
    tournamentName: "Weekly cEDH",
    startDate: 1756512000, // 2025-08-30 UTC
    topCut: 4,
    standings: Array.from({ length: MIN_EVENT_PLAYERS }, (_, i) => standing({ standing: i + 1 })),
    ...overrides,
  };
}

describe("commanderNamesFrom", () => {
  it("reads deckObj Commanders keys first", () => {
    expect(commanderNamesFrom(standing())).toEqual(["Kinnan, Bonder Prodigy"]);
  });

  it("accepts a singular 'Commander' section key", () => {
    expect(
      commanderNamesFrom(standing({ deckObj: { Commander: { "Tymna the Weaver": 1 } } })),
    ).toEqual(["Tymna the Weaver"]);
  });

  it("falls back to the ~~Commanders~~ decklist text section, stripping quantities", () => {
    const s = standing({
      deckObj: undefined,
      decklist:
        "~~Commanders~~\n1 Tymna the Weaver\n1x Kraum, Ludevic's Opus\n~~Mainboard~~\n1 Sol Ring",
    });
    expect(commanderNamesFrom(s)).toEqual(["Tymna the Weaver", "Kraum, Ludevic's Opus"]);
  });

  it("returns null for a bare decklist URL (never followed) and for no data at all", () => {
    expect(commanderNamesFrom(standing({ deckObj: undefined }))).toBeNull();
    expect(commanderNamesFrom(standing({ deckObj: undefined, decklist: undefined }))).toBeNull();
  });
});

describe("mapTournament", () => {
  it("maps a clean event: rows, placement, record, decklist URL, disclosed bounds", () => {
    const res = mapTournament(tournament(), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.tournament).toEqual({
      external_key: "tid-1",
      name: "Weekly cEDH",
      start_date: "2025-08-30",
      player_count: MIN_EVENT_PLAYERS,
      top_cut: 4,
    });
    expect(res.standings).toHaveLength(Math.min(TOP_PLACEMENT, MIN_EVENT_PLAYERS));
    expect(res.standings[0]).toEqual({
      external_key: "tid-1",
      placement: 1,
      player_name: "Some Player",
      leader_ids: ["id-kinnan"],
      decklist_url: "https://moxfield.com/decks/abc123",
      wins: 4,
      draws: 1,
      losses: 0,
    });
    expect(res.standingSkips).toEqual({});
  });

  it("resolves a partner pair to two sorted leader ids (deckObj and text alike)", () => {
    const viaObj = standing({
      standing: 1,
      deckObj: { Commanders: { "Tymna the Weaver": 1, "Thrasios, Triton Hero": 1 } },
    });
    const viaText = standing({
      standing: 2,
      deckObj: undefined,
      decklist: "~~Commanders~~\n1 Thrasios, Triton Hero\n1 Tymna the Weaver\n~~Mainboard~~",
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 2 }, (_, i) =>
      standing({ standing: i + 3 }),
    );
    const res = mapTournament(tournament({ standings: [viaObj, viaText, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    // Sorted ids regardless of source order — deterministic rows for change-skip merges.
    expect(res.standings[0].leader_ids).toEqual(["id-thrasios", "id-tymna"]);
    expect(res.standings[1].leader_ids).toEqual(["id-thrasios", "id-tymna"]);
  });

  it("skips unresolved commanders with a counted reason — exact name_norm only, no fuzzy", () => {
    const unknown = standing({
      standing: 1,
      deckObj: { Commanders: { "Knnan, Bonder Prodigy": 1 } },
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 1 }, (_, i) =>
      standing({ standing: i + 2 }),
    );
    const res = mapTournament(tournament({ standings: [unknown, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingSkips.unresolved_commander).toBe(1);
    expect(res.standings.map((s) => s.placement)).not.toContain(1);
  });

  it("resolves through normalizeCardName: curly apostrophes and case fold to name_norm", () => {
    const curly = standing({
      standing: 1,
      deckObj: { Commanders: { "KRAUM, LUDEVIC’S OPUS": 1 } },
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 1 }, (_, i) =>
      standing({ standing: i + 2 }),
    );
    const res = mapTournament(tournament({ standings: [curly, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings[0].leader_ids).toEqual(["id-kraum"]);
  });

  it("keeps only placements ≤ TOP_PLACEMENT and counts the rest as a bound", () => {
    const many = Array.from({ length: TOP_PLACEMENT + 10 }, (_, i) =>
      standing({ standing: i + 1 }),
    );
    const res = mapTournament(tournament({ standings: many }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings).toHaveLength(TOP_PLACEMENT);
    expect(res.standingSkips.beyond_top_placement).toBe(10);
    expect(res.tournament.player_count).toBe(TOP_PLACEMENT + 10);
  });

  it("falls back to array order when the standing field is absent", () => {
    const noField = Array.from({ length: MIN_EVENT_PLAYERS }, () =>
      standing({ standing: undefined }),
    );
    const res = mapTournament(tournament({ standings: noField }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings.map((s) => s.placement)).toEqual(
      Array.from({ length: TOP_PLACEMENT }, (_, i) => i + 1),
    );
  });

  it("skips duplicate placements after the first (idempotent merge key)", () => {
    const dupes = [
      standing({ standing: 1, name: "First" }),
      standing({ standing: 1, name: "Second" }),
      ...Array.from({ length: MIN_EVENT_PLAYERS - 2 }, (_, i) => standing({ standing: i + 3 })),
    ];
    const res = mapTournament(tournament({ standings: dupes }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingSkips.duplicate_placement).toBe(1);
    expect(res.standings.filter((s) => s.placement === 1)).toHaveLength(1);
    expect(res.standings[0].player_name).toBe("First");
  });

  it("counts URL-only and empty-section standings without killing the event", () => {
    const urlOnly = standing({ standing: 1, deckObj: undefined });
    const empty = standing({ standing: 2, deckObj: { Commanders: {} } });
    const three = standing({
      standing: 3,
      deckObj: {
        Commanders: {
          "Tymna the Weaver": 1,
          "Thrasios, Triton Hero": 1,
          "Kraum, Ludevic's Opus": 1,
        },
      },
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 3 }, (_, i) =>
      standing({ standing: i + 4 }),
    );
    const res = mapTournament(tournament({ standings: [urlOnly, empty, three, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingSkips).toEqual({
      no_deck_data: 1,
      no_commander: 1,
      too_many_commanders: 1,
    });
    expect(res.standings).toHaveLength(MIN_EVENT_PLAYERS - 3);
  });

  it("skips whole events: malformed, too small, nothing usable", () => {
    expect(mapTournament(tournament({ TID: undefined }), resolve)).toEqual({
      ok: false,
      skip: "malformed",
    });
    expect(mapTournament(tournament({ startDate: "yesterday" }), resolve)).toEqual({
      ok: false,
      skip: "malformed",
    });
    const small = Array.from({ length: MIN_EVENT_PLAYERS - 1 }, (_, i) =>
      standing({ standing: i + 1 }),
    );
    expect(mapTournament(tournament({ standings: small }), resolve)).toEqual({
      ok: false,
      skip: "too_small",
    });
    const noDecks = Array.from({ length: MIN_EVENT_PLAYERS }, (_, i) =>
      standing({ standing: i + 1, deckObj: undefined }),
    );
    expect(mapTournament(tournament({ standings: noDecks }), resolve)).toEqual({
      ok: false,
      skip: "no_usable_standings",
    });
  });

  it("null-coerces junk record fields and oversize/blank names", () => {
    const junk = standing({
      standing: 1,
      name: "   ",
      wins: "4",
      draws: Number.NaN,
      losses: -2,
      decklist: "notaurl",
      deckObj: { Commanders: { "Kinnan, Bonder Prodigy": 1 } },
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 1 }, (_, i) =>
      standing({ standing: i + 2 }),
    );
    const res = mapTournament(tournament({ standings: [junk, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings[0]).toMatchObject({
      player_name: null,
      decklist_url: null,
      wins: null,
      draws: null,
      losses: null,
    });
  });

  it("re-checks the fetch window — the API returned a future-dated test event in probing", () => {
    const window = { minStartSeconds: 1756512000 - 86400, maxStartSeconds: 1756512000 + 86400 };
    const inWindow = mapTournament(tournament(), resolve, window);
    expect(inWindow.ok).toBe(true);
    expect(
      mapTournament(tournament({ startDate: 1756512000 + 400 * 86400 }), resolve, window),
    ).toEqual({ ok: false, skip: "outside_window" });
    expect(
      mapTournament(tournament({ startDate: 1756512000 - 400 * 86400 }), resolve, window),
    ).toEqual({ ok: false, skip: "outside_window" });
  });

  it("measures embedded-list coverage without storing lists (LATER rows' gate)", () => {
    expect(hasCardList(standing({ deckObj: { Commanders: {}, Mainboard: mainboard(95) } }))).toBe(
      true,
    );
    // A stub section or no deckObj is not a list.
    expect(hasCardList(standing())).toBe(false);
    expect(hasCardList(standing({ deckObj: { Mainboard: mainboard(5) } }))).toBe(false);
    expect(hasCardList(standing({ deckObj: undefined }))).toBe(false);

    const withList = standing({
      standing: 1,
      deckObj: { Commanders: { "Kinnan, Bonder Prodigy": 1 }, Mainboard: mainboard(95) },
    });
    const rest = Array.from({ length: MIN_EVENT_PLAYERS - 1 }, (_, i) =>
      standing({ standing: i + 2 }),
    );
    const res = mapTournament(tournament({ standings: [withList, ...rest] }), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingsWithLists).toBe(1);
  });
});

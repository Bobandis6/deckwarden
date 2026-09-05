/**
 * limitless-map unit tests (P4.5). Fixtures are modeled on real API
 * responses fetched 2026-09-05 (a 64-player decklists:true SIM event and a
 * 17-player decklists:false offline event) — the shapes in the module
 * header, not the docs alone.
 */
import { describe, expect, it } from "vitest";

import {
  assessTournament,
  isStandardFormat,
  leaderCodeFrom,
  limitlessDecklistUrl,
  limitlessEventUrl,
  mapLimitlessTournament,
  MIN_EVENT_PLAYERS,
  TOP_PLACEMENT,
  type LimitlessDetails,
  type LimitlessStanding,
} from "./limitless-map";

const LEADER_IDS: Record<string, string> = {
  "OP14-020": "11111111-1111-4111-8111-111111111111",
  "OP05-098": "22222222-2222-4222-8222-222222222222",
};
const resolve = (code: string) => LEADER_IDS[code];

function details(overrides: Partial<LimitlessDetails> = {}): LimitlessDetails {
  return {
    id: "6a8f06390580a332c84204b0",
    game: "OP",
    format: null,
    name: "[OP17] ChinoizeCup #105 Wednesday",
    date: "2026-09-02T18:00:00.000Z",
    players: 64,
    decklists: true,
    isPublic: true,
    ...overrides,
  } as LimitlessDetails;
}

function standing(placing: number | null, overrides: Partial<LimitlessStanding> = {}) {
  return {
    name: "SoulKingg",
    player: "soulkingg",
    placing,
    decklist: { leader: { name: "Dracule Mihawk", set: "OP14", number: "020" } },
    record: { wins: 3, losses: 2, ties: 1 },
    ...overrides,
  };
}

/** A mappable event: placings 1..n, all resolvable. */
function standings(n: number): LimitlessStanding[] {
  return Array.from({ length: n }, (_, i) => standing(i + 1));
}

describe("URL builders", () => {
  it("builds the public event permalink from the external key", () => {
    expect(limitlessEventUrl("6a8f06390580a332c84204b0")).toBe(
      "https://play.limitlesstcg.com/tournament/6a8f06390580a332c84204b0",
    );
  });

  it("builds the per-player decklist page and encodes the username", () => {
    expect(limitlessDecklistUrl("abc", "player one")).toBe(
      "https://play.limitlesstcg.com/tournament/abc/player/player%20one/decklist",
    );
  });
});

describe("format mapping", () => {
  it("treats null/absent/STANDARD as Standard and labeled formats as not ours", () => {
    expect(isStandardFormat(null)).toBe(true);
    expect(isStandardFormat(undefined)).toBe(true);
    expect(isStandardFormat("STANDARD")).toBe(true);
    expect(isStandardFormat("EXTRA")).toBe(false);
    expect(isStandardFormat("CUSTOM")).toBe(false);
  });
});

describe("leaderCodeFrom", () => {
  it("builds set-number from a real decklist leader, uppercased", () => {
    expect(leaderCodeFrom({ leader: { name: "x", set: "op14", number: "020" } })).toBe("OP14-020");
  });

  it("returns null for a null decklist and for a leaderless one", () => {
    expect(leaderCodeFrom(null)).toBeNull();
    expect(leaderCodeFrom({})).toBeNull();
    expect(leaderCodeFrom({ leader: { name: "x", set: "OP14" } })).toBeNull();
  });
});

describe("assessTournament", () => {
  it("accepts a public, decklisted, Standard event", () => {
    expect(assessTournament(details())).toEqual({ ok: true });
  });

  it.each([
    ["malformed", { id: undefined }],
    ["malformed", { date: "not a date" }],
    ["unsupported_format", { format: "EXTRA" }],
    ["unsupported_format", { format: "CUSTOM" }],
    ["not_public", { isPublic: false }],
    ["no_decklists", { decklists: false }],
    // decklists absent must not be treated as true.
    ["no_decklists", { decklists: undefined }],
  ] as const)("skips %s", (skip, overrides) => {
    expect(assessTournament(details(overrides))).toEqual({ ok: false, skip });
  });

  it("re-checks the fetch window's promise (topdeck-map's outside_window move)", () => {
    const window = { minStartMs: Date.parse("2026-09-01"), maxStartMs: Date.parse("2026-09-06") };
    expect(assessTournament(details(), window)).toEqual({ ok: true });
    expect(assessTournament(details({ date: "2026-08-01T00:00:00.000Z" }), window)).toEqual({
      ok: false,
      skip: "outside_window",
    });
    expect(assessTournament(details({ date: "2026-10-01T00:00:00.000Z" }), window)).toEqual({
      ok: false,
      skip: "outside_window",
    });
  });
});

describe("mapLimitlessTournament", () => {
  it("maps a real-shaped event: player count from standings length, top-16 kept", () => {
    const res = mapLimitlessTournament(details(), standings(20), resolve);
    if (!res.ok) throw new Error(`expected ok, got ${res.skip}`);
    expect(res.tournament).toEqual({
      external_key: "6a8f06390580a332c84204b0",
      name: "[OP17] ChinoizeCup #105 Wednesday",
      start_date: "2026-09-02",
      player_count: 20,
      top_cut: null,
    });
    expect(res.standings).toHaveLength(TOP_PLACEMENT);
    expect(res.standingSkips).toEqual({ beyond_top_placement: 20 - TOP_PLACEMENT });
    const first = res.standings[0];
    expect(first.placement).toBe(1);
    expect(first.leader_ids).toEqual([LEADER_IDS["OP14-020"]]);
    expect(first.player_name).toBe("SoulKingg");
    expect(first.decklist_url).toBe(
      "https://play.limitlesstcg.com/tournament/6a8f06390580a332c84204b0/player/soulkingg/decklist",
    );
  });

  it("maps record wins/losses and ties→draws", () => {
    const res = mapLimitlessTournament(details(), standings(MIN_EVENT_PLAYERS), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings[0]).toMatchObject({ wins: 3, losses: 2, draws: 1 });
  });

  it("skips dropped players (placing null) without inventing an index placement", () => {
    // The verified live response led with a dropped player — order lies.
    const rows = [standing(null, { name: "Dropped" }), ...standings(MIN_EVENT_PLAYERS)];
    const res = mapLimitlessTournament(details(), rows, resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingSkips.no_placing).toBe(1);
    expect(res.standings.some((r) => r.player_name === "Dropped")).toBe(false);
  });

  it("counts skips per standing: null decklist, malformed leader, unresolved, dupes", () => {
    const rows = [
      ...standings(MIN_EVENT_PLAYERS - 4), // placings 1..12
      // decklists:false rows carry decklist: null (and deck: {}), verified live.
      standing(13, { decklist: null }),
      standing(14, { decklist: { leader: { name: "x" } } }),
      standing(15, { decklist: { leader: { name: "x", set: "ZZ99", number: "999" } } }),
      standing(2, { name: "Dupe" }),
    ];
    const res = mapLimitlessTournament(details(), rows, resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standingSkips).toEqual({
      no_deck_data: 1,
      malformed_leader: 1,
      unresolved_leader: 1,
      duplicate_placement: 1,
    });
    expect(res.standings).toHaveLength(MIN_EVENT_PLAYERS - 4);
    expect(res.tournament.player_count).toBe(MIN_EVENT_PLAYERS);
  });

  it("player_name falls back to the username and a missing username nulls the URL", () => {
    const rows = standings(MIN_EVENT_PLAYERS);
    rows[0] = standing(1, { name: undefined });
    rows[1] = standing(2, { player: undefined });
    const res = mapLimitlessTournament(details(), rows, resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.standings[0].player_name).toBe("soulkingg");
    expect(res.standings[1].decklist_url).toBeNull();
  });

  it("skips too-small events by actual standings length", () => {
    const res = mapLimitlessTournament(details(), standings(MIN_EVENT_PLAYERS - 1), resolve);
    expect(res).toEqual({ ok: false, skip: "too_small" });
  });

  it("skips an event where nothing survived (still running: placings unassigned)", () => {
    const rows = Array.from({ length: 20 }, () => standing(null));
    expect(mapLimitlessTournament(details(), rows, resolve)).toEqual({
      ok: false,
      skip: "no_usable_standings",
    });
  });
});

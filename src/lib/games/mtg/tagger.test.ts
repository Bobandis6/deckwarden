/**
 * Y3a — the Tagger flags' pure half: the hand-edited overrides file (strict:
 * a typo fails before any write), the roll-up over descendant tags, and the
 * fallback rule (a failing source never lowers the read).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  indexTagLine,
  isUnreviewedMld,
  overrideOracleIds,
  parseTaggerOverrides,
  resolveTagger,
  rollUp,
  taggerCounts,
  type TagIndex,
  type TaggerFlag,
  type TaggerInputs,
} from "./tagger";

const MLD_TAG = "cd12a44c-1aee-4ece-b8ea-3eb118ef0230";
const TURN_TAG = "03b17ebf-f5d3-4063-bfd4-1ae156a16a8f";
const CHILD_TAG = "11111111-1111-4111-8111-111111111111";
const GRANDCHILD_TAG = "22222222-2222-4222-8222-222222222222";

/** Oracle ids, UUID-shaped like the real ones. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ARMAGEDDON = id(1);
const LILIANA = id(2);
const NEW_CARD = id(3);
const DISABLED = id(4);
const TIME_WARP = id(5);
const CHILD_ONLY = id(6);

function file(over: Record<string, unknown> = {}, mld: Record<string, unknown> = {}) {
  return {
    $comment: ["ignored"],
    reviewed: "2026-10-01",
    flags: {
      mld: {
        tag: { id: MLD_TAG, slug: "mass-land-denial" },
        enabled: true,
        clear: { [ARMAGEDDON]: "Armageddon" },
        edge: { [LILIANA]: "Liliana of the Veil — a planeswalker ultimate" },
        disabledCards: { [DISABLED]: "Some card — why" },
        ...mld,
      },
      extra_turn: {
        tag: { id: TURN_TAG, slug: "extra-turn" },
        enabled: true,
        disabledCards: {},
      },
    },
    ...over,
  };
}

const overrides = (mld: Record<string, unknown> = {}) => parseTaggerOverrides(file({}, mld));

function line(tagId: string, oracleIds: string[], childIds: string[] = []) {
  return JSON.stringify({
    object: "tag",
    id: tagId,
    slug: "x",
    type: "oracle",
    parent_ids: [],
    child_ids: childIds,
    taggings: oracleIds.map((oracle_id) => ({ oracle_id, weight: "median" })),
  });
}

function bulk(...lines: string[]): TagIndex {
  const index: TagIndex = new Map();
  for (const l of lines) indexTagLine(index, l);
  return index;
}

const NONE: Record<TaggerFlag, ReadonlySet<string>> = { mld: new Set(), extra_turn: new Set() };

function inputs(over: Partial<TaggerInputs> = {}): TaggerInputs {
  return {
    overrides: overrides(),
    index: bulk(
      line(MLD_TAG, [ARMAGEDDON, LILIANA, NEW_CARD, DISABLED]),
      line(TURN_TAG, [TIME_WARP]),
    ),
    stored: NONE,
    previousStaleSince: null,
    nowIso: "2026-10-02T10:37:00.000Z",
    ...over,
  };
}

describe("parseTaggerOverrides", () => {
  it("parses the real in-repo file: the reviewed 42 clear / 69 edge split", () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), "data/mtg/tagger-overrides.json"), "utf8"),
    ) as unknown;
    const o = parseTaggerOverrides(raw);
    expect(o.flags.mld.tag).toEqual({ id: MLD_TAG, slug: "mass-land-denial" });
    expect(o.flags.extra_turn.tag).toEqual({ id: TURN_TAG, slug: "extra-turn" });
    expect(o.flags.mld.enabled && o.flags.extra_turn.enabled).toBe(true);
    expect(Object.keys(o.flags.mld.clear)).toHaveLength(42);
    expect(Object.keys(o.flags.mld.edge)).toHaveLength(69);
    // Y3b: extra_turn means a turn for you — the three cards that give it to
    // an opponent are disabled (Spellbook's combo flag leaves those out too).
    expect(Object.values(o.flags.extra_turn.disabledCards).map((n) => n.split(" — ")[0])).toEqual([
      "Emrakul, the Promised End",
      "Eon Frolicker",
      "Perch Protection",
    ]);
    expect(overrideOracleIds(o)).toHaveLength(114);
    // Wizards' five examples read clear; the prompt's named edges read edge.
    const clearNames = Object.values(o.flags.mld.clear);
    for (const name of ["Armageddon", "Ruination", "Sunder", "Winter Orb", "Blood Moon"]) {
      expect(clearNames).toContain(name);
    }
    const edgeNames = Object.values(o.flags.mld.edge).join("\n");
    expect(edgeNames).toContain("Liliana of the Veil — a planeswalker ultimate");
  });

  it("keeps extra_turn's empty split and the notes as given", () => {
    const o = overrides();
    expect(o.flags.extra_turn).toEqual({
      tag: { id: TURN_TAG, slug: "extra-turn" },
      enabled: true,
      clear: {},
      edge: {},
      disabledCards: {},
    });
    expect(o.flags.mld.edge[LILIANA]).toBe("Liliana of the Veil — a planeswalker ultimate");
  });

  it("fails loudly on a malformed file", () => {
    const bad: Array<[unknown, RegExp]> = [
      [null, /not a JSON object/],
      [file({ reviewed: "Oct 1" }), /reviewed must be YYYY-MM-DD/],
      [file({ flags: [] }), /flags must be an object/],
      [file({ flags: { ...file().flags, tutor: {} } }), /unknown flag "tutor"/],
      [file({ flags: { mld: file().flags.mld } }), /flags\.extra_turn is missing/],
      [
        file({}, { tag: { id: "mass-land-denial", slug: "x" } }),
        /tag\.id must be the Tagger tag's UUID/,
      ],
      [file({}, { tag: { id: MLD_TAG } }), /tag\.slug is missing/],
      [file({}, { tag: { id: TURN_TAG, slug: "x" } }), /pinned by another flag/],
      [file({}, { enabled: "yes" }), /enabled must be true or false/],
      [file({}, { clear: [ARMAGEDDON] }), /mld\.clear must map oracle ids to notes/],
      [file({}, { clear: { "not-an-id": "x" } }), /"not-an-id" is not an oracle id/],
      [file({}, { clear: { [ARMAGEDDON]: " " } }), /the note must name the card/],
      [file({}, { edge: { [ARMAGEDDON]: "Armageddon" } }), /is both clear and edge/],
      [file({}, { disabledCards: { [LILIANA]: "why" } }), /disabled and also split/],
      [
        file({
          flags: {
            ...file().flags,
            extra_turn: { ...file().flags.extra_turn, edge: { [TIME_WARP]: "Time Warp" } },
          },
        }),
        /only mld has a clear \/ edge split/,
      ],
    ];
    for (const [raw, message] of bad) {
      expect(() => parseTaggerOverrides(raw)).toThrow(message);
    }
  });

  it("lists every oracle id it names once, for the run's unknown-id check", () => {
    expect(overrideOracleIds(overrides()).sort()).toEqual([ARMAGEDDON, LILIANA, DISABLED].sort());
  });
});

describe("the oracle_tags index", () => {
  it("keeps child ids and tagged oracle ids, ignoring the rest", () => {
    const index = bulk(line(MLD_TAG, [ARMAGEDDON], [CHILD_TAG]));
    expect(index.get(MLD_TAG)).toEqual({ childIds: [CHILD_TAG], oracleIds: [ARMAGEDDON] });
  });

  it("throws on a malformed line (the caller keeps the stored flags)", () => {
    expect(() => bulk("{not json")).toThrow();
    expect(() => bulk(JSON.stringify({ slug: "no-id" }))).toThrow(/without an id/);
  });

  it("rolls a tag up over every descendant, cycle-safe", () => {
    const index = bulk(
      line(MLD_TAG, [ARMAGEDDON], [CHILD_TAG]),
      line(CHILD_TAG, [CHILD_ONLY, ARMAGEDDON], [GRANDCHILD_TAG]),
      line(GRANDCHILD_TAG, [LILIANA], [MLD_TAG]), // a cycle back to the root
    );
    expect(rollUp(index, MLD_TAG)).toEqual(new Set([ARMAGEDDON, CHILD_ONLY, LILIANA]));
    expect(rollUp(index, CHILD_TAG)).toEqual(new Set([CHILD_ONLY, ARMAGEDDON, LILIANA]));
  });

  it("returns null for a tag the bulk lacks, and skips child ids it lacks", () => {
    expect(rollUp(bulk(), MLD_TAG)).toBeNull();
    expect(rollUp(bulk(line(MLD_TAG, [ARMAGEDDON], [CHILD_TAG])), MLD_TAG)).toEqual(
      new Set([ARMAGEDDON]),
    );
  });
});

describe("resolveTagger", () => {
  it("fresh: splits land denial by the file (unreviewed → edge) and drops disabled cards", () => {
    const res = resolveTagger(inputs());
    expect(res.status).toEqual({ mld: "fresh", extra_turn: "fresh" });
    expect(res.staleSince).toEqual({ mld: null, extra_turn: null });
    expect(res.notes).toEqual([]);
    expect(Object.fromEntries(res.cards)).toEqual({
      [ARMAGEDDON]: { mld: "clear" },
      [LILIANA]: { mld: "edge" },
      [NEW_CARD]: { mld: "edge" },
      [TIME_WARP]: { extra_turn: true },
    });
    expect(isUnreviewedMld(overrides(), NEW_CARD)).toBe(true);
    expect(isUnreviewedMld(overrides(), LILIANA)).toBe(false);
  });

  it("merges both flags on one card", () => {
    const res = resolveTagger(
      inputs({ index: bulk(line(MLD_TAG, [ARMAGEDDON]), line(TURN_TAG, [ARMAGEDDON])) }),
    );
    expect(res.cards.get(ARMAGEDDON)).toEqual({ mld: "clear", extra_turn: true });
  });

  it("a failed read keeps the stored cards, split again by today's file", () => {
    const stored = { mld: new Set([ARMAGEDDON, LILIANA]), extra_turn: new Set([TIME_WARP]) };
    const moved = overrides({ clear: { [LILIANA]: "Liliana" }, edge: { [ARMAGEDDON]: "A" } });
    const res = resolveTagger(inputs({ index: null, stored, overrides: moved }));
    expect(res.status).toEqual({ mld: "kept", extra_turn: "kept" });
    expect(res.staleSince).toEqual({
      mld: "2026-10-02T10:37:00.000Z",
      extra_turn: "2026-10-02T10:37:00.000Z",
    });
    expect(Object.fromEntries(res.cards)).toEqual({
      [ARMAGEDDON]: { mld: "edge" },
      [LILIANA]: { mld: "clear" },
      [TIME_WARP]: { extra_turn: true },
    });
    expect(res.notes).toEqual([]); // the read's own error is the caller's to report
  });

  it("carries stale_since forward while a flag stays kept, and clears it once fresh", () => {
    const previousStaleSince = { mld: "2026-10-01T10:37:00.000Z", extra_turn: null };
    const kept = resolveTagger(inputs({ index: null, previousStaleSince }));
    expect(kept.staleSince).toEqual({
      mld: "2026-10-01T10:37:00.000Z",
      extra_turn: "2026-10-02T10:37:00.000Z",
    });
    expect(resolveTagger(inputs({ previousStaleSince })).staleSince).toEqual({
      mld: null,
      extra_turn: null,
    });
  });

  it("a pinned tag missing from the bulk, or flagging nothing, keeps that flag only", () => {
    const stored = { mld: new Set([LILIANA]), extra_turn: new Set([TIME_WARP]) };
    const missing = resolveTagger(inputs({ stored, index: bulk(line(TURN_TAG, [id(9)])) }));
    expect(missing.status).toEqual({ mld: "kept", extra_turn: "fresh" });
    expect(missing.notes).toEqual([
      `mld: the pinned tag mass-land-denial (${MLD_TAG}) is not in the bulk`,
    ]);
    expect(Object.fromEntries(missing.cards)).toEqual({
      [LILIANA]: { mld: "edge" },
      [id(9)]: { extra_turn: true },
    });
    const empty = resolveTagger(
      inputs({ stored, index: bulk(line(MLD_TAG, []), line(TURN_TAG, [TIME_WARP])) }),
    );
    expect(empty.status.mld).toBe("kept");
    expect(empty.notes[0]).toMatch(/flags no card/);
  });

  it("a switched-off flag is written for no card, and isn't stale", () => {
    const off = parseTaggerOverrides(
      file({
        flags: { ...file().flags, extra_turn: { ...file().flags.extra_turn, enabled: false } },
      }),
    );
    const res = resolveTagger(
      inputs({ overrides: off, stored: { ...NONE, extra_turn: new Set([TIME_WARP]) } }),
    );
    expect(res.status.extra_turn).toBe("disabled");
    expect(res.staleSince.extra_turn).toBeNull();
    expect(res.tagged.extra_turn.size).toBe(0);
    expect([...res.cards.values()].some((f) => f.extra_turn)).toBe(false);
  });
});

describe("taggerCounts", () => {
  it("counts what was tagged, staged, written, split and changed", () => {
    const stored = { mld: new Set([ARMAGEDDON, id(8)]), extra_turn: new Set<string>() };
    const res = resolveTagger(inputs({ stored }));
    // NEW_CARD is tagged but not staged (an emblem, a non-English card…).
    const staged = new Set([ARMAGEDDON, LILIANA, DISABLED, TIME_WARP]);
    const counts = taggerCounts(res, overrides(), stored, staged);
    expect(counts.mld).toEqual({
      tagged: 4,
      matched: 3,
      flagged: 2,
      added: 1, // Liliana
      removed: 1, // id(8): stored, no longer tagged
      listed_untagged: 0,
      clear: 1,
      edge: 1,
      unreviewed: 0,
    });
    expect(counts.extra_turn).toEqual({
      tagged: 1,
      matched: 1,
      flagged: 1,
      added: 1,
      removed: 0,
      listed_untagged: 0,
    });
  });

  it("counts unreviewed edges and listed cards the tag dropped; none of that when kept", () => {
    const res = resolveTagger(
      inputs({ index: bulk(line(MLD_TAG, [NEW_CARD]), line(TURN_TAG, [TIME_WARP])) }),
    );
    const staged = new Set([NEW_CARD, TIME_WARP]);
    const counts = taggerCounts(res, overrides(), NONE, staged);
    expect(counts.mld).toMatchObject({ flagged: 1, edge: 1, unreviewed: 1, listed_untagged: 3 });
    const kept = resolveTagger(inputs({ index: null }));
    expect(taggerCounts(kept, overrides(), NONE, staged).mld.listed_untagged).toBeNull();
  });
});

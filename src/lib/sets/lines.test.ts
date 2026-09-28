/**
 * The set lines (X4a, WAVE3.md D4 + the owner's answers of 2026-09-28):
 * main vs other, the ordinal with its same-day skip, a day's order, the
 * place words, and the picker's match. The expansion fixture is the real
 * line from Arabian Nights to Kaladesh as GET /api/sets answered it on
 * 2026-09-28 (code:yyyymmdd:live cards) — Time Spiral Timeshifted shares
 * Time Spiral's day, which is why Eldritch Moon is the 71st, not the 72nd.
 */
import { describe, expect, it } from "vitest";

import { mtgAdapter } from "@/lib/games/mtg/adapter";
import { optcgAdapter } from "@/lib/games/optcg/adapter";

import {
  lineOrdinals,
  matchSets,
  placeSets,
  setFieldKey,
  setGroup,
  setMatchClass,
  setPlace,
  setPlaceShort,
  type ReleasedSet,
} from "./lines";

const EXPANSIONS_TO_KALADESH =
  "arn:19931217:78 atq:19940304:85 leg:19940601:310 drk:19940801:119 fem:19941101:102 ice:19950603:373 hml:19951001:115 all:19960610:144 mir:19961008:335 vis:19970203:167 wth:19970609:167 tmp:19971014:335 sth:19980302:143 exo:19980615:143 usg:19981012:335 ulg:19990215:143 uds:19990607:143 mmq:19991004:335 nem:20000214:143 pcy:20000605:143 inv:20001002:335 pls:20010205:143 apc:20010604:143 ody:20011001:335 tor:20020204:143 jud:20020527:143 ons:20021007:335 lgn:20030203:145 scg:20030526:143 mrd:20031002:291 dst:20040206:165 5dn:20040604:165 chk:20041001:291 bok:20050204:165 sok:20050603:165 rav:20051007:291 gpt:20060203:165 dis:20060505:180 csp:20060721:155 tsb:20061006:121 tsp:20061006:286 plc:20070202:165 fut:20070504:180 lrw:20071012:286 mor:20080201:150 shm:20080502:286 eve:20080725:180 ala:20081003:234 con:20090206:145 arb:20090430:145 zen:20091002:234 wwk:20100205:145 roe:20100423:233 som:20101001:234 mbs:20110204:150 nph:20110513:170 isd:20110930:254 dka:20120203:158 avr:20120504:234 rtr:20121005:254 gtc:20130201:249 dgm:20130503:156 ths:20130927:234 bng:20140207:165 jou:20140502:165 ktk:20140926:254 frf:20150123:180 dtk:20150327:254 bfz:20151002:254 ogw:20160122:183 soi:20160408:287 emn:20160722:208 kld:20160930:264";

function expansionLine() {
  return EXPANSIONS_TO_KALADESH.split(" ").map((entry) => {
    const [code, day, cards] = entry.split(":");
    return {
      code,
      setType: "expansion",
      releasedAt: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`,
      cards: Number(cards),
    };
  });
}

function set(partial: Partial<ReleasedSet> & { code: string }): ReleasedSet {
  return {
    name: partial.code.toUpperCase(),
    releasedAt: "2024-01-01",
    setType: "expansion",
    group: "main",
    cards: 100,
    ordinal: null,
    ...partial,
  };
}

describe("setGroup — the owner's main sets", () => {
  it("the five lines, the Eternal sets, the bonus sheets and Secret Lair Drop are main", () => {
    for (const type of [
      "expansion",
      "core",
      "masters",
      "commander",
      "draft_innovation",
      "eternal",
      "masterpiece",
    ]) {
      expect(setGroup(type, "x")).toBe("main");
    }
    expect(setGroup("box", "sld")).toBe("main");
  });

  it("everything else is another product — Secret Lair's other boxes and the Un-sets included", () => {
    for (const [type, code] of [
      ["box", "slu"],
      ["box", "slc"],
      ["promo", "slp"],
      ["funny", "unf"],
      ["token", "tblb"],
      ["memorabilia", "pssc"],
    ]) {
      expect(setGroup(type, code)).toBe("other");
    }
  });
});

describe("lineOrdinals — each numbered line by date, skipping a same-day smaller set", () => {
  it("the real expansion line: Arabian Nights 1st, Time Spiral Timeshifted skipped, Eldritch Moon 71st, Kaladesh 72nd", () => {
    const ordinals = lineOrdinals(expansionLine());
    expect(ordinals.get("arn")).toBe(1);
    expect(ordinals.has("tsb")).toBe(false);
    expect(ordinals.get("tsp")).toBe(40);
    expect(ordinals.get("emn")).toBe(71);
    expect(ordinals.get("kld")).toBe(72);
    // Without the skip the owner's example would be off by one.
    const counted = expansionLine().filter((s) => s.releasedAt <= "2016-07-22");
    expect(counted).toHaveLength(72);
  });

  it("the skip needs the same day AND the same line; the larger set keeps the number, a tie goes to the lower code", () => {
    const ordinals = lineOrdinals([
      { code: "mh3", setType: "draft_innovation", releasedAt: "2024-06-14", cards: 309 },
      { code: "h2r", setType: "draft_innovation", releasedAt: "2024-06-14", cards: 16 },
      { code: "m3c", setType: "commander", releasedAt: "2024-06-14", cards: 360 },
      { code: "aaa", setType: "masters", releasedAt: "2020-01-01", cards: 50 },
      { code: "bbb", setType: "masters", releasedAt: "2020-01-01", cards: 50 },
    ]);
    expect(ordinals.get("mh3")).toBe(1);
    expect(ordinals.has("h2r")).toBe(false);
    expect(ordinals.get("m3c")).toBe(1); // another line: not a rival
    expect(ordinals.get("aaa")).toBe(1);
    expect(ordinals.has("bbb")).toBe(false);
  });

  it("core sets and the added main kinds carry no number", () => {
    const ordinals = lineOrdinals([
      { code: "lea", setType: "core", releasedAt: "1993-08-05", cards: 290 },
      { code: "sta", setType: "masterpiece", releasedAt: "2021-04-23", cards: 63 },
      { code: "tle", setType: "eternal", releasedAt: "2025-11-21", cards: 242 },
      { code: "sld", setType: "box", releasedAt: "2019-12-02", cards: 1735 },
    ]);
    expect(ordinals.size).toBe(0);
  });
});

describe("placeSets — groups, numbers, and a day's order", () => {
  it("newest first; on one day the expansion leads its Commander decks, then the rest by size", () => {
    const placed = placeSets([
      // The SQL order: newest first, larger first, then name.
      {
        code: "msc",
        name: "Marvel Super Heroes Commander",
        releasedAt: "2026-06-26",
        setType: "commander",
        cards: 616,
      },
      {
        code: "msh",
        name: "Marvel Super Heroes",
        releasedAt: "2026-06-26",
        setType: "expansion",
        cards: 281,
      },
      {
        code: "pmsh",
        name: "Marvel Super Heroes Promos",
        releasedAt: "2026-06-26",
        setType: "promo",
        cards: 40,
      },
      {
        code: "blc",
        name: "Bloomburrow Commander",
        releasedAt: "2024-08-02",
        setType: "commander",
        cards: 350,
      },
      {
        code: "blb",
        name: "Bloomburrow",
        releasedAt: "2024-08-02",
        setType: "expansion",
        cards: 279,
      },
    ]);
    expect(placed.map((s) => s.code)).toEqual(["msh", "msc", "pmsh", "blb", "blc"]);
    expect(placed.map((s) => s.group)).toEqual(["main", "main", "other", "main", "main"]);
    expect(placed.find((s) => s.code === "blb")?.ordinal).toBe(1);
    expect(placed.find((s) => s.code === "pmsh")?.ordinal).toBeNull();
  });
});

describe("the words", () => {
  it("the shared ordinal words reach three-digit places (tournaments/format.ts)", () => {
    for (const [n, word] of [
      [1, "the 1st"],
      [102, "the 102nd"],
      [111, "the 111th"],
      [113, "the 113th"],
      [121, "the 121st"],
    ] as const) {
      expect(setPlace(set({ code: "x", ordinal: n }))).toBe(`${word} expansion set`);
    }
  });

  it("a set's place: the owner's sentence for the numbered lines, a kind for the rest", () => {
    expect(setPlace(set({ code: "emn", ordinal: 71 }))).toBe("the 71st expansion set");
    expect(setPlace(set({ code: "40k", setType: "commander", ordinal: 21 }))).toBe(
      "the 21st Commander set",
    );
    expect(setPlace(set({ code: "2x2", setType: "masters", ordinal: 13 }))).toBe(
      "the 13th reprint set",
    );
    expect(setPlace(set({ code: "mh3", setType: "draft_innovation", ordinal: 13 }))).toBe(
      "the 13th draft innovation set",
    );
    expect(setPlace(set({ code: "10e", setType: "core" }))).toBe("a core set");
    expect(setPlace(set({ code: "tsb" }))).toBe("an expansion set"); // the skipped bonus sheet
    expect(setPlace(set({ code: "tle", setType: "eternal" }))).toBe(
      "a Universes Beyond Eternal set",
    );
    expect(setPlace(set({ code: "sta", setType: "masterpiece" }))).toBe("a bonus sheet");
    expect(setPlace(set({ code: "sld", setType: "box" }))).toBe("the Secret Lair series");
    expect(setPlace(set({ code: "slu", setType: "box" }))).toBe("a boxed set");
    expect(setPlace(set({ code: "arc", setType: "archenemy" }))).toBe("an Archenemy set");
    expect(setPlace(set({ code: "unf", setType: "funny" }))).toBe("an Un-set or funny promo set");
    // A type Scryfall adds later reads as its own words.
    expect(setPlace(set({ code: "new", setType: "alchemy_rebalance" }))).toBe(
      "an alchemy rebalance set",
    );
  });

  it("a picker row's short place", () => {
    expect(setPlaceShort(set({ code: "emn", ordinal: 71 }))).toBe("71st expansion set");
    expect(setPlaceShort(set({ code: "10e", setType: "core" }))).toBe("core set");
    expect(setPlaceShort(set({ code: "sld", setType: "box" }))).toBe("Secret Lair series");
  });
});

describe("the picker's match", () => {
  const SETS = [
    set({ code: "blc", name: "Bloomburrow Commander" }),
    set({ code: "blb", name: "Bloomburrow" }),
    set({ code: "emn", name: "Eldritch Moon" }),
    set({ code: "one", name: "Phyrexia: All Will Be One" }),
    set({ code: "eld", name: "Throne of Eldraine" }),
    set({ code: "lrw", name: "Lórwyn" }),
    set({ code: "mh3", name: "Modern Horizons 3" }),
  ];

  it("classes: code exactly, name start, word start, code start, name contains", () => {
    expect(setMatchClass(SETS[1], "BLB")).toBe(1);
    expect(setMatchClass(SETS[1], "blo")).toBe(2);
    expect(setMatchClass(SETS[2], "moon")).toBe(3);
    expect(setMatchClass(SETS[6], "mh")).toBe(4); // the code starts with it; no word does
    expect(setMatchClass(SETS[4], "hron")).toBe(5);
    expect(setMatchClass(SETS[1], "zzz")).toBeNull();
    expect(setMatchClass(SETS[5], "lorwyn")).toBe(2); // the shared normalizer strips the accent
  });

  it("best class first, the list's own order inside a class; nothing typed keeps the list", () => {
    expect(matchSets(SETS, "one").map((s) => s.code)).toEqual(["one", "eld"]);
    expect(matchSets(SETS, "blo").map((s) => s.code)).toEqual(["blc", "blb"]);
    expect(matchSets(SETS, "  ").map((s) => s.code)).toEqual(SETS.map((s) => s.code));
    expect(matchSets(SETS, "zzz")).toEqual([]);
  });
});

describe("setFieldKey — the gate", () => {
  it("Magic declares the set field; One Piece declares none", () => {
    expect(setFieldKey(mtgAdapter.searchFields)).toBe("set");
    expect(setFieldKey(optcgAdapter.searchFields)).toBeNull();
  });
});

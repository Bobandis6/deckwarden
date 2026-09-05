import { describe, expect, it } from "vitest";

import {
  baseCardId,
  decodeHtmlEntities,
  isBasePrinting,
  mapOptcgIdentity,
  mapOptcgPrinting,
  optcgColorsToMask,
  optcgPrintingId,
  packSetCode,
  packSetName,
  OPTCG_COLOR_BIT,
  type PunkCard,
  type PunkIndexEntry,
  type PunkPack,
} from "./punk-map";

/** ST01-001 verbatim from punk-records@916181e1 (english/data/569001.json). */
const LUFFY_LEADER: PunkCard = {
  id: "ST01-001",
  pack_id: "569001",
  name: "Monkey.D.Luffy",
  rarity: "Leader",
  category: "Leader",
  colors: ["Red"],
  cost: 5,
  power: 5000,
  counter: null,
  attributes: ["Strike"],
  types: ["Supernovas", "Straw Hat Crew"],
  effect:
    "[Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.",
  trigger: null,
  block_number: 1,
  img_url: "../images/cardlist/card/ST01-001.png?260828",
  img_full_url: "https://en.onepiece-cardgame.com/images/cardlist/card/ST01-001.png?260828",
};

const CHARACTER: PunkCard = {
  ...LUFFY_LEADER,
  id: "OP01-025",
  name: "Roronoa Zoro",
  rarity: "SR",
  category: "Character",
  colors: ["Red", "Green"],
  cost: 3,
  power: 5000,
  counter: 1000,
  attributes: ["Slash"],
  types: ["Supernovas", "Straw Hat Crew"],
  effect: "[Rush] (This card can attack on the turn in which it is played.)",
  trigger: "Play this card.",
};

const EVENT: PunkCard = {
  ...LUFFY_LEADER,
  id: "OP01-029",
  name: "Radical Beam!!",
  category: "Event",
  rarity: "UC",
  colors: ["Red"],
  cost: 1,
  power: null,
  counter: null,
  attributes: [],
  types: ["Straw Hat Crew"],
  effect: "[Counter] Your Leader or 1 of your Characters gains +2000 power during this battle.",
  trigger: null,
};

describe("decodeHtmlEntities", () => {
  it("decodes the entities Bandai scrapes leave behind, single pass", () => {
    expect(decodeHtmlEntities("Ace &amp; Sabo &amp; Luffy")).toBe("Ace & Sabo & Luffy");
    expect(decodeHtmlEntities("&lt;b&gt;&quot;&apos;&nbsp;")).toBe("<b>\"' ");
    expect(decodeHtmlEntities("&#39;&#x27;&#X27;")).toBe("'''");
    // Single pass: double-encoded input loses exactly one level.
    expect(decodeHtmlEntities("&amp;amp;")).toBe("&amp;");
    // Unknown entities and bare ampersands pass through verbatim.
    expect(decodeHtmlEntities("&bogus; DON!! & Luffy &#xFFFFFFFF;")).toBe(
      "&bogus; DON!! & Luffy &#xFFFFFFFF;",
    );
  });
});

describe("colors", () => {
  it("maps all six OP colors onto the shared mask bits", () => {
    expect(OPTCG_COLOR_BIT).toEqual({
      Red: 8,
      Green: 16,
      Blue: 2,
      Black: 4,
      Yellow: 1,
      Purple: 32,
    });
    expect(optcgColorsToMask(["Red", "Green"])).toBe(24);
    expect(optcgColorsToMask(["Yellow", "Purple"])).toBe(33);
    expect(optcgColorsToMask(null)).toBe(0);
  });
});

describe("ids", () => {
  it("splits printing keys into base ids for both _pN and _rN suffixes", () => {
    expect(baseCardId("OP01-001")).toBe("OP01-001");
    expect(baseCardId("OP01-001_p2")).toBe("OP01-001");
    expect(baseCardId("OP12-041_r1")).toBe("OP12-041");
    expect(isBasePrinting("OP01-001")).toBe(true);
    expect(isBasePrinting("OP01-001_p1")).toBe(false);
    expect(isBasePrinting("OP12-041_r1")).toBe(false);
  });

  it("mints stable v5 uuids — pinned so a refactor can never silently re-key printings", () => {
    // These exact values are what prod rows carry; changing them orphans decks.
    expect(optcgPrintingId("OP01-001")).toBe(optcgPrintingId("OP01-001"));
    expect(optcgPrintingId("OP01-001")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(optcgPrintingId("OP01-001")).not.toBe(optcgPrintingId("OP01-001_p1"));
    expect(optcgPrintingId("ST01-001")).toBe("f17abc33-b7f1-51b2-9a61-7f3af8c60d6a");
  });
});

describe("sets", () => {
  it("uses pack labels verbatim and mints codes for the label-less pseudo-packs", () => {
    const st01: PunkPack = {
      id: "569001",
      raw_title: "STARTER DECK -Straw Hat Crew- [ST-01]",
      title_parts: { label: "ST-01", prefix: "STARTER DECK", title: "Straw Hat Crew" },
    };
    expect(packSetCode(st01)).toBe("ST-01");
    expect(packSetName(st01)).toBe("Straw Hat Crew");
    const combined: PunkPack = {
      id: "569114",
      raw_title: "BOOSTER PACK -THE AZURE SEA’S SEVEN- [OP14-EB04]",
      title_parts: { label: "OP14-EB04", prefix: "BOOSTER PACK", title: "THE AZURE SEA’S SEVEN" },
    };
    expect(packSetCode(combined)).toBe("OP14-EB04");
    const promo: PunkPack = {
      id: "569901",
      raw_title: "Promotion card",
      title_parts: { label: null, prefix: null, title: "Promotion card" },
    };
    expect(packSetCode(promo)).toBe("PROMO");
    expect(packSetName(promo)).toBe("Promotion card");
    const other: PunkPack = { id: "569801", raw_title: "Other Product Card", title_parts: null };
    expect(packSetCode(other)).toBe("OTHER");
    expect(packSetName(other)).toBe("Other Product Card");
  });

  it("decodes HTML entities in pack titles (ST-22 'Ace &amp; Newgate' upstream)", () => {
    const st22: PunkPack = {
      id: "569122",
      raw_title: "STARTER DECK -Ace &amp; Newgate- [ST-22]",
      title_parts: { label: "ST-22", prefix: "STARTER DECK", title: "Ace &amp; Newgate" },
    };
    expect(packSetName(st22)).toBe("Ace & Newgate");
  });
});

describe("mapOptcgIdentity", () => {
  it("maps a leader: cost slot becomes life, cost_value NULL, id-first identity", () => {
    const row = mapOptcgIdentity(LUFFY_LEADER);
    expect(row.game_id).toBe(2);
    expect(row.external_key).toBe("ST01-001");
    expect(row.name).toBe("Monkey.D.Luffy");
    // Dots stay literal — the shared normalizer is deliberately unchanged.
    expect(row.name_norm).toBe("monkey.d.luffy");
    expect(row.primary_type).toBe("Leader");
    expect(row.cost_value).toBeNull();
    expect(row.colors_mask).toBe(8);
    expect(row.ci_mask).toBe(8);
    expect(row.is_leader_candidate).toBe(true);
    const attrs = JSON.parse(row.attrs);
    expect(attrs.category).toBe("leader");
    expect(attrs.life).toBe(5);
    expect(attrs.power_num).toBe(5000);
    expect(attrs.counter_num).toBeUndefined();
    expect(attrs.type_line).toBe("Leader — Supernovas / Straw Hat Crew");
    expect(attrs.oracle_text).toContain("rested DON!!");
    expect(attrs.attributes).toEqual(["Strike"]);
    expect(attrs.block).toBe(1);
  });

  it("maps a character: cost is cost, power/counter numeric, trigger kept structured", () => {
    const row = mapOptcgIdentity(CHARACTER);
    expect(row.cost_value).toBe(3);
    expect(row.colors_mask).toBe(24);
    expect(row.is_leader_candidate).toBe(false);
    const attrs = JSON.parse(row.attrs);
    expect(attrs.life).toBeUndefined();
    expect(attrs.power_num).toBe(5000);
    expect(attrs.counter_num).toBe(1000);
    expect(attrs.trigger_text).toBe("Play this card.");
    // Trigger deliberately NOT folded into the FTS body text.
    expect(attrs.oracle_text).not.toContain("Play this card.");
  });

  it("decodes HTML entities in name (and name_norm follows), text fields, and traits", () => {
    // OP13-007 name verbatim from punk-records@916181e1 — Bandai scrape ships &amp;.
    const row = mapOptcgIdentity({
      ...CHARACTER,
      id: "OP13-007",
      name: "Ace &amp; Sabo &amp; Luffy",
      types: ["Whitebeard Pirates &amp; Co."],
      effect: "K.O. up to 1 of your opponent&#39;s Characters.",
      trigger: "Draw 1 card &amp; rest this card.",
    });
    expect(row.name).toBe("Ace & Sabo & Luffy");
    expect(row.name_norm).toBe("ace & sabo & luffy");
    const attrs = JSON.parse(row.attrs);
    expect(attrs.oracle_text).toBe("K.O. up to 1 of your opponent's Characters.");
    expect(attrs.trigger_text).toBe("Draw 1 card & rest this card.");
    expect(attrs.traits).toEqual(["Whitebeard Pirates & Co."]);
    expect(attrs.type_line).toBe("Character — Whitebeard Pirates & Co.");
  });

  it("maps an event: no power/counter/life keys at all — lean rows", () => {
    const attrs = JSON.parse(mapOptcgIdentity(EVENT).attrs);
    expect(attrs.power_num).toBeUndefined();
    expect(attrs.counter_num).toBeUndefined();
    expect(attrs.life).toBeUndefined();
    expect(attrs.category).toBe("event");
  });
});

describe("mapOptcgPrinting", () => {
  const entry: PunkIndexEntry = {
    card_id: "ST01-001_p1",
    pack_id: "569901",
    name: "Monkey.D.Luffy",
    rarity: "L",
    category: "Leader",
    img_url: "https://en.onepiece-cardgame.com/images/cardlist/card/ST01-001_p1.png?260828",
  };

  it("hotlinks Bandai via image_override when no R2 base is configured", () => {
    const row = mapOptcgPrinting("ST01-001_p1", entry, null);
    expect(row.id).toBe(optcgPrintingId("ST01-001_p1"));
    expect(row.external_key).toBe("ST01-001");
    expect(row.collector_number).toBe("ST01-001_p1");
    expect(row.is_default).toBe(false);
    expect(row.has_back).toBe(false);
    expect(row.finishes).toEqual([]);
    expect(JSON.parse(row.image_override)).toEqual({ front: entry.img_url });
  });

  it("base printings are the default printing", () => {
    expect(mapOptcgPrinting("ST01-001", { ...entry, card_id: "ST01-001" }, null).is_default).toBe(
      true,
    );
  });

  it("an R2 base flips the served URL and the content hash — the re-point is one re-ingest", () => {
    const bandai = mapOptcgPrinting("ST01-001_p1", entry, null);
    const r2 = mapOptcgPrinting("ST01-001_p1", entry, "https://img.deckwarden.gg/");
    expect(JSON.parse(r2.image_override).front).toBe(
      "https://img.deckwarden.gg/optcg/images/ST01-001_p1.png",
    );
    expect(r2.content_hash).not.toBe(bandai.content_hash);
    // Hash is otherwise stable run-to-run.
    expect(mapOptcgPrinting("ST01-001_p1", entry, null).content_hash).toBe(bandai.content_hash);
  });
});

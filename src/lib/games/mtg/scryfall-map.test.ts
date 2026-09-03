import { describe, expect, it } from "vitest";

import { normalizeCardName } from "@/lib/cards/normalize";
import {
  colorsToMask,
  hasBack,
  isLeaderCandidate,
  leanPrices,
  mapIdentity,
  mapPrinting,
  primaryType,
  printingContentHash,
  skipReason,
  statToNum,
  type ScryfallCard,
} from "./scryfall-map";

const TODAY = "2026-08-23";

const bolt: ScryfallCard = {
  id: "e3285e6b-3e79-4d7c-bf96-d920f973b122",
  oracle_id: "4457ed35-7c10-48c8-9776-456485fdf070",
  lang: "en",
  layout: "normal",
  name: "Lightning Bolt",
  released_at: "2010-07-16",
  set: "m11",
  collector_number: "149",
  rarity: "common",
  finishes: ["nonfoil", "foil"],
  cmc: 1,
  mana_cost: "{R}",
  type_line: "Instant",
  oracle_text: "Lightning Bolt deals 3 damage to any target.",
  colors: ["R"],
  color_identity: ["R"],
  keywords: [],
  edhrec_rank: 100,
  prices: { usd: "1.23", usd_foil: "9.99", eur: null, tix: null },
};

const dfc: ScryfallCard = {
  id: "aa4d4b91-a534-4b9d-944b-6d8b64a4d55c",
  lang: "en",
  layout: "transform",
  name: "Delver of Secrets // Insectile Aberration",
  released_at: "2011-09-30",
  set: "isd",
  collector_number: "51",
  cmc: 1,
  color_identity: ["U"],
  card_faces: [
    {
      name: "Delver of Secrets",
      mana_cost: "{U}",
      type_line: "Creature — Human Wizard",
      oracle_text: "At the beginning of your upkeep...",
      power: "1",
      toughness: "1",
      colors: ["U"],
      oracle_id: "22a5c53b-2e51-4d0d-9dc6-b6bbbd7c9f4f",
      image_uris: { normal: "https://example.invalid/front.jpg" },
    },
    {
      name: "Insectile Aberration",
      type_line: "Creature — Human Insect",
      oracle_text: "Flying",
      power: "3",
      toughness: "2",
      colors: ["U"],
      image_uris: { normal: "https://example.invalid/back.jpg" },
    },
  ],
};

describe("normalizeCardName", () => {
  it("lowercases, deaccents, folds faces, unifies apostrophes", () => {
    expect(normalizeCardName("Lim-Dûl's Vault")).toBe("lim-dul's vault");
    expect(normalizeCardName("Fire // Ice")).toBe("fire ice");
    expect(normalizeCardName("Æther Vial")).toBe("aether vial");
    expect(normalizeCardName("Urza’s  Saga")).toBe("urza's saga");
  });
});

describe("skip filter", () => {
  it("keeps normal english cards", () => expect(skipReason(bolt)).toBeNull());
  it("skips non-english and token layouts", () => {
    expect(skipReason({ ...bolt, lang: "ja" })).toBe("non_english");
    expect(skipReason({ ...bolt, layout: "token" })).toBe("layout");
    expect(skipReason({ ...bolt, layout: "art_series" })).toBe("layout");
  });
  it("skips cards with no oracle_id anywhere", () => {
    expect(skipReason({ ...bolt, oracle_id: undefined })).toBe("no_oracle_id");
    expect(skipReason(dfc)).toBeNull(); // face-level oracle_id counts
  });
});

describe("field helpers", () => {
  it("colorsToMask: W1 U2 B4 R8 G16, colorless = 0", () => {
    expect(colorsToMask(["W", "U", "B", "R", "G"])).toBe(31);
    expect(colorsToMask([])).toBe(0);
    expect(colorsToMask(undefined)).toBe(0);
  });
  it("primaryType picks the front-face card type", () => {
    expect(primaryType("Legendary Creature — Elf Druid")).toBe("Creature");
    expect(primaryType("Artifact Creature — Golem")).toBe("Creature");
    expect(primaryType("Instant // Sorcery")).toBe("Instant");
    expect(primaryType("Legendary Planeswalker — Jace")).toBe("Planeswalker");
    expect(primaryType(undefined)).toBeNull();
  });
  it("statToNum pre-normalizes dirty stats", () => {
    expect(statToNum("3")).toBe(3);
    expect(statToNum("*")).toBeNull();
    expect(statToNum("1+*")).toBe(1);
    expect(statToNum("-1")).toBe(-1);
    expect(statToNum(undefined)).toBeNull();
  });
  it("leanPrices strips nulls and never returns {}", () => {
    expect(leanPrices(bolt.prices)).toEqual({ usd: "1.23", usd_foil: "9.99" });
    expect(leanPrices({ usd: null })).toBeNull();
    expect(leanPrices(undefined)).toBeNull();
  });
});

describe("mapIdentity", () => {
  it("maps a normal card", () => {
    const row = mapIdentity(bolt, TODAY);
    expect(row).toMatchObject({
      game_id: 1,
      external_key: bolt.oracle_id,
      name: "Lightning Bolt",
      name_norm: "lightning bolt",
      primary_type: "Instant",
      cost_value: 1,
      colors_mask: 8,
      ci_mask: 8,
      is_leader_candidate: false,
      popularity: 100,
      is_preview: false,
    });
    const attrs = JSON.parse(row.attrs);
    expect(attrs.oracle_text).toContain("3 damage");
    expect(attrs.keywords).toBeUndefined(); // empty list not stored
  });

  it("folds faces for DFCs and takes face oracle_id", () => {
    const row = mapIdentity(dfc, TODAY);
    expect(row.external_key).toBe(dfc.card_faces![0].oracle_id);
    const attrs = JSON.parse(row.attrs);
    expect(attrs.type_line).toBe("Creature — Human Wizard // Creature — Human Insect");
    expect(attrs.oracle_text).toContain("Flying");
    expect(attrs.faces).toHaveLength(2);
    expect(attrs.power).toBe("1");
    expect(attrs.power_num).toBe(1);
    expect(row.colors_mask).toBe(2); // union of face colors
  });

  // The reversible_card layout repeats each side in card_faces and joins all
  // face names into `name` — mapping it verbatim minted "Chulane // Chulane"
  // identities in prod (2026-09-02) whose doubled name_norm broke exact
  // resolution (Topdeck leader map, import). Pinned here both ways.
  it("reversible printing of a single-faced card collapses to the one real face", () => {
    const reversible: ScryfallCard = {
      id: "0f2a7b16-1b8e-4ac5-a4a8-6b6c85c1c8f1",
      lang: "en",
      layout: "reversible_card",
      name: "Chulane, Teller of Tales // Chulane, Teller of Tales",
      set: "sld",
      collector_number: "379",
      cmc: 5,
      color_identity: ["G", "U", "W"],
      card_faces: [
        {
          name: "Chulane, Teller of Tales",
          mana_cost: "{2}{G}{W}{U}",
          type_line: "Legendary Creature — Human Druid",
          oracle_text: "Whenever you cast a creature spell, draw a card...",
          power: "2",
          toughness: "4",
          colors: ["G", "U", "W"],
          oracle_id: "1e94a742-7cb8-4b93-a621-63ee68b12271",
          image_uris: { normal: "https://example.invalid/a.jpg" },
        },
        {
          name: "Chulane, Teller of Tales",
          mana_cost: "{2}{G}{W}{U}",
          type_line: "Legendary Creature — Human Druid",
          oracle_text: "Whenever you cast a creature spell, draw a card...",
          power: "2",
          toughness: "4",
          colors: ["G", "U", "W"],
          oracle_id: "1e94a742-7cb8-4b93-a621-63ee68b12271",
          image_uris: { normal: "https://example.invalid/b.jpg" },
        },
      ],
    };
    const row = mapIdentity(reversible, TODAY);
    expect(row.name).toBe("Chulane, Teller of Tales");
    expect(row.name_norm).toBe("chulane, teller of tales");
    expect(row.external_key).toBe("1e94a742-7cb8-4b93-a621-63ee68b12271");
    expect(row.is_leader_candidate).toBe(true);
    const attrs = JSON.parse(row.attrs);
    expect(attrs.type_line).toBe("Legendary Creature — Human Druid");
    expect(attrs.oracle_text).not.toContain("//");
    expect(attrs.faces).toBeUndefined(); // one real face = a single-faced card
    // the printing keeps its real back image regardless
    expect(hasBack(reversible)).toBe(true);
  });

  it("reversible printing of a DFC keeps the real A // B name", () => {
    const reversibleDfc: ScryfallCard = {
      id: "5f0c37b2-2b9e-4a15-9c30-25f0f2f3d001",
      lang: "en",
      layout: "reversible_card",
      // Scryfall joins every face name: front MDFC + its restated front again.
      name: "Marang River Regent // Coil and Catch // Marang River Regent",
      set: "tdm",
      collector_number: "410",
      cmc: 7,
      color_identity: ["U"],
      card_faces: [
        {
          name: "Marang River Regent",
          type_line: "Creature — Dragon",
          oracle_text: "Flying...",
          power: "6",
          toughness: "7",
          colors: ["U"],
          oracle_id: "8bd8b2a0-df90-4b74-95a4-8bdb0b6bd05e",
        },
        {
          name: "Coil and Catch",
          type_line: "Instant — Omen",
          oracle_text: "Draw three cards...",
          colors: ["U"],
          oracle_id: "8bd8b2a0-df90-4b74-95a4-8bdb0b6bd05e",
        },
        {
          name: "Marang River Regent",
          type_line: "Creature — Dragon",
          oracle_text: "Flying...",
          power: "6",
          toughness: "7",
          colors: ["U"],
          oracle_id: "8bd8b2a0-df90-4b74-95a4-8bdb0b6bd05e",
        },
      ],
    };
    const row = mapIdentity(reversibleDfc, TODAY);
    expect(row.name).toBe("Marang River Regent // Coil and Catch");
    expect(row.name_norm).toBe("marang river regent coil and catch");
    const attrs = JSON.parse(row.attrs);
    expect(attrs.faces).toHaveLength(2);
    expect(attrs.type_line).toBe("Creature — Dragon // Instant — Omen");
  });

  it("flags previews and leader candidates", () => {
    expect(mapIdentity({ ...bolt, released_at: "2027-01-01" }, TODAY).is_preview).toBe(true);
    expect(isLeaderCandidate({ ...bolt, type_line: "Legendary Creature — Elder Dragon" })).toBe(
      true,
    );
    expect(
      isLeaderCandidate({
        ...bolt,
        type_line: "Legendary Planeswalker — Teferi",
        oracle_text: "Teferi, Temporal Archmage can be your commander.",
      }),
    ).toBe(true);
  });
});

describe("mapPrinting", () => {
  it("maps printing fields and detects backs", () => {
    const row = mapPrinting(dfc);
    expect(row).toMatchObject({ id: dfc.id, set_code: "isd", has_back: true });
    expect(hasBack(bolt)).toBe(false);
  });

  it("content hash ignores prices but tracks card fields", () => {
    const a = printingContentHash(bolt);
    expect(printingContentHash({ ...bolt, prices: { usd: "99.99" } })).toBe(a);
    expect(printingContentHash({ ...bolt, rarity: "mythic" })).not.toBe(a);
  });

  it("serializes lean prices as JSON text", () => {
    expect(JSON.parse(mapPrinting(bolt).prices!)).toEqual({ usd: "1.23", usd_foil: "9.99" });
    expect(mapPrinting(dfc).prices).toBeNull();
  });
});

/**
 * The gallery's wire shape (W5): slim rows carry no URLs (imageOverride only
 * when non-null — the lean-rows rule), prices flatten to usd/usd_foil, and
 * the caption reads like the D4 sketch ("CMM · #410 · Unc.").
 */
import { describe, expect, it } from "vitest";

import {
  API_PRINTINGS_CAP,
  INLINE_PRINTINGS_MAX,
  printingCaption,
  rarityLabel,
  toGalleryPrinting,
  type PrintingRow,
} from "./printings";

const row: PrintingRow = {
  id: "11111111-1111-4111-8111-111111111111",
  setCode: "cmm",
  setName: "Commander Masters",
  collectorNumber: "410",
  rarity: "uncommon",
  releasedAt: "2023-08-04",
  isDefault: true,
  hasBack: false,
  prices: { usd: "2.89", usd_foil: "4.69" },
  imageOverride: null,
};

describe("toGalleryPrinting", () => {
  it("flattens prices and derives the year", () => {
    const slim = toGalleryPrinting(row);
    expect(slim).toEqual({
      id: row.id,
      setCode: "cmm",
      setName: "Commander Masters",
      collectorNumber: "410",
      rarity: "uncommon",
      year: 2023,
      isDefault: true,
      hasBack: false,
      usd: "2.89",
      usdFoil: "4.69",
    });
    // The lean-rows rule: no imageOverride key at all when the column is null.
    expect("imageOverride" in slim).toBe(false);
  });

  it("normalizes missing prices and dates to null", () => {
    const slim = toGalleryPrinting({ ...row, prices: null, releasedAt: null });
    expect(slim.usd).toBeNull();
    expect(slim.usdFoil).toBeNull();
    expect(slim.year).toBeNull();
    // Empty strings (Scryfall's occasional "") normalize too.
    expect(toGalleryPrinting({ ...row, prices: { usd: "" } }).usd).toBeNull();
  });

  it("carries imageOverride only when non-null", () => {
    const override = { front: "https://example.com/x.jpg" };
    expect(toGalleryPrinting({ ...row, imageOverride: override }).imageOverride).toEqual(override);
  });
});

describe("rarityLabel / printingCaption", () => {
  it("abbreviates only uncommon and capitalizes the other Scryfall words", () => {
    expect(rarityLabel("uncommon")).toBe("Unc.");
    expect(rarityLabel("rare")).toBe("Rare");
    expect(rarityLabel("mythic")).toBe("Mythic");
    expect(rarityLabel(null)).toBeNull();
  });

  it("passes One Piece printed codes through untouched", () => {
    expect(rarityLabel("SR")).toBe("SR");
    expect(rarityLabel("Leader")).toBe("Leader");
  });

  it("reads like the D4 sketch", () => {
    expect(printingCaption(toGalleryPrinting(row))).toBe("CMM · #410 · Unc.");
    expect(printingCaption(toGalleryPrinting({ ...row, rarity: null }))).toBe("CMM · #410");
  });
});

describe("caps", () => {
  it("pin the contract's numbers", () => {
    expect(INLINE_PRINTINGS_MAX).toBe(100);
    expect(API_PRINTINGS_CAP).toBe(250);
  });
});

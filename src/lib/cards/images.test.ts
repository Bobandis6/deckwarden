import { describe, expect, it } from "vitest";

import {
  embeddablePrintingImageUrl,
  isEmbeddableImageUrl,
  printingImageUrl,
  scryfallImageUrl,
  toSmallImage,
} from "./images";

const ID = "e3285e6b-3e79-4d7c-bf96-d920f973b122";

describe("scryfallImageUrl", () => {
  it("derives the documented CDN pattern from the printing id", () => {
    expect(scryfallImageUrl(ID)).toBe(`https://cards.scryfall.io/normal/front/e/3/${ID}.jpg`);
    expect(scryfallImageUrl(ID, "small")).toBe(
      `https://cards.scryfall.io/small/front/e/3/${ID}.jpg`,
    );
    expect(scryfallImageUrl(ID, "png", "back")).toBe(
      `https://cards.scryfall.io/png/back/e/3/${ID}.png`,
    );
  });
});

describe("printingImageUrl", () => {
  it("uses the derived URL when there is no override", () => {
    expect(printingImageUrl({ id: ID, imageOverride: null })).toBe(scryfallImageUrl(ID));
  });

  it("honors image_override per face (ingest post-pass shape: {front, back})", () => {
    const override = { front: "https://cards.scryfall.io/normal/front/x/y/other.jpg", back: null };
    expect(printingImageUrl({ id: ID, imageOverride: override })).toBe(override.front);
    // back has no override → derived back URL
    expect(printingImageUrl({ id: ID, imageOverride: override }, "normal", "back")).toBe(
      scryfallImageUrl(ID, "normal", "back"),
    );
  });
});

describe("toSmallImage", () => {
  it("rewrites a derived normal URL to the small rendition", () => {
    expect(toSmallImage(scryfallImageUrl(ID))).toBe(scryfallImageUrl(ID, "small"));
  });

  it("passes override and foreign URLs through untouched", () => {
    const override = "https://example.com/normal/hosted.jpg";
    expect(toSmallImage(override)).toBe(override);
    // "normal" appearing later in the path must not be rewritten
    const tricky = `https://cards.scryfall.io/png/front/e/3/normal.png`;
    expect(toSmallImage(tricky)).toBe(tricky);
  });
});

describe("embeddablePrintingImageUrl", () => {
  it("returns Bandai CORP-blocked override URLs as null, everything else as-is", () => {
    // Bandai serves Cross-Origin-Resource-Policy: same-site (2026-09-03) —
    // browsers refuse the embed, so the wire must carry null, not a broken src.
    const bandai = {
      id: "f17abc33-b7f1-51b2-9a61-7f3af8c60d6a",
      imageOverride: {
        front: "https://en.onepiece-cardgame.com/images/cardlist/card/ST01-001.png?260828",
      },
    };
    expect(embeddablePrintingImageUrl(bandai)).toBeNull();
    expect(isEmbeddableImageUrl("https://asia-en.onepiece-cardgame.com/images/x.png")).toBe(false);
    const r2 = {
      id: "f17abc33-b7f1-51b2-9a61-7f3af8c60d6a",
      imageOverride: { front: "https://img.deckwarden.gg/optcg/images/ST01-001.png" },
    };
    expect(embeddablePrintingImageUrl(r2)).toBe(
      "https://img.deckwarden.gg/optcg/images/ST01-001.png",
    );
    // MTG's derived Scryfall URLs are untouched by the gate.
    expect(embeddablePrintingImageUrl({ id: ID })).toBe(scryfallImageUrl(ID));
  });
});

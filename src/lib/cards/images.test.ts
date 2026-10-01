import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TILE_IMAGE } from "@/lib/decks/tiles";

import {
  embeddablePrintingImageUrl,
  isEmbeddableImageUrl,
  OPTCG_IMAGE_HOST,
  OPTCG_SMALL_IMAGE,
  OPTCG_SMALL_PREFIX,
  optcgSmallImageUrl,
  printingImageUrl,
  scryfallImageUrl,
  thumbnailUrl,
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

describe("optcgSmallImageUrl (P4.9)", () => {
  it("derives the mirror's small WebP from a full img.deckwarden.gg PNG, variants included", () => {
    expect(optcgSmallImageUrl(`${OPTCG_IMAGE_HOST}/optcg/images/OP15-058.png`)).toBe(
      "https://img.deckwarden.gg/optcg/small/OP15-058.webp",
    );
    expect(optcgSmallImageUrl("https://img.deckwarden.gg/optcg/images/OP01-025_p1.png")).toBe(
      "https://img.deckwarden.gg/optcg/small/OP01-025_p1.webp",
    );
    expect(optcgSmallImageUrl("https://img.deckwarden.gg/optcg/images/P-001_r1.png")).toBe(
      "https://img.deckwarden.gg/optcg/small/P-001_r1.webp",
    );
  });

  it("is null for r2.dev, Bandai, Scryfall and anything off the mirror's exact shape", () => {
    expect(
      optcgSmallImageUrl(
        "https://pub-6d142676dd964e79abf609637297c45d.r2.dev/optcg/images/OP15-058.png",
      ),
    ).toBeNull();
    expect(
      optcgSmallImageUrl("https://en.onepiece-cardgame.com/images/cardlist/card/OP15-058.png"),
    ).toBeNull();
    expect(optcgSmallImageUrl(scryfallImageUrl(ID))).toBeNull();
    expect(
      optcgSmallImageUrl("https://img.deckwarden.gg/optcg/images/OP15-058.png?v=2"),
    ).toBeNull();
    expect(optcgSmallImageUrl("https://img.deckwarden.gg/optcg/images/x/OP15-058.png")).toBeNull();
    expect(optcgSmallImageUrl("https://img.deckwarden.gg/optcg/small/OP15-058.webp")).toBeNull();
    expect(optcgSmallImageUrl("http://img.deckwarden.gg/optcg/images/OP15-058.png")).toBeNull();
  });

  it("fills the box every tile and shelf reserves, under the prefix the mirror job writes", () => {
    expect({ width: OPTCG_SMALL_IMAGE.width, height: OPTCG_SMALL_IMAGE.height }).toEqual(
      TILE_IMAGE,
    );
    const mirror = readFileSync("scripts/mirror-optcg-images.sh", "utf8");
    expect(mirror).toContain(`SMALL_PREFIX="${OPTCG_SMALL_PREFIX}"`);
    expect(mirror).toContain('PREFIX="optcg/images"');
    expect(mirror).toContain("--content-type image/webp");
  });
});

describe("thumbnailUrl", () => {
  it("returns the small rendition for a Scryfall normal URL", () => {
    expect(thumbnailUrl(scryfallImageUrl(ID))).toBe(scryfallImageUrl(ID, "small"));
  });

  it("returns the mirror's small WebP for an img.deckwarden.gg PNG (P4.9 — row 51 fired)", () => {
    expect(thumbnailUrl("https://img.deckwarden.gg/optcg/images/ST01-001.png")).toBe(
      "https://img.deckwarden.gg/optcg/small/ST01-001.webp",
    );
  });

  it("returns null for r2.dev, overrides, foreign URLs, and null", () => {
    // r2.dev is rate-limited ("not for production"): small boxes never point at it.
    expect(thumbnailUrl("https://pub-0123.r2.dev/optcg/images/OP15-058.png")).toBeNull();
    expect(thumbnailUrl("https://example.com/normal/hosted.jpg")).toBeNull();
    expect(thumbnailUrl(`https://cards.scryfall.io/png/front/e/3/${ID}.png`)).toBeNull();
    expect(thumbnailUrl(null)).toBeNull();
  });
});

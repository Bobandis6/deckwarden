import { describe, expect, it } from "vitest";

import { printingImageUrl, scryfallImageUrl } from "./images";

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

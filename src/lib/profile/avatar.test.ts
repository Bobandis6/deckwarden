/**
 * The chosen picture's pure module (X5, WAVE3.md D5): the stored shape and
 * its tolerant read, the PUT body's three kinds, the derived crop, the order
 * a render tries, the credit line and the initial.
 */
import { describe, expect, it } from "vitest";

import {
  AVATAR_REQUEST,
  avatarArtUrl,
  avatarCredit,
  avatarInitial,
  avatarSources,
  parseAvatarChoice,
} from "./avatar";

const PRINTING = "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6";
const ART = { kind: "art", printingId: PRINTING, cardName: "Sol Ring", artist: "Mark Tedin" };
const PROVIDER = "https://cdn.discordapp.com/avatars/1/live.png";

describe("parseAvatarChoice", () => {
  it("reads the two stored shapes", () => {
    expect(parseAvatarChoice({ kind: "initial" })).toEqual({ kind: "initial" });
    expect(parseAvatarChoice(ART)).toEqual(ART);
  });

  it("anything else is NULL — the provider picture, never a broken render", () => {
    for (const value of [
      null,
      undefined,
      "initial",
      { kind: "upload", url: "https://evil.example/x.png" },
      { kind: "art", printingId: "not-a-uuid", cardName: "Sol Ring", artist: "Mark Tedin" },
      { kind: "art", printingId: PRINTING, cardName: "Sol Ring" },
      { kind: "art", printingId: PRINTING, cardName: "Sol Ring", artist: "" },
    ]) {
      expect(parseAvatarChoice(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("AVATAR_REQUEST", () => {
  it("takes the three kinds; card art names a card, never a printing or a URL", () => {
    const card = "6ad8011d-3471-4369-9d68-b264cc027487";
    expect(AVATAR_REQUEST.parse({ kind: "provider" })).toEqual({ kind: "provider" });
    expect(AVATAR_REQUEST.parse({ kind: "initial" })).toEqual({ kind: "initial" });
    expect(AVATAR_REQUEST.parse({ kind: "art", cardId: card })).toEqual({
      kind: "art",
      cardId: card,
    });
    // Extra keys are stripped, not stored.
    expect(
      AVATAR_REQUEST.parse({ kind: "art", cardId: card, url: "https://evil.example/x.png" }),
    ).toEqual({ kind: "art", cardId: card });
    for (const bad of [{}, { kind: "art" }, { kind: "art", cardId: "x" }, { kind: "upload" }]) {
      expect(AVATAR_REQUEST.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("rendering a choice", () => {
  it("the crop is derived from the printing id: art_crop, front face", () => {
    expect(avatarArtUrl(PRINTING)).toBe(
      `https://cards.scryfall.io/art_crop/front/1/b/${PRINTING}.jpg`,
    );
  });

  it("tries the art, then the provider picture; the initial tries nothing", () => {
    expect(avatarSources(null, PROVIDER)).toEqual([PROVIDER]);
    expect(avatarSources(null, null)).toEqual([]);
    expect(avatarSources({ kind: "initial" }, PROVIDER)).toEqual([]);
    expect(avatarSources(parseAvatarChoice(ART), PROVIDER)).toEqual([
      avatarArtUrl(PRINTING),
      PROVIDER,
    ]);
    expect(avatarSources(parseAvatarChoice(ART), null)).toEqual([avatarArtUrl(PRINTING)]);
  });

  it("the credit names the card, then artCredit's line; nothing for other choices", () => {
    expect(avatarCredit(parseAvatarChoice(ART))).toBe(
      "Picture: Sol Ring · Art: Mark Tedin · ™ & © Wizards of the Coast",
    );
    expect(avatarCredit(null)).toBeNull();
    expect(avatarCredit({ kind: "initial" })).toBeNull();
  });

  it("the initial is the first code point, uppercased, or ?", () => {
    expect(avatarInitial("bobandis6")).toBe("B");
    expect(avatarInitial("  élan")).toBe("É");
    expect(avatarInitial("🦊 Fox")).toBe("🦊");
    expect(avatarInitial("   ")).toBe("?");
  });
});

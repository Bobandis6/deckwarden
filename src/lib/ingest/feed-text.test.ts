// @vitest-environment node
/**
 * The two characters that fail a nightly feed run (feed-text.ts): U+0000 and
 * a lone surrogate of either half. Everything else a person can type passes,
 * paired surrogates (an emoji) included.
 */
import { describe, expect, it } from "vitest";

import { isStorableText } from "./feed-text";

describe("isStorableText", () => {
  it.each(["Weekly cEDH", "Sébastien Müller", "週末の大会", "Unicorn \u{1F984} Cup", "", "  "])(
    "keeps %j",
    (text) => {
      expect(isStorableText(text)).toBe(true);
    },
  );

  it.each(["a\u0000b", "\u0000", "a\ud83db", "\ud83d", "a\udc00b", "\u{1F984}\ud83d"])(
    "refuses %j",
    (text) => {
      expect(isStorableText(text)).toBe(false);
    },
  );
});

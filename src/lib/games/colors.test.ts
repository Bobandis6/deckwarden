import { describe, expect, it } from "vitest";

import { ciPipsHtml, lettersToMask, maskToLetters } from "./colors";

describe("color mask helpers", () => {
  it("round-trips letters and masks in WUBRG order", () => {
    expect(lettersToMask("wub")).toBe(1 + 2 + 4);
    expect(maskToLetters(1 + 2 + 4)).toEqual(["W", "U", "B"]);
    // order-insensitive parse, canonical order out
    expect(maskToLetters(lettersToMask("gruwb"))).toEqual(["W", "U", "B", "R", "G"]);
  });

  it("ignores junk letters", () => {
    expect(lettersToMask("w,x u!")).toBe(1 + 2);
  });

  it("renders a C pip for colorless identities", () => {
    expect(ciPipsHtml(0)).toBe(`<span class="pip pip-c">C</span>`);
    expect(ciPipsHtml(1 + 16)).toBe(
      `<span class="pip pip-w">W</span><span class="pip pip-g">G</span>`,
    );
  });
});

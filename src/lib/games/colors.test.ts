import { describe, expect, it } from "vitest";

import { COLOR_BIT, ciPipsHtml, lettersToMask, maskToLetters, strictLettersToMask } from "./colors";

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

  it("the strict reading (the search grammar's) refuses junk instead of ignoring it", () => {
    expect(strictLettersToMask("wub")).toBe(1 + 2 + 4);
    expect(strictLettersToMask("C")).toBe(32);
    expect(strictLettersToMask("")).toBe(0);
    expect(strictLettersToMask("WUX")).toBeNull();
    expect(strictLettersToMask("w,u")).toBeNull();
  });

  it("is the one WUBRGC table (S8, I3): W1 U2 B4 R8 G16 C32", () => {
    expect(COLOR_BIT).toEqual({ W: 1, U: 2, B: 4, R: 8, G: 16, C: 32 });
  });

  it("renders a C pip for colorless identities", () => {
    expect(ciPipsHtml(0)).toBe(`<span class="pip pip-c">C</span>`);
    expect(ciPipsHtml(1 + 16)).toBe(
      `<span class="pip pip-w">W</span><span class="pip pip-g">G</span>`,
    );
  });
});

import { describe, expect, it } from "vitest";

import { maskToOptcgColorNames, maskToOptcgLetters, OPTCG_COLORS } from "./colors";
import { OPTCG_COLOR_BIT } from "./punk-map";

describe("OPTCG_COLORS", () => {
  it("covers every punk-map color bit exactly once", () => {
    const bits = OPTCG_COLORS.map((c) => c.bit).sort((a, b) => a - b);
    expect(bits).toEqual(Object.values(OPTCG_COLOR_BIT).sort((a, b) => a - b));
  });
});

describe("maskToOptcgColorNames", () => {
  it("maps shared-mask bits to OP names, never MTG letters", () => {
    expect(maskToOptcgColorNames(OPTCG_COLOR_BIT.Yellow)).toEqual(["Yellow"]);
    expect(maskToOptcgColorNames(OPTCG_COLOR_BIT.Purple)).toEqual(["Purple"]);
    expect(maskToOptcgColorNames(OPTCG_COLOR_BIT.Red | OPTCG_COLOR_BIT.Green)).toEqual([
      "Red",
      "Green",
    ]);
    expect(maskToOptcgColorNames(0)).toEqual([]);
  });
});

describe("maskToOptcgLetters", () => {
  it("emits the colorset param grammar in OP display order", () => {
    expect(maskToOptcgLetters(OPTCG_COLOR_BIT.Red | OPTCG_COLOR_BIT.Blue)).toBe("RU");
    expect(maskToOptcgLetters(OPTCG_COLOR_BIT.Yellow | OPTCG_COLOR_BIT.Purple)).toBe("CW");
  });
});

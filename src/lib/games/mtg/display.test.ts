/**
 * Magic display hooks the ambient layer reads (R2, G7): the color-identity
 * swatches as `--mana-*` variables in WUBRG order, the neutral C pastel for
 * a colorless identity (the explicit C bit adds nothing), and the
 * `ambientArt` capability the resolver gates on.
 */
import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";

const swatches = (mask: number) => mtgAdapter.display.colorSwatches?.(mask);

describe("mtg display (R2)", () => {
  it("colorSwatches maps the identity to --mana-* variables in WUBRG order", () => {
    expect(swatches(1 | 2 | 4)).toEqual(["var(--mana-w)", "var(--mana-u)", "var(--mana-b)"]);
    expect(swatches(16 | 8)).toEqual(["var(--mana-r)", "var(--mana-g)"]);
    expect(swatches(1 | 2 | 4 | 8 | 16)).toHaveLength(5);
  });

  it("a colorless identity (mask 0, or the explicit C bit alone) is the neutral C pastel", () => {
    expect(swatches(0)).toEqual(["var(--mana-c)"]);
    expect(swatches(32)).toEqual(["var(--mana-c)"]);
    // The C bit beside real colors adds nothing.
    expect(swatches(32 | 8)).toEqual(["var(--mana-r)"]);
  });

  it("declares art_crop ambient art", () => {
    expect(mtgAdapter.capabilities.ambientArt).toEqual({ kind: "art_crop" });
  });
});

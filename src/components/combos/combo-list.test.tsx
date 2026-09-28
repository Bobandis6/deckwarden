/**
 * ComboList's combo door (X3, WAVE3.md D3): with `buildHref` every row
 * carries "Build around this combo" as a plain link (server HTML — the hub
 * stays ISR) to the href the page built; without it (card pages, a banned
 * or not-legal commander's hub) no row does. The walkthrough link and the
 * anchor card's plain-text name are untouched either way.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ComboView } from "@/lib/combos/queries";
import { getAdapter } from "@/lib/games/registry";

import { ComboList } from "./combo-list";

const combosMeta = getAdapter("mtg").capabilities.combos!;

const kikiId = "ba951d7e-9938-411d-8f03-8a10c59cd5cf";
const combos: ComboView[] = [
  {
    id: 106877,
    externalKey: "618-1537",
    results: ["Infinite creature tokens with haste"],
    templates: [],
    popularity: 28185,
    pieces: [
      { id: kikiId, name: "Kiki-Jiki, Mirror Breaker", externalKey: "oracle-kiki" },
      { id: "c-1", name: "Zealous Conscripts", externalKey: "oracle-conscripts" },
    ],
  },
  {
    id: 2,
    externalKey: "618-4153--5",
    results: ["Infinite damage"],
    templates: ["A sacrifice outlet"],
    popularity: 120,
    pieces: [
      { id: kikiId, name: "Kiki-Jiki, Mirror Breaker", externalKey: "oracle-kiki" },
      { id: "c-2", name: "Pestermite", externalKey: "oracle-pestermite" },
    ],
  },
];

describe("ComboList — the combo door (X3)", () => {
  it("with buildHref: one door per row, a plain link to the page-built href", () => {
    render(
      <ComboList
        combos={combos}
        combosMeta={combosMeta}
        anchorCardId={kikiId}
        buildHref={(combo) => `/decks/new?game=mtg&leader=oracle-kiki&combo=${combo.externalKey}`}
      />,
    );
    const doors = screen.getAllByRole("link", { name: "Build around this combo" });
    expect(doors.map((d) => d.getAttribute("href"))).toEqual([
      "/decks/new?game=mtg&leader=oracle-kiki&combo=618-1537",
      "/decks/new?game=mtg&leader=oracle-kiki&combo=618-4153--5",
    ]);
    // The walkthrough link and the anchor's plain-text name stand as before.
    expect(
      screen.getAllByRole("link", { name: /How it works on Commander Spellbook/ }),
    ).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Kiki-Jiki, Mirror Breaker" })).toBeNull();
  });

  it("without buildHref (card pages, a hub with no build action): no door on any row", () => {
    render(<ComboList combos={combos} combosMeta={combosMeta} />);
    expect(screen.queryByRole("link", { name: "Build around this combo" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /How it works on Commander Spellbook/ }),
    ).toHaveLength(2);
  });
});

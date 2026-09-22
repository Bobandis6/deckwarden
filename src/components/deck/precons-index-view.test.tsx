/**
 * The /precons filter island (W8b, D7): year groups newest first, the
 * exact-identity color pills, search over name + commanders + set, the
 * sort select, the empty state with Clear filters — and the W8b decision
 * pin that filter state is EPHEMERAL: no filter ever reflects into the
 * URL (no searchParams by contract, no hash by decision).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { normalizeCardName } from "@/lib/cards/normalize";
import { deckTileData } from "@/lib/decks/tiles";
import { lettersToMask } from "@/lib/games/colors";
import { PreconsIndexView, type PreconItem } from "./precons-index-view";

function item(
  name: string,
  year: number,
  letters: string,
  leaders: string[],
  set: string,
): PreconItem {
  const ciMask = letters === "" ? 0 : lettersToMask(letters);
  return {
    publicId: `p_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    year,
    releaseDate: `${year}-06-01`,
    ciMask,
    search: normalizeCardName([name, ...leaders, set].join(" ")),
    tile: deckTileData({
      href: `/d/p_x`,
      name,
      game: "mtg",
      formatCode: "commander",
      updatedAt: `${year}-06-01`,
      likesCount: 0,
      ciMask,
      leaderImage: null,
      dateLabel: `Released Jun ${year}`,
      priceLabel: "≈ $97",
    }),
  };
}

const ITEMS: PreconItem[] = [
  item("Breed Lethality", 2016, "WUBG", ["Atraxa, Praetors' Voice"], "Commander 2016"),
  item("Counterpunch", 2011, "WBG", ["Ghave, Guru of Spores"], "Commander"),
  item("Eldrazi Unbound", 2018, "", ["Zetalpa? no — colorless"], "Commander Anthology"),
  item("Timey-Wimey", 2023, "WUR", ["The Tenth Doctor", "Rose Tyler"], "Doctor Who"),
  item("Wretched Ranks", 2026, "WB", ["Someone"], "Foundations"),
];

const tileNames = () =>
  [...document.querySelectorAll("[data-slot=deck-tile] [data-slot=tile-link]")].map(
    (el) => el.textContent,
  );

describe("PreconsIndexView", () => {
  it("year groups newest first with every tile badged and priced; Oldest reverses; Name flattens", () => {
    render(<PreconsIndexView items={ITEMS} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "2026",
      "2023",
      "2018",
      "2016",
      "2011",
    ]);
    expect(tileNames()).toEqual([
      "Wretched Ranks",
      "Timey-Wimey",
      "Eldrazi Unbound",
      "Breed Lethality",
      "Counterpunch",
    ]);
    expect(document.querySelectorAll("[data-slot=tile-badge]")).toHaveLength(5);
    expect(document.body.textContent).toContain("Released Jun 2016");
    expect(document.body.textContent).toContain("≈ $97");
    // Cold-start rule: product tiles never say "Updated".
    expect(document.body.textContent).not.toContain("Updated");

    fireEvent.change(screen.getByLabelText(/Sort/), { target: { value: "oldest" } });
    expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("2011");

    fireEvent.change(screen.getByLabelText(/Sort/), { target: { value: "name" } });
    expect(screen.queryByRole("heading", { level: 2, name: "2016" })).toBeNull();
    expect(tileNames()).toEqual([
      "Breed Lethality",
      "Counterpunch",
      "Eldrazi Unbound",
      "Timey-Wimey",
      "Wretched Ranks",
    ]);
  });

  it("search matches deck names, commander names and sets", () => {
    render(<PreconsIndexView items={ITEMS} />);
    const box = screen.getByLabelText("Search decks or commanders");
    fireEvent.change(box, { target: { value: "atraxa" } });
    expect(tileNames()).toEqual(["Breed Lethality"]);
    fireEvent.change(box, { target: { value: "doctor who" } });
    expect(tileNames()).toEqual(["Timey-Wimey"]);
    fireEvent.change(box, { target: { value: "" } });
    expect(tileNames()).toHaveLength(5);
  });

  it("color pills are exact identity — WUBG is Breed Lethality alone, C is exactly colorless", () => {
    render(<PreconsIndexView items={ITEMS} />);
    for (const c of ["White", "Blue", "Black", "Green"]) {
      fireEvent.click(screen.getByRole("button", { name: c }));
    }
    expect(tileNames()).toEqual(["Breed Lethality"]);

    fireEvent.click(screen.getByRole("button", { name: "Colorless" }));
    expect(tileNames()).toEqual(["Eldrazi Unbound"]);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(tileNames()).toHaveLength(5);
  });

  it("year select narrows to one group", () => {
    render(<PreconsIndexView items={ITEMS} />);
    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: "2023" } });
    expect(tileNames()).toEqual(["Timey-Wimey"]);
  });

  it("no match → 'No precons match' with Clear filters restoring everything", () => {
    render(<PreconsIndexView items={ITEMS} />);
    fireEvent.change(screen.getByLabelText("Search decks or commanders"), {
      target: { value: "krenko" },
    });
    expect(screen.getByText("No precons match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(tileNames()).toHaveLength(5);
  });

  it("filtering never touches the URL (the W8b ephemeral-state decision)", () => {
    render(<PreconsIndexView items={ITEMS} />);
    const before = window.location.href;
    fireEvent.change(screen.getByLabelText("Search decks or commanders"), {
      target: { value: "atraxa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "White" }));
    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: "2016" } });
    fireEvent.change(screen.getByLabelText(/Sort/), { target: { value: "name" } });
    expect(window.location.href).toBe(before);
  });
});

/**
 * The /sets filter island (X4b): every row a link and always in the DOM
 * (the default hides, never drops), "Main sets only" on by default, year
 * groups newest first with a day's sets in the list's own order, the row's
 * words (the picker's place words, the UTC date, the card count), the box
 * matching the way the /cards picker does (`blo` → the Bloomburrow sets,
 * `blb` → Bloomburrow, `moon` → Eldritch Moon), the two empty states — and
 * the /precons pin: filtering never touches the URL.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReleasedSet } from "@/lib/sets/lines";

import { SetsIndexView, filterSets, groupSetsByYear } from "./sets-index-view";

/** Newest first, a day's sets by line — GET /api/sets' order and shape. */
const SETS: ReleasedSet[] = [
  set("hob", "The Hobbit", "2026-08-14", "expansion", "main", 281, 114),
  set("blb", "Bloomburrow", "2024-08-02", "expansion", "main", 279, 102),
  set("blc", "Bloomburrow Commander", "2024-08-02", "commander", "main", 350, 18),
  set("pblb", "Bloomburrow Promos", "2024-08-02", "promo", "other", 40, null),
  set("tblb", "Bloomburrow Tokens", "2024-08-02", "token", "other", 1, null),
  set("sld", "Secret Lair Drop", "2019-12-02", "box", "main", 1735, null),
  set("emn", "Eldritch Moon", "2016-07-22", "expansion", "main", 208, 71),
  set("itp", "Introductory Two-Player Set", "1996-12-31", "starter", "other", 49, null),
  set("lea", "Limited Edition Alpha", "1993-08-05", "core", "main", 295, null),
];

function set(
  code: string,
  name: string,
  releasedAt: string,
  setType: string,
  group: ReleasedSet["group"],
  cards: number,
  ordinal: number | null,
): ReleasedSet {
  return { code, name, releasedAt, setType, group, cards, ordinal };
}

const box = () => screen.getByLabelText("Filter sets by name or code");
const mainOnly = () => screen.getByRole("checkbox", { name: "Main sets only" });
const type = (value: string) => fireEvent.change(box(), { target: { value } });

/** The names of the rows a reader can see: neither the row nor its year is hidden. */
function shownNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll("li")]
    .filter((li) => !li.hidden && !li.closest("section")?.hidden)
    .map((li) => li.querySelector("a > span")?.textContent ?? "");
}

describe("SetsIndexView", () => {
  it("renders every set as a link and shows the main sets by default", () => {
    const { container } = render(<SetsIndexView sets={SETS} />);
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(SETS.map((s) => `/cards?set=${s.code}`));
    expect((mainOnly() as HTMLInputElement).checked).toBe(true);
    expect(shownNames(container)).toEqual([
      "The Hobbit",
      "Bloomburrow",
      "Bloomburrow Commander",
      "Secret Lair Drop",
      "Eldritch Moon",
      "Limited Edition Alpha",
    ]);
    // The other products stay in the markup, hidden — never dropped.
    const promos = container.querySelector('a[href="/cards?set=pblb"]')!;
    expect((promos.closest("li") as HTMLLIElement).hidden).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Showing 6 of 9 sets");
  });

  it("groups by year, newest first, and hides a year with no row to show", () => {
    const { container } = render(<SetsIndexView sets={SETS} />);
    const years = [...container.querySelectorAll("section")].map((section) => ({
      year: within(section).getByRole("heading", { level: 2, hidden: true }).textContent,
      hidden: section.hidden,
    }));
    expect(years).toEqual([
      { year: "2026", hidden: false },
      { year: "2024", hidden: false },
      { year: "2019", hidden: false },
      { year: "2016", hidden: false },
      { year: "1996", hidden: true }, // only an other product that year
      { year: "1993", hidden: false },
    ]);
    fireEvent.click(mainOnly());
    expect(container.querySelector("section:nth-of-type(5)")!.hasAttribute("hidden")).toBe(false);
  });

  it("a row reads name · code · place in its line · date · cards", () => {
    render(<SetsIndexView sets={SETS} />);
    const row = (code: string) =>
      [...document.querySelectorAll(`a[href="/cards?set=${code}"] span`)]
        .filter((span) => span.children.length === 0)
        .map((span) => span.textContent);
    expect(row("blb")).toEqual([
      "Bloomburrow",
      "blb",
      "102nd expansion set",
      "Aug 2, 2024",
      "279 cards",
    ]);
    expect(row("blc")).toEqual([
      "Bloomburrow Commander",
      "blc",
      "18th Commander set",
      "Aug 2, 2024",
      "350 cards",
    ]);
    expect(row("sld")).toContain("Secret Lair series");
    expect(row("sld")).toContain("1,735 cards");
    expect(row("lea")).toContain("core set");
    expect(row("tblb")).toContain("1 card");
  });

  it("the box matches like the picker and keeps the page's order", () => {
    const { container } = render(<SetsIndexView sets={SETS} />);
    type("blo");
    expect(shownNames(container)).toEqual(["Bloomburrow", "Bloomburrow Commander"]);
    expect(screen.getByRole("status").textContent).toBe("Showing 2 of 9 sets");
    fireEvent.click(mainOnly());
    expect(shownNames(container)).toEqual([
      "Bloomburrow",
      "Bloomburrow Commander",
      "Bloomburrow Promos",
      "Bloomburrow Tokens",
    ]);
    type("blb");
    expect(shownNames(container)).toEqual(["Bloomburrow"]);
    type("moon");
    expect(shownNames(container)).toEqual(["Eldritch Moon"]);
    type("");
    expect(shownNames(container)).toHaveLength(SETS.length);
    expect(screen.getByRole("status").textContent).toBe("Showing all 9 sets");
  });

  it("nothing matches → 'No sets match', and Clear filter brings the list back", () => {
    const { container } = render(<SetsIndexView sets={SETS} />);
    type("zzzq");
    expect(shownNames(container)).toEqual([]);
    expect(screen.getByText("No sets match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(shownNames(container)).toHaveLength(6);
    expect(screen.queryByText("No sets match")).toBeNull();
  });

  it("only other products match → the empty state offers them by count", () => {
    const { container } = render(<SetsIndexView sets={SETS} />);
    type("tokens");
    expect(screen.getByText("No main sets match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 other product" }));
    expect((mainOnly() as HTMLInputElement).checked).toBe(false);
    expect(shownNames(container)).toEqual(["Bloomburrow Tokens"]);
  });

  it("filtering never touches the URL (the /precons ephemeral-state decision)", () => {
    render(<SetsIndexView sets={SETS} />);
    const before = window.location.href;
    type("blo");
    fireEvent.click(mainOnly());
    type("zzzq");
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(window.location.href).toBe(before);
  });
});

describe("the island's pure helpers", () => {
  it("groupSetsByYear keeps the list's order inside a year, whatever order the years arrive in", () => {
    const shuffled = [SETS[6], SETS[1], SETS[2], SETS[0]];
    expect(groupSetsByYear(shuffled).map((y) => [y.year, y.sets.map((s) => s.code)])).toEqual([
      ["2026", ["hob"]],
      ["2024", ["blb", "blc"]],
      ["2016", ["emn"]],
    ]);
  });

  it("filterSets counts the other products the main-only filter held back", () => {
    expect(filterSets(SETS, "blo", true)).toEqual({
      shown: new Set(["blb", "blc"]),
      otherMatches: 2,
    });
    expect(filterSets(SETS, "", false).shown.size).toBe(SETS.length);
    expect(filterSets(SETS, "  ", true).shown.size).toBe(6);
  });
});

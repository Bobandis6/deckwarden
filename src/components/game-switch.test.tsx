/**
 * GameSwitch (R1b, C6): a nav labelled "Game" of two link pills with
 * aria-current on the active game — the /cards markup, shared by the browse
 * indexes.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameSwitch } from "./game-switch";

describe("GameSwitch", () => {
  it("links the two indexes and marks the active game", () => {
    render(<GameSwitch active="optcg" />);
    const nav = screen.getByRole("navigation", { name: "Game" });
    const mtg = within(nav).getByRole("link", { name: "Magic: The Gathering" });
    const op = within(nav).getByRole("link", { name: "One Piece" });
    expect(mtg.getAttribute("href")).toBe("/commanders");
    expect(op.getAttribute("href")).toBe("/leaders");
    expect(op.getAttribute("aria-current")).toBe("page");
    expect(mtg.getAttribute("aria-current")).toBeNull();
  });

  it("takes /cards' own hrefs", () => {
    render(<GameSwitch active="mtg" hrefs={{ mtg: "/cards", optcg: "/cards?game=optcg" }} />);
    expect(screen.getByRole("link", { name: "One Piece" }).getAttribute("href")).toBe(
      "/cards?game=optcg",
    );
    expect(
      screen.getByRole("link", { name: "Magic: The Gathering" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});

/**
 * The editor's compact attribution (R4): the game's credit line ends the
 * tools content. U3a: it carries `mt-auto`, so in the wide tier's column it
 * rests on the pane's bottom edge while the content is short (a seeded
 * preview then pushes it only from there); the words don't move.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";

import { EditorAttribution } from "./editor-attribution";

describe("EditorAttribution", () => {
  it("Magic: the Scryfall / Fan Content line, resting on the column's bottom edge", () => {
    render(<EditorAttribution adapter={getAdapter("mtg")} />);
    const line = document.querySelector<HTMLElement>("[data-slot=editor-attribution]")!;
    expect(line.className).toContain("mt-auto");
    expect(line.textContent).toContain("Card data and images courtesy of Scryfall");
    expect(screen.getByRole("link", { name: "Scryfall" }).getAttribute("href")).toBe(
      "https://scryfall.com",
    );
  });

  it("One Piece: the posture line's wrapper rests there too", () => {
    render(<EditorAttribution adapter={getAdapter("optcg")} />);
    expect(
      document.querySelector<HTMLElement>("[data-slot=editor-attribution]")!.className,
    ).toContain("mt-auto");
  });
});

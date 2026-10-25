/**
 * The Tokens section (DECK-TOKENS) through the editor's deck pane and, read
 * only, on its own as the share page renders it: the disclosure (closed by
 * default, its open state kept with the view preferences), the count and the
 * "N from your cards" hint without a request, "From your cards" in ONE
 * resolve call by oracle id with each row naming its makers, Add and Add
 * all through the pane's one callback, the token rows in text and grid with
 * their captions, the steppers in the tokens zone, the token-only search,
 * and the quiet first screen.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeckListPane } from "@/components/editor/deck-list-pane";
import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

import { TokensSection } from "./tokens-section";

const mtg = getAdapter("mtg");
const TOKENS = COMMANDER.zones.find((z) => z.holds === "tokens")!;
const editorCard = (c: ReturnType<typeof card>): EditorCard => ({ ...c, image: null });

const KEY = {
  treasure: "aaaaaaaa-0000-4000-8000-000000000001",
  soldier: "aaaaaaaa-0000-4000-8000-000000000002",
  emblem: "aaaaaaaa-0000-4000-8000-000000000003",
  spirit: "aaaaaaaa-0000-4000-8000-000000000004",
};
const tokenCard = (name: string, key: string, over: Partial<ReturnType<typeof card>> = {}) =>
  editorCard(
    card({
      name,
      externalKey: key,
      primaryType: "Creature",
      costValue: 0,
      ...over,
      attrs: {
        type_line: `Token Creature — ${name}`,
        oracle_text: "",
        ...over.attrs,
        is_token: true,
      },
    }),
  );
const treasure = tokenCard("Treasure", KEY.treasure, {
  primaryType: "Artifact",
  attrs: { type_line: "Token Artifact — Treasure", oracle_text: "" },
});
const soldier = tokenCard("Soldier", KEY.soldier, {
  colorsMask: 1,
  attrs: { type_line: "Token Creature — Soldier", oracle_text: "", power: "1", toughness: "1" },
});
const emblem = tokenCard("Elspeth, Sun's Champion Emblem", KEY.emblem, {
  primaryType: "Emblem",
  attrs: { type_line: "Emblem — Elspeth", oracle_text: "" },
});
const spirit = tokenCard("Spirit", KEY.spirit, {
  colorsMask: 1,
  attrs: {
    type_line: "Token Creature — Spirit",
    oracle_text: "Flying",
    power: "1",
    toughness: "1",
    keywords: ["Flying"],
  },
});
const byKey = new Map([treasure, soldier, emblem, spirit].map((c) => [c.externalKey, c]));

const commander = editorCard(card({ name: "Brago, King Eternal", isLeaderCandidate: true }));
const tithe = editorCard(
  card({
    name: "Smothering Tithe",
    primaryType: "Enchantment",
    attrs: { type_line: "Enchantment", oracle_text: "", tokens: [KEY.treasure] },
  }),
);
const elspeth = editorCard(
  card({
    name: "Elspeth, Sun's Champion",
    primaryType: "Planeswalker",
    attrs: {
      type_line: "Legendary Planeswalker — Elspeth",
      oracle_text: "",
      tokens: [KEY.soldier, KEY.emblem],
    },
  }),
);
const dockside = editorCard(
  card({
    name: "Dockside Extortionist",
    attrs: { type_line: "Creature — Goblin Pirate", oracle_text: "", tokens: [KEY.treasure] },
  }),
);

const entries: EditorEntry[] = [
  { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
  { cardId: tithe.id, zone: "main", qty: 1, tags: [] },
  { cardId: elspeth.id, zone: "main", qty: 1, tags: [] },
  { cardId: dockside.id, zone: "main", qty: 1, tags: [] },
  { cardId: spirit.id, zone: "tokens", qty: 1, tags: [] },
];
const cards = new Map([commander, tithe, elspeth, dockside, spirit].map((c) => [c.id, c]));

const fetchMock = vi.fn();
const resolveCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/cards/resolve");
const searchCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/cards/search?"));

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "/api/cards/resolve") {
      const { names } = JSON.parse(String(init?.body)) as { names: string[] };
      return Response.json({
        results: names.map((key) => ({ match: (byKey.get(key) as CardWire | undefined) ?? null })),
      });
    }
    if (String(url).startsWith("/api/cards/search?")) {
      return Response.json({ results: [soldier, spirit] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function pane(over: Partial<React.ComponentProps<typeof DeckListPane>> = {}) {
  const onAddTokens = vi.fn<(c: EditorCard[]) => string | undefined>(() => undefined);
  const onSetQty = vi.fn<(zone: string, id: string, qty: number) => string | undefined>(
    () => undefined,
  );
  const onPreview = vi.fn();
  render(
    <DeckListPane
      adapter={mtg}
      format={COMMANDER}
      entries={entries}
      cards={cards}
      issues={[]}
      analytics={[]}
      onRemove={() => {}}
      extras={false}
      onAddTokens={onAddTokens}
      onSetQty={onSetQty}
      onPreview={onPreview}
      {...over}
    />,
  );
  return { onAddTokens, onSetQty, onPreview };
}
const trigger = () => screen.getByRole("button", { name: /^Tokens/ });
const section = () => document.querySelector<HTMLElement>("[data-slot=tokens-section]")!;

describe("the Tokens section in the editor (DECK-TOKENS)", () => {
  it("is closed at first: the heading names the count and what the cards make, and nothing is asked", async () => {
    pane();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    // Three linked tokens the zone lacks (Treasure from two cards counts once).
    expect(trigger().textContent).toBe("Tokens13 from your cards");
    expect(within(section()).queryByText("Spirit")).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opening asks ONE resolve by oracle id, names each token's makers, and remembers the choice", async () => {
    const { onAddTokens } = pane();
    fireEvent.click(trigger());
    await waitFor(() => expect(trigger().getAttribute("aria-expanded")).toBe("true"));
    const soldierRow = await screen.findByRole("button", {
      name: "Add Soldier (1/1 white), from Elspeth, Sun's Champion",
    });
    expect(resolveCalls()).toHaveLength(1);
    const body = JSON.parse(String(resolveCalls()[0][1]?.body));
    expect(body).toEqual({
      game: "mtg",
      format: "commander",
      names: [KEY.treasure, KEY.soldier, KEY.emblem].sort(),
    });
    expect(
      screen.getByRole("button", {
        name: "Add Treasure, from Dockside Extortionist, Smothering Tithe",
      }),
    ).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("deckwarden:deck-view")!)).toMatchObject({
      tokensOpen: true,
    });
    // The hint stays a closed heading's: open, the rows say it.
    expect(trigger().textContent).toBe("Tokens1");

    fireEvent.click(soldierRow);
    expect(onAddTokens).toHaveBeenLastCalledWith([soldier]);
    fireEvent.click(screen.getByRole("button", { name: "Add all 3" }));
    expect(onAddTokens.mock.lastCall![0].map((c: EditorCard) => c.name)).toEqual([
      "Elspeth, Sun's Champion Emblem",
      "Soldier",
      "Treasure",
    ]);
  });

  it("the deck's tokens in the text view: captioned rows whose steppers work in the tokens zone", async () => {
    const { onSetQty } = pane();
    fireEvent.click(trigger());
    const name = await within(section()).findByRole("button", { name: /^Spirit/ });
    expect(name.querySelector("[data-slot=caption]")?.textContent).toBe("1/1 white, flying");
    fireEvent.click(within(section()).getByRole("button", { name: "One more Spirit" }));
    expect(onSetQty).toHaveBeenCalledWith("tokens", spirit.id, 2);
  });

  it("follows the pane's View: the grid shows each printed token, no badge over its name", async () => {
    window.localStorage.setItem(
      "deckwarden:deck-view",
      JSON.stringify({ view: "grid", groupBy: "primaryType", sortBy: "name", tokensOpen: true }),
    );
    pane();
    const tile = await within(section()).findByRole("button", { name: "Show Spirit" });
    expect(tile.closest("li")?.textContent).toContain("×1");
    expect(tile.closest("li")?.textContent).not.toContain("1/1 white");
  });

  it("Add a token searches the token catalog alone, and a pick goes through the pane's add", async () => {
    window.localStorage.setItem("deckwarden:deck-view", JSON.stringify({ tokensOpen: true }));
    const { onAddTokens } = pane();
    const input = await screen.findByRole("searchbox", { name: "Add a token" });
    fireEvent.change(input, { target: { value: "sold" } });
    const pick = await screen.findByRole("button", { name: "Add Soldier (1/1 white)" });
    const url = new URL(String(searchCalls()[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      game: "mtg",
      tokens: "1",
      name: "sold",
      sort: "best",
      limit: "12",
    });
    fireEvent.click(pick);
    expect(onAddTokens).toHaveBeenLastCalledWith([soldier]);
  });

  it("the box reads a token's words: 'Elemental 4/4 blue red' asks by name, P/T and colors", async () => {
    window.localStorage.setItem("deckwarden:deck-view", JSON.stringify({ tokensOpen: true }));
    pane();
    const input = await screen.findByRole("searchbox", { name: "Add a token" });
    expect(input.getAttribute("placeholder")).toBe("Name, P/T or colors: Elemental 4/4 blue red");
    fireEvent.change(input, { target: { value: "Elemental 4/4 blue red" } });
    await waitFor(() => expect(searchCalls()).toHaveLength(1));
    const url = new URL(String(searchCalls()[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "elemental",
      power: "4",
      toughness: "4",
      colors: "including:UR",
      game: "mtg",
      tokens: "1",
      sort: "best",
      limit: "12",
    });
  });

  it("a broad search says how many it shows and pages the rest with Show more", async () => {
    const elementals = Array.from({ length: 15 }, (_, i) =>
      tokenCard("Elemental", `bbbbbbbb-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, {
        attrs: {
          type_line: "Token Creature — Elemental",
          oracle_text: "",
          power: String(i),
          toughness: "1",
        },
      }),
    );
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const params = new URL(String(url), "http://localhost").searchParams;
      const offset = Number(params.get("offset") ?? 0);
      return Response.json({ results: elementals.slice(offset, offset + 12), total: 15 });
    });
    window.localStorage.setItem("deckwarden:deck-view", JSON.stringify({ tokensOpen: true }));
    pane();
    fireEvent.change(await screen.findByRole("searchbox", { name: "Add a token" }), {
      target: { value: "elemental" },
    });
    expect(
      await screen.findByText(
        "Showing 12 of 15. Add P/T or colors to narrow it, like 4/4 blue red.",
      ),
    ).toBeTruthy();
    const found = () =>
      within(screen.getByRole("list", { name: "Tokens found" })).getAllByRole("button");
    expect(found()).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Show 3 more" }));
    await waitFor(() => expect(found()).toHaveLength(15));
    expect(String(searchCalls().at(-1)?.[0])).toContain("offset=12");
    // Everything shown: no count line, no button.
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
  });

  it("waits for the first card (the quiet first screen) unless the deck holds a token", () => {
    const { unmount } = render(
      <DeckListPane
        adapter={mtg}
        format={COMMANDER}
        entries={[]}
        cards={new Map()}
        issues={[]}
        analytics={[]}
        onSetQty={() => undefined}
        onRemove={() => {}}
        onPreview={() => {}}
        extras={false}
        onAddTokens={() => undefined}
      />,
    );
    expect(document.querySelector("[data-slot=tokens-section]")).toBeNull();
    unmount();
    render(
      <DeckListPane
        adapter={mtg}
        format={COMMANDER}
        entries={[{ cardId: spirit.id, zone: "tokens", qty: 2, tags: [] }]}
        cards={new Map([[spirit.id, spirit]])}
        issues={[]}
        analytics={[]}
        onSetQty={() => undefined}
        onRemove={() => {}}
        onPreview={() => {}}
        extras={false}
        onAddTokens={() => undefined}
      />,
    );
    expect(trigger().textContent).toBe("Tokens2");
    // Outside the 100: the deck still reads 0 / 100.
    expect(document.querySelector("[data-slot=deck-size]")?.textContent).toContain("0 / 100");
  });
});

describe("the Tokens section read-only (the share page)", () => {
  it("no adds and no steppers; a name opens its card", async () => {
    const onPreview = vi.fn();
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <TokensSection
          adapter={mtg}
          zone={TOKENS}
          items={[{ entry: { cardId: spirit.id, zone: "tokens", qty: 3, tags: [] }, card: spirit }]}
          view="text"
          open={open}
          onOpenChange={setOpen}
          onPreview={onPreview}
          preview
        />
      );
    };
    render(<Harness />);
    expect(trigger().textContent).toBe("Tokens3");
    fireEvent.click(trigger());
    const name = await screen.findByRole("button", { name: /^Spirit/ });
    expect(screen.queryByRole("searchbox", { name: "Add a token" })).toBeNull();
    expect(screen.queryByRole("button", { name: "One more Spirit" })).toBeNull();
    fireEvent.click(name);
    expect(onPreview).toHaveBeenCalledWith(spirit);
  });
});

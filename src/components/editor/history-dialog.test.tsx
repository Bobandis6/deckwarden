/**
 * HistoryDialog's RTL suite (P3.6's dialog; none existed before Y9a's three
 * played-snapshot tests — Y10 brings the rest, WAVE4 E's pin matrix):
 * loading with the ownership proof, Save version (its status, the cap and
 * the route's 409), Compare (the pure diff to the live list), Restore
 * (confirmed, flushed first, re-hydrated after, its notes), Delete
 * (confirmed; the 409 for a version a game uses), the fork's upstream —
 * and Y10's "Played 3 · 2–1" per version and Save version's "No card
 * changes since vN" when the screen's list hashes like the newest version.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorEntry } from "@/lib/decks/editor-state";
import type { ForkCredit } from "@/lib/decks/fork-credit";
import { playableListHash } from "@/lib/decks/list-hash";
import { setDeckToken } from "@/lib/decks/token-store";
import { COMMANDER } from "@/lib/games/mtg/formats";

import { HistoryDialog } from "./history-dialog";

const DECK = "33333333-3333-4333-8333-333333333333";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const commander = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
const main = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;

type Record3 = { games: number; win: number; loss: number; draw: number };
const version = (
  n: number,
  kind: "saved" | "played",
  note: string | null,
  record: Record3 | null = null,
) => ({
  version: n,
  note,
  kind,
  createdAt: "2026-10-10T20:00:00.000Z",
  cardCount: 100,
  record,
});

/** The screen's list. */
const LIVE: EditorEntry[] = [
  { cardId: U(1), zone: commander, qty: 1, tags: [] },
  { cardId: U(2), zone: main, qty: 1, tags: ["Ramp"], printingId: U(92) },
  { cardId: U(3), zone: main, qty: 2, tags: [] },
];
const frozen = (entries: EditorEntry[]) =>
  entries.map((e) => ({
    cardId: e.cardId,
    zone: e.zone,
    qty: e.qty,
    tags: e.tags,
    printingId: e.printingId ?? null,
  }));
const NAMES = { [U(1)]: "Atraxa, Praetors' Voice", [U(2)]: "Sol Ring", [U(3)]: "Forest" };

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${String(url)}`,
  );

let versionsBody: Record<string, unknown>;
/** Per-route answers; the versions GET answers `versionsBody` (tests change it between calls). */
let routes: Record<string, () => ReturnType<typeof reply>>;
beforeEach(() => {
  window.localStorage.clear();
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (routes[key]) return routes[key]();
    if (key === `GET /api/decks/${DECK}/versions`) return reply(200, versionsBody);
    return reply(404, { error: "unexpected" });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setVersions(versions: ReturnType<typeof version>[], latestListHash: string | null = null) {
  versionsBody = {
    versions,
    currentVersion: versions[0]?.version ?? 0,
    cap: 50,
    playedAllowance: 100,
    latestListHash,
  };
}

function renderHistory({
  versions = [] as ReturnType<typeof version>[],
  latestListHash = null as string | null,
  entries = LIVE,
  forkedFrom = null as ForkCredit | null,
} = {}) {
  setVersions(versions, latestListHash);
  const onBeforeRestore = vi.fn(async () => {});
  const onRestored = vi.fn(async () => {});
  const order: string[] = [];
  onBeforeRestore.mockImplementation(async () => {
    order.push("flush");
  });
  render(
    <HistoryDialog
      deckId={DECK}
      format={COMMANDER}
      entries={entries}
      cards={new Map()}
      forkedFrom={forkedFrom}
      onBeforeRestore={onBeforeRestore}
      onRestored={onRestored}
      onClose={() => {}}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Deck history" });
  return { dialog, onBeforeRestore, onRestored, order };
}
const rows = (dialog: HTMLElement) => within(dialog).getAllByRole("listitem");
const loaded = (dialog: HTMLElement, text: string) =>
  waitFor(() => expect(dialog.textContent).toContain(text));

describe("HistoryDialog — loading", () => {
  it("lists the versions newest first with note, number, date and cards — no-store, the edit key when this browser holds one", async () => {
    setDeckToken(DECK, "token-1");
    const { dialog } = renderHistory({
      versions: [version(2, "saved", "post-FNM"), version(1, "saved", null)],
    });
    await loaded(dialog, "post-FNM");
    const [first, second] = rows(dialog);
    expect(first.textContent).toContain("post-FNM");
    expect(first.textContent).toContain("v2 ·");
    expect(first.textContent).toContain("100 cards");
    // An unnamed version reads by its number.
    expect(second.textContent).toContain("Version 1");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.cache).toBe("no-store");
    expect(init.headers["x-deck-token"]).toBe("token-1");
  });

  it("no versions yet says what one is for", async () => {
    const { dialog } = renderHistory();
    await loaded(dialog, "No versions yet. Save one to mark a milestone");
  });

  it("a failed load says so", async () => {
    routes[`GET /api/decks/${DECK}/versions`] = () => reply(500, {});
    const { dialog } = renderHistory();
    await loaded(dialog, "Couldn't load versions (500).");
  });
});

describe("HistoryDialog — Save version", () => {
  it("posts the trimmed note, says what it saved, clears the note and reloads", async () => {
    routes[`POST /api/decks/${DECK}/versions`] = () => {
      setVersions([version(2, "saved", "post-FNM"), version(1, "saved", null)]);
      return reply(201, { version: 2, cardCount: 100, cap: 50 });
    };
    const { dialog } = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(dialog, "1 / 50");
    const note = within(dialog).getByRole("textbox", { name: "Version note" });
    fireEvent.change(note, { target: { value: "  post-FNM  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save version" }));
    await loaded(dialog, "Saved version 2 (100 cards).");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(post[1].body)).toEqual({ note: "post-FNM" });
    expect((note as HTMLInputElement).value).toBe("");
    await loaded(dialog, "2 / 50");
  });

  it("the route's 409 is said in its own words", async () => {
    routes[`POST /api/decks/${DECK}/versions`] = () =>
      reply(409, {
        error: "This deck already has 50 versions — delete an old one to save another.",
      });
    const { dialog } = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(dialog, "1 / 50");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save version" }));
    await loaded(dialog, "This deck already has 50 versions — delete an old one to save another.");
  });
});

describe("HistoryDialog — Compare, Restore, Delete", () => {
  it("Compare diffs the version to the live list, by name, and presses its button", async () => {
    routes[`GET /api/decks/${DECK}/versions/1`] = () =>
      reply(200, {
        ...version(1, "saved", "first build"),
        cards: frozen([LIVE[0], { ...LIVE[2], qty: 1 }]),
        names: NAMES,
      });
    const { dialog } = renderHistory({ versions: [version(1, "saved", "first build")] });
    await loaded(dialog, "first build");
    const compare = within(dialog).getByRole("button", { name: "Compare" });
    fireEvent.click(compare);
    await loaded(dialog, "first build → now");
    expect(dialog.textContent).toContain("+1 · 1 qty");
    expect(dialog.textContent).toContain("Sol Ring");
    expect(compare.getAttribute("aria-pressed")).toBe("true");
  });

  it("Compare against the same cards says so — tags and printings aren't compared", async () => {
    routes[`GET /api/decks/${DECK}/versions/1`] = () =>
      reply(200, {
        ...version(1, "saved", null),
        cards: frozen(LIVE.map((e) => ({ ...e, tags: ["Other"], printingId: undefined }))),
        names: NAMES,
      });
    const { dialog } = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(dialog, "Version 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Compare" }));
    await loaded(
      dialog,
      "No card changes since this version (tags and printings aren't compared).",
    );
  });

  it("Restore asks first; declined, nothing is sent", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { dialog, onBeforeRestore } = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(dialog, "Version 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "Restore “Version 1”? The current list is saved as a new version first, so this can be undone.",
    );
    expect(onBeforeRestore).not.toHaveBeenCalled();
    expect(calls().filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("Restore flushes first, posts, says what happened, reloads and re-hydrates the editor", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { dialog, onBeforeRestore, onRestored, order } = renderHistory({
      versions: [version(1, "saved", null)],
    });
    routes[`POST /api/decks/${DECK}/versions/1/restore`] = () => {
      order.push("post");
      return reply(200, {
        restoredVersion: 1,
        safetyVersion: 2,
        count: 99,
        printingsReset: 2,
        cardsDropped: 1,
      });
    };
    await loaded(dialog, "Version 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(onBeforeRestore).toHaveBeenCalled();
    expect(order).toEqual(["flush", "post"]);
    expect(dialog.textContent).toContain(
      "Restored version 1; the previous list is version 2. 2 chosen printings no longer exist and fell back to the default printing. 1 card no longer exists in the card database and could not be restored.",
    );
    expect(calls().filter((c) => c === `GET /api/decks/${DECK}/versions`)).toHaveLength(2);
  });

  it("a restore the route refuses (422) is said in its words, and nothing re-hydrates", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    routes[`POST /api/decks/${DECK}/versions/1/restore`] = () =>
      reply(422, { error: "That version no longer makes a valid list." });
    const { dialog, onRestored } = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(dialog, "Version 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await loaded(dialog, "That version no longer makes a valid list.");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("Delete asks first, then deletes and says so", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    routes[`DELETE /api/decks/${DECK}/versions/2`] = () => {
      setVersions([version(1, "saved", null)]);
      return reply(204, null);
    };
    const { dialog } = renderHistory({
      versions: [version(2, "saved", "old"), version(1, "saved", null)],
    });
    await loaded(dialog, "old");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete version 2" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete “old”? This can't be undone.");
    await loaded(dialog, "Deleted version 2.");
    await waitFor(() => expect(rows(dialog)).toHaveLength(1));
  });

  it("a version a logged game uses: the route's 409 is said, and it stays", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    routes[`DELETE /api/decks/${DECK}/versions/2`] = () =>
      reply(409, {
        error: "A logged game was played with this list, so it stays while the game does.",
      });
    const { dialog } = renderHistory({ versions: [version(2, "saved", "old")] });
    await loaded(dialog, "old");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete version 2" }));
    await loaded(
      dialog,
      "A logged game was played with this list, so it stays while the game does.",
    );
    expect(rows(dialog)).toHaveLength(1);
  });
});

describe("HistoryDialog — a fork's upstream", () => {
  it("the credit line, their changes since you forked and yours", async () => {
    routes[`GET /api/decks/${DECK}/upstream`] = () =>
      reply(200, {
        credit: { state: "linked", publicId: "abcdefgh2345", name: "Atraxa Superfriends" },
        baseline: frozen([LIVE[0], LIVE[1]]),
        baselineNote: null,
        upstream: frozen([LIVE[0]]),
        names: NAMES,
      });
    const { dialog } = renderHistory({
      versions: [version(1, "saved", "Forked")],
      forkedFrom: { state: "linked", publicId: "abcdefgh2345", name: "Atraxa Superfriends" },
    });
    await loaded(dialog, "Their changes since you forked");
    expect(within(dialog).getByRole("link", { name: "Atraxa Superfriends" })).toBeTruthy();
    // Theirs: Sol Ring cut. Yours: two Forests added.
    expect(dialog.textContent).toContain("-1");
    expect(dialog.textContent).toContain("+2");
  });
});

describe("HistoryDialog — played snapshots (Y9a)", () => {
  it("the count is saved versions only; a played list has Compare and Restore but no Delete", async () => {
    const { dialog } = renderHistory({
      versions: [
        version(3, "played", "Played Oct 10, 2026"),
        version(2, "saved", "post-FNM"),
        version(1, "played", "Played Oct 9, 2026"),
      ],
    });
    await loaded(dialog, "1 / 50");
    const items = rows(dialog);
    expect(items).toHaveLength(3);
    expect(within(items[0]).queryByRole("button", { name: "Delete version 3" })).toBeNull();
    expect(within(items[0]).getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(within(items[1]).getByRole("button", { name: "Delete version 2" })).toBeTruthy();
  });

  it("49 saved and 60 played: Save version and Restore stay open", async () => {
    const { dialog } = renderHistory({
      versions: [
        ...Array.from({ length: 60 }, (_, i) => version(200 - i, "played", "Played")),
        ...Array.from({ length: 49 }, (_, i) => version(49 - i, "saved", null)),
      ],
    });
    await loaded(dialog, "49 / 50");
    expect(within(dialog).getByRole("button", { name: "Save version" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(dialog.textContent).not.toContain("version limit");
    expect(
      within(dialog)
        .getAllByRole("button", { name: "Restore" })
        .every((b) => !(b as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it("50 saved still closes Save version and Restore — played lists never added to it", async () => {
    const { dialog } = renderHistory({
      versions: [
        version(60, "played", "Played"),
        ...Array.from({ length: 50 }, (_, i) => version(50 - i, "saved", null)),
      ],
    });
    await loaded(dialog, "50 / 50");
    expect(dialog.textContent).toContain("This deck has reached the 50-version limit.");
  });
});

describe("HistoryDialog — results (Y10)", () => {
  it("each version a game was played with says 'Played 3 · 2–1' — saved and played alike; the others say nothing", async () => {
    const { dialog } = renderHistory({
      versions: [
        version(4, "played", "Played Oct 10, 2026", { games: 3, win: 2, loss: 1, draw: 0 }),
        version(3, "saved", "post-FNM", { games: 4, win: 2, loss: 1, draw: 1 }),
        version(2, "saved", "unplayed"),
      ],
    });
    await loaded(dialog, "unplayed");
    const played = rows(dialog).map(
      (li) => li.querySelector("[data-slot=history-played]")?.textContent ?? null,
    );
    expect(played).toEqual(["Played 3 · 2–1", "Played 4 · 2–1–1", null]);
    // The notation is hidden from a screen reader, which hears the words.
    expect(
      rows(dialog)[0].querySelector("[data-slot=history-played]")!.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(rows(dialog)[0].textContent).toContain("Played 3: 2 wins, 1 loss");
  });

  it("Save version says 'No card changes since vN' when the screen hashes like the newest version — and still saves", async () => {
    const { dialog } = renderHistory({
      versions: [version(3, "played", "Played"), version(2, "saved", null)],
      latestListHash: playableListHash(LIVE),
    });
    await loaded(dialog, "No card changes since v3 (tags and printings aren't compared).");
    expect(within(dialog).getByRole("button", { name: "Save version" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("a tag or printing change on screen keeps the line (the hash doesn't see them); a card change drops it", async () => {
    const retagged = LIVE.map((e) => ({ ...e, tags: ["New"], printingId: U(77) }));
    const first = renderHistory({
      versions: [version(3, "saved", null)],
      latestListHash: playableListHash(LIVE),
      entries: retagged,
    });
    await loaded(first.dialog, "No card changes since v3");
    cleanup();
    const changed = renderHistory({
      versions: [version(3, "saved", null)],
      latestListHash: playableListHash(LIVE),
      entries: [...LIVE.slice(0, 2), { ...LIVE[2], qty: 3 }],
    });
    await loaded(changed.dialog, "Version 3");
    expect(changed.dialog.querySelector("[data-slot=history-unchanged]")).toBeNull();
  });

  it("no versions, or no hash sent: no line", async () => {
    const none = renderHistory({ latestListHash: playableListHash(LIVE) });
    await loaded(none.dialog, "No versions yet.");
    expect(none.dialog.querySelector("[data-slot=history-unchanged]")).toBeNull();
    cleanup();
    const unhashed = renderHistory({ versions: [version(1, "saved", null)] });
    await loaded(unhashed.dialog, "Version 1");
    expect(unhashed.dialog.querySelector("[data-slot=history-unchanged]")).toBeNull();
  });
});

/**
 * Y9a — the Games dialog on its own (WAVE4 D10): "Log a game" at the top;
 * Won / Lost / Draw logs at once, after the editor's flush (a failed save
 * logs nothing and says so); the players remembered per browser and game;
 * the details folded; One Piece's 1v1 with went first / second and no
 * table level; the played allowance disclosed; a guest deck — and a
 * signed-out owner — read "Sign in to keep a game journal" with ?next=.
 *
 * Y9b: the opponents' leaders through X2's suggest box (picked rows become
 * chips and log as external keys; at most pod − 1; partners as one entry
 * of two, the second box over every card; One Piece's one leader), typed
 * text never picked stopping the log, and `returnPath` for the sign-in.
 *
 * Y10: the record (fixture numbers: W–L–D, by players with the baseline,
 * by list with its diff line, a percentage only from 10 games, "Too few
 * games to compare" below 5, the games with no list kept), the recent
 * games naming their opponents, and editing one — what the edit shows is
 * what it saves.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import type { GameWire, GamesList, LogResult } from "@/lib/journal/games";
import type { SuggestRow } from "@/lib/search/suggest";

import { fitsSegmented, GamesDialog } from "./games-dialog";

const DECK = "33333333-3333-4333-8333-333333333333";
const mtg = getAdapter("mtg");
const optcg = getAdapter("optcg");

const game = (over: Partial<GameWire> = {}): GameWire => ({
  id: 41,
  version: 7,
  playedOn: "2026-10-09",
  podSize: 4,
  result: "win",
  endTurn: null,
  tableLevel: null,
  seat: 1,
  opponents: null,
  notes: null,
  createdAt: "2026-10-09T20:00:00.000Z",
  ...over,
});
const list = (over: Partial<GamesList> = {}): GamesList => ({
  games: [],
  total: 0,
  playedSnapshots: 0,
  playedAllowance: 100,
  record: [],
  lists: [],
  names: {},
  ...over,
});
const logged = (over: Partial<LogResult> = {}): LogResult => ({
  game: game({ id: 42, result: "win" }),
  version: 8,
  minted: true,
  capped: false,
  first: false,
  ...over,
});

/** A suggest row — the fields the box reads; `externalKey` is what a game stores. */
const suggestRow = (name: string, externalKey: string, over: Partial<SuggestRow> = {}) => ({
  id: `id-${externalKey}`,
  name,
  slug: externalKey,
  isLeader: true,
  typeLine: "Legendary Creature",
  colorsMask: 0,
  ciMask: 0,
  externalKey,
  image: null,
  ...over,
});
const ATRAXA = suggestRow("Atraxa, Praetors' Voice", "d0d33d52-3d28-4635-b985-51e126289259");
const KARLACH = suggestRow("Karlach, Fury of Avernus", "5b7c7a5e-8f3b-4b1e-9c1f-2f8a1c3d4e5f");
const GIANTS = suggestRow("Raised by Giants", "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", {
  isLeader: false,
  slug: null,
});
const ENEL = suggestRow("Enel", "OP15-058");
/** The suggest stub's answers: by scope, filtered by the typed text. */
const SUGGEST: Record<string, SuggestRow[]> = {
  "mtg:leaders": [ATRAXA, KARLACH],
  "mtg:cards": [ATRAXA, KARLACH, GIANTS],
  "optcg:leaders": [ENEL],
};
const suggestCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.startsWith("/api/cards/suggest"))
    .map((url) => Object.fromEntries(new URL(url, "http://x").searchParams));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const postBody = (i = 0) => JSON.parse(posts()[i][1].body as string);

let getAnswer: ReturnType<typeof reply>;
let patchAnswer: ReturnType<typeof reply>;
let deleteAnswer: ReturnType<typeof reply>;
beforeEach(() => {
  window.localStorage.clear();
  getAnswer = reply(200, list());
  patchAnswer = reply(200, { game: game() });
  deleteAnswer = reply(200, { deleted: true, snapshotRemoved: false });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === "POST" ? reply(201, logged()) : getAnswer,
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog({
  adapter = mtg,
  accountDeck = true,
  phone = false,
  flushOk = true,
  returnPath,
}: {
  adapter?: typeof mtg;
  accountDeck?: boolean;
  phone?: boolean;
  flushOk?: boolean;
  returnPath?: string;
} = {}) {
  const order: string[] = [];
  const onBeforeLog = vi.fn(async () => {
    order.push("flush");
    return flushOk;
  });
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      order.push("post");
      return reply(201, logged());
    }
    if (init?.method === "PATCH") return patchAnswer;
    if (init?.method === "DELETE") return deleteAnswer;
    if (url.startsWith("/api/cards/suggest")) {
      const params = new URL(url, "http://x").searchParams;
      const q = params.get("q") ?? "";
      const rows = SUGGEST[`${params.get("game")}:${params.get("scope")}`] ?? [];
      return reply(200, { q, results: rows.filter((r) => r.name.toLowerCase().includes(q)) });
    }
    return getAnswer;
  });
  const onLogged = vi.fn();
  render(
    <GamesDialog
      deckId={DECK}
      adapter={adapter}
      accountDeck={accountDeck}
      phone={phone}
      returnPath={returnPath}
      onBeforeLog={onBeforeLog}
      onLogged={onLogged}
      onClose={() => {}}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Games" });
  return { dialog, onBeforeLog, onLogged, order };
}
const button = (dialog: HTMLElement, name: string) => within(dialog).getByRole("button", { name });

describe("GamesDialog — logging", () => {
  it("'Log a game' at the top; Won flushes first, then logs at once with the players", async () => {
    const { dialog, onLogged, order } = renderDialog();
    const headings = within(dialog).getAllByRole("heading", { level: 3 });
    expect(headings[0].textContent).toBe("Log a game");
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(onLogged).toHaveBeenCalledWith(logged()));
    expect(order).toEqual(["flush", "post"]);
    const [url] = posts()[0];
    expect(url).toBe(`/api/decks/${DECK}/games`);
    expect(postBody()).toEqual({ result: "win", podSize: 4, playedOn: expect.any(String) });
    expect(postBody().playedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Lost and Draw log their own results", async () => {
    const { dialog, onLogged } = renderDialog();
    fireEvent.click(button(dialog, "Lost"));
    await waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1));
    fireEvent.click(button(dialog, "Draw"));
    await waitFor(() => expect(onLogged).toHaveBeenCalledTimes(2));
    expect([postBody(0).result, postBody(1).result]).toEqual(["loss", "draw"]);
  });

  it("a save that fails logs nothing, and says so — the snapshot must equal the screen", async () => {
    const { dialog, onLogged } = renderDialog({ flushOk: false });
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        "Your latest changes didn't save, so the game wasn't logged. Try again.",
      ),
    );
    expect(posts()).toHaveLength(0);
    expect(onLogged).not.toHaveBeenCalled();
  });

  it("a refused log stays open with the route's words; the editor isn't told", async () => {
    const { dialog, onLogged } = renderDialog();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? reply(500, {}) : getAnswer,
    );
    fireEvent.click(button(dialog, "Draw"));
    await waitFor(() =>
      expect(dialog.textContent).toContain("Couldn't log the game (500). Try again."),
    );
    expect(onLogged).not.toHaveBeenCalled();
  });

  it("the players are remembered per browser and game; a seat past the new size is cleared", async () => {
    const { dialog } = renderDialog();
    const players = within(dialog).getByRole("group", { name: "Players" });
    expect(
      within(players)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
    fireEvent.click(within(dialog).getByText("More details"));
    const seat = await within(dialog).findByRole("group", { name: "Seat" });
    fireEvent.click(within(seat).getByRole("button", { name: "4th" }));
    fireEvent.click(within(players).getByRole("button", { name: "3" }));
    expect(window.localStorage.getItem("deckwarden:journal-pod:mtg")).toBe("3");
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody()).not.toHaveProperty("seat");
    expect(postBody().podSize).toBe(3);
    cleanup();

    const again = renderDialog();
    const pressed = within(within(again.dialog).getByRole("group", { name: "Players" }))
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed?.textContent).toBe("3");
  });

  it("the details stay folded; picked ones ride along, the table's level only when picked", async () => {
    const { dialog } = renderDialog();
    expect(within(dialog).queryByRole("group", { name: "Bracket" })).toBeNull();
    fireEvent.click(within(dialog).getByText("More details"));
    const bracket = await within(dialog).findByRole("group", { name: "Bracket" });
    const pressed = within(bracket)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed.map((b) => b.textContent)).toEqual(["Not set"]);
    fireEvent.click(within(bracket).getByRole("button", { name: "3" }));
    fireEvent.change(within(dialog).getByLabelText("Turn it ended"), { target: { value: "9" } });
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2026-10-08" } });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: " close one " } });
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Seat" })).getByText("2nd"));
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody()).toEqual({
      result: "win",
      podSize: 4,
      playedOn: "2026-10-08",
      endTurn: 9,
      tableLevel: 3,
      seat: 2,
      notes: "close one",
    });
  });

  it("seats at six or more players are a select (a Segmented would overflow a phone)", async () => {
    window.localStorage.setItem("deckwarden:journal-pod:mtg", "6");
    const { dialog } = renderDialog();
    fireEvent.click(within(dialog).getByText("More details"));
    const select = await within(dialog).findByRole("combobox", { name: "Seat" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["1st", "2nd", "3rd", "4th", "5th", "6th", "Not set"]);
  });
});

describe("GamesDialog — choices that fit a phone", () => {
  const opts = (labels: string[]) => labels.map((label) => ({ label }));
  it("eight short labels (8 × 44 px = 352 px) are a Segmented, nine are not; with a long one, six", () => {
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    expect(fitsSegmented(opts(digits.slice(0, 8)))).toBe(true);
    expect(fitsSegmented(opts(digits))).toBe(false);
    expect(fitsSegmented(opts([...digits.slice(0, 5), "Not set"]))).toBe(true);
    expect(fitsSegmented(opts([...digits.slice(0, 6), "Not set"]))).toBe(false);
  });

  it("a turn outside 1–99 is said here and logs nothing", async () => {
    const { dialog, onBeforeLog } = renderDialog();
    fireEvent.click(within(dialog).getByText("More details"));
    for (const value of ["0", "100", "2.5"]) {
      fireEvent.change(await within(dialog).findByLabelText("Turn it ended"), {
        target: { value },
      });
      fireEvent.click(button(dialog, "Won"));
      await waitFor(() =>
        expect(dialog.textContent).toContain("The turn it ended is a whole number from 1 to 99."),
      );
    }
    expect(onBeforeLog).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });
});

describe("GamesDialog — One Piece", () => {
  it("1v1: no players choice, no table level; the seat is went first / went second", async () => {
    const { dialog } = renderDialog({ adapter: optcg as typeof mtg });
    expect(within(dialog).queryByRole("group", { name: "Players" })).toBeNull();
    fireEvent.click(within(dialog).getByText("More details"));
    const seat = await within(dialog).findByRole("group", { name: "Seat" });
    expect(
      within(seat)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Went first", "Went second", "Not set"]);
    expect(within(dialog).queryByRole("group", { name: "Bracket" })).toBeNull();
    fireEvent.click(within(seat).getByRole("button", { name: "Went second" }));
    fireEvent.click(button(dialog, "Lost"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody()).toEqual({
      result: "loss",
      podSize: 2,
      playedOn: expect.any(String),
      seat: 2,
    });
  });
});

describe("GamesDialog — the journal around the log", () => {
  it("discloses the played allowance, and says so at it", async () => {
    const { dialog } = renderDialog();
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        "History keeps up to 100 played lists per deck; they never count against your saved versions.",
      ),
    );
    cleanup();
    getAnswer = reply(200, list({ playedSnapshots: 100 }));
    const full = renderDialog();
    await waitFor(() =>
      expect(full.dialog.textContent).toContain(
        "This deck keeps 100 played lists, the most it can. A game on a list it hasn't kept yet logs without one.",
      ),
    );
  });

  it("the recent games, newest first, in plain words", async () => {
    getAnswer = reply(
      200,
      list({
        total: 2,
        games: [
          game(),
          game({ id: 40, playedOn: "2026-10-02", result: "loss", seat: null, version: null }),
        ],
      }),
    );
    const { dialog } = renderDialog();
    const recent = await waitFor(() => {
      const ul = dialog.querySelector("[data-slot=games-recent]");
      expect(ul).not.toBeNull();
      return ul as HTMLElement;
    });
    expect(
      [...recent.querySelectorAll("[data-slot=game-line]")].map((line) => line.textContent),
    ).toEqual(["Oct 9 · Won, 4 players, went 1st, v7", "Oct 2 · Lost, 4 players, no list kept"]);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/decks/${DECK}/games`);
  });

  it("no games yet says so", async () => {
    const { dialog } = renderDialog();
    await waitFor(() => expect(dialog.textContent).toContain("No games logged yet."));
  });

  it("a guest deck reads the sign-in sentence with ?next= — and asks nothing", () => {
    const { dialog } = renderDialog({ accountDeck: false });
    const link = within(dialog).getByRole("link", { name: "Sign in to keep a game journal" });
    expect(link.getAttribute("href")).toBe(
      `/account?next=${encodeURIComponent(`/decks/${DECK}/edit`)}`,
    );
    expect(within(dialog).queryByRole("button", { name: "Won" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returnPath sends the sign-in back to the door's page (Y9b: the share page)", () => {
    const { dialog } = renderDialog({ accountDeck: false, returnPath: "/d/krenko123abc" });
    expect(
      within(dialog)
        .getByRole("link", { name: "Sign in to keep a game journal" })
        .getAttribute("href"),
    ).toBe(`/account?next=${encodeURIComponent("/d/krenko123abc")}`);
  });

  it("a signed-out owner (a 401) reads the same sentence", async () => {
    getAnswer = reply(401, { error: "Sign in to keep a game journal" });
    const { dialog } = renderDialog();
    await within(dialog).findByRole("link", { name: "Sign in to keep a game journal" });
  });

  it("on a phone it is the bottom Drawer, with the same log", async () => {
    const { dialog, onLogged } = renderDialog({ phone: true });
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
  });
});

/** Type into a suggest box (a real input event — Base UI ignores a change without inputType). */
function typeInto(input: HTMLElement, value: string) {
  fireEvent.input(input, { target: { value }, inputType: "insertText" });
}
/** Type, wait out the debounce and the answer, and pick the named row. */
async function pick(dialog: HTMLElement, box: string, text: string, row: string) {
  typeInto(within(dialog).getByRole("combobox", { name: box }), text);
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(row) }));
}
async function openDetails(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByText("More details"));
  return within(dialog).findByRole("group", { name: /^Opponent/ });
}
const chips = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll("[data-slot=opponent-chip]")].map((c) => c.textContent);

describe("GamesDialog — opponents (Y9b)", () => {
  it("a picked commander is a chip and logs as its oracle id; the next box asks for the next opponent, empty", async () => {
    const { dialog } = renderDialog();
    const field = await openDetails(dialog);
    expect(field.tagName).toBe("FIELDSET");
    expect(within(field).getByText("Opponents' commanders")).toBeTruthy();
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    expect(suggestCalls().at(-1)).toEqual({ game: "mtg", scope: "leaders", q: "atr" });
    expect(chips(dialog)).toEqual(["Atraxa, Praetors' Voice"]);
    // Base UI fills the picked name in after the pick: it must not land in the next box.
    const next = within(dialog).getByRole("combobox", { name: "Opponent 2's commander" });
    expect((next as HTMLInputElement).value).toBe("");
    fireEvent.click(button(dialog, "Lost"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody().opponents).toEqual([[ATRAXA.externalKey]]);
  });

  it("partners are one entry of two — the second box asks every card, so a Background is there", async () => {
    const { dialog } = renderDialog();
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "karl", "Karlach");
    fireEvent.click(button(dialog, "Add a second commander"));
    const second = within(dialog).getByRole("combobox", { name: "Opponent 1's second commander" });
    expect(document.activeElement).toBe(second);
    await pick(dialog, "Opponent 1's second commander", "raised", "Raised by Giants");
    expect(suggestCalls().at(-1)).toEqual({ game: "mtg", scope: "cards", q: "raised" });
    expect(chips(dialog)).toEqual(["Karlach, Fury of Avernus", "Raised by Giants"]);
    // Two leaders: no third, and the second box closed with its pick.
    expect(within(dialog).queryByRole("button", { name: "Add a second commander" })).toBeNull();
    expect(
      within(dialog).queryByRole("combobox", { name: "Opponent 1's second commander" }),
    ).toBeNull();
    await pick(dialog, "Opponent 2's commander", "atr", "Atraxa");
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody().opponents).toEqual([
      [KARLACH.externalKey, GIANTS.externalKey],
      [ATRAXA.externalKey],
    ]);
  });

  it("at most pod − 1: a 3-player table takes two opponents and no box after; a smaller table drops the last", async () => {
    window.localStorage.setItem("deckwarden:journal-pod:mtg", "3");
    const { dialog } = renderDialog();
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    await pick(dialog, "Opponent 2's commander", "karl", "Karlach");
    expect(within(dialog).queryByRole("combobox", { name: /^Opponent 3/ })).toBeNull();
    fireEvent.click(
      within(within(dialog).getByRole("group", { name: "Players" })).getByRole("button", {
        name: "2",
      }),
    );
    expect(chips(dialog)).toEqual(["Atraxa, Praetors' Voice"]);
    expect(within(dialog).getByText("Opponent's commander")).toBeTruthy();
    fireEvent.click(button(dialog, "Draw"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody()).toMatchObject({ podSize: 2, opponents: [[ATRAXA.externalKey]] });
  });

  it("removing a leader takes it off; removing the last takes the opponent, and nothing is sent", async () => {
    const { dialog } = renderDialog();
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    fireEvent.click(button(dialog, "Remove Atraxa, Praetors' Voice"));
    expect(chips(dialog)).toEqual([]);
    expect(within(dialog).getByRole("combobox", { name: "Opponent 1's commander" })).toBeTruthy();
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody()).not.toHaveProperty("opponents");
  });

  it("the same card picked again as the pair is not a second leader", async () => {
    const { dialog } = renderDialog();
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    fireEvent.click(button(dialog, "Add a second commander"));
    await pick(dialog, "Opponent 1's second commander", "atr", "Atraxa");
    expect(chips(dialog)).toEqual(["Atraxa, Praetors' Voice"]);
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody().opponents).toEqual([[ATRAXA.externalKey]]);
  });

  it("an open second box follows its opponent up when an earlier one is removed", async () => {
    const { dialog } = renderDialog();
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    await pick(dialog, "Opponent 2's commander", "karl", "Karlach");
    const adds = within(dialog).getAllByRole("button", { name: "Add a second commander" });
    fireEvent.click(adds[1]);
    typeInto(
      within(dialog).getByRole("combobox", { name: "Opponent 2's second commander" }),
      "rai",
    );
    fireEvent.click(button(dialog, "Remove Atraxa, Praetors' Voice"));
    const moved = within(dialog).getByRole("combobox", { name: "Opponent 1's second commander" });
    expect((moved as HTMLInputElement).value).toBe("rai");
    expect(chips(dialog)).toEqual(["Karlach, Fury of Avernus"]);
  });

  it("One Piece: one opponent, one leader, stored as the printed id — no second box", async () => {
    const { dialog } = renderDialog({ adapter: optcg as typeof mtg });
    await openDetails(dialog);
    expect(within(dialog).getByText("Opponent's leader")).toBeTruthy();
    await pick(dialog, "Opponent's leader", "ene", "Enel");
    expect(suggestCalls().at(-1)).toEqual({ game: "optcg", scope: "leaders", q: "ene" });
    // One Piece tells its 17 printed Enels apart by the id: the chip says which.
    expect(chips(dialog)).toEqual(["Enel (OP15-058)"]);
    expect(button(dialog, "Remove Enel (OP15-058)")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Add a second/ })).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: /Opponent/ })).toBeNull();
    fireEvent.click(button(dialog, "Lost"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postBody().opponents).toEqual([["OP15-058"]]);
  });

  it("a name typed but never picked stops the log, reopening the details to show it; a cleared box logs", async () => {
    const { dialog, onLogged } = renderDialog();
    await openDetails(dialog);
    typeInto(within(dialog).getByRole("combobox", { name: "Opponent 1's commander" }), "atr");
    // Fold the details: the text is kept, and the refusal unfolds them again.
    fireEvent.click(within(dialog).getByText("More details"));
    await waitFor(() =>
      expect(within(dialog).queryByRole("group", { name: /^Opponent/ })).toBeNull(),
    );
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() =>
      expect(dialog.textContent).toContain("Pick the commander from the list, or clear the box."),
    );
    const box = await within(dialog).findByRole("combobox", { name: "Opponent 1's commander" });
    expect((box as HTMLInputElement).value).toBe("atr");
    expect(posts()).toHaveLength(0);
    typeInto(box, "");
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    expect(postBody()).not.toHaveProperty("opponents");
  });

  it("on a phone the box works inside the bottom Drawer", async () => {
    const { dialog, onLogged } = renderDialog({ phone: true });
    await openDetails(dialog);
    await pick(dialog, "Opponent 1's commander", "atr", "Atraxa");
    expect(screen.getByRole("dialog", { name: "Games" })).toBe(dialog);
    fireEvent.click(button(dialog, "Won"));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    expect(postBody().opponents).toEqual([[ATRAXA.externalKey]]);
  });
});

/** An element's text as the eye reads it — the screen-reader-only words left out. */
function visible(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return clone.textContent ?? "";
}
const cell = (
  version: number | null,
  podSize: number,
  result: GameWire["result"],
  games: number,
) => ({
  version,
  podSize,
  result,
  games,
});
/** Thirteen games: v8 (7), v5 (3), two with no list kept, one on v2 — older than the lists described. */
const RECORD = [
  cell(8, 4, "win", 3),
  cell(8, 4, "loss", 3),
  cell(8, 3, "loss", 1),
  cell(5, 4, "win", 2),
  cell(5, 4, "loss", 1),
  cell(null, 4, "loss", 2),
  cell(2, 4, "win", 1),
];
const LISTS = [
  { version: 8, since: 5, change: "+2, -2" },
  { version: 5, since: 2, change: "+1, -1" },
];
async function record(dialog: HTMLElement) {
  return waitFor(() => {
    const section = dialog.querySelector("[data-slot=games-record]");
    expect(section).not.toBeNull();
    return section as HTMLElement;
  });
}

describe("GamesDialog — the record (Y10)", () => {
  it("the fixture's numbers: N games · W–L, by players with the baseline, by list with its diff line", async () => {
    getAnswer = reply(200, list({ total: 13, record: RECORD, lists: LISTS }));
    const { dialog } = renderDialog();
    const section = await record(dialog);
    const headings = within(dialog).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Log a game", "Record", "Recent games"]);
    // 13 games: a percentage (from 10).
    const line = section.querySelector("[data-slot=games-record-line]")!;
    expect(visible(line)).toBe("13 games · 6–7 · won 46%");
    expect(line.textContent).toContain("6 wins, 7 losses");
    expect(
      [...section.querySelectorAll("[data-slot=games-record-pods] li")].map((li) => li.textContent),
    ).toEqual([
      "3 players · won 0 of 1 · an even table wins 1 in 3",
      "4 players · won 6 of 12 · 50% · an even table wins 1 in 4",
    ]);
    const rows = [...section.querySelectorAll("[data-slot=games-record-lists] li")].map((li) =>
      [...li.children].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ["v8, since v5: +2, -2", "won 3 of 7"],
      ["v5, since v2: +1, -1", "won 2 of 3", "Too few games to compare"],
      ["No list kept", "won 0 of 2", "Too few games to compare"],
    ]);
    expect(section.textContent).toContain("and 1 earlier list");
  });

  it("a percentage only from 10 games — 9 games show the count alone", async () => {
    getAnswer = reply(
      200,
      list({
        total: 9,
        record: [cell(3, 4, "win", 5), cell(3, 4, "loss", 3), cell(3, 4, "draw", 1)],
        lists: [{ version: 3, since: null, change: null }],
      }),
    );
    const { dialog } = renderDialog();
    const section = await record(dialog);
    expect(visible(section.querySelector("[data-slot=games-record-line]")!)).toBe(
      "9 games · 5–3–1",
    );
    expect(section.textContent).not.toContain("%");
    // The first list played is its number alone; 9 games are enough to compare.
    expect(
      [...section.querySelectorAll("[data-slot=games-record-lists] li")].map(
        (li) => li.textContent,
      ),
    ).toEqual(["v3won 5 of 9"]);
  });

  it("One Piece is always 1v1: the baseline said once, no split by players", async () => {
    getAnswer = reply(
      200,
      list({
        total: 12,
        record: [cell(4, 2, "win", 7), cell(4, 2, "loss", 5)],
        lists: [{ version: 4, since: null, change: null }],
      }),
    );
    const { dialog } = renderDialog({ adapter: optcg });
    const section = await record(dialog);
    expect(visible(section.querySelector("[data-slot=games-record-line]")!)).toBe(
      "12 games · 7–5 · won 58%",
    );
    expect(section.textContent).toContain("An even table wins 1 in 2.");
    expect(section.querySelector("[data-slot=games-record-pods]")).toBeNull();
    expect(section.textContent).toContain("won 7 of 12 · 58%");
  });

  it("no games: no record", async () => {
    const { dialog } = renderDialog();
    await waitFor(() => expect(dialog.textContent).toContain("No games logged yet."));
    expect(dialog.querySelector("[data-slot=games-record]")).toBeNull();
  });
});

const KRAUM = suggestRow("Kraum, Ludevic's Opus", "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11");
const TYMNA = suggestRow("Tymna the Weaver", "6b3d0f1e-9a2c-4e7b-8d5f-1c2b3a4d5e6f");
const NAMES = {
  [ATRAXA.externalKey]: ATRAXA.name,
  [KRAUM.externalKey]: KRAUM.name,
  [TYMNA.externalKey]: TYMNA.name,
};
/** A game with everything filled in, as the GET returns it. */
const FULL = game({
  id: 41,
  version: 7,
  playedOn: "2026-10-09",
  podSize: 4,
  result: "win",
  endTurn: 9,
  tableLevel: 3,
  seat: 2,
  opponents: [[ATRAXA.externalKey], [KRAUM.externalKey, TYMNA.externalKey]],
  notes: "gg",
});
const patches = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH") as [string, RequestInit][];
const gets = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === `/api/decks/${DECK}/games` && (init?.method ?? "GET") === "GET",
  );
async function openEdit(dialog: HTMLElement, index = 0) {
  const recent = await waitFor(() => {
    const ul = dialog.querySelector("[data-slot=games-recent]");
    expect(ul).not.toBeNull();
    return ul as HTMLElement;
  });
  const edit = within(recent).getAllByRole("button", { name: "Edit" })[index];
  fireEvent.click(edit);
  return { edit, view: await within(dialog).findByRole("region", { name: /^Edit the game of/ }) };
}

describe("GamesDialog — the recent games, named and editable (Y10)", () => {
  it("each game names its opponents ('; ' between them, '+' in a pair); an unknown key shows as itself", async () => {
    getAnswer = reply(
      200,
      list({
        total: 2,
        games: [FULL, game({ id: 40, opponents: [["1111aaaa-2222-4333-8444-555566667777"]] })],
        names: NAMES,
      }),
    );
    const { dialog } = renderDialog();
    await waitFor(() => expect(dialog.querySelectorAll("[data-slot=game-vs]")).toHaveLength(2));
    expect([...dialog.querySelectorAll("[data-slot=game-vs]")].map((v) => v.textContent)).toEqual([
      "vs Atraxa, Praetors' Voice; Kraum, Ludevic's Opus + Tymna the Weaver",
      "vs 1111aaaa-2222-4333-8444-555566667777",
    ]);
    // The Edit button is described by its game's line.
    const edit = within(dialog).getAllByRole("button", { name: "Edit" })[0];
    expect(document.getElementById(edit.getAttribute("aria-describedby")!)!.textContent).toContain(
      "Oct 9 · Won, 4 players, went 2nd, v7",
    );
  });

  it("One Piece names the leader with its printed id, like the chip", async () => {
    getAnswer = reply(
      200,
      list({
        total: 1,
        games: [game({ podSize: 2, seat: 1, opponents: [["OP15-058"]] })],
        names: { "OP15-058": "Enel" },
      }),
    );
    const { dialog } = renderDialog({ adapter: optcg });
    await waitFor(() =>
      expect(dialog.querySelector("[data-slot=game-vs]")?.textContent).toBe("vs Enel (OP15-058)"),
    );
  });

  it("Edit shows the game as stored — what it shows is what it saves — and the list it was played with", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    expect(view.querySelector("h3")!.textContent).toBe("Edit the game of Oct 9");
    expect(document.activeElement).toBe(view.querySelector("h3"));
    expect(view.textContent).toContain("Played with v7. An edit never changes the list.");
    const pressed = (name: string) =>
      within(within(view).getByRole("group", { name })).getByRole("button", { pressed: true })
        .textContent;
    expect(pressed("Result")).toBe("Won");
    expect(pressed("Players")).toBe("4");
    expect(pressed("Bracket")).toBe("3");
    expect(pressed("Seat")).toBe("2nd");
    expect((view.querySelector("input[type=date]") as HTMLInputElement).value).toBe("2026-10-09");
    expect((view.querySelector("input[type=number]") as HTMLInputElement).value).toBe("9");
    expect((view.querySelector("textarea") as HTMLTextAreaElement).value).toBe("gg");
    expect(chips(view)).toEqual([ATRAXA.name, KRAUM.name, TYMNA.name]);
    // Saving it untouched sends nothing.
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(dialog.querySelector("[data-slot=game-edit]")).toBeNull());
    expect(patches()).toHaveLength(0);
    expect(gets()).toHaveLength(1);
  });

  it("Save sends only what changed; the list loads again, says so, and focus returns to its Edit", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const { dialog } = renderDialog();
    await openEdit(dialog);
    const view = dialog.querySelector("[data-slot=game-edit]") as HTMLElement;
    fireEvent.click(
      within(within(view).getByRole("group", { name: "Result" })).getByRole("button", {
        name: "Lost",
      }),
    );
    fireEvent.change(view.querySelector("input[type=number]")!, { target: { value: "11" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(dialog.textContent).toContain("Saved the changes to that game."));
    const [[url, init]] = patches();
    expect(url).toBe(`/api/decks/${DECK}/games/41`);
    expect(JSON.parse(init.body as string)).toEqual({ result: "loss", endTurn: 11 });
    await waitFor(() => expect(gets()).toHaveLength(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getAllByRole("button", { name: "Edit" })[0],
      ),
    );
  });

  it("clearing a detail sends null; removing every opponent clears them", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.change(view.querySelector("textarea")!, { target: { value: "  " } });
    fireEvent.click(
      within(within(view).getByRole("group", { name: "Bracket" })).getByRole("button", {
        name: "Not set",
      }),
    );
    for (const name of [ATRAXA.name, KRAUM.name, TYMNA.name]) {
      fireEvent.click(within(view).getByRole("button", { name: `Remove ${name}` }));
    }
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body as string)).toEqual({
      tableLevel: null,
      opponents: null,
      notes: null,
    });
  });

  it("a smaller table drops the seat past it and the opponents past pod − 1", async () => {
    getAnswer = reply(200, list({ total: 1, games: [{ ...FULL, seat: 3 }], names: NAMES }));
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.click(
      within(within(view).getByRole("group", { name: "Players" })).getByRole("button", {
        name: "2",
      }),
    );
    expect(chips(view)).toEqual([ATRAXA.name]);
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body as string)).toEqual({
      podSize: 2,
      seat: null,
      opponents: [[ATRAXA.externalKey]],
    });
  });

  it("a refused edit stays open with the route's words", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    patchAnswer = reply(400, { error: "Seat must be 1 to 4" });
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.change(view.querySelector("input[type=number]")!, { target: { value: "12" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(view.textContent).toContain("Seat must be 1 to 4"));
    expect(dialog.querySelector("[data-slot=game-edit]")).not.toBeNull();
    expect(gets()).toHaveLength(1);
  });

  it("a turn outside 1–99 is said in the edit and sends nothing", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.change(view.querySelector("input[type=number]")!, { target: { value: "0" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(view.textContent).toContain("The turn it ended is a whole number from 1 to 99."),
    );
    expect(patches()).toHaveLength(0);
  });

  it("Delete asks first; declined, nothing is sent; confirmed, the game goes and the list loads again", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.click(within(view).getByRole("button", { name: "Delete game" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete this game? It leaves the record, and this can't be undone.",
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    confirm.mockReturnValue(true);
    getAnswer = reply(200, list());
    fireEvent.click(within(view).getByRole("button", { name: "Delete game" }));
    await waitFor(() => expect(dialog.textContent).toContain("Deleted that game."));
    const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    expect(del[0]).toBe(`/api/decks/${DECK}/games/41`);
    await waitFor(() => expect(dialog.textContent).toContain("No games logged yet."));
    expect(document.activeElement?.id).toBe(`${DECK}-recent`);
    confirm.mockRestore();
  });

  it("Cancel goes back without a request", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    const { dialog } = renderDialog();
    const { view, edit } = await openEdit(dialog);
    fireEvent.change(view.querySelector("textarea")!, { target: { value: "changed" } });
    fireEvent.click(within(view).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog.querySelector("[data-slot=game-edit]")).toBeNull());
    expect(patches()).toHaveLength(0);
    expect(gets()).toHaveLength(1);
    await waitFor(() => expect(document.activeElement?.textContent).toBe(edit.textContent));
  });

  it("One Piece: no players in the edit; the seat is went first / went second", async () => {
    getAnswer = reply(
      200,
      list({
        total: 1,
        games: [game({ podSize: 2, seat: 1, opponents: [["OP15-058"]] })],
        names: { "OP15-058": "Enel" },
      }),
    );
    const { dialog } = renderDialog({ adapter: optcg });
    const { view } = await openEdit(dialog);
    expect(within(view).queryByRole("group", { name: "Players" })).toBeNull();
    expect(chips(view)).toEqual(["Enel (OP15-058)"]);
    fireEvent.click(
      within(within(view).getByRole("group", { name: "Seat" })).getByRole("button", {
        name: "Went second",
      }),
    );
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body as string)).toEqual({ seat: 2 });
  });

  it("a game logged with no list kept says the edit can't change that", async () => {
    getAnswer = reply(200, list({ total: 1, games: [game({ version: null })] }));
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    expect(view.textContent).toContain("Logged with no list kept. An edit never changes that.");
  });

  it("a 401 during an edit reads the sign-in sentence", async () => {
    getAnswer = reply(200, list({ total: 1, games: [FULL], names: NAMES }));
    patchAnswer = reply(401, { error: "Sign in to keep a game journal" });
    const { dialog } = renderDialog();
    const { view } = await openEdit(dialog);
    fireEvent.change(view.querySelector("textarea")!, { target: { value: "x" } });
    fireEvent.click(within(view).getByRole("button", { name: "Save changes" }));
    await within(dialog).findByRole("link", { name: "Sign in to keep a game journal" });
  });
});

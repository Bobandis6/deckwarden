/**
 * Y9a — the Games dialog on its own (WAVE4 D10): "Log a game" at the top;
 * Won / Lost / Draw logs at once, after the editor's flush (a failed save
 * logs nothing and says so); the players remembered per browser and game;
 * the details folded; One Piece's 1v1 with went first / second and no
 * table level; the played allowance disclosed; a guest deck — and a
 * signed-out owner — read "Sign in to keep a game journal" with ?next=.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import type { GameWire, GamesList, LogResult } from "@/lib/journal/games";

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
  ...over,
});
const logged = (over: Partial<LogResult> = {}): LogResult => ({
  game: game({ id: 42, result: "win" }),
  version: 8,
  minted: true,
  capped: false,
  ...over,
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const postBody = (i = 0) => JSON.parse(posts()[i][1].body as string);

let getAnswer: ReturnType<typeof reply>;
beforeEach(() => {
  window.localStorage.clear();
  getAnswer = reply(200, list());
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
}: {
  adapter?: typeof mtg;
  accountDeck?: boolean;
  phone?: boolean;
  flushOk?: boolean;
} = {}) {
  const order: string[] = [];
  const onBeforeLog = vi.fn(async () => {
    order.push("flush");
    return flushOk;
  });
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      order.push("post");
      return reply(201, logged());
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
        "This deck keeps 100 played lists — the most it can. A game on a list it hasn't kept yet logs without one.",
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
      within(recent)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Oct 9 · Won · 4 players · went 1st · v7",
      "Oct 2 · Lost · 4 players · no list kept",
    ]);
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

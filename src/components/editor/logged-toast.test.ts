/**
 * Y10 — the shared logged toast (logged-toast.ts): "Logged a win · Undo",
 * the capped line as its description when the game kept no list, and on a
 * deck's first game (the POST's `first`) the Warden's one restrained line —
 * once, never on a later game.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LogResult } from "@/lib/journal/games";

const added: Record<string, unknown>[] = [];
vi.mock("@/components/ui/toast", () => ({
  toast: {
    add: (options: Record<string, unknown>) => {
      added.push(options);
      return "toast-1";
    },
    close: () => {},
  },
}));

const { showLoggedToast } = await import("./logged-toast");

const logged = (over: Partial<LogResult> = {}): LogResult => ({
  game: {
    id: 42,
    version: 8,
    playedOn: "2026-10-10",
    podSize: 4,
    result: "win",
    endTurn: null,
    tableLevel: null,
    seat: null,
    opponents: null,
    notes: null,
    createdAt: "2026-10-10T20:00:00.000Z",
  },
  version: 8,
  minted: true,
  capped: false,
  first: false,
  ...over,
});

beforeEach(() => {
  added.length = 0;
});

describe("showLoggedToast", () => {
  it("a later game: 'Logged a win' with Undo, and no description", () => {
    showLoggedToast("deck-1", logged());
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ title: "Logged a win", type: "success" });
    expect(added[0]).not.toHaveProperty("description");
    expect((added[0].actionProps as { children: string }).children).toBe("Undo");
  });

  it("the deck's first game carries the Warden's one line", () => {
    showLoggedToast("deck-1", logged({ first: true }));
    expect(added[0].description).toBe("The Warden keeps this deck's record from here.");
  });

  it("a game logged with no list kept says so (it is never a first game)", () => {
    showLoggedToast("deck-1", logged({ version: null, minted: false, capped: true }));
    expect(added[0].description).toBe(
      "This deck already keeps 100 played lists, so this game keeps no list of its own.",
    );
  });
});

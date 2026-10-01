/**
 * useFirstApproval (Y2b, WAVE4 D2): "Share this deck" is offered at the
 * first false → true approval, never on a mount at zero or a load, lands
 * on a deck row (a draft waits for its row), and is offered once per deck
 * per browser — a fresh mount (a reload) never offers it again.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SHARE_OFFERS_KEY } from "@/lib/decks/share-offers";

import { useFirstApproval } from "./use-first-approval";

type Props = { approved: boolean | null; deckId: string | null };

function mount(initialProps: Props) {
  return renderHook(({ approved, deckId }: Props) => useFirstApproval(approved, deckId), {
    initialProps,
  });
}

const stored = () => JSON.parse(window.localStorage.getItem(SHARE_OFFERS_KEY) ?? "[]");

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("useFirstApproval", () => {
  it("never on a mount at zero — a legal deck opened as it is", () => {
    const hook = mount({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    expect(stored()).toEqual([]);
  });

  it("never on a load: not loaded (null) → a legal deck is no transition", () => {
    const hook = mount({ approved: null, deckId: "deck-1" });
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    expect(stored()).toEqual([]);
  });

  it("the first approval offers and records the deck; the session keeps it whenever the deck is approved", () => {
    const hook = mount({ approved: false, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(true);
    expect(stored()).toEqual(["deck-1"]);
    // An unrelated re-render keeps it; losing the approval hides it; regaining shows it.
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(true);
    hook.rerender({ approved: false, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(true);
  });

  it("a draft that approves before its row offers nothing until the row mints — then it does", () => {
    const hook = mount({ approved: false, deckId: null });
    hook.rerender({ approved: true, deckId: null });
    expect(hook.result.current).toBe(false);
    expect(stored()).toEqual([]);
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(true);
    expect(stored()).toEqual(["deck-1"]);
  });

  it("an approval lost before the row mints waits for the next one", () => {
    const hook = mount({ approved: false, deckId: null });
    hook.rerender({ approved: true, deckId: null });
    hook.rerender({ approved: false, deckId: null });
    hook.rerender({ approved: false, deckId: "deck-1" });
    expect(hook.result.current).toBe(false);
    expect(stored()).toEqual([]);
    hook.rerender({ approved: true, deckId: "deck-1" });
    expect(hook.result.current).toBe(true);
  });

  it("once per deck per browser: after a reload the same deck's approval offers nothing", () => {
    const first = mount({ approved: false, deckId: "deck-1" });
    first.rerender({ approved: true, deckId: "deck-1" });
    expect(first.result.current).toBe(true);
    first.unmount();

    const reload = mount({ approved: false, deckId: "deck-1" });
    reload.rerender({ approved: true, deckId: "deck-1" });
    expect(reload.result.current).toBe(false);
    // Another deck still gets its own first offer.
    const other = mount({ approved: false, deckId: "deck-2" });
    other.rerender({ approved: true, deckId: "deck-2" });
    expect(other.result.current).toBe(true);
    expect(stored()).toEqual(["deck-1", "deck-2"]);
  });
});

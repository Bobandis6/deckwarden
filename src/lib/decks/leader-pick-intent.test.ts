/**
 * The leader pick intent (W4): parse validation, the 30-minute TTL, the
 * wrong-deck / wrong-game guard the editor's `?leader=` apply relies on,
 * and clear-on-apply.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPickIntent,
  parsePickIntent,
  PICK_INTENT_KEY,
  PICK_INTENT_TTL_MS,
  pickIntentFor,
  readPickIntent,
  writePickIntent,
} from "./leader-pick-intent";

const NOW = 1_758_300_000_000;
const intent = { deckId: "deck-1", deckName: "Krenko — Mob Rule", game: "mtg" as const };

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("parsePickIntent", () => {
  it("round-trips a valid intent within the TTL", () => {
    const raw = JSON.stringify({ ...intent, at: NOW });
    expect(parsePickIntent(raw, NOW + 1000)).toEqual({ ...intent, at: NOW });
  });

  it("an intent older than 30 minutes is null; one just inside survives", () => {
    const raw = JSON.stringify({ ...intent, at: NOW });
    expect(parsePickIntent(raw, NOW + PICK_INTENT_TTL_MS + 1)).toBeNull();
    expect(parsePickIntent(raw, NOW + PICK_INTENT_TTL_MS)).not.toBeNull();
  });

  it("garbage, non-JSON, and shape violations are null", () => {
    expect(parsePickIntent(null, NOW)).toBeNull();
    expect(parsePickIntent("not json", NOW)).toBeNull();
    expect(parsePickIntent("42", NOW)).toBeNull();
    expect(parsePickIntent(JSON.stringify({ ...intent }), NOW)).toBeNull(); // no `at`
    expect(parsePickIntent(JSON.stringify({ ...intent, at: "soon" }), NOW)).toBeNull();
    expect(parsePickIntent(JSON.stringify({ ...intent, deckId: "", at: NOW }), NOW)).toBeNull();
  });
});

describe("write / read / pickIntentFor", () => {
  it("writePickIntent stamps `at` and readPickIntent returns it", () => {
    writePickIntent(intent);
    const read = readPickIntent();
    expect(read).not.toBeNull();
    expect(read?.deckId).toBe("deck-1");
    expect(read?.deckName).toBe("Krenko — Mob Rule");
    expect(typeof read?.at).toBe("number");
  });

  it("pickIntentFor matches only the exact deck AND game (crafted-link guard)", () => {
    writePickIntent(intent);
    expect(pickIntentFor("deck-1", "mtg")).not.toBeNull();
    expect(pickIntentFor("deck-2", "mtg")).toBeNull();
    expect(pickIntentFor("deck-1", "optcg")).toBeNull();
  });

  it("a stale stored intent reads as null through pickIntentFor", () => {
    window.sessionStorage.setItem(
      PICK_INTENT_KEY,
      JSON.stringify({ ...intent, at: Date.now() - PICK_INTENT_TTL_MS - 1 }),
    );
    expect(pickIntentFor("deck-1", "mtg")).toBeNull();
  });

  it("clearPickIntent (apply / Cancel) removes the stored intent", () => {
    writePickIntent(intent);
    clearPickIntent();
    expect(readPickIntent()).toBeNull();
    expect(window.sessionStorage.getItem(PICK_INTENT_KEY)).toBeNull();
  });
});

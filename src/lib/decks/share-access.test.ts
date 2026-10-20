/**
 * The share page's access decision (S6, L4): the table the layout's real
 * 404 and the page's render both read.
 */
import { describe, expect, it } from "vitest";

import { shareAccess } from "./share-access";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("shareAccess", () => {
  it("renders public and unlisted decks for everyone, signed in or not", () => {
    for (const visibility of ["public", "unlisted"] as const) {
      for (const userId of [null, OWNER]) {
        for (const viewer of [null, OWNER, STRANGER]) {
          expect(shareAccess({ visibility, userId }, viewer)).toBe("render");
        }
      }
    }
  });

  it("gates a private guest deck for every viewer — the proof lives in the owning browser", () => {
    expect(shareAccess({ visibility: "private", userId: null }, null)).toBe("gate");
    expect(shareAccess({ visibility: "private", userId: null }, STRANGER)).toBe("gate");
  });

  it("renders a private account deck for its owner's session only", () => {
    expect(shareAccess({ visibility: "private", userId: OWNER }, OWNER)).toBe("render");
  });

  it("answers not-found for a private account deck to a stranger and to the signed-out", () => {
    expect(shareAccess({ visibility: "private", userId: OWNER }, STRANGER)).toBe("not-found");
    expect(shareAccess({ visibility: "private", userId: OWNER }, null)).toBe("not-found");
  });
});

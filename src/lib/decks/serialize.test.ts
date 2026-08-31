import { describe, expect, it } from "vitest";

import { deckMetaJson, type DeckRow } from "./serialize";

const row: DeckRow = {
  id: "33333333-3333-4333-8333-333333333333",
  publicId: "abcdefgh2345",
  gameId: 1,
  formatId: 1,
  userId: "11111111-1111-4111-8111-111111111111",
  claimToken: null,
  createdIp: null,
  name: "Test Deck",
  description: null,
  notes: null,
  visibility: "public",
  leaderIds: [],
  ciMask: 0,
  folderId: "44444444-4444-4444-8444-444444444444",
  forkedFromDeckId: null,
  currentVersion: 0,
  likesCount: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

describe("deckMetaJson", () => {
  it("exposes folderId to the owner only", () => {
    expect(deckMetaJson(row, { isOwner: true }).folderId).toBe(row.folderId);
    expect(deckMetaJson(row, { isOwner: false }).folderId).toBeNull();
  });

  it("never carries the server-only columns", () => {
    const json = deckMetaJson(row, { isOwner: true }) as Record<string, unknown>;
    expect(json).not.toHaveProperty("claimToken");
    expect(json).not.toHaveProperty("createdIp");
    expect(json).not.toHaveProperty("userId");
  });
});

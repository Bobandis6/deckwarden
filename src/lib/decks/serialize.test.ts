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
  kind: "user",
  leaderIds: [],
  ciMask: 0,
  folderId: "44444444-4444-4444-8444-444444444444",
  forkedFromDeckId: null,
  currentVersion: 0,
  likesCount: 0,
  goals: null,
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

  it("exposes kind on the wire (W8a)", () => {
    expect(deckMetaJson(row, { isOwner: false }).kind).toBe("user");
    expect(deckMetaJson({ ...row, kind: "precon" }, { isOwner: false }).kind).toBe("precon");
  });

  describe("goals (Y4b, WAVE4 D5)", () => {
    const goals = {
      v: 1 as const,
      targetLevel: 2,
      exceptions: "One thematic Game Changer — ask me",
      budget: { perCardUsd: 5, totalUsd: 150 },
      answers: {
        rulesetVersion: 1,
        play: { fast: "no" as const },
        calls: { "combo:618-1537": "yes" as const },
      },
    };

    it("the owner gets every goal, the budget and the answers included", () => {
      expect(deckMetaJson({ ...row, goals }, { isOwner: true }).goals).toEqual(goals);
    });

    it("a visitor gets the target and the exceptions — never the budget, never the answers", () => {
      const json = deckMetaJson({ ...row, goals }, { isOwner: false });
      expect(json.goals).toEqual({
        v: 1,
        targetLevel: 2,
        exceptions: "One thematic Game Changer — ask me",
      });
      expect(JSON.stringify(json)).not.toMatch(/budget|perCardUsd|totalUsd|answers|rulesetVersion/);
    });

    it("goals holding only a budget or answers are none at all to a visitor", () => {
      const { budget, answers } = goals;
      expect(
        deckMetaJson({ ...row, goals: { v: 1, budget } }, { isOwner: false }).goals,
      ).toBeNull();
      expect(
        deckMetaJson({ ...row, goals: { v: 1, answers } }, { isOwner: false }).goals,
      ).toBeNull();
    });

    it("no goals is null for everyone; a shape this version doesn't know reads as none", () => {
      expect(deckMetaJson(row, { isOwner: true }).goals).toBeNull();
      expect(deckMetaJson(row, { isOwner: false }).goals).toBeNull();
      const unknown = { v: 2, targetLevel: 3 } as unknown as typeof goals;
      expect(deckMetaJson({ ...row, goals: unknown }, { isOwner: true }).goals).toBeNull();
    });
  });
});

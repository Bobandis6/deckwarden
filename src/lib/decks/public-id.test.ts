import { describe, expect, it } from "vitest";

import { newPublicId, PUBLIC_ID_LENGTH } from "./public-id";

describe("newPublicId", () => {
  it("emits URL-safe slugs of the fixed length", () => {
    for (let i = 0; i < 200; i++) {
      expect(newPublicId()).toMatch(
        new RegExp(`^[23456789abcdefghjkmnpqrstuvwxyz_]{${PUBLIC_ID_LENGTH}}$`),
      );
    }
  });

  it("does not collide across a small sample", () => {
    const sample = new Set(Array.from({ length: 5000 }, () => newPublicId()));
    expect(sample.size).toBe(5000);
  });
});

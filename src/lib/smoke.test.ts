import { describe, expect, it } from "vitest";

describe("toolchain smoke test", () => {
  it("runs under vitest", () => {
    expect(1 + 1).toBe(2);
  });
});

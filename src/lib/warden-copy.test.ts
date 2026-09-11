/**
 * Warden copy (R5b, F8): one voice line per page, never the reserved
 * approval language (that line belongs to zero-issue validation alone).
 */
import { describe, expect, it } from "vitest";

import { WARDEN_COPY } from "./warden-copy";

describe("WARDEN_COPY", () => {
  it("never uses approval language outside validation", () => {
    for (const page of Object.values(WARDEN_COPY)) {
      for (const line of Object.values(page)) {
        expect(line.toLowerCase()).not.toContain("approve");
      }
    }
  });

  it("the 404 speaks as the Warden in its title; the error page in its hint", () => {
    expect(WARDEN_COPY.notFound.title).toBe("The Warden finds no such page.");
    expect(WARDEN_COPY.error.hint).toMatch(/^The Warden /);
    expect(WARDEN_COPY.error.title).toBe("Something went wrong");
  });
});

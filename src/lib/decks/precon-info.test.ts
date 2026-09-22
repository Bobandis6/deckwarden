/**
 * W8b pins: the precon lookup-key decision (slug, never the MTGJSON
 * fileName code) and the UTC release label.
 */
import { describe, expect, it } from "vitest";

import { PRECON_SLUG_RE, releasedLabel } from "./precon-info";

describe("PRECON_SLUG_RE — the slug-not-code decision", () => {
  it("accepts real slugs (the public_id grammar minus the p_ prefix)", () => {
    expect(PRECON_SLUG_RE.test("breed_lethality_c16")).toBe(true);
    expect(PRECON_SLUG_RE.test("timey_wimey_who")).toBe(true);
  });

  it("rejects the MTGJSON fileName code — the API 404s it by construction", () => {
    expect(PRECON_SLUG_RE.test("BreedLethality_C16")).toBe(false);
    expect(PRECON_SLUG_RE.test("TimeyWimey_WHO")).toBe(false);
  });

  it("rejects traversal and over-long junk", () => {
    expect(PRECON_SLUG_RE.test("../etc")).toBe(false);
    expect(PRECON_SLUG_RE.test("")).toBe(false);
    expect(PRECON_SLUG_RE.test("a".repeat(31))).toBe(false);
  });
});

describe("releasedLabel", () => {
  it("month + year, UTC-pinned (a date-only string never drifts a day)", () => {
    expect(releasedLabel("2016-11-11")).toBe("Nov 2016");
    expect(releasedLabel("2023-10-13")).toBe("Oct 2023");
    expect(releasedLabel(new Date("2011-06-17T00:00:00Z"))).toBe("Jun 2011");
  });

  it("null in, null out", () => {
    expect(releasedLabel(null)).toBeNull();
  });
});

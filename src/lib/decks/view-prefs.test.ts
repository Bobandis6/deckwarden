import { describe, expect, it } from "vitest";

import { parseViewPrefs } from "./view-prefs";

describe("parseViewPrefs", () => {
  it("accepts a fully valid stored preference", () => {
    expect(parseViewPrefs('{"view":"grid","groupBy":"costValue","sortBy":"price"}')).toEqual({
      view: "grid",
      groupBy: "costValue",
      sortBy: "price",
    });
  });

  it("drops unknown values field-by-field", () => {
    expect(parseViewPrefs('{"view":"grid","groupBy":"bogus","sortBy":42}')).toEqual({
      view: "grid",
    });
  });

  it("returns empty prefs for null, junk JSON, and non-objects", () => {
    expect(parseViewPrefs(null)).toEqual({});
    expect(parseViewPrefs("not json")).toEqual({});
    expect(parseViewPrefs('"grid"')).toEqual({});
  });
});

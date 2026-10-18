/**
 * S0 — the advisory range reader, pinned on the ranges the vercel/next.js and
 * better-auth/better-auth feeds actually contained on 2026-10-18 (every
 * grammar the header of version-range.ts lists), the wide readings, and the
 * `patched_versions` closure.
 */
import { describe, expect, it } from "vitest";

import {
  compareVersions,
  covers,
  formatVersion,
  isPatched,
  parseBound,
  parsePatched,
  parseRange,
  parseVersion,
  satisfiesRange,
  type Version,
} from "./version-range";

function v(text: string): Version {
  const parsed = parseVersion(text);
  if (!parsed) throw new Error(`not a version: ${text}`);
  return parsed;
}

/** The versions a range admits, out of a fixed probe set. */
function admits(range: string, probes: string[]): string[] {
  const parsed = parseRange(range);
  if (!parsed) throw new Error(`unparsed: ${range}`);
  return probes.filter((p) => satisfiesRange(v(p), parsed));
}

describe("parseVersion", () => {
  it("reads releases, prereleases and a v prefix", () => {
    expect(parseVersion("16.4.2")).toEqual({ major: 16, minor: 4, patch: 2, prerelease: [] });
    expect(parseVersion("v1.7.0-beta.18")).toEqual({
      major: 1,
      minor: 7,
      patch: 0,
      prerelease: ["beta", 18],
    });
    expect(parseVersion("15.6.0-canary.61+build.3")?.prerelease).toEqual(["canary", 61]);
  });

  it("refuses wildcards, placeholders and partial versions — those are bounds", () => {
    for (const text of ["16.3.?", "10.x", "14.0", "15", "x", "", "banana", "1.2.3.4"]) {
      expect(parseVersion(text), text).toBeNull();
    }
  });

  it("formats back", () => {
    expect(formatVersion(v("16.4.2"))).toBe("16.4.2");
    expect(formatVersion(v("1.7.0-beta.18"))).toBe("1.7.0-beta.18");
  });
});

describe("parseBound", () => {
  it("reads a partial, a wildcard or a ? the wide way for its side", () => {
    expect(parseBound(">=", "14.0")).toEqual({ op: ">=", version: v("14.0.0") });
    expect(parseBound(">=", "16.3.?")).toEqual({ op: ">=", version: v("16.3.0") });
    expect(parseBound("<", "16.3.?")).toEqual({ op: "<", version: v("16.4.0") });
    expect(parseBound("<=", "10.x")).toEqual({ op: "<", version: v("11.0.0") });
    expect(parseBound("<", "15")).toEqual({ op: "<", version: v("16.0.0") });
    expect(parseBound(">", "16.3.x")).toEqual({ op: ">=", version: v("16.4.0") });
  });

  it("keeps an exact version exact", () => {
    expect(parseBound("<=", "16.4.0")).toEqual({ op: "<=", version: v("16.4.0") });
    expect(parseBound(">", "16.0.0")).toEqual({ op: ">", version: v("16.0.0") });
  });

  it("refuses a bound with no leading number", () => {
    expect(parseBound("<", "x")).toBeNull();
    expect(parseBound("<", "?")).toBeNull();
    expect(parseBound("<", "latest")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions(v("16.3.8"), v("16.4.0"))).toBeLessThan(0);
    expect(compareVersions(v("16.4.2"), v("16.4.1"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.7.10"), v("1.7.10"))).toBe(0);
    expect(compareVersions(v("1.7.10"), v("1.7.9"))).toBeGreaterThan(0);
  });

  it("puts a prerelease before its release, numerics before words, and compares dot by dot", () => {
    expect(compareVersions(v("1.4.0-beta.18"), v("1.4.0"))).toBeLessThan(0);
    expect(compareVersions(v("15.6.0-canary.58"), v("15.6.0"))).toBeLessThan(0);
    expect(compareVersions(v("1.7.0-beta.9"), v("1.7.0-beta.10"))).toBeLessThan(0);
    expect(compareVersions(v("1.7.0-beta.18"), v("1.7.0-rc.3"))).toBeLessThan(0);
    expect(compareVersions(v("1.7.0-rc.3"), v("1.7.0-rc.3.1"))).toBeLessThan(0);
  });
});

describe("parseRange on the feeds' own grammar", () => {
  const probes = [
    "1.4.0-beta.17",
    "1.4.0-beta.18",
    "1.7.2",
    "1.7.7",
    "1.7.10",
    "10.5.1",
    "11.0.0",
    "11.1.3",
    "12.2.0",
    "12.3.4",
    "12.3.5",
    "13.2.9",
    "13.4.0",
    "14.0.0",
    "14.2.20",
    "14.2.21",
    "14.2.23",
    "14.2.25",
    "14.2.30",
    "14.2.31",
    "14.5.0",
    "15.0.0",
    "15.0.5",
    "15.1.1",
    "15.1.5",
    "15.1.6",
    "15.4.4",
    "15.4.5",
    "15.4.7",
    "15.5.27",
    "15.5.28",
    "15.6.0-canary.60",
    "15.6.0",
    "16.0.0",
    "16.1.4",
    "16.1.5",
    "16.2.9",
    "16.3.0",
    "16.3.7",
    "16.3.8",
    "16.4.0",
    "16.4.1",
    "16.4.2",
    "16.9.9",
    "17.0.0",
  ];

  it("a comma between a lower and an upper bound is AND (better-auth's `>= a, < b`)", () => {
    expect(admits(">= 1.4.0-beta.18, < 1.7.7", probes)).toEqual(["1.4.0-beta.18", "1.7.2"]);
    expect(admits("< 1.7.7, >= 1.4.0-beta.18", probes)).toEqual(["1.4.0-beta.18", "1.7.2"]);
  });

  it("two bounds without a comma are AND, inclusive or exclusive as written (the 2026-10-14 next ranges)", () => {
    expect(admits(">= 16.0.0 <= 16.4.0", probes)).toEqual([
      "16.0.0",
      "16.1.4",
      "16.1.5",
      "16.2.9",
      "16.3.0",
      "16.3.7",
      "16.3.8",
      "16.4.0",
    ]);
    expect(admits("> 16.0.0 <= 16.4.0", probes)).not.toContain("16.0.0");
    expect(admits(">=16.0.0 <= 16.4.0", probes)).toContain("16.3.8");
    expect(admits(">= 10.0.0  <= 15.5.27", probes)).toContain("15.5.27");
    expect(admits(">= 10.0.0  <= 15.5.27", probes)).not.toContain("15.5.28");
  });

  it("commas between complete ranges are OR", () => {
    expect(admits(">= 13.0.0 < 14.2.21, >= 15.0.0 < 15.1.1", probes)).toEqual([
      "13.2.9",
      "13.4.0",
      "14.0.0",
      "14.2.20",
      "15.0.0",
      "15.0.5",
    ]);
    expect(
      admits(">=13.0.0 <15.0.8, >=15.0.0 <15.6.0-canary.61, >=16.0.0 <16.1.5", probes),
    ).toEqual(
      expect.arrayContaining([
        "14.2.31",
        "15.0.5",
        "15.4.7",
        "15.6.0-canary.60",
        "16.0.0",
        "16.1.4",
      ]),
    );
    expect(
      admits(">=13.0.0 <15.0.8, >=15.0.0 <15.6.0-canary.61, >=16.0.0 <16.1.5", probes),
    ).not.toContain("15.6.0");
  });

  it("same-direction bounds name one release line each, so they are OR", () => {
    expect(admits("<14.2.32, <15.4.7", probes)).toContain("15.0.0");
    expect(admits("<14.2.32, <15.4.7", probes)).not.toContain("15.4.7");
    expect(admits(">= 13.3, >= 14, >=15, >=16", probes)).toContain("13.4.0");
    expect(admits(">= 13.3, >= 14, >=15, >=16", probes)).not.toContain("13.2.9");
    expect(admits("<=12.3.5, <=13.5.9, <=14.2.25, <=15.2.3", probes)).toContain("15.1.6");
  });

  it("a hyphen range, the word `and`, `=>`, a `v` prefix and two-component versions", () => {
    expect(admits("< 14.2.31, 15.0.0 - 15.4.4", probes)).toEqual(
      expect.arrayContaining(["14.2.30", "15.0.0", "15.4.4"]),
    );
    expect(admits("< 14.2.31, 15.0.0 - 15.4.4", probes)).not.toContain("14.2.31");
    expect(admits("< 14.2.31, 15.0.0 - 15.4.4", probes)).not.toContain("15.4.5");
    expect(admits("<14.2.24, >15.0.0 and <15.1.6", probes)).toEqual([
      "1.4.0-beta.17",
      "1.4.0-beta.18",
      "1.7.2",
      "1.7.7",
      "1.7.10",
      "10.5.1",
      "11.0.0",
      "11.1.3",
      "12.2.0",
      "12.3.4",
      "12.3.5",
      "13.2.9",
      "13.4.0",
      "14.0.0",
      "14.2.20",
      "14.2.21",
      "14.2.23",
      "15.0.5",
      "15.1.1",
      "15.1.5",
    ]);
    expect(admits("=> 11.1.4 < 12.3.5", probes)).toEqual(["12.2.0", "12.3.4"]);
    expect(admits(">= v12.2.0 < 15.5.16", probes)).toContain("12.2.0");
    expect(admits("=>14.0 <14.2.25", probes)).toEqual(["14.0.0", "14.2.20", "14.2.21", "14.2.23"]);
    expect(admits(">= 13.0.0, < 13.5.9", probes)).toEqual(["13.2.9", "13.4.0"]);
  });

  it("wildcards and bare versions are the line they start, read wide", () => {
    expect(admits("10.x", probes)).toEqual(["10.5.1"]);
    expect(admits("16.3.0", probes)).toEqual([
      "16.3.0",
      "16.3.7",
      "16.3.8",
      "16.4.0",
      "16.4.1",
      "16.4.2",
      "16.9.9",
    ]);
    expect(admits("15.0.0-canary.0", probes)).toEqual(
      expect.arrayContaining(["15.0.0", "15.6.0-canary.60", "15.6.0"]),
    );
    expect(admits("15.0.0-canary.0", probes)).not.toContain("16.0.0");
  });

  it("a ? upper bound is the whole line; an open range stays open", () => {
    expect(admits(">= 16.0.0 < 16.3.?", probes)).toContain("16.3.8");
    expect(admits(">= 16.0.0 < 16.3.?", probes)).not.toContain("16.4.0");
    expect(admits(">= 16.0.0", probes)).toContain("16.4.2");
    expect(admits(">= 1.6.14", probes)).toContain("1.7.10");
  });

  it("refuses what it does not understand", () => {
    for (const text of ["", "   ", "garbage", ">= 1.2.3 banana", ">= ", "latest", ", ,"]) {
      expect(parseRange(text), JSON.stringify(text)).toBeNull();
    }
  });
});

describe("parsePatched and isPatched", () => {
  it("reads a list with v prefixes, prereleases and a ? as the next line", () => {
    expect(parsePatched("v16.0.7, v15.5.7, 15.6.0-canary.58").map(formatVersion)).toEqual([
      "16.0.7",
      "15.5.7",
      "15.6.0-canary.58",
    ]);
    expect(parsePatched("16.3.?").map(formatVersion)).toEqual(["16.4.0"]);
    expect(parsePatched("15.5.14 16.1.7").map(formatVersion)).toEqual(["15.5.14", "16.1.7"]);
    expect(parsePatched("")).toEqual([]);
    expect(parsePatched(null)).toEqual([]);
    expect(parsePatched(undefined)).toEqual([]);
  });

  it("the version's own minor line speaks first, then its major, then any", () => {
    const lines = parsePatched(
      "v16.0.7, v15.5.7, v15.4.8, v15.3.6, 15.6.0-canary.58, 16.1.0-canary.12",
    );
    expect(isPatched(v("15.4.7"), lines)).toBe(false);
    expect(isPatched(v("15.4.8"), lines)).toBe(true);
    expect(isPatched(v("15.4.9"), lines)).toBe(true);
    expect(isPatched(v("15.7.0"), lines)).toBe(true);
    expect(isPatched(v("16.4.2"), lines)).toBe(true);
    expect(isPatched(v("16.0.5"), parsePatched("15.5.14, 16.1.7"))).toBe(false);
    expect(isPatched(v("16.4.2"), parsePatched("15.5.14, 16.1.7"))).toBe(true);
    expect(isPatched(v("14.2.0"), parsePatched("15.5.14, 16.1.7"))).toBe(false);
    expect(isPatched(v("16.4.2"), parsePatched("13.5.7"))).toBe(true);
    expect(isPatched(v("13.5.3"), parsePatched("13.5.7"))).toBe(false);
  });

  it("nothing listed patches nothing", () => {
    expect(isPatched(v("1.7.10"), [])).toBe(false);
  });
});

describe("covers — one vulnerability entry against one installed version", () => {
  it("the three 2026-10-14 next advisories cover 16.3.8 and not 16.4.2", () => {
    for (const range of ["> 16.0.0 <= 16.4.0", ">=16.0.0 <= 16.4.0", ">= 16.0.0 <= 16.4.0"]) {
      expect(covers(v("16.3.8"), range, "16.4.1")).toEqual({
        covered: true,
        unparsed: false,
        patched: false,
      });
      expect(covers(v("16.4.2"), range, "16.4.1")).toEqual({
        covered: false,
        unparsed: false,
        patched: false,
      });
    }
  });

  it("the two better-auth advisories cover 1.7.2 and not 1.7.10", () => {
    for (const range of [">= 1.4.0-beta.18, < 1.7.7", ">= 1.5.0-beta.12, < 1.7.7"]) {
      expect(covers(v("1.7.2"), range, "1.7.7").covered).toBe(true);
      expect(covers(v("1.7.10"), range, "1.7.7").covered).toBe(false);
    }
  });

  it("an open range is closed by patched_versions, a ? patch by its next line", () => {
    expect(covers(v("16.4.2"), ">= 16.0.0", "16.3.?")).toEqual({
      covered: false,
      unparsed: false,
      patched: true,
    });
    expect(covers(v("16.3.8"), ">= 16.0.0", "16.3.?").covered).toBe(true);
    expect(covers(v("16.4.2"), ">=13.5.1", "13.5.7").covered).toBe(false);
    expect(
      covers(v("16.4.2"), ">=14.3.0-canary.77, >=15, >=16", "v16.0.7, v15.5.7, 16.1.0-canary.12")
        .covered,
    ).toBe(false);
  });

  it("an open range with nothing patched covers (GHSA-fmh4-wcc4-5jm3's `>= 1.6.14`)", () => {
    expect(covers(v("1.7.10"), ">= 1.6.14", "")).toEqual({
      covered: true,
      unparsed: false,
      patched: false,
    });
  });

  it("a range it cannot read covers, and says so", () => {
    expect(covers(v("16.4.2"), "not a range", "x")).toEqual({
      covered: true,
      unparsed: true,
      patched: false,
    });
    expect(covers(v("16.4.2"), null, null)).toEqual({
      covered: true,
      unparsed: true,
      patched: false,
    });
    expect(covers(v("16.4.2"), "", "")).toEqual({ covered: true, unparsed: true, patched: false });
  });
});

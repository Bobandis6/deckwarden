/**
 * safeNextPath (X1, REC-1): the one gate between a crafted `?next=` and the
 * redirect after sign-in. The refusals are the contract — WAVE3.md G's table
 * plus the X1 prompt's verify-first list (a value that DECODES to `//`, an
 * encoded backslash, the empty string, /account with a hash).
 */
import { describe, expect, it } from "vitest";

import { NEXT_PATH_MAX_LENGTH, accountHref, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("accepts a root-relative path on this site, query and hash included", () => {
    expect(safeNextPath("/d/abc")).toBe("/d/abc");
    expect(safeNextPath("/d/jhr5ax43ewx7")).toBe("/d/jhr5ax43ewx7");
    expect(safeNextPath("/c/atraxa-praetors-voice")).toBe("/c/atraxa-praetors-voice");
    expect(safeNextPath("/d/abc?view=grid#list")).toBe("/d/abc?view=grid#list");
    expect(safeNextPath("/")).toBe("/");
  });

  it.each([
    ["a protocol-relative host", "//evil.example"],
    ["a protocol-relative host with a path", "//evil.example/d/abc"],
    ["a backslash host", "/\\evil.example"],
    ["a backslash anywhere", "/d/abc\\x"],
    ["an absolute URL", "https://evil.example/d/abc"],
    ["a scheme with no slashes", "javascript:alert(1)"],
    ["a relative path", "d/abc"],
    ["a double slash further in", "/d//abc"],
    ["a double slash in the query", "/d/abc?to=//evil.example"],
    ["the empty string", ""],
    ["a leading space", " /d/abc"],
  ])("refuses %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it.each([
    ["%2F after the leading slash (decodes to //)", "/%2Fevil.example"],
    ["%2f in lower case", "/%2fevil.example"],
    ["%5C (an encoded backslash)", "/%5Cevil.example"],
    ["%5c further in", "/d/abc%5cx"],
    ["%09 (an encoded tab)", "/%09/evil.example"],
    ["%0A (an encoded newline)", "/d/abc%0Ax"],
    ["a malformed escape", "/d/%E0%A4%A"],
  ])("refuses what the value DECODES to: %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it.each([
    ["a tab (parsers strip it: /\\t/host reads //host)", "/\t/evil.example"],
    ["a newline", "/d/abc\nx"],
    ["a NUL", "/d/abc\u0000"],
    ["DEL", "/d/abc\u007f"],
    ["a C1 control", "/d/abc\u0085"],
  ])("refuses a control character: %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it.each([
    ["/account"],
    ["/account/"],
    ["/account#decks"],
    ["/account?next=%2Fd%2Fabc"],
    ["/Account"],
    ["/d/../account"],
    ["/%61ccount"],
    ["/api"],
    ["/api/decks/mine"],
    ["/API/auth/sign-out"],
    ["/d/../api/account"],
  ])("refuses the account page and the API: %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("the reserved prefixes are whole segments, not string prefixes", () => {
    expect(safeNextPath("/accounting")).toBe("/accounting");
    expect(safeNextPath("/apiary")).toBe("/apiary");
  });

  it(`accepts ${NEXT_PATH_MAX_LENGTH} characters and refuses ${NEXT_PATH_MAX_LENGTH + 1}`, () => {
    const atLimit = `/d/${"a".repeat(NEXT_PATH_MAX_LENGTH - 3)}`;
    expect(atLimit).toHaveLength(NEXT_PATH_MAX_LENGTH);
    expect(safeNextPath(atLimit)).toBe(atLimit);
    expect(safeNextPath(`${atLimit}a`)).toBeNull();
  });

  it("refuses anything that is not one string (a repeated parameter arrives as an array)", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(["/d/abc", "/d/def"])).toBeNull();
    expect(safeNextPath(["/d/abc"])).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });

  it("returns the parsed form, so what is followed is what was checked", () => {
    expect(safeNextPath("/d/./abc")).toBe("/d/abc");
    expect(safeNextPath("/d/x/../abc")).toBe("/d/abc");
  });
});

describe("accountHref", () => {
  it("is plain /account without a safe return path", () => {
    expect(accountHref()).toBe("/account");
    expect(accountHref(null)).toBe("/account");
    expect(accountHref("//evil.example")).toBe("/account");
    expect(accountHref("/account")).toBe("/account");
  });

  it("carries the return path in the query, fully encoded", () => {
    expect(accountHref("/d/abc")).toBe("/account?next=%2Fd%2Fabc");
    expect(accountHref("/d/abc?view=grid#list")).toBe(
      "/account?next=%2Fd%2Fabc%3Fview%3Dgrid%23list",
    );
  });

  it("round-trips: what the account page reads back is what the prompt sent", () => {
    for (const path of ["/d/abc", "/d/abc?view=grid#list", "/c/atraxa-praetors-voice"]) {
      const href = new URL(accountHref(path), "https://deckwarden.invalid");
      expect(href.pathname).toBe("/account");
      expect(href.hash).toBe("");
      expect(safeNextPath(href.searchParams.get("next"))).toBe(path);
    }
  });
});

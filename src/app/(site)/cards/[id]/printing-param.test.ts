/**
 * The `?printing=` view-state store (W5): well-formed ids only, replaceState
 * writes (no history entries), null when absent.
 */
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { parsePrintingParam, usePrintingParam, writePrintingParam } from "./printing-param";

const ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  window.history.replaceState(null, "", "/cards/abc");
});

describe("parsePrintingParam", () => {
  it("returns the id for a well-formed param", () => {
    expect(parsePrintingParam(`?printing=${ID}`)).toBe(ID);
  });

  it("is null when absent or malformed", () => {
    expect(parsePrintingParam("")).toBeNull();
    expect(parsePrintingParam("?printing=")).toBeNull();
    expect(parsePrintingParam("?printing=not-a-uuid")).toBeNull();
    expect(parsePrintingParam("?other=1")).toBeNull();
  });
});

describe("usePrintingParam / writePrintingParam", () => {
  it("write → read round trip, and null removes the param", () => {
    const { result } = renderHook(() => usePrintingParam());
    expect(result.current).toBeNull();

    const depth = window.history.length;
    act(() => writePrintingParam(ID));
    expect(result.current).toBe(ID);
    expect(window.location.search).toBe(`?printing=${ID}`);
    // replaceState, never push: back/forward gain no entries.
    expect(window.history.length).toBe(depth);

    act(() => writePrintingParam(null));
    expect(result.current).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("reads a deep link present before mount", () => {
    window.history.replaceState(null, "", `/cards/abc?printing=${ID}`);
    const { result } = renderHook(() => usePrintingParam());
    expect(result.current).toBe(ID);
  });
});

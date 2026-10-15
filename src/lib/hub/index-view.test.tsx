/**
 * The index-view store (R5a): validation (a corrupt value is the default,
 * the grid since U7a), the load / save round trip under
 * `deckwarden:index-view`, the hook following same-tab saves and cross-tab
 * storage events, and the server snapshot — the grid is what the server
 * HTML carries even for a List reader.
 */
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_INDEX_VIEW,
  INDEX_VIEW_KEY,
  loadIndexView,
  parseIndexView,
  saveIndexView,
  useIndexView,
} from "./index-view";

afterEach(() => {
  window.localStorage.clear();
});

describe("parseIndexView", () => {
  it("reads list and grid; everything else — nothing, junk, JSON — is the grid (U7a)", () => {
    expect(DEFAULT_INDEX_VIEW).toBe("grid");
    expect(parseIndexView("grid")).toBe("grid");
    expect(parseIndexView("list")).toBe("list");
    expect(parseIndexView(null)).toBe("grid");
    expect(parseIndexView("")).toBe("grid");
    expect(parseIndexView("{oops")).toBe("grid");
    expect(parseIndexView('{"view":"list"}')).toBe("grid");
    expect(parseIndexView("LIST")).toBe("grid");
  });
});

describe("loadIndexView / saveIndexView", () => {
  it("round-trips under the key", () => {
    expect(loadIndexView()).toBe("grid");
    saveIndexView("list");
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("list");
    expect(loadIndexView()).toBe("list");
  });
});

describe("useIndexView", () => {
  it("reads the stored value, follows saves in the same tab and storage events from others", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
    const { result } = renderHook(() => useIndexView());
    expect(result.current).toBe("list");

    act(() => saveIndexView("grid"));
    expect(result.current).toBe("grid");

    act(() => {
      window.localStorage.setItem(INDEX_VIEW_KEY, "list");
      window.dispatchEvent(new StorageEvent("storage", { key: INDEX_VIEW_KEY }));
    });
    expect(result.current).toBe("list");
  });

  it("the server snapshot is the grid even when the reader stored list", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
    function Probe() {
      return <span>{useIndexView()}</span>;
    }
    expect(renderToString(<Probe />)).toBe("<span>grid</span>");
  });
});

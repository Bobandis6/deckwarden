/**
 * The index-view store (R5a): validation (a corrupt value is the list), the
 * load / save round trip under `deckwarden:index-view`, the hook following
 * same-tab saves and cross-tab storage events, and the server snapshot —
 * the list is what the server HTML carries even for a Grid reader.
 */
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
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
  it("reads list and grid; everything else — nothing, junk, JSON — is the list", () => {
    expect(parseIndexView("grid")).toBe("grid");
    expect(parseIndexView("list")).toBe("list");
    expect(parseIndexView(null)).toBe("list");
    expect(parseIndexView("")).toBe("list");
    expect(parseIndexView("{oops")).toBe("list");
    expect(parseIndexView('{"view":"grid"}')).toBe("list");
    expect(parseIndexView("GRID")).toBe("list");
  });
});

describe("loadIndexView / saveIndexView", () => {
  it("round-trips under the key", () => {
    expect(loadIndexView()).toBe("list");
    saveIndexView("grid");
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("grid");
    expect(loadIndexView()).toBe("grid");
  });
});

describe("useIndexView", () => {
  it("reads the stored value, follows saves in the same tab and storage events from others", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
    const { result } = renderHook(() => useIndexView());
    expect(result.current).toBe("grid");

    act(() => saveIndexView("list"));
    expect(result.current).toBe("list");

    act(() => {
      window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
      window.dispatchEvent(new StorageEvent("storage", { key: INDEX_VIEW_KEY }));
    });
    expect(result.current).toBe("grid");
  });

  it("the server snapshot is the list even when the reader stored grid", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
    function Probe() {
      return <span>{useIndexView()}</span>;
    }
    expect(renderToString(<Probe />)).toBe("<span>list</span>");
  });
});

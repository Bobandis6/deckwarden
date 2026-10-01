import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isMacPlatform, useIsMac } from "./use-is-mac";

describe("useIsMac (Y2a)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the platform, falling back to the user agent", () => {
    expect(isMacPlatform({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(isMacPlatform({ platform: "iPhone", userAgent: "" })).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe(
      false,
    );
    expect(
      isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }),
    ).toBe(true);
    expect(isMacPlatform({ platform: "Linux x86_64", userAgent: "X11; Linux" })).toBe(false);
  });

  it("the client snapshot answers after hydration", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(renderHook(() => useIsMac()).result.current).toBe(true);
  });
});

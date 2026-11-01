import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CARD_ENTRANCE_ATTRIBUTE as ATTRIBUTE,
  CARD_READY_MS,
  CARD_SESSION_KEY as KEY,
  cardEntranceEligible,
  cardEntranceScript,
} from "./card-entrance";

describe("card entrance session policy", () => {
  const fresh = { pathname: "/", stored: null, reducedMotion: false, navigationType: "navigate" };
  it("allows only a fresh Home document, including query/hash variants via pathname", () => {
    expect(cardEntranceEligible(fresh)).toBe(true);
    for (const input of [
      { pathname: "/commanders" },
      { stored: "1" },
      { stored: "old-version" },
      { stored: "" },
      { reducedMotion: true },
      { navigationType: "reload" },
      { navigationType: "back_forward" },
    ])
      expect(cardEntranceEligible({ ...fresh, ...input })).toBe(false);
  });
});

describe("serialized pre-paint card gate", () => {
  let store: Map<string, string>;
  let reduced: boolean;
  let resolveDecode: () => void;
  let rejectDecode: (reason: Error) => void;
  let decode: Promise<void>;
  let preference: EventTarget & { matches: boolean };
  let animations: Array<{ cancel: ReturnType<typeof vi.fn>; resolve: () => void }>;
  let animate: ReturnType<typeof vi.fn>;
  let observer: MutationCallback;
  let visibility: DocumentVisibilityState;
  const state = () => document.documentElement.getAttribute(ATTRIBUTE);
  const run = () => new Function(cardEntranceScript())();
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  const markup = () => '<div data-slot="hero-fan"><img alt="A"><img alt="B"><img alt="C"></div>';

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map();
    reduced = false;
    visibility = "visible";
    animations = [];
    decode = new Promise<void>((resolve, reject) => {
      resolveDecode = resolve;
      rejectDecode = reject;
    });
    preference = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => {
      preference.matches = reduced;
      return preference;
    });
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: MutationCallback) {
          observer = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          expect(state()).toBeNull(); // Remember before any concealment.
          store.set(key, value);
        },
      },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      transform: "none",
      getPropertyValue: () => "linear(0, 0.5, 1)",
    } as unknown as CSSStyleDeclaration);
    vi.stubGlobal("getComputedStyle", window.getComputedStyle);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(488);
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () => decode,
    });
    animate = vi.fn(() => {
      let resolve!: () => void;
      const finished = new Promise<void>((done) => {
        resolve = done;
      });
      const cancel = vi.fn();
      animations.push({ resolve, cancel });
      return { finished, cancel };
    });
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    document.documentElement.removeAttribute(ATTRIBUTE);
    document.body.innerHTML = markup();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    window.dispatchEvent(new Event("pagehide"));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.removeAttribute(ATTRIBUTE);
    delete (Element.prototype as { animate?: unknown }).animate;
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  });

  it("conceals before decode, installs all from-states before reveal, and restores static CSS after completion", async () => {
    run();
    expect(store.get(KEY)).toBe("1");
    expect(state()).toBe("pending");
    expect(animate).not.toHaveBeenCalled();
    animate.mockImplementationOnce(() => {
      expect(state()).toBe("pending");
      return { finished: Promise.resolve(), cancel: vi.fn() };
    });
    resolveDecode();
    await flush();
    expect(state()).toBe("playing");
    expect(animate).toHaveBeenCalledTimes(6);
    animations.forEach((animation) => animation.resolve());
    await flush();
    expect(state()).toBeNull();
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  });

  it("marks an off-Home start, so a subsequent full Home document cannot play", () => {
    window.history.replaceState({}, "", "/commanders");
    run();
    expect(store.get(KEY)).toBe("1");
    expect(state()).toBeNull();
    window.history.replaceState({}, "", "/");
    run();
    expect(state()).toBeNull();
  });

  it("also consumes a reduced-motion session before a later preference change/reload", () => {
    reduced = true;
    run();
    expect(state()).toBeNull();
    expect(store.get(KEY)).toBe("1");
    reduced = false;
    run();
    expect(state()).toBeNull();
  });

  it.each(["reload", "back_forward"])("never plays a %s document even without a marker", (type) => {
    vi.mocked(performance.getEntriesByType).mockReturnValue([
      { type },
    ] as unknown as PerformanceEntry[]);
    run();
    expect(state()).toBeNull();
    expect(store.get(KEY)).toBe("1");
  });

  it.each(["getItem", "setItem"])(
    "storage failure in %s leaves a usable static presentation",
    (method) => {
      vi.spyOn(window.sessionStorage, method).mockImplementation(() => {
        throw new Error("blocked");
      });
      run();
      expect(state()).toBeNull();
      expect(animate).not.toHaveBeenCalled();
    },
  );

  it("cancels on logo navigation before decode and cannot restart when cards remount", async () => {
    run();
    const logo = document.createElement("a");
    logo.href = "/";
    logo.addEventListener("click", (event) => event.preventDefault());
    document.body.append(logo);
    logo.click();
    expect(state()).toBeNull();
    document.body.innerHTML = markup();
    observer([], {} as MutationObserver);
    resolveDecode();
    await flush();
    expect(animate).not.toHaveBeenCalled();
    run();
    expect(state()).toBeNull();
  });

  it.each(["popstate", "pagehide"])(
    "%s settles in-flight cards and a return never restarts them",
    async (event) => {
      run();
      resolveDecode();
      await flush();
      expect(state()).toBe("playing");
      window.dispatchEvent(new Event(event));
      expect(state()).toBeNull();
      expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
      observer([], {} as MutationObserver);
      expect(animate).toHaveBeenCalledTimes(6);
    },
  );

  it("programmatic removal during decode consumes the gate even if Home immediately remounts", async () => {
    run();
    document.body.innerHTML = markup();
    observer([], {} as MutationObserver);
    resolveDecode();
    await flush();
    expect(state()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it("discovers streamed cards without waiting for React hydration", async () => {
    document.body.innerHTML = "";
    run();
    expect(state()).toBe("pending");
    document.body.innerHTML = markup();
    observer([], {} as MutationObserver);
    resolveDecode();
    await flush();
    expect(state()).toBe("playing");
  });

  it("image failure releases the trio statically", async () => {
    run();
    rejectDecode(new Error("image unavailable"));
    await flush();
    expect(state()).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it("a loading deadline releases the trio and late decode never jumps it back", async () => {
    run();
    vi.advanceTimersByTime(CARD_READY_MS);
    expect(state()).toBeNull();
    resolveDecode();
    await flush();
    expect(animate).not.toHaveBeenCalled();
  });

  it("a missing image keeps the named static fallback", () => {
    document.querySelector("img")!.outerHTML = "<span>Printless</span>";
    run();
    expect(state()).toBeNull();
    expect(document.querySelector("span")!.textContent).toBe("Printless");
  });

  it.each(["preference", "background"])(
    "%s changes settle the current entrance",
    async (change) => {
      run();
      resolveDecode();
      await flush();
      if (change === "preference") {
        preference.matches = true;
        preference.dispatchEvent(new Event("change"));
      } else {
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      }
      expect(state()).toBeNull();
      expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    },
  );

  it("unsupported animation APIs use the static baseline", () => {
    delete (Element.prototype as { animate?: unknown }).animate;
    run();
    expect(state()).toBeNull();
    expect(store.get(KEY)).toBe("1");
  });
});

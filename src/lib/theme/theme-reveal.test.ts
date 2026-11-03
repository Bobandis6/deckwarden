/**
 * The theme reveal (VIEW-TRANSITIONS): the flip runs inside a view
 * transition whose origin and radius sit on <html> for exactly as long as
 * the transition runs, resolves once the class has changed (or after the
 * backstop), and falls back to a plain flip without the API, under reduced
 * motion, or with nothing to reveal.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REVEAL_ATTRIBUTE,
  REVEAL_CLEANUP_TIMEOUT_MS,
  REVEAL_SETTLE_TIMEOUT_MS,
  revealRadius,
  revealThemeChange,
} from "./theme-reveal";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A startViewTransition stub whose `finished` the test settles by hand. */
function stubViewTransition() {
  const runs: { update: Promise<unknown>; finished: Deferred }[] = [];
  const start = vi.fn((update: () => Promise<void> | void) => {
    const finished = deferred();
    const run = { update: Promise.resolve().then(() => update()), finished };
    runs.push(run);
    return {
      finished: finished.promise,
      ready: finished.promise,
      updateCallbackDone: run.update,
      skipTransition() {},
    };
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  return { start, runs };
}

const root = document.documentElement;

afterEach(() => {
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  root.className = "";
  root.removeAttribute(REVEAL_ATTRIBUTE);
  root.removeAttribute("style");
});

describe("revealRadius", () => {
  it("reaches the farthest viewport corner from the origin", () => {
    expect(revealRadius({ x: 0, y: 0 }, 300, 400)).toBe(500);
    expect(revealRadius({ x: 300, y: 400 }, 300, 400)).toBe(500);
    expect(revealRadius({ x: 150, y: 200 }, 300, 400)).toBe(250);
  });
});

describe("revealThemeChange", () => {
  it("flips plainly, at once, without the API", () => {
    const apply = vi.fn();
    expect(revealThemeChange(apply, { x: 10, y: 10 })).toBe("plain");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(false);
  });

  it("flips plainly with no origin, and under reduced motion", () => {
    const { start } = stubViewTransition();
    const apply = vi.fn();
    expect(revealThemeChange(apply, null)).toBe("plain");
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce") })),
    );
    expect(revealThemeChange(apply, { x: 10, y: 10 })).toBe("plain");
    expect(apply).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
  });

  it("runs the flip inside the transition, resolving once the class changed, and clears the origin after it finished", async () => {
    const { start, runs } = stubViewTransition();
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 500);
    const apply = vi.fn(() => {
      root.classList.add("light");
    });
    expect(revealThemeChange(apply, { x: 900, y: 40 })).toBe("revealed");
    expect(start).toHaveBeenCalledTimes(1);
    // The flip waits for the browser's snapshot: nothing applied yet.
    expect(apply).not.toHaveBeenCalled();
    expect(root.getAttribute(REVEAL_ATTRIBUTE)).toMatch(/^\d+$/);
    expect(root.style.getPropertyValue("--reveal-x")).toBe("900px");
    expect(root.style.getPropertyValue("--reveal-y")).toBe("40px");
    // The far corner is (0, 500): hypot(900, 460) = 1010.7, rounded up.
    expect(root.style.getPropertyValue("--reveal-r")).toBe("1011px");
    await runs[0].update;
    expect(apply).toHaveBeenCalledTimes(1);
    // Still flagged while the sweep runs; cleared once it finished.
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(true);
    runs[0].finished.resolve();
    await runs[0].finished.promise;
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(false);
    expect(root.style.getPropertyValue("--reveal-x")).toBe("");
    expect(root.style.getPropertyValue("--reveal-r")).toBe("");
  });

  it("the update callback resolves after the backstop when the class never changes", async () => {
    vi.useFakeTimers();
    const { runs } = stubViewTransition();
    revealThemeChange(() => {}, { x: 1, y: 1 });
    let settled = false;
    const update = runs[0].update.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(REVEAL_SETTLE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await update;
    expect(settled).toBe(true);
  });

  it("the flag never outlives the sweep: a transition that never settles is cleared by the backstop", async () => {
    vi.useFakeTimers();
    stubViewTransition();
    revealThemeChange(() => {}, { x: 5, y: 5 });
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(true);
    await vi.advanceTimersByTimeAsync(REVEAL_CLEANUP_TIMEOUT_MS - 1);
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(false);
    expect(root.style.getPropertyValue("--reveal-r")).toBe("");
  });

  it("a reveal that ends after a newer one began leaves the newer origin alone, and a skipped transition still cleans up", async () => {
    const { runs } = stubViewTransition();
    revealThemeChange(() => {}, { x: 1, y: 1 });
    const first = root.getAttribute(REVEAL_ATTRIBUTE);
    revealThemeChange(() => {}, { x: 2, y: 2 });
    const second = root.getAttribute(REVEAL_ATTRIBUTE);
    expect(second).not.toBe(first);
    runs[0].finished.reject(new Error("skipped"));
    await runs[0].finished.promise.catch(() => {});
    await Promise.resolve();
    expect(root.getAttribute(REVEAL_ATTRIBUTE)).toBe(second);
    expect(root.style.getPropertyValue("--reveal-x")).toBe("2px");
    runs[1].finished.reject(new Error("skipped"));
    await runs[1].finished.promise.catch(() => {});
    await Promise.resolve();
    expect(root.hasAttribute(REVEAL_ATTRIBUTE)).toBe(false);
    expect(root.style.getPropertyValue("--reveal-x")).toBe("");
  });
});

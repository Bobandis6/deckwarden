/**
 * The home intro's gate (HOME-INTRO, 2026-10-22): the pure decision over
 * raw storage strings, the serialized script run as the browser runs it
 * (`new Function` over `introScript()`, so a closure over module scope
 * would throw here as it would in the page), the marker written before the
 * attribute, the attribute removed when the hero's animations end or the
 * fallback poll finds none running, and the stylesheet's rule: inside the
 * no-preference media query, keyed on the gate, U2's dw-in on the one-off
 * slot, opacity and transform only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HERO_SELECTOR,
  HERO_SLOT,
  INTRO_ANIMATION,
  INTRO_ATTRIBUTE,
  INTRO_MARK,
  INTRO_PLAY,
  INTRO_POLL_MS,
  INTRO_STORAGE_KEY,
  introDecision,
  introGate,
  introScript,
} from "./intro-gate";

describe("introDecision", () => {
  const home = { pathname: "/", stored: null, reducedMotion: false };

  it("plays on home with no marker, a blank or a stale value", () => {
    expect(introDecision(home)).toBe("play");
    expect(introDecision({ ...home, stored: "" })).toBe("play");
    expect(introDecision({ ...home, stored: "2" })).toBe("play");
    expect(introDecision({ ...home, stored: "true" })).toBe("play");
  });

  it("skips once the tab's marker is the current one", () => {
    expect(introDecision({ ...home, stored: INTRO_MARK })).toBe("skip");
    expect(INTRO_MARK).toBe("1");
  });

  it("skips off home: the script runs on every document and reads the pathname alone", () => {
    expect(introDecision({ ...home, pathname: "/commanders" })).toBe("skip");
    expect(introDecision({ ...home, pathname: "/decks/new" })).toBe("skip");
    expect(introDecision({ ...home, pathname: "" })).toBe("skip");
    // `/?x=1` has pathname "/" — the query is not the decision's business.
    expect(introDecision({ ...home, pathname: new URL("http://x/?x=1").pathname })).toBe("play");
  });

  it("skips under reduced motion, marker or not", () => {
    expect(introDecision({ ...home, reducedMotion: true })).toBe("skip");
    expect(introDecision({ ...home, reducedMotion: true, stored: INTRO_MARK })).toBe("skip");
  });
});

/** A fake animation the stub `getAnimations` hands back. */
interface FakeAnimation {
  animationName: string;
  playState: AnimationPlayState;
  /** Play-pending: the state a busy main thread leaves at first paint. */
  pending?: boolean;
}

describe("introScript, run as the browser runs it", () => {
  const html = () => document.documentElement;
  let store: Map<string, string>;
  let getThrows: boolean;
  let setThrows: boolean;
  let attributeWhenWritten: string | null | undefined;
  let animations: FakeAnimation[];
  let getAnimationsCalls: number;
  let reduced: boolean;
  let readyState: DocumentReadyState;

  const runScript = () => {
    // `new Function` over the serialized text: the page's own path.
    new Function(introScript())();
  };
  const endEvent = (target: Element, animationName: string) => {
    const event = new Event("animationend", { bubbles: true });
    Object.defineProperty(event, "animationName", { value: animationName });
    target.dispatchEvent(event);
  };
  const hero = () => document.querySelector(HERO_SELECTOR)!;
  const h1 = () => hero().querySelector("h1")!;
  const lede = () => hero().querySelector("h1 + p")!;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    store = new Map();
    getThrows = false;
    setThrows = false;
    attributeWhenWritten = undefined;
    animations = [];
    getAnimationsCalls = 0;
    reduced = false;
    readyState = "complete";
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => {
          if (getThrows) throw new DOMException("SecurityError", "SecurityError");
          return store.has(key) ? store.get(key)! : null;
        },
        setItem: (key: string, value: string) => {
          if (setThrows) throw new DOMException("QuotaExceededError", "QuotaExceededError");
          attributeWhenWritten = html().getAttribute(INTRO_ATTRIBUTE);
          store.set(key, value);
        },
      },
    });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced, media: query }));
    Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
    Element.prototype.getAnimations = function () {
      getAnimationsCalls++;
      return animations as unknown as Animation[];
    };
    window.history.pushState({}, "", "/");
    html().removeAttribute(INTRO_ATTRIBUTE);
    document.body.innerHTML = `<main id="main"><section data-slot="${HERO_SLOT}"><div><h1>Your next great deck starts here.</h1><p>The sentence.</p><div><a href="/decks/new">Build a deck</a></div></div><div data-slot="hero-fan"><img alt="A"></div></section><section><h2>Magic</h2></section></main>`;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    html().removeAttribute(INTRO_ATTRIBUTE);
    document.body.innerHTML = "";
  });

  it("is strict mode, the two functions' own source with the constants as arguments, and nothing that would close a script tag", () => {
    const script = introScript();
    expect(
      script.startsWith(`"use strict";(${introGate.toString()})(${introDecision.toString()},`),
    ).toBe(true);
    expect(
      script.endsWith(
        `,"deckwarden:intro","1","data-intro","play","[data-slot=\\"home-hero\\"]","dw-in",250)`,
      ),
    ).toBe(true);
    expect(script).not.toMatch(/<\/script|<!--/i);
    // No module constant inside either function: the sources name the values by parameter only.
    for (const fn of [introGate, introDecision]) {
      expect(fn.toString()).not.toMatch(/INTRO_|HERO_/);
    }
  });

  it("first load of home: the marker is written, THEN the attribute is set, and the hero plays", () => {
    runScript();
    expect(store.get(INTRO_STORAGE_KEY)).toBe(INTRO_MARK);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    // The write came first: the attribute was absent at the moment of setItem.
    expect(attributeWhenWritten).toBeNull();
  });

  it("a second document in the same tab (reload, back) skips: the marker is read before anything is written", () => {
    store.set(INTRO_STORAGE_KEY, INTRO_MARK);
    runScript();
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    expect(attributeWhenWritten).toBeUndefined();
    expect(getAnimationsCalls).toBe(0);
  });

  it("a stale marker plays again", () => {
    store.set(INTRO_STORAGE_KEY, "0");
    runScript();
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    expect(store.get(INTRO_STORAGE_KEY)).toBe(INTRO_MARK);
  });

  it("off home nothing happens: no read is acted on, no write, no attribute", () => {
    window.history.pushState({}, "", "/commanders");
    runScript();
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    expect(store.size).toBe(0);
    window.history.pushState({}, "", "/?x=1");
    runScript();
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
  });

  it("reduced motion: no attribute and no marker, so a later visit without the preference plays", () => {
    reduced = true;
    runScript();
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("storage that throws on read skips; storage that throws on write skips without the attribute", () => {
    getThrows = true;
    runScript();
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    getThrows = false;
    setThrows = true;
    runScript();
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    expect(store.size).toBe(0);
    expect(getAnimationsCalls).toBe(0);
  });

  it("removes the attribute on the LAST intro animation's end, by name and inside the hero only", () => {
    runScript();
    animations = [
      { animationName: INTRO_ANIMATION, playState: "running" },
      { animationName: INTRO_ANIMATION, playState: "running" },
    ];
    // Another animation's end, and a dw-in ending outside the hero, change nothing.
    endEvent(h1(), "ring-glow");
    endEvent(document.querySelector("main > section:nth-child(2) h2")!, INTRO_ANIMATION);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    // The h1 ends at 400 ms; the lede is still running.
    animations = [
      { animationName: INTRO_ANIMATION, playState: "finished" },
      { animationName: INTRO_ANIMATION, playState: "running" },
    ];
    endEvent(h1(), INTRO_ANIMATION);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    // The lede ends at 460 ms: nothing of the intro runs, the gate goes.
    animations = [
      { animationName: INTRO_ANIMATION, playState: "finished" },
      { animationName: INTRO_ANIMATION, playState: "finished" },
    ];
    endEvent(lede(), INTRO_ANIMATION);
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    // Once: a later end event and the poll do nothing more.
    html().setAttribute(INTRO_ATTRIBUTE, "sentinel");
    endEvent(lede(), INTRO_ANIMATION);
    vi.advanceTimersByTime(2000);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe("sentinel");
  });

  it("the fallback poll: from the first frame after DOMContentLoaded, every 250 ms, until no intro animation is running or pending", () => {
    readyState = "loading";
    runScript();
    animations = [{ animationName: INTRO_ANIMATION, playState: "idle", pending: true }];
    vi.advanceTimersByTime(1000);
    // Still loading: no poll has run.
    expect(getAnimationsCalls).toBe(0);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    readyState = "interactive";
    document.dispatchEvent(new Event("DOMContentLoaded"));
    vi.advanceTimersByTime(20); // the first frame
    expect(getAnimationsCalls).toBe(1);
    // Pending (a busy main thread at first paint) keeps the gate, as running does.
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    animations = [{ animationName: INTRO_ANIMATION, playState: "running" }];
    vi.advanceTimersByTime(INTRO_POLL_MS);
    expect(getAnimationsCalls).toBe(2);
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    // Another animation running in the hero is not the intro's.
    animations = [
      { animationName: INTRO_ANIMATION, playState: "finished" },
      { animationName: "ring-glow", playState: "running" },
    ];
    vi.advanceTimersByTime(INTRO_POLL_MS);
    expect(getAnimationsCalls).toBe(3);
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(getAnimationsCalls).toBe(3);
  });

  it("no hero in the document: the first poll removes the gate", () => {
    document.body.innerHTML = "<main id='main'><h1>Elsewhere</h1></main>";
    runScript();
    expect(html().getAttribute(INTRO_ATTRIBUTE)).toBe(INTRO_PLAY);
    vi.advanceTimersByTime(20);
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
  });

  it("a browser whose animation list throws loses the gate rather than keeping it", () => {
    runScript();
    Element.prototype.getAnimations = () => {
      throw new TypeError("no");
    };
    vi.advanceTimersByTime(20);
    expect(html().hasAttribute(INTRO_ATTRIBUTE)).toBe(false);
  });
});

describe("the stylesheet's rule (globals.css)", () => {
  const source = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  /** The stylesheet without its comments: the prose mentions the gate too. */
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  /** The `{ … }` block that opens after `from`, by brace matching. */
  const blockAfter = (from: number) => {
    const open = css.indexOf("{", from);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return [open, i + 1] as const;
    }
    throw new Error("unbalanced");
  };
  const gate = `:root[${INTRO_ATTRIBUTE}="${INTRO_PLAY}"] ${HERO_SELECTOR}`;

  it("lives inside one prefers-reduced-motion: no-preference block beside the fan, and nowhere else", () => {
    const mentions = [...css.matchAll(/data-intro/g)].map((m) => m.index!);
    expect(mentions.length).toBeGreaterThan(0);
    const mediaAt = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", mentions[0]);
    expect(mediaAt).toBeGreaterThan(css.indexOf(".home-fan {"));
    const [, end] = blockAfter(mediaAt);
    for (const at of mentions) {
      expect(at).toBeGreaterThan(mediaAt);
      expect(at).toBeLessThan(end);
    }
    // Inside @layer components, like the fan.
    const layerAt = css.lastIndexOf("@layer components", mediaAt);
    expect(blockAfter(layerAt)[1]).toBeGreaterThan(end);
  });

  it("keys the h1 and the lede on the gate: dw-in 400ms on settle-400 from half opacity and 0.3em below, the lede 60ms behind, nothing else", () => {
    const mediaAt = css.lastIndexOf(
      "@media (prefers-reduced-motion: no-preference)",
      css.indexOf("data-intro"),
    );
    const [start, end] = blockAfter(mediaAt);
    const block = css.slice(start, end);
    expect(block).toContain(`${gate} h1,\n    ${gate} h1 + p {`);
    expect(block).toContain(`animation: ${INTRO_ANIMATION} 400ms var(--ease-settle-400) both;`);
    expect(block).toContain("--dw-opacity: 0.5;");
    expect(block).toContain("--dw-y: 0.3em;");
    expect(block).toContain(`${gate} h1 + p {\n      animation-delay: 60ms;`);
    // Two rules, two selectors apiece at most: no fan, no buttons, no filter.
    expect(block.match(/\{/g)).toHaveLength(3);
    expect(block).not.toMatch(/hero-fan|button|filter|blur|scale|rotate/);
    // The keyframes it plays animate opacity and transform only (U2).
    const frames = css.match(
      new RegExp(`@keyframes ${INTRO_ANIMATION} \\{([\\s\\S]*?)\\n  \\}`),
    )?.[1];
    expect(frames).toBeDefined();
    const props = [...frames!.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(["opacity", "transform"]));
  });
});

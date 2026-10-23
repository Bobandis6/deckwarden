/**
 * The home intro's gate (HOME-INTRO, 2026-10-22; DECKCHECK-STUDY.md §2.1):
 * the hero's headline and sentence settle in once per visit, on the first
 * document load of home in a tab, and never on a return. The decision is
 * pure (`introDecision`); the browser side (`introGate`) is serialized into
 * an inline script in the root layout (`introScript`, next-themes' pattern:
 * a function's own source, called with its arguments), so the code that
 * ships is the code the tests run. The script runs during HTML parsing,
 * before the hero is parsed and before first paint, which is what keeps
 * the first painted frame the intro's from-state (no final-state-then-reset
 * flash) and a reload free of the snap the study measured on a
 * hydration-time gate.
 *
 * Rules, in order: off home (the script is in the root layout, so it runs
 * on every document) → skip; reduced motion → skip; the tab has played
 * before (the marker in sessionStorage: one tab's memory, so a new tab
 * plays again and a duplicated tab, which copies the storage, does not) →
 * skip; storage unreadable or unwritable → skip, because an intro the tab
 * cannot remember would replay on every load, the thing the owner asked to
 * avoid. On play the marker is written FIRST, then `data-intro="play"` goes
 * on <html>, and the stylesheet's rule (globals.css, under
 * prefers-reduced-motion: no-preference) animates the hero's h1 and lede.
 * The attribute is removed when the hero's intro animations have ended (an
 * animationend listener; a poll every 250 ms from the first frame after
 * DOMContentLoaded is the fallback, and a pending animation, which is what
 * a busy main thread leaves at first paint, keeps the gate), so a client
 * return, which remounts the hero, finds no gate. Removing it changes
 * nothing on screen: dw-in has no `to` keyframe, so it ends at the
 * elements' own styles.
 *
 * Both functions are self-contained on purpose: `toString()` carries no
 * closure, so neither may read a module constant or another import; the
 * constants travel as arguments, and `intro-gate.test.ts` runs the
 * serialized script itself.
 */

/** The tab's marker: one key, one value. */
export const INTRO_STORAGE_KEY = "deckwarden:intro";
export const INTRO_MARK = "1";
/** The gate on <html> while the intro plays. */
export const INTRO_ATTRIBUTE = "data-intro";
export const INTRO_PLAY = "play";
/** The hero section's slot (src/app/(site)/page.tsx) and the selector the script and the stylesheet share. */
export const HERO_SLOT = "home-hero";
export const HERO_SELECTOR = `[data-slot="${HERO_SLOT}"]`;
/** U2's keyframes, the ones the stylesheet's rule plays (globals.css). */
export const INTRO_ANIMATION = "dw-in";
/** The fallback poll's period. */
export const INTRO_POLL_MS = 250;

export type IntroDecision = "play" | "skip";

export interface IntroInput {
  /** `location.pathname`: the intro belongs to a document load of `/` alone. */
  pathname: string;
  /** The raw sessionStorage value under INTRO_STORAGE_KEY; null when absent. */
  stored: string | null;
  /** `matchMedia("(prefers-reduced-motion: reduce)").matches`. */
  reducedMotion: boolean;
}

/**
 * Play or skip, from the three facts the script reads. Pure, closure-free
 * (its source ships inside the inline script): the marker's value is the
 * literal here, INTRO_MARK above, pinned together in the tests.
 */
export function introDecision(input: IntroInput): IntroDecision {
  if (input.pathname !== "/") return "skip";
  if (input.reducedMotion) return "skip";
  if (input.stored === "1") return "skip";
  return "play";
}

/**
 * The browser side, run once per document during parsing. Closure-free:
 * everything it needs arrives as an argument, and it touches only the
 * globals a browser has. Any failure leaves the page without an intro and
 * without a gate. Its helpers are `const` arrows, not block-level function
 * declarations: the minified source runs in the page as a classic script,
 * and `introScript` prefixes "use strict" so it runs under the semantics it
 * was compiled with (a sloppy block-level function would also leak a `var`,
 * Annex B).
 */
export function introGate(
  decide: (input: IntroInput) => IntroDecision,
  key: string,
  mark: string,
  attribute: string,
  play: string,
  heroSelector: string,
  animationName: string,
  pollMs: number,
): void {
  try {
    const root = document.documentElement;
    let stored: string | null;
    try {
      stored = window.sessionStorage.getItem(key);
    } catch {
      return;
    }
    const decision = decide({
      pathname: window.location.pathname,
      stored,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    if (decision !== "play") return;
    try {
      window.sessionStorage.setItem(key, mark);
    } catch {
      return;
    }
    root.setAttribute(attribute, play);

    let done = false;
    let timer = 0;
    const hero = (): Element | null => document.querySelector(heroSelector);
    const running = (): boolean => {
      const el = hero();
      if (!el) return false;
      const list = el.getAnimations({ subtree: true });
      for (let i = 0; i < list.length; i++) {
        const a = list[i] as CSSAnimation;
        // `pending` is the play-pending state a busy main thread leaves at
        // first paint (the study saw 120 to 220 ms of it at 4x CPU).
        if (a.animationName === animationName && (a.playState === "running" || a.pending)) {
          return true;
        }
      }
      return false;
    };
    const finish = (): void => {
      if (done) return;
      done = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("animationend", onEnd, true);
      root.removeAttribute(attribute);
    };
    const onEnd = (event: AnimationEvent): void => {
      try {
        if (event.animationName !== animationName) return;
        const el = hero();
        if (!el || !el.contains(event.target as Node)) return;
        if (!running()) finish();
      } catch {
        finish();
      }
    };
    const poll = (): void => {
      timer = 0;
      if (done) return;
      try {
        if (running()) {
          timer = window.setTimeout(poll, pollMs);
          return;
        }
      } catch {
        // An animation list the browser cannot give is no reason to keep the gate.
      }
      finish();
    };
    const start = (): void => {
      window.requestAnimationFrame(poll);
    };
    document.addEventListener("animationend", onEnd, true);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch {
    // Nothing: a browser this fails in gets the page without the intro.
  }
}

/**
 * The inline script's text: strict mode, then the two functions' own
 * source, the gate called with the decision and the constants. Rendered by
 * the root layout as the first child of <body>.
 */
export function introScript(): string {
  const args = [
    INTRO_STORAGE_KEY,
    INTRO_MARK,
    INTRO_ATTRIBUTE,
    INTRO_PLAY,
    HERO_SELECTOR,
    INTRO_ANIMATION,
    INTRO_POLL_MS,
  ]
    .map((value) => JSON.stringify(value))
    .join(",");
  return `"use strict";(${introGate.toString()})(${introDecision.toString()},${args})`;
}

/**
 * Entrance on a fresh tab starting on Home, or a browser refresh of Home.
 * Runs from the root layout during parsing, independently of React mounts.
 * The default HTML/CSS is the existing static trio. Only this pre-paint gate
 * can hide it, and both a deadline and CSS fail-open restore that default.
 */
export const CARD_SESSION_KEY = "deckwarden:hero-session";
export const CARD_ENTRANCE_ATTRIBUTE = "data-card-entrance";
export const CARD_READY_MS = 1500;
/** 43.75% of the original speed: halfway between 62.5% and 25%, totaling 1.6 s. */
export const CARD_DURATION_MS = 600 / 0.4375;
export const CARD_STAGGER_MS = 50 / 0.4375;

export interface CardEntranceInput {
  pathname: string;
  stored: string | null;
  reducedMotion: boolean;
  navigationType?: string;
}

/** A refresh explicitly replays; existing markers still block navigation returns. */
export function cardEntranceEligible(input: CardEntranceInput): boolean {
  return (
    input.pathname === "/" &&
    !input.reducedMotion &&
    input.navigationType !== "back_forward" &&
    (input.navigationType === "reload" || input.stored === null)
  );
}

/** Closure-free: its compiled source is also what the browser and tests execute. */
export function cardEntranceGate(
  eligible: (input: CardEntranceInput) => boolean,
  key: string,
  attribute: string,
  readyMs: number,
  duration: number,
  stagger: number,
): void {
  const root = document.documentElement;
  let finish = (): void => root.removeAttribute(attribute);
  try {
    const stored = window.sessionStorage.getItem(key);
    // Mark EVERY first document, including non-Home and reduced-motion visits,
    // before any feature checks. An unreadable/unwritable store stays static.
    if (stored === null) window.sessionStorage.setItem(key, "1");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (
      !eligible({
        pathname: location.pathname,
        stored,
        reducedMotion: preference.matches,
        navigationType: navigation?.type,
      }) ||
      document.visibilityState === "hidden" ||
      typeof Element.prototype.animate !== "function" ||
      typeof HTMLImageElement.prototype.decode !== "function"
    ) {
      return;
    }

    let done = false;
    let fan: Element | null = null;
    let timer = 0;
    const animations: Animation[] = [];
    const observer = new MutationObserver(() => {
      try {
        if (location.pathname !== "/" || (fan && !fan.isConnected)) finish();
        else discover();
      } catch {
        finish();
      }
    });
    const onLeave = (): void => finish();
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") finish();
    };
    const onPreference = (): void => {
      if (preference.matches) finish();
    };
    const onClick = (event: MouseEvent): void => {
      // Cancel before a same-tab link navigation, including the Home logo.
      // Modified/new-tab clicks don't interrupt the current document.
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link || link.download || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.hash) return;
      finish();
    };
    finish = (): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("popstate", onLeave);
      preference.removeEventListener("change", onPreference);
      root.removeAttribute(attribute);
      // No inline transforms or fill effects survive; the original CSS owns
      // the exact final perspective and remains responsive after resizing.
      animations.forEach((animation) => animation.cancel());
    };
    const discover = (): void => {
      if (done || fan) return;
      const candidate = document.querySelector('[data-slot="hero-fan"]');
      // Streaming/parser delivery can expose the parent before its children.
      if (!candidate || candidate.children.length < 3) return;
      fan = candidate;
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, readyMs);
      const cards = Array.from(fan.children);
      if (cards.length !== 3 || cards.some((card) => !(card instanceof HTMLImageElement))) {
        finish();
        return;
      }
      const images = cards as HTMLImageElement[];
      // decode() includes load, cached images, and decode readiness. Any missing
      // or failed image abandons the whole sequence, never moving empty boxes.
      void Promise.all(images.map((img) => img.decode())).then(() => {
        if (done) return;
        try {
          if (
            !fan?.isConnected ||
            location.pathname !== "/" ||
            preference.matches ||
            images.some((img) => !img.naturalWidth)
          ) {
            finish();
            return;
          }
          const easing = getComputedStyle(root).getPropertyValue("--ease-settle-400").trim();
          if (!easing) {
            finish();
            return;
          }
          images.forEach((img, index) => {
            const base = getComputedStyle(img).transform;
            const perspective = base === "none" ? "" : base;
            // A shallow quadratic swoop sampled along its distance, with a
            // small early roll that is gone before the final descent. The
            // house settle curve eases the WHOLE path, not each waypoint.
            const frames = [
              [-6, -12, -1.5],
              [-2.25, -6.75, -2.5],
              [0, -3, -1],
              [0.75, -0.75, 0],
              [0, 0, 0],
            ].map(([x, y, roll], step) => ({
              offset: step / 4,
              transform: `translate(${x}%, ${y}%) rotate(${roll}deg) ${perspective}`.trim(),
            }));
            animations.push(
              img.animate(frames, {
                duration,
                delay: index * stagger,
                easing,
                fill: "both",
              }),
              img.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: duration / 5,
                delay: index * stagger,
                easing: "linear",
                fill: "both",
              }),
            );
          });
          // Install every from-state BEFORE removing pre-paint concealment.
          root.setAttribute(attribute, "playing");
          window.clearTimeout(timer);
          timer = window.setTimeout(finish, duration + stagger * 2 + 250);
          void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
        } catch {
          finish();
        }
      }, finish);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("popstate", onLeave);
    preference.addEventListener("change", onPreference);
    observer.observe(document.body, { childList: true, subtree: true });
    // A document that never delivers a trio must not keep the gate alive.
    timer = window.setTimeout(finish, 5000);
    root.setAttribute(attribute, "pending");
    discover();
  } catch {
    finish();
  }
}

export function cardEntranceScript(): string {
  const args = [
    CARD_SESSION_KEY,
    CARD_ENTRANCE_ATTRIBUTE,
    CARD_READY_MS,
    CARD_DURATION_MS,
    CARD_STAGGER_MS,
  ].map((value) => JSON.stringify(value));
  return `"use strict";(${cardEntranceGate.toString()})(${cardEntranceEligible.toString()},${args.join(",")})`;
}

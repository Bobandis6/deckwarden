/**
 * The theme switch's reveal (VIEW-TRANSITIONS, 2026-11-02; the owner's pick
 * from DESIGN-REFERENCES-2026-11-02.md, idea 2; the reference is Design
 * Spells 146, HackerRank's ripple). A theme change has an origin: instead
 * of every element easing its own colors, or the page snapping, the new
 * theme sweeps out as a circle from the control that chose it. The sweep
 * is the browser's View Transitions API: `revealThemeChange` writes the
 * origin and the covering radius as `--reveal-*` on <html>, flags it with
 * `data-theme-reveal` (globals.css keys the clip-path keyframes on the
 * flag, so a navigation's view transition is never clipped) and runs the
 * flip inside document.startViewTransition. The flip itself is next-themes'
 * (`setTheme`), which applies the class in an effect, so the update
 * callback resolves when <html>'s class actually changed (a
 * MutationObserver) or after 300 ms, whichever comes first; the browser
 * snapshots the new page only then.
 *
 * Plain flip, no transition: no origin (a pick that changes nothing on
 * screen, like System while the system is already dark), a browser without
 * the API, or a reader who asked for reduced motion (the motion policy: the
 * change stays understandable without motion, and an instant flip is what
 * the site had before U8). This replaced U8's eased body background, which
 * could only ease the canvas: easing the inherited text color restyled
 * every element on every frame (REDESIGN.md "U8 decisions"), where one
 * composited reveal costs a snapshot.
 */

export interface RevealOrigin {
  /** Viewport coordinates, px. */
  x: number;
  y: number;
}

/** The flag on <html> while a reveal runs; its value is the reveal's serial. */
export const REVEAL_ATTRIBUTE = "data-theme-reveal";
/** The update callback's backstop, should the class never change (ms). */
export const REVEAL_SETTLE_TIMEOUT_MS = 300;
/**
 * The flag's backstop (ms): the sweep is 400 ms, and the flag must never
 * outlive it, since a navigation's view transition under the flag would be
 * clipped to the old origin. `finished` clears it; this clears it if the
 * browser never settles the promise (a tab hidden mid-sweep, a skipped
 * transition that neither resolved nor rejected).
 */
export const REVEAL_CLEANUP_TIMEOUT_MS = 1200;

/** The radius of the circle centred on `origin` that covers a width x height viewport. */
export function revealRadius(origin: RevealOrigin, width: number, height: number): number {
  return Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y));
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let revealSerial = 0;

/**
 * Flips the theme through `apply`, inside a view transition clipped to a
 * circle growing from `origin` when one can run. Returns which path ran.
 */
export function revealThemeChange(
  apply: () => void,
  origin: RevealOrigin | null,
): "revealed" | "plain" {
  if (
    !origin ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function" ||
    prefersReducedMotion()
  ) {
    apply();
    return "plain";
  }
  const root = document.documentElement;
  const token = String(++revealSerial);
  const radius = Math.ceil(revealRadius(origin, window.innerWidth, window.innerHeight));
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);
  root.setAttribute(REVEAL_ATTRIBUTE, token);
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const settle = () => {
          observer.disconnect();
          clearTimeout(timer);
          // Lay the whole document out while next-themes' one-frame
          // `transition: none` is still in the head (it leaves on a timer):
          // rendering is paused inside this callback, so without this the
          // first style pass after the flip would come after that style is
          // gone and start every control's 120 ms color transition inside the
          // sweep (97 of them on a hub, read in headless Chrome).
          void root.offsetHeight;
          resolve();
        };
        const observer = new MutationObserver(settle);
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        const timer = setTimeout(settle, REVEAL_SETTLE_TIMEOUT_MS);
        apply();
      }),
  );
  const cleanUp = () => {
    clearTimeout(backstop);
    // A later reveal owns the flag now; leave its origin alone.
    if (root.getAttribute(REVEAL_ATTRIBUTE) !== token) return;
    root.removeAttribute(REVEAL_ATTRIBUTE);
    for (const name of ["--reveal-x", "--reveal-y", "--reveal-r"]) root.style.removeProperty(name);
  };
  const backstop = setTimeout(cleanUp, REVEAL_CLEANUP_TIMEOUT_MS);
  transition.finished.then(cleanUp, cleanUp);
  return "revealed";
}

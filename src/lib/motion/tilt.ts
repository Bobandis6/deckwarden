/**
 * The card tilt (CARD-TILT, 2026-11-03; DESIGN-REFERENCES-2026-11-02.md
 * idea 3, after Aceternity's "3D Card Effect", its pointer-following
 * rotation and nothing else: no floating layers, and no glare, which would
 * read as foil on a printing that isn't). A card turns a few degrees toward
 * a fine pointer the way a card on a table answers a fingertip: the edge
 * under the pointer goes back, the far edge comes up, and the grounded
 * shadow slides up to 4 px toward the raised side. Three homes: the home
 * hero trio and the hub hero (6°), the editor's leader card (4°).
 *
 * `attachTilt` sets `data-tilt` and four inline custom properties on the
 * card, nothing else: `--tilt-x` and `--tilt-y` (degrees about each axis)
 * for globals.css's `[data-tilt]` transform, `--tilt-dx` and `--tilt-dy`
 * (the shadow's offset in px) for the card's box-shadow. One write per
 * pointer event, which browsers deliver once a frame; CardImage's 120 ms
 * transform and box-shadow transitions on settle-120 do the smoothing, so
 * the card lags the hand by a frame and reads as weight. No React state, no
 * frame loop.
 *
 * The pointer is read on a surface that never turns (the card's parent: the
 * stage, the hub's wrapper, the leader's button) against the card's
 * untransformed box. A card listening on itself would lose the pointer at
 * the edge it tips away, snap back, find it again, and shake.
 *
 * Fine pointers only, never under reduced motion: with a coarse primary
 * pointer or the preference on, nothing attaches and the card keeps its
 * static pose, and turning the preference on later lets go at once. A
 * touch on a hybrid device, a held button and a running view transition
 * leave the card at rest; a press rests it, so the hub hero is square when
 * a click starts its morph.
 */

/** The hero trio on home and the hub hero on /c/ and /l/. */
export const HERO_TILT_DEG = 6;
/** The editor's leader card: a working surface, so less. */
export const LEADER_TILT_DEG = 4;
/** The shadow's slide at the edge, in px. */
export const TILT_SHADOW_PX = 4;

export interface TiltBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Degrees about each axis (`x` tips the top and bottom edges, `y` the sides) and the shadow's offset in px. */
export interface Tilt {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const PROPERTIES = ["--tilt-x", "--tilt-y", "--tilt-dx", "--tilt-dy"] as const;
/** What puts the card back square at once: the pointer leaving, a press, a cancelled pointer. */
const REST_EVENTS = ["pointerleave", "pointerdown", "pointercancel"] as const;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));
/** Two decimals, so an unchanged hundredth writes an unchanged value; never -0. */
const round = (value: number) => Math.round(value * 100) / 100 || 0;

/**
 * The tilt for a pointer over a card's box: linear from the centre (square)
 * to the edges (`maxDeg`), clamped. CSS's rotateY(+) sends the right edge
 * back and rotateX(+) brings the bottom edge forward, so a pointer at the
 * right turns +y and a pointer at the bottom turns -x. The shadow slides
 * the other way, toward the edge that came up.
 */
export function tiltFor(pointer: { x: number; y: number }, box: TiltBox, maxDeg: number): Tilt {
  if (!(box.width > 0 && box.height > 0)) return { x: 0, y: 0, dx: 0, dy: 0 };
  const nx = clamp(((pointer.x - box.left) / box.width) * 2 - 1);
  const ny = clamp(((pointer.y - box.top) / box.height) * 2 - 1);
  return {
    x: round(-ny * maxDeg),
    y: round(nx * maxDeg),
    dx: round(-nx * TILT_SHADOW_PX),
    dy: round(-ny * TILT_SHADOW_PX),
  };
}

/**
 * The card's untransformed box in the viewport. A surface holding several
 * cards (the stage) is their offset parent, so each card's own layout box
 * comes from its offsets, which no transform moves; a surface wrapping one
 * card (the leader's button) is that card's box.
 */
function cardBox(card: HTMLElement, surface: HTMLElement): TiltBox {
  const frame = surface.getBoundingClientRect();
  if (card.offsetParent !== surface) return frame;
  return {
    left: frame.left + surface.clientLeft + card.offsetLeft,
    top: frame.top + surface.clientTop + card.offsetTop,
    width: card.offsetWidth,
    height: card.offsetHeight,
  };
}

/** A view transition is running (the hub hero can be a morph's end): the card stays square under it. */
function inViewTransition(): boolean {
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    // A browser that can't parse the selector: nothing to wait for.
    return false;
  }
}

const noop = () => {};

/**
 * Turns `card` toward a fine pointer moving over `surface` (the card's
 * parent unless named) by up to `maxDeg`, and returns the detach, which
 * leaves the card as it was found. Without a fine primary pointer, or with
 * reduced motion on, it attaches nothing and returns a no-op.
 */
export function attachTilt(
  card: HTMLElement,
  { maxDeg, surface = card.parentElement }: { maxDeg: number; surface?: HTMLElement | null },
): () => void {
  if (!surface || typeof window.matchMedia !== "function") return noop;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches || !window.matchMedia("(pointer: fine)").matches) return noop;

  let tilted = false;
  let attached = true;
  const rest = (): void => {
    if (!tilted) return;
    tilted = false;
    for (const name of PROPERTIES) card.style.removeProperty(name);
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0 || inViewTransition()) {
      rest();
      return;
    }
    const box = cardBox(card, surface);
    const { clientX: x, clientY: y } = event;
    if (x < box.left || y < box.top || x > box.left + box.width || y > box.top + box.height) {
      rest();
      return;
    }
    const tilt = tiltFor({ x, y }, box, maxDeg);
    tilted = true;
    card.style.setProperty("--tilt-x", `${tilt.x}deg`);
    card.style.setProperty("--tilt-y", `${tilt.y}deg`);
    card.style.setProperty("--tilt-dx", `${tilt.dx}px`);
    card.style.setProperty("--tilt-dy", `${tilt.dy}px`);
  };
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    surface.removeEventListener("pointermove", onMove);
    for (const type of REST_EVENTS) surface.removeEventListener(type, rest);
    reduced.removeEventListener("change", onPreference);
    rest();
    card.removeAttribute("data-tilt");
  };
  const onPreference = (): void => {
    if (reduced.matches) detach();
  };

  card.setAttribute("data-tilt", "");
  surface.addEventListener("pointermove", onMove);
  for (const type of REST_EVENTS) surface.addEventListener(type, rest);
  reduced.addEventListener("change", onPreference);
  return detach;
}

/**
 * The ambient layer (R2, REDESIGN.md §3): nothing before hydration or
 * without a leader; the gradient alone for every artless state (Off
 * included — the gradient stays); the crop invisible until it loads, then
 * the credit chip in the same component, the veil, and the gradient
 * yielding; a failed load falling back to the gradient with no chip; the
 * crossfade keeping the previous crop for 250 ms and dropping it at once
 * under reduced motion; the layer inert and hidden from assistive tech.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardArt } from "@/lib/cards/art";
import { AmbientArt, ambientGradient } from "./ambient-art";

const ON = { backgroundArt: true };
const OFF = { backgroundArt: false };
const MANA = ["var(--mana-w)", "var(--mana-u)"];

function art(url: string, artist = "Anna Podedworna"): CardArt {
  return { url, layout: "art_crop", artist, credit: `Art: ${artist} · ™ & © Wizards of the Coast` };
}

const layer = () => document.querySelector('[data-slot="ambient-art"]');
const gradient = () => document.querySelector<HTMLElement>('[data-slot="ambient-gradient"]');
const crops = () => document.querySelectorAll<HTMLImageElement>('[data-slot="ambient-crop"]');
const chip = () => document.querySelector('[data-slot="art-credit"]');
const veil = () => document.querySelector('[data-slot="ambient-veil"]');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AmbientArt", () => {
  it("renders nothing before hydration (appearance unknown) and nothing without a leader", () => {
    const { rerender, container } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={null} />,
    );
    expect(container.innerHTML).toBe("");
    rerender(<AmbientArt art={null} swatches={null} appearance={ON} />);
    expect(container.innerHTML).toBe("");
  });

  it("a leader without art paints the gradient from the swatches: no crop, no chip, no veil", () => {
    render(<AmbientArt art={null} swatches={MANA} appearance={ON} />);
    expect(layer()?.getAttribute("aria-hidden")).toBe("true");
    expect(layer()?.className).toContain("pointer-events-none");
    expect(layer()?.className).toContain("-z-10");
    expect(gradient()?.style.backgroundImage).toBe(ambientGradient(MANA));
    expect(gradient()?.style.backgroundImage).toContain("var(--mana-w)");
    expect(gradient()?.className).toContain("opacity-[0.04] dark:opacity-[0.08]");
    expect(crops()).toHaveLength(0);
    expect(chip()).toBeNull();
    expect(veil()).toBeNull();
  });

  it("Off keeps the gradient and drops the crop and the chip together", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    expect(crops()).toHaveLength(1);
    rerender(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={OFF} />,
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(crops()).toHaveLength(0);
    expect(chip()).toBeNull();
    expect(gradient()).toBeTruthy();
    expect(gradient()?.className).not.toContain("opacity-0");
  });

  it("the crop stays invisible until it loads, then the chip, the veil and the fade-in appear and the gradient yields", () => {
    render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    const img = crops()[0];
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("fetchpriority")).toBe("low");
    expect(img.dataset.loaded).toBe("false");
    expect(img.className).toContain("opacity-0");
    expect(chip()).toBeNull();
    expect(veil()).toBeNull();
    expect(gradient()?.className).not.toContain("opacity-0");

    fireEvent.load(img);
    expect(img.dataset.loaded).toBe("true");
    expect(img.className).toContain("opacity-[0.04] dark:opacity-[0.08]");
    expect(img.className).toContain("motion-safe:animate-in motion-safe:fade-in-0");
    expect(img.className).toContain("object-cover");
    expect(chip()?.textContent).toBe("Art: Anna Podedworna · ™ & © Wizards of the Coast");
    expect(chip()?.closest("[tabindex]")).toBeNull();
    expect(veil()).toBeTruthy();
    expect(gradient()?.className).toContain("opacity-0");
  });

  it("a crop that fails to load falls back to the gradient with no chip", () => {
    render(
      <AmbientArt art={art("https://cards.scryfall.io/404.jpg")} swatches={MANA} appearance={ON} />,
    );
    fireEvent.error(crops()[0]);
    expect(crops()).toHaveLength(0);
    expect(chip()).toBeNull();
    expect(gradient()?.className).not.toContain("opacity-0");
  });

  it("swapping crops crossfades: the previous one leaves after 250 ms, the new one fades in on load", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    fireEvent.load(crops()[0]);
    rerender(
      <AmbientArt
        art={art("https://cards.scryfall.io/b.jpg", "Someone Else")}
        swatches={MANA}
        appearance={ON}
      />,
    );
    const shown = crops();
    expect(shown).toHaveLength(2);
    expect(shown[0].dataset.leaving).toBe("true");
    expect(shown[0].className).toContain("motion-safe:animate-out motion-safe:fade-out-0");
    expect(shown[0].className).toContain("motion-reduce:opacity-0");
    expect(shown[1].getAttribute("src")).toBe("https://cards.scryfall.io/b.jpg");
    expect(chip()).toBeNull(); // the replacement is not on screen yet
    fireEvent.load(shown[1]);
    expect(chip()?.textContent).toContain("Someone Else");
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(crops()).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(crops()).toHaveLength(1);
    expect(crops()[0].getAttribute("src")).toBe("https://cards.scryfall.io/b.jpg");
  });

  it("reduced motion drops the previous crop at once and the art still appears", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.useFakeTimers();
    const { rerender } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    fireEvent.load(crops()[0]);
    rerender(
      <AmbientArt art={art("https://cards.scryfall.io/b.jpg")} swatches={MANA} appearance={ON} />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(crops()).toHaveLength(1);
    fireEvent.load(crops()[0]);
    expect(crops()[0].dataset.loaded).toBe("true");
    expect(chip()).toBeTruthy();
  });

  it("removing the last leader clears everything after the fade", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    fireEvent.load(crops()[0]);
    rerender(<AmbientArt art={null} swatches={null} appearance={ON} />);
    expect(crops()[0].dataset.leaving).toBe("true");
    expect(chip()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.innerHTML).toBe("");
  });

  it("ambientGradient centers one swatch and spreads several", () => {
    expect(ambientGradient(["#f9a825"])).toBe(
      "radial-gradient(ellipse 90% 80% at 50% 40%, #f9a825 0%, transparent 70%)",
    );
    expect(ambientGradient(["#d32f2f", "#f9a825"]).split("radial-gradient")).toHaveLength(3);
  });
});

describe("AmbientArt creditInset (R4)", () => {
  it("lifts the chip by the given length; nothing inline without it", () => {
    const { rerender } = render(
      <AmbientArt art={art("https://cards.scryfall.io/a.jpg")} swatches={MANA} appearance={ON} />,
    );
    fireEvent.load(crops()[0]);
    const plain = chip() as HTMLElement;
    expect(plain.style.bottom).toBe("");
    expect(plain.className).toContain("bottom-2");
    rerender(
      <AmbientArt
        art={art("https://cards.scryfall.io/a.jpg")}
        swatches={MANA}
        appearance={ON}
        creditInset="calc(var(--editor-bottom-inset, 0px) + 0.5rem)"
      />,
    );
    expect((chip() as HTMLElement).style.bottom).toBe(
      "calc(var(--editor-bottom-inset, 0px) + 0.5rem)",
    );
  });
});

/**
 * The root layout (U8, WAVE5.md D3): "Skip to content" is the first
 * FOCUSABLE in <body> — before the theme provider and every page's shell,
 * editor routes included. Since HOME-INTRO (2026-10-22) one inline script
 * stands before it: the home intro's pre-paint gate, which runs during
 * parsing and is not focusable. next/font only works under Next's compiler;
 * the three faces are stand-ins here.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { introScript } from "@/lib/home/intro-gate";

vi.mock("next/font/google", () => {
  const face = (name: string) => () => ({ variable: `font-${name}`, className: name });
  return { Geist: face("geist"), Geist_Mono: face("geist-mono"), Literata: face("literata") };
});

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  it("renders Skip to content as the first focusable in body, before any page's header", () => {
    const html = renderToStaticMarkup(
      RootLayout({
        params: Promise.resolve({}),
        children: (
          <>
            <header>
              <button type="button">Menu</button>
            </header>
            <main id="main">Page</main>
          </>
        ),
      }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const focusables = doc.body.querySelectorAll("a[href], button, input, select, textarea");
    expect(focusables[0].textContent).toBe("Skip to content");
    expect(focusables[0].getAttribute("href")).toBe("#main");
    expect(doc.getElementById("main")).not.toBeNull();
  });

  it("the home intro's gate is the first child of body — an inline script, before Skip to content, which stays the first focusable (HOME-INTRO)", () => {
    const html = renderToStaticMarkup(
      RootLayout({ params: Promise.resolve({}), children: <main id="main">Page</main> }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const first = doc.body.firstElementChild!;
    expect(first.tagName).toBe("SCRIPT");
    expect(first.getAttribute("src")).toBeNull();
    expect(first.textContent).toBe(introScript());
    expect(first.nextElementSibling?.textContent).toBe("Skip to content");
    const focusables = doc.body.querySelectorAll("a[href], button, input, select, textarea");
    expect(focusables[0].textContent).toBe("Skip to content");
  });
});

/**
 * The root layout (U8, WAVE5.md D3): "Skip to content" is the first
 * FOCUSABLE in <body> — before the theme provider and every page's shell,
 * editor routes included. Since HOME-INTRO (2026-10-22) one inline script
 * stands before it: the home intro's pre-paint gate, which runs during
 * parsing and is not focusable. Since LATER.md row 313 (2026-10-24) the
 * last element the layout renders in <body> is Cloudflare Web Analytics'
 * snippet, as Cloudflare issued it, from a host the enforcing CSP allows
 * (in a served page only Next's own scripts follow it). next/font only
 * works under Next's compiler; the three faces are stand-ins here.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { introScript } from "@/lib/home/intro-gate";

import nextConfig from "../../next.config";

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

  it("carries Cloudflare's Web Analytics snippet once, as the last element it renders in body, from a host the CSP allows (LATER 313)", async () => {
    const html = renderToStaticMarkup(
      RootLayout({ params: Promise.resolve({}), children: <main id="main">Page</main> }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const beacons = doc.querySelectorAll("script[data-cf-beacon]");
    expect(beacons).toHaveLength(1);
    const beacon = doc.body.lastElementChild!;
    expect(beacon).toBe(beacons[0]);
    // The snippet as issued: a module script (deferred), the public site token.
    expect(beacon.getAttribute("type")).toBe("module");
    expect(beacon.getAttribute("src")).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(JSON.parse(beacon.getAttribute("data-cf-beacon")!)).toEqual({
      token: "d20931217390412fba404d4cc52f17dd",
    });
    expect(beacon.textContent).toBe("");
    // The enforcing policy names the beacon's host, so the browser loads it.
    const [siteWide] = await nextConfig.headers!();
    const csp = siteWide.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    const scriptSrc = csp
      .split("; ")
      .find((directive) => directive.startsWith("script-src "))!
      .split(" ");
    expect(scriptSrc).toContain(new URL(beacon.getAttribute("src")!).origin);
  });
});

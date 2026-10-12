"use client";

/**
 * Skip to content (U8, WAVE5.md D3): the first focusable on every page (the
 * root layout renders it before anything else), hidden until it takes focus.
 * Its target is the page's `<main id="main">`: every page renders exactly one
 * (skip-link.test.tsx scans the tree for it), and the editor's is its panes
 * (EditorLayout), so the editor routes get the link too.
 *
 * The plain fragment works before hydration. Once hydrated, a click (Enter
 * on the focused link) moves focus INTO main through a tabindex="-1" that
 * leaves again on blur, so main never joins the tab order and a mouse click
 * inside it never focuses it; the next Tab lands on main's first control.
 * The default is prevented then, so the URL keeps no "#main" (and Next's
 * router sees no hash change).
 */
import type { MouseEvent } from "react";

/** The id every page's `<main>` carries, written as a literal there (a server page can't read a constant from this client module). */
const MAIN_ID = "main";

function focusMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById(MAIN_ID);
  if (!main) return;
  event.preventDefault();
  if (!main.hasAttribute("tabindex")) {
    main.setAttribute("tabindex", "-1");
    main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
  }
  main.focus();
}

export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={focusMain}
      className="type-label bg-background text-foreground focus-visible:ring-ring/50 sr-only rounded-lg border-(--border-control) outline-none focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:inline-flex focus:h-8 focus:items-center focus:border focus:px-3 focus-visible:ring-3"
    >
      Skip to content
    </a>
  );
}

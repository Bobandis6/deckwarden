/**
 * The site header's nav-link style (R1b), in a plain module so the server
 * shell (site-header.tsx) and the client islands (site-nav.tsx) share one
 * string — a "use client" module's exports are client references, not
 * values, on the server side.
 *
 * U8 (WAVE5.md D3): the entry that names the open page carries
 * `aria-current="page"` (site-nav.tsx decides which) and comes forward the
 * way a hover does, in the foreground ink; the labels never change.
 */
export const navLinkClass =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex h-8 items-center rounded-md px-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 aria-expanded:bg-muted aria-expanded:text-foreground aria-[current=page]:text-foreground pointer-coarse:h-11 pointer-coarse:px-3";

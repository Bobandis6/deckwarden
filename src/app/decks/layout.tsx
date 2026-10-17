/**
 * The /decks layout (the owner's call of 2026-10-17, amending REDESIGN.md
 * §2): the site header stands on every page, the editor routes included.
 * `/decks/new` (the picker and the draft editor behind `?game=`) and
 * `/decks/[id]/edit` sit outside the (site) group for the editor's sake —
 * no site footer under a workspace, the editor's own viewport export — so
 * this layout is where their header comes from. One header per page: the
 * picker, the fallback and the editor no longer render one of their own,
 * and the editor's workspace bar keeps only the deck's controls (the mark
 * and the appearance menu live up here now).
 *
 * The editor's root is the viewport minus this header (`--site-header-height`
 * in globals.css mirrors SiteHeader's `h-14` row and its hairline), so the
 * document never scrolls under the workspace and the header stays put.
 *
 * Plain and synchronous, like the (site) layout: no headers(), cookies()
 * or searchParams here — /decks/new is a static shell and must stay one.
 *
 * Caching intent: inert — each page keeps its own mode (/decks/new static,
 * /decks/[id]/edit force-dynamic).
 */
import { SiteHeader } from "@/components/site-header";

export default function DecksLayout({ children }: LayoutProps<"/decks">) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}

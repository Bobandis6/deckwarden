/**
 * SiteHeader (R1b, REDESIGN.md §2 "Site shell"): the shell every (site)
 * page stands in — the mark → home, Build, Browse (Commanders · Leaders ·
 * Cards), My decks, the account slot, the appearance menu. Since 2026-10-17
 * the editor routes stand under it too — decks/layout.tsx renders it above
 * /decks/new and /decks/[id]/edit — with the editor's workspace bar (R3)
 * below it holding the deck's controls only; nothing renders it twice.
 *
 * Server shell, client islands. The shell is static markup, so it can sit
 * in the (site) layout without touching request data: the account slot
 * (AccountSlot) reads the session CLIENT-side through the Better Auth
 * client, and the server HTML always carries the signed-out shape. It is the
 * only island that does since X1 — My decks is /account for everyone.
 * headers() or cookies() anywhere in this tree would make /c/, /l/ and
 * the event pages dynamic again — LATER row 71's ISR fix is the yardstick this
 * header is measured against.
 *
 * Phones (< md): the nav links collapse into one Base UI Menu behind a
 * MenuIcon trigger (MobileNavMenu), which since HEADER-SEARCH also holds the
 * Appearance items: the appearance trigger hides below md and its 44 px
 * slot goes to the card search button, so the account slot, the search
 * button and the Menu stay inline. The mark tilts 3° on hover (F13),
 * motion-safe only. Below 360 px the wordmark steps aside and the mark
 * stands alone, as in the phone editor's header (the link keeps its
 * aria-label and a 44 px target): with it the guest row (mark, Sign in,
 * then Appearance, now the search button, and Menu) needs 324 px of a
 * 320 px screen's 288 and scrolled every page 20 px sideways (LATER row
 * 250). Measured with the search button in Appearance's place (2026-10-24,
 * 390 px, touch): the wordmark row is 147.8 px and the cluster 159.7, so
 * the row is 355.5 px, which fits from 360 px with 4.5 px to spare, as
 * before. Keeping Appearance inline beside the button made it 403.5 px,
 * so the wordmark would have had to go on every phone up to 416 px.
 *
 * U8: Build, Browse and My decks are client islands so they can read the
 * path (usePathname — not request data) and mark the open page with
 * `aria-current="page"`. The wordmark keeps its own type (WAVE5.md D3).
 *
 * HEADER-SEARCH (2026-10-24): HeaderSearch opens the right-hand cluster —
 * the card search box from md up (the cluster grows into the row's free
 * space and keeps its controls at the right edge), the search button below
 * md. The phone's search row is laid over this row (`relative` is its
 * frame), and while it is open this row's own children are hidden (the
 * `:has` rule; the search row inside the cluster sets itself visible), so
 * nothing shifts and Tab never reaches a control under it. It reads no
 * request data either.
 */
import Link from "next/link";

import { AccountSlot } from "@/components/auth/account-slot";
import { BrandMark } from "@/components/brand-mark";
import { HeaderSearch } from "@/components/search/header-search";
import { BrowseMenu, BuildLink, MobileNavMenu, MyDecksLink } from "@/components/site-nav";
import { navLinkClass } from "@/components/site-nav-link";
import { AppearanceMenu } from "@/components/theme/appearance-menu";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="relative mx-auto flex h-14 w-full max-w-wide items-center gap-2 px-4 max-md:[&:has([data-search-open])>*]:invisible">
        <Link
          href="/"
          aria-label="Deckwarden"
          className="group/mark focus-visible:ring-ring/50 mr-2 flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
        >
          <BrandMark className="size-8 motion-safe:transition-transform motion-safe:duration-[120ms] motion-safe:group-hover/mark:-rotate-3" />
          <span className="font-display text-lg font-semibold tracking-tight max-[360px]:hidden">
            Deckwarden
          </span>
        </Link>

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          <BuildLink className={navLinkClass} />
          <BrowseMenu />
          <MyDecksLink className={navLinkClass} />
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1">
          <HeaderSearch />
          <AccountSlot />
          <AppearanceMenu className="max-md:hidden" />
          <MobileNavMenu />
        </div>
      </div>
    </header>
  );
}

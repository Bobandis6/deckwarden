/**
 * SiteHeader (R1b, REDESIGN.md §2 "Site shell"): the shell every (site)
 * page stands in — the mark → home, Build, Browse (Commanders · Leaders ·
 * Cards), My decks, the account slot, the appearance menu. The editor
 * routes keep their own workspace header (R3 builds the real one) and never
 * render this; the /decks/new picker renders it itself.
 *
 * Server shell, client islands. The shell is static markup, so it can sit
 * in the (site) layout without touching request data: the account slot
 * (AccountSlot) and the My decks target (MyDecksLink) read the session
 * CLIENT-side through the Better Auth client, and the server HTML always
 * carries the signed-out shape. headers() or cookies() anywhere in this
 * tree would make /c/, /l/ and /cards/[id] dynamic again — LATER row 69's
 * ISR fix is the yardstick this header is measured against.
 *
 * Phones (< md): the nav links collapse into one Base UI Menu behind a
 * MenuIcon trigger (MobileNavMenu); the account slot and appearance menu
 * stay inline. The mark tilts 3° on hover (F13), motion-safe only.
 */
import Link from "next/link";

import { AccountSlot } from "@/components/auth/account-slot";
import { BrandMark } from "@/components/brand-mark";
import { BrowseMenu, MobileNavMenu, MyDecksLink } from "@/components/site-nav";
import { navLinkClass } from "@/components/site-nav-link";
import { AppearanceMenu } from "@/components/theme/appearance-menu";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-wide items-center gap-2 px-4">
        <Link
          href="/"
          aria-label="Deckwarden"
          className="group/mark focus-visible:ring-ring/50 mr-2 flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
        >
          <BrandMark className="size-7 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover/mark:-rotate-3" />
          <span className="text-sm font-semibold tracking-tight">Deckwarden</span>
        </Link>

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          <Link href="/decks/new" className={navLinkClass}>
            Build
          </Link>
          <BrowseMenu />
          <MyDecksLink className={navLinkClass} />
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <AccountSlot />
          <AppearanceMenu />
          <MobileNavMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * SiteHeader (R1b, REDESIGN.md §2 "Site shell"): the shell every (site)
 * page stands in — the mark → home, Build, Browse (Commanders · Leaders ·
 * Cards), My decks, the account slot, the appearance menu. The editor
 * routes keep their own workspace header (R3 builds the real one) and never
 * render this; the /decks/new picker renders it itself.
 *
 * Server shell, client islands. The shell is static markup, so it can sit
 * in the (site) layout without touching request data: the account slot
 * (AccountSlot) reads the session CLIENT-side through the Better Auth
 * client, and the server HTML always carries the signed-out shape. It is the
 * only island that does since X1 — My decks is /account for everyone.
 * headers() or cookies() anywhere in this tree would make /c/, /l/ and
 * /cards/[id] dynamic again — LATER row 69's ISR fix is the yardstick this
 * header is measured against.
 *
 * Phones (< md): the nav links collapse into one Base UI Menu behind a
 * MenuIcon trigger (MobileNavMenu); the account slot and appearance menu
 * stay inline. The mark tilts 3° on hover (F13), motion-safe only. Below
 * 360 px the wordmark steps aside and the mark stands alone, as in the
 * phone editor's header (the link keeps its aria-label and a 44 px target):
 * with it the guest row (mark, Sign in, Appearance, Menu) needs 324 px of a
 * 320 px screen's 288 and scrolled every page 20 px sideways (LATER row 250).
 *
 * U8: Build, Browse and My decks are client islands so they can read the
 * path (usePathname — not request data) and mark the open page with
 * `aria-current="page"`. The wordmark keeps its own type (WAVE5.md D3).
 */
import Link from "next/link";

import { AccountSlot } from "@/components/auth/account-slot";
import { BrandMark } from "@/components/brand-mark";
import { BrowseMenu, BuildLink, MobileNavMenu, MyDecksLink } from "@/components/site-nav";
import { navLinkClass } from "@/components/site-nav-link";
import { AppearanceMenu } from "@/components/theme/appearance-menu";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-wide items-center gap-2 px-4">
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

        <div className="ml-auto flex items-center gap-1">
          <AccountSlot />
          <AppearanceMenu />
          <MobileNavMenu />
        </div>
      </div>
    </header>
  );
}

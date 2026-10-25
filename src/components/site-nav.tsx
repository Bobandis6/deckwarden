"use client";

/**
 * The site header's client islands (R1b): the Browse menu, the My decks
 * link, and the phone collapse — one Base UI Menu holding every nav link
 * behind a MenuIcon trigger below `md`, and since HEADER-SEARCH the
 * Appearance items under them (the header's own Appearance trigger hides
 * below `md`, giving its slot to the card search button).
 *
 * My decks is /account for everyone (X1, WAVE3.md D1): signed out, that
 * page is sign-in with this browser's decks listed under the buttons. Nothing
 * here reads the session any more — the link is the same string in the
 * server HTML and after hydration, so nothing swaps; only the account slot
 * (AccountSlot) still reads it. Menu items are LinkItems rendered as Next
 * Links — real anchors (Enter follows them, middle-click opens a tab) with
 * client-side navigation, closing the menu on the way.
 *
 * The open page (U8, WAVE5.md D3): an entry whose href IS the current path
 * carries `aria-current="page"` (and navLinkClass's foreground ink) — Build
 * on /decks/new, My decks on /account, and the Browse trigger on any of its
 * six indexes, where the menu's own entry for that index says it too; the
 * phone menu marks its entries the same way. Exact paths only: home, a hub,
 * a card, an event or a deck page names no entry. usePathname is the only
 * route read here; it renders into the static and ISR HTML like the rest of
 * the shell (no request data).
 */
import { ChevronDownIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { navLinkClass } from "@/components/site-nav-link";
import { AppearanceItems } from "@/components/theme/appearance-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** The Browse menu's entries — hub indexes only, never a specific hub (hubs-smoke pins that). */
export const BROWSE_LINKS = [
  { href: "/commanders", label: "Commanders" },
  { href: "/leaders", label: "Leaders" },
  { href: "/cards", label: "Cards" },
  // X4b (WAVE3.md E): Sets right after Cards — every row there opens /cards?set=.
  { href: "/sets", label: "Sets" },
  // Then the D-nav sketch's order (WAVE2 §D1): Precons, and Tournaments (W10) last.
  { href: "/precons", label: "Precons" },
  { href: "/tournaments", label: "Tournaments" },
] as const;

/** One target for everyone (X1): the account page, which is the sign-in page when signed out. */
const MY_DECKS_HREF = "/account";
const BUILD_HREF = "/decks/new";

/** `aria-current` for an entry: "page" when its href is the open path (U8). */
function current(pathname: string | null, href: string) {
  return pathname === href ? ("page" as const) : undefined;
}

/** A header nav link that marks itself when its page is open (Build, My decks). */
function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={href} className={className} aria-current={current(pathname, href)}>
      {children}
    </Link>
  );
}

export function BuildLink({ className }: { className?: string }) {
  return (
    <NavLink href={BUILD_HREF} className={className}>
      Build
    </NavLink>
  );
}

export function MyDecksLink({ className }: { className?: string }) {
  return (
    <NavLink href={MY_DECKS_HREF} className={className}>
      My decks
    </NavLink>
  );
}

export function BrowseMenu() {
  const pathname = usePathname();
  // The trigger names the open index's set: one of its six pages is open.
  const browsing = BROWSE_LINKS.some((entry) => entry.href === pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(navLinkClass, "gap-1")}
        aria-current={browsing ? "page" : undefined}
      >
        Browse
        <ChevronDownIcon aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      {/* Base UI names the popup after its trigger (aria-labelledby) — "Browse". */}
      <DropdownMenuContent className="min-w-40">
        {BROWSE_LINKS.map((entry) => (
          <DropdownMenuLinkItem
            key={entry.href}
            render={<Link href={entry.href} />}
            aria-current={current(pathname, entry.href)}
            closeOnClick
          >
            {entry.label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone collapse: every nav link in one menu; hidden from `md` up, where the inline links show. */
export function MobileNavMenu() {
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Menu" className="md:hidden" />}
      >
        <MenuIcon />
      </DropdownMenuTrigger>
      {/* Named "Menu" after its trigger, like every Base UI menu popup. */}
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLinkItem
          render={<Link href={BUILD_HREF} />}
          aria-current={current(pathname, BUILD_HREF)}
          closeOnClick
        >
          Build
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Browse</DropdownMenuLabel>
          {BROWSE_LINKS.map((entry) => (
            <DropdownMenuLinkItem
              key={entry.href}
              render={<Link href={entry.href} />}
              aria-current={current(pathname, entry.href)}
              closeOnClick
            >
              {entry.label}
            </DropdownMenuLinkItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem
          render={<Link href={MY_DECKS_HREF} />}
          aria-current={current(pathname, MY_DECKS_HREF)}
          closeOnClick
        >
          My decks
        </DropdownMenuLinkItem>
        {/* HEADER-SEARCH: below md the header's Appearance trigger gives its
            44 px to the search button, and its items ride here — U4a's
            AppearanceItems, so still one appearance control per page. */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <AppearanceItems />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

/**
 * The site header's client islands (R1b): the Browse menu, the My decks
 * link, and the phone collapse — one Base UI Menu holding every nav link
 * behind a MenuIcon trigger below `md`.
 *
 * My decks is /account for everyone (X1, WAVE3.md D1): signed out, that
 * page is sign-in with this browser's decks listed under the buttons. Nothing
 * here reads the session any more — the link is the same string in the
 * server HTML and after hydration, so nothing swaps; only the account slot
 * (AccountSlot) still reads it. Menu items are LinkItems rendered as Next
 * Links — real anchors (Enter follows them, middle-click opens a tab) with
 * client-side navigation, closing the menu on the way.
 */
import { ChevronDownIcon, MenuIcon } from "lucide-react";
import Link from "next/link";

import { navLinkClass } from "@/components/site-nav-link";
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
  // The D-nav sketch's order (WAVE2 §D1): Precons after Cards, Tournaments (W10) last.
  { href: "/precons", label: "Precons" },
  { href: "/tournaments", label: "Tournaments" },
] as const;

/** One target for everyone (X1): the account page, which is the sign-in page when signed out. */
const MY_DECKS_HREF = "/account";

export function MyDecksLink({ className }: { className?: string }) {
  return (
    <Link href={MY_DECKS_HREF} className={className}>
      My decks
    </Link>
  );
}

export function BrowseMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(navLinkClass, "gap-1")}>
        Browse
        <ChevronDownIcon aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      {/* Base UI names the popup after its trigger (aria-labelledby) — "Browse". */}
      <DropdownMenuContent className="min-w-40">
        {BROWSE_LINKS.map((entry) => (
          <DropdownMenuLinkItem key={entry.href} render={<Link href={entry.href} />} closeOnClick>
            {entry.label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone collapse: every nav link in one menu; hidden from `md` up, where the inline links show. */
export function MobileNavMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Menu" className="md:hidden" />}
      >
        <MenuIcon />
      </DropdownMenuTrigger>
      {/* Named "Menu" after its trigger, like every Base UI menu popup. */}
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLinkItem render={<Link href="/decks/new" />} closeOnClick>
          Build
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Browse</DropdownMenuLabel>
          {BROWSE_LINKS.map((entry) => (
            <DropdownMenuLinkItem key={entry.href} render={<Link href={entry.href} />} closeOnClick>
              {entry.label}
            </DropdownMenuLinkItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href={MY_DECKS_HREF} />} closeOnClick>
          My decks
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

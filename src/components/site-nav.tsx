"use client";

/**
 * The site header's client islands (R1b): the Browse menu, the My decks
 * link — /account once signed in, home's guest-deck section (#your-decks)
 * until then — and the phone collapse, one Base UI Menu holding every nav
 * link behind a MenuIcon trigger below `md`.
 *
 * Session state comes from the Better Auth client (as SignOutButton's does),
 * never from request data, so the (site) layout stays inert for ISR. The
 * server HTML renders the guest hrefs and the client swaps them once
 * useSession resolves: the markup is identical on both sides (useSession
 * starts pending with no data), so hydration matches and nothing needs
 * suppressHydrationWarning. Menu items are LinkItems rendered as Next Links
 * — real anchors (Enter follows them, middle-click opens a tab) with
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
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** The Browse menu's entries — hub indexes only, never a specific hub (hubs-smoke pins that). */
export const BROWSE_LINKS = [
  { href: "/commanders", label: "Commanders" },
  { href: "/leaders", label: "Leaders" },
  { href: "/cards", label: "Cards" },
] as const;

/** /account once signed in; the browser's guest-deck section on home until then. */
function useMyDecksHref(): string {
  const { data } = authClient.useSession();
  return data ? "/account" : "/#your-decks";
}

export function MyDecksLink({ className }: { className?: string }) {
  const href = useMyDecksHref();
  return (
    <Link href={href} className={className}>
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
  const myDecks = useMyDecksHref();
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
        <DropdownMenuLinkItem render={<Link href={myDecks} />} closeOnClick>
          My decks
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

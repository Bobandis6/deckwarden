"use client";

/**
 * The site header's account slot (R1b; the signed-in menu since W3,
 * WAVE2.md D1): "Sign in" for guests; a real-button menu trigger (avatar +
 * name, name sr-only below `sm`) once the Better Auth client resolves a
 * session — My decks · Bookmarks · Collection · Profile & settings as
 * links into /account's sections, then Sign out. Client-side on purpose —
 * reading the session on the server would mean headers() in the (site)
 * layout, which turns every ISR page dynamic (LATER row 69). The server
 * HTML and the first client render both show the guest shape (useSession
 * starts pending with no data), so hydration matches and the swap happens
 * after the session fetch. account-delete-smoke's "Sign in" pin on the
 * signed-out /account page rides on this too.
 *
 * Base UI names the popup after its trigger, so the menu announces as the
 * user's name — consistent with "Browse" / "Menu". Sign out stays an Item
 * (not a link): closeOnClick off, the menu closes itself only on success;
 * on failure it stays open and the item reads the retry copy (D1).
 *
 * X1 (WAVE3.md D1): the name is the menu's first item, a link to /account
 * that lands at the very top of the page — see landAtTop for the measured
 * reason a plain link is not enough.
 *
 * X5 (WAVE3.md D5): the picture is UserAvatar at 24 px (LATER row 110 —
 * one initial rule, the first code point, in all three places), from the
 * session's `avatar` and `image`. When card art is the picture, its credit
 * is one quiet line under the name row (the owner's answer, 2026-10-01).
 * REC-5 (LATER row 80): the session carries `username`, so "Public profile
 * ↗" is an item once one exists. Both are Better Auth additional fields;
 * after a change the writer refetches the session with the cookie cache
 * bypassed, which updates this menu at once.
 */
import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { signOutLabel, useSignOut } from "@/components/auth/use-sign-out";
import { AvatarCredit, UserAvatar } from "@/components/profile/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { parseAvatarChoice } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

/** The /account sections the menu links into (D1; #bookmarks is W3's new id). */
const ACCOUNT_MENU_LINKS = [
  { href: "/account#decks", label: "My decks" },
  { href: "/account#bookmarks", label: "Bookmarks" },
  { href: "/account#collection", label: "Collection" },
  { href: "/account#settings", label: "Profile & settings" },
] as const;

/**
 * The name row's landing (X1): scrollY 0, from anywhere. The link alone does
 * not guarantee it. Measured in a real browser on Next 16.3.2 (2026-09-27):
 * a Link to the path you are already on clears a hash the in-page nav set
 * (the router never heard about it) and scrolls to the top ONLY when the
 * page's top edge is out of view — from scrollY 40 it stays at 40. The
 * header is not sticky, so opening this menu means the header is on screen,
 * which is exactly that range. `href="/account#top"` was the other
 * candidate and fails the second click in a row: a repeated navigation to
 * the same URL does not scroll again (1500 stayed 1500).
 *
 * So the row scrolls itself, in the same click as the navigation. "instant"
 * so a smooth scroll can never be cut short by the page swap. A modified or
 * non-primary click opens a tab or a window — this page stays where it is.
 */
export function landAtTop(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export function AccountSlot() {
  const { data } = authClient.useSession();
  const user = data?.user;

  if (!user) {
    return (
      // A styled Link, not Button-as-Link: Base UI's Button puts role="button"
      // on a non-native element, and this is a link (a menu-less navigation).
      <Link href="/account" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Sign in
      </Link>
    );
  }

  return <AccountMenu user={user} />;
}

/**
 * The signed-in menu, its own component so the guest branch (what the
 * error/404 shells and every server render show) never touches useRouter —
 * useSignOut needs the app router mounted.
 */
function AccountMenu({
  user,
}: {
  user: { name: string; image?: string | null; avatar?: unknown; username?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const { pending, failed, reset, signOut } = useSignOut();

  const avatar = parseAvatarChoice(user.avatar);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 hover:bg-muted aria-expanded:bg-muted flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
        {/* Decorative (aria-hidden inside): the name span is the trigger's label. */}
        <UserAvatar name={user.name} image={user.image} avatar={avatar} size={24} />
        <span className="max-w-32 truncate text-sm font-medium max-sm:sr-only">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          {/* The name alone, as a link (X1): the top of /account, name and picture in view. */}
          <DropdownMenuLinkItem
            render={<Link href="/account" />}
            closeOnClick
            onClick={landAtTop}
            className="max-w-56 font-medium"
          >
            {/* min-w-0: a flex child will not shrink below its text without it, and the name would overflow instead of truncating. */}
            <span className="min-w-0 truncate">{user.name}</span>
          </DropdownMenuLinkItem>
          {/* Card art's credit, nearby (X5): text, not an item — arrows skip it. */}
          <AvatarCredit avatar={avatar} className="max-w-56 px-1.5 pb-1" />
          <DropdownMenuSeparator />
          {ACCOUNT_MENU_LINKS.map((entry) => (
            <DropdownMenuLinkItem key={entry.href} render={<Link href={entry.href} />} closeOnClick>
              {entry.label}
            </DropdownMenuLinkItem>
          ))}
          {user.username && (
            <DropdownMenuLinkItem render={<Link href={`/u/${user.username}`} />} closeOnClick>
              Public profile ↗
            </DropdownMenuLinkItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => {
            void signOut().then((ok) => {
              if (ok) setOpen(false);
            });
          }}
        >
          <LogOutIcon aria-hidden />
          {signOutLabel(pending, failed)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

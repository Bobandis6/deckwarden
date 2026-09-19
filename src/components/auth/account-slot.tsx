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
 * on failure it stays open and the item reads the retry copy (D1). No
 * "Public profile ↗" item — the client session has no username (LATER).
 */
import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { signOutLabel, useSignOut } from "@/components/auth/use-sign-out";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** The /account sections the menu links into (D1; #bookmarks is W3's new id). */
const ACCOUNT_MENU_LINKS = [
  { href: "/account#decks", label: "My decks" },
  { href: "/account#bookmarks", label: "Bookmarks" },
  { href: "/account#collection", label: "Collection" },
  { href: "/account#settings", label: "Profile & settings" },
] as const;

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
function AccountMenu({ user }: { user: { name: string; image?: string | null } }) {
  const [open, setOpen] = useState(false);
  const { pending, failed, reset, signOut } = useSignOut();

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 hover:bg-muted aria-expanded:bg-muted flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 outline-none focus-visible:ring-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
        {/* Decorative: the name span is the trigger's label; the initial must not leak into it. */}
        <Avatar size="sm" aria-hidden>
          {/* Provider avatars are cross-origin; no-referrer matches /account's own <img>. */}
          {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <span className="max-w-32 truncate text-sm font-medium max-sm:sr-only">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="max-w-56 truncate">{user.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ACCOUNT_MENU_LINKS.map((entry) => (
            <DropdownMenuLinkItem key={entry.href} render={<Link href={entry.href} />} closeOnClick>
              {entry.label}
            </DropdownMenuLinkItem>
          ))}
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

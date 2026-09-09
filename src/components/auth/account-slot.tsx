"use client";

/**
 * The site header's account slot (R1b, REDESIGN.md §2): "Sign in" for
 * guests; avatar + name → /account once the Better Auth client resolves a
 * session. Client-side on purpose — reading the session on the server would
 * mean headers() in the (site) layout, which turns every ISR page dynamic
 * (LATER row 69). The server HTML and the first client render both show the
 * guest shape (useSession starts pending with no data), so hydration
 * matches and the swap happens after the session fetch. account-delete-
 * smoke's "Sign in" pin on the signed-out /account page rides on this too.
 */
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Link
      href="/account"
      className="focus-visible:ring-ring/50 hover:bg-muted flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 outline-none focus-visible:ring-2"
    >
      {/* Decorative: the name span is the link's label; the initial must not leak into it. */}
      <Avatar size="sm" aria-hidden>
        {/* Provider avatars are cross-origin; no-referrer matches /account's own <img>. */}
        {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <span className="max-w-32 truncate text-sm font-medium max-sm:sr-only">{user.name}</span>
    </Link>
  );
}

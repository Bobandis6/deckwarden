"use client";

/**
 * The profile picture — on /account (48 px), /u/[username] (64 px) and, since
 * X5, the header's account slot (24 px; LATER row 110). P2.9 round 2 made it
 * never an empty ring: the initial holds the space until a picture has
 * actually loaded, and stays when the load fails (provider pictures go
 * stale — a Discord URL embeds a hash that changes with the picture).
 *
 * X5 (WAVE3.md D5): it takes the chosen picture. `avatarSources` lists what
 * to try in order — card art's derived crop, then the provider picture —
 * and a failed load moves to the next, so a stale art choice (its printing
 * gone from Scryfall's CDN) shows the provider picture, then the initial;
 * never a broken image. "Just my initial" tries nothing. The credit line
 * that must sit beside card art is the caller's (AvatarCredit), because
 * only the caller knows where "nearby" is.
 *
 * A client component now: the fallback chain is state. Still a plain <img>
 * underneath (house image rules — no optimizer quota on external images).
 * Decorative by design: the name beside it carries the meaning.
 *
 * `size` is the rendered pixel size. It is never forwarded to the wrapper's
 * own `size` variant, whose data-[size=…] classes would outrank the class
 * set here.
 */
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  avatarCredit,
  avatarInitial,
  avatarSources,
  type AvatarChoice,
} from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  24: { root: "size-6", fallback: "text-xs" },
  48: { root: "size-12", fallback: "text-foreground text-lg font-semibold" },
  64: { root: "size-16", fallback: "text-foreground text-xl font-semibold" },
} as const;

export type UserAvatarSize = keyof typeof SIZE_CLASSES;

export function UserAvatar({
  name,
  image,
  avatar = null,
  size,
  className,
}: {
  name: string;
  image?: string | null;
  avatar?: AvatarChoice | null;
  size: UserAvatarSize;
  className?: string;
}) {
  const sources = avatarSources(avatar, image);
  // Keyed by the list: a new choice starts the chain again from its first source.
  return (
    <AvatarChain
      key={sources.join(" ")}
      sources={sources}
      initial={avatarInitial(name)}
      size={size}
      className={className}
    />
  );
}

function AvatarChain({
  sources,
  initial,
  size,
  className,
}: {
  sources: string[];
  initial: string;
  size: UserAvatarSize;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  const classes = SIZE_CLASSES[size];
  return (
    <Avatar aria-hidden className={cn(classes.root, className)}>
      {/* Cross-origin pictures (Discord, Google, Scryfall): no referrer leaves the page. */}
      {src && (
        <AvatarImage
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error") setIndex((i) => i + 1);
          }}
        />
      )}
      <AvatarFallback className={classes.fallback}>{initial}</AvatarFallback>
    </Avatar>
  );
}

/**
 * The line card art must carry nearby (CLAUDE.md: art_crop needs the
 * artist and © visible): "Picture: Sol Ring · Art: … · ™ & © Wizards of
 * the Coast". Nothing for any other choice.
 */
export function AvatarCredit({
  avatar,
  className,
}: {
  avatar: AvatarChoice | null;
  className?: string;
}) {
  const credit = avatarCredit(avatar);
  if (!credit) return null;
  return <p className={cn("text-muted-foreground text-xs", className)}>{credit}</p>;
}

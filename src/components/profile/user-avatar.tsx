/**
 * The profile picture on /account and /u/[username] (P2.9 round 2) — the
 * header slot's avatar at page size. Provider pictures go stale: a Discord
 * avatar URL embeds a hash that changes with the picture, the stored address
 * then 404s, and nothing refreshes it. A plain <img> showed the page through
 * an empty ring; this shows the initial until the picture has actually
 * loaded, and keeps it when the load fails.
 *
 * No "use client": it has no hooks and only composes ui/avatar's client
 * parts, which the header already ships on every (site) page. Still a plain
 * <img> underneath (house image rules — no optimizer quota on externally
 * hosted avatars). Decorative by design: the <h1> beside it carries the name.
 *
 * `size` is the rendered pixel size. It is never forwarded to the wrapper's
 * own `size` variant, whose data-[size=…] classes would outrank the class
 * set here.
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const SIZE_CLASSES = {
  48: { root: "size-12", fallback: "text-foreground text-lg font-semibold" },
  64: { root: "size-16", fallback: "text-foreground text-xl font-semibold" },
} as const;

export function UserAvatar({
  name,
  image,
  size,
}: {
  name: string;
  image?: string | null;
  size: keyof typeof SIZE_CLASSES;
}) {
  // The first code point, not charAt(0): half a surrogate pair renders
  // differently on the server and on the client.
  const first = Array.from(name.trim())[0];
  const classes = SIZE_CLASSES[size];
  return (
    <Avatar aria-hidden className={classes.root}>
      {/* Provider avatars are cross-origin; no-referrer matches the header's slot. */}
      {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className={classes.fallback}>
        {first ? first.toUpperCase() : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

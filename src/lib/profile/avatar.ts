/**
 * The chosen picture (X5, WAVE3.md D5) — one pure module for the stored
 * shape, the request the dialog sends, the image a choice derives, and its
 * credit line. Client-safe: the header, the dialog and the server pages all
 * read it.
 *
 * Stored in `users.avatar` (jsonb, nullable), never in `users.image` — a
 * sign-in refresh rewrites that column (WAVE3 A):
 *   NULL                                   → the provider picture (users.image)
 *   { kind: "initial" }                    → the initial
 *   { kind: "art", printingId, cardName, artist } → a Magic card's art crop
 * No URL is stored (the Neon rule: no stored Magic image URLs). The crop is
 * derived from the printing id — the API's `image_uris.art_crop` minus its
 * `?` stamp, proven for a normal and a double-faced card in X5's ship note —
 * and the credit line from the stored artist, captured from the Scryfall
 * API at Save (art.ts' rule: the artist lives only there).
 *
 * Rendering never shows a broken image: a stored value this module does not
 * recognise reads as NULL, and `avatarSources` lists what to try in order —
 * the art, then the provider picture — with the initial under both.
 */
import { z } from "zod";

import { artCredit } from "@/lib/cards/art";
import { scryfallImageUrl } from "@/lib/cards/images";

export type AvatarChoice =
  { kind: "initial" } | { kind: "art"; printingId: string; cardName: string; artist: string };

const STORED = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("initial") }),
  z.object({
    kind: z.literal("art"),
    printingId: z.uuid(),
    cardName: z.string().min(1),
    artist: z.string().min(1),
  }),
]);

/** A stored value as a choice; anything unrecognised (or NULL) is the provider picture. */
export function parseAvatarChoice(value: unknown): AvatarChoice | null {
  const parsed = STORED.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The PUT body: the three choices. Card art names a card; the server picks its printing. */
export const AVATAR_REQUEST = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("provider") }),
  z.object({ kind: z.literal("initial") }),
  z.object({ kind: z.literal("art"), cardId: z.uuid() }),
]);

export type AvatarRequest = z.infer<typeof AVATAR_REQUEST>;

/** The art crop for a stored printing — derived, never stored. Front face. */
export function avatarArtUrl(printingId: string): string {
  return scryfallImageUrl(printingId, "art_crop", "front");
}

/** What to try, in order; the initial stands under all of them. */
export function avatarSources(choice: AvatarChoice | null, image?: string | null): string[] {
  if (choice?.kind === "initial") return [];
  const sources = choice?.kind === "art" ? [avatarArtUrl(choice.printingId)] : [];
  if (image) sources.push(image);
  return sources;
}

/** "Picture: Sol Ring · Art: … · ™ & © Wizards of the Coast" — only for card art. */
export function avatarCredit(choice: AvatarChoice | null): string | null {
  if (choice?.kind !== "art") return null;
  return `Picture: ${choice.cardName} · ${artCredit(choice.artist)}`;
}

/** The first code point, uppercased, or "?" — never half a surrogate pair. */
export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

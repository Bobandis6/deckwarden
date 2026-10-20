/**
 * Deck folders (P2.2): access predicates, wire shape, and lookups, mirroring
 * decks' access.ts / serialize.ts. The session-authed middleware
 * (requireOwnedFolder) lives in route-helpers.ts with its deck twin — same
 * reason: importing the better-auth instance from here would drag env
 * requirements into the pure predicates' unit tests.
 *
 * Folders are simpler than decks on purpose: they exist only for signed-in
 * users, so the session is the one ownership proof — no claim tokens, no
 * guest path. Reads follow the deck rule: owner always, everyone else only
 * when visibility != private.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";

export type FolderRow = typeof schema.deckFolders.$inferSelect;

export const FOLDER_LIMITS = {
  /** Per-user cap — keeps /account and profile pages renderable in one query. */
  perUser: 50,
  nameMax: 80,
  descriptionMax: 2000,
} as const;

export function isFolderOwner(
  folder: Pick<FolderRow, "userId">,
  sessionUserId: string | null,
): boolean {
  return sessionUserId !== null && folder.userId === sessionUserId;
}

/** Reads: owner always; everyone else only when the folder isn't private. */
export function canReadFolder(
  folder: Pick<FolderRow, "userId" | "visibility">,
  sessionUserId: string | null,
): boolean {
  return folder.visibility !== "private" || isFolderOwner(folder, sessionUserId);
}

export type DeckVisibility = (typeof schema.DECK_VISIBILITIES)[number];

/**
 * The deck visibilities a viewer sees inside a folder (S6,
 * SECURITY-AUDIT-report.md L5). The owner sees everything, with the
 * visibility word on every non-public tile. Everyone else sees public decks,
 * plus unlisted ones only inside an UNLISTED folder — the folder's own link
 * is the unguessable thing then, the same reachability class as the decks'
 * links (P2.2's reasoning). A PUBLIC folder is browsable (the profile lists
 * it, the sitemap carries it, crawlers index it), so an unlisted deck filed
 * in one was listed to the world, against the schema's own promise that
 * unlisted means not browsable; now it shows only to its owner there. A
 * private folder's non-owners never reach a listing (the page answers the
 * denial shell first), so the answer for them is nothing.
 */
export function folderDeckVisibilities(
  folder: Pick<FolderRow, "userId" | "visibility">,
  sessionUserId: string | null,
): DeckVisibility[] {
  if (isFolderOwner(folder, sessionUserId)) return ["public", "unlisted", "private"];
  switch (folder.visibility) {
    case "public":
      return ["public"];
    case "unlisted":
      return ["public", "unlisted"];
    default:
      return [];
  }
}

/** user_id never leaves the server; attribution goes through the owner's username. */
export function folderMetaJson(folder: FolderRow, opts: { isOwner: boolean }) {
  return {
    id: folder.id,
    publicId: folder.publicId,
    name: folder.name,
    description: folder.description,
    visibility: folder.visibility,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    isOwner: opts.isOwner,
  };
}

const UUID = z.uuid();

export async function loadFolder(id: string): Promise<FolderRow | null> {
  if (!UUID.safeParse(id).success) return null;
  const [folder] = await getDb()
    .select()
    .from(schema.deckFolders)
    .where(eq(schema.deckFolders.id, id))
    .limit(1);
  return folder ?? null;
}

/** Share-page lookup: deck_folders.public_id is the /f/[publicId] slug. */
export async function loadFolderByPublicId(publicId: string): Promise<FolderRow | null> {
  // Same shape gate as decks (public-id.ts slugs) — junk skips the roundtrip.
  if (!/^[a-z0-9_]{4,32}$/.test(publicId)) return null;
  const [folder] = await getDb()
    .select()
    .from(schema.deckFolders)
    .where(eq(schema.deckFolders.publicId, publicId))
    .limit(1);
  return folder ?? null;
}

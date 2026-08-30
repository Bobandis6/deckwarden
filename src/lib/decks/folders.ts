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

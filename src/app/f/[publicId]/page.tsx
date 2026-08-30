/**
 * /f/[publicId] — the shareable folder page (P2.2), §7's "known Moxfield
 * gap": a folder of decks behind one send-able URL.
 *
 * Caching intent: force-dynamic, same privacy reasoning as /d/[publicId] —
 * a folder (or a deck inside it) flipped private must take effect on the
 * next request.
 *
 * Access: folder ownership is session-based (folders exist only for
 * accounts), so unlike the deck page there's no client token gate — the
 * server can answer "is this the owner" directly. Private folders render a
 * denial shell (HTTP 200, same status posture as private decks — see
 * LATER.md). Deck rows are filtered per-viewer: non-owners see public +
 * unlisted decks (sharing a folder link shares its decks' links — same
 * reachability class), never private ones; the owner sees everything with
 * visibility spelled out so the page can't silently lie to them about what
 * others see. Attribution goes through the owner's username only — no
 * username, no byline (choosing one is the publish opt-in).
 */
import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { formatLabel, updatedLabel } from "@/lib/decks/display";
import { isFolderOwner, loadFolderByPublicId } from "@/lib/decks/folders";

export const dynamic = "force-dynamic";

const getFolder = cache(loadFolderByPublicId);

// Indexing policy (P2.6): same contract as /d — public indexable, unlisted
// noindex-but-unfurlable, private noindexed shell. See the deck page note.
export async function generateMetadata({ params }: PageProps<"/f/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const folder = await getFolder(publicId);
  if (!folder || folder.visibility === "private") {
    return { title: "Folder", robots: { index: false } };
  }
  const description = folder.description ?? "A deck folder shared on Deckwarden.";
  return {
    title: folder.name,
    description,
    alternates: { canonical: `/f/${publicId}` },
    openGraph: { title: folder.name, description, type: "website" },
    ...(folder.visibility === "public" ? {} : { robots: { index: false } }),
  };
}

export default async function FolderSharePage({ params }: PageProps<"/f/[publicId]">) {
  const { publicId } = await params;
  const folder = await getFolder(publicId);
  if (!folder) notFound();

  const sessionUserId = await getSessionUserId(await headers());
  const isOwner = isFolderOwner(folder, sessionUserId);

  if (folder.visibility === "private" && !isOwner) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold">This folder is private</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          The owner hasn&apos;t shared it. If it&apos;s yours, sign in to view it.
        </p>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Back to Deckwarden
        </Link>
      </main>
    );
  }

  const db = getDb();
  const [decks, [owner]] = await Promise.all([
    db
      .select()
      .from(schema.decks)
      .where(
        and(
          eq(schema.decks.folderId, folder.id),
          ...(isOwner ? [] : [ne(schema.decks.visibility, "private")]),
        ),
      )
      .orderBy(desc(schema.decks.updatedAt)),
    db
      .select({ name: schema.users.name, username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.id, folder.userId))
      .limit(1),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Deckwarden
        </Link>
      </p>

      <header className="mt-6">
        <h1 className="text-2xl font-bold tracking-tight break-words">{folder.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {owner?.username ? (
            <>
              A folder by{" "}
              <Link href={`/u/${owner.username}`} className="hover:underline">
                {owner.name} <span className="text-muted-foreground">@{owner.username}</span>
              </Link>{" "}
              ·{" "}
            </>
          ) : (
            <>A folder on Deckwarden · </>
          )}
          <span className="tabular-nums">{decks.length}</span>{" "}
          {decks.length === 1 ? "deck" : "decks"}
        </p>
        {folder.description && (
          <p className="mt-2 text-sm whitespace-pre-wrap">{folder.description}</p>
        )}
        {isOwner && (
          <p className="text-muted-foreground mt-3 rounded-lg border px-3 py-2 text-xs">
            {folder.visibility === "private"
              ? "Only you can see this folder."
              : folder.visibility === "unlisted"
                ? "Anyone with this link can view it. "
                : "This folder is public — it appears on your profile. "}
            Organize it from{" "}
            <Link href="/account" className="underline">
              your account
            </Link>
            .
          </p>
        )}
      </header>

      <section aria-label="Decks in this folder" className="mt-6">
        {decks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing in this folder yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Link href={`/d/${deck.publicId}`} className="block px-3 py-2 hover:underline">
                  <span className="block truncate text-sm font-medium">{deck.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatLabel(deck.gameId, deck.formatId)}
                    {/* Visibility spelled out for the owner: rows others can't see must say so. */}
                    {isOwner && deck.visibility !== "public" ? ` · ${deck.visibility}` : ""} ·
                    Updated {updatedLabel(deck.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

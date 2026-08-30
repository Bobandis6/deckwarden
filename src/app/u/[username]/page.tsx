/**
 * /u/[username] — public profile (P2.2): avatar, display name, public
 * folders, public decks. Shows exactly what the public sees — no owner-only
 * extras beyond a "this is you" management hint — so nobody has to wonder
 * what their profile leaks; management lives on /account. The page exists
 * only after its owner chose a username (the publish opt-in).
 *
 * Caching intent: force-dynamic, same reasoning as /d/[publicId]: a deck or
 * folder flipped private must vanish from here immediately, and profile
 * renders are two indexed queries.
 *
 * Visibility rules: decks listed only when public (unlisted = not browsable);
 * folders only when public, and their deck counts count only non-private
 * decks — the number a visitor will actually find on the folder page.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { formatLabel, joinedLabel, updatedLabel } from "@/lib/decks/display";
import { isUsernameShaped } from "@/lib/profile/username";

export const dynamic = "force-dynamic";

const getProfile = cache(async (raw: string) => {
  // Usernames are ASCII slugs; anything else can't match and skips the query.
  if (!isUsernameShaped(raw)) return null;
  const [user] = await getDb()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
      username: schema.users.username,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.username, raw.toLowerCase()))
    .limit(1);
  return user ?? null;
});

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const user = await getProfile(username);
  if (!user) return { title: "Profile" };
  const title = `${user.name} (@${user.username})`;
  const description = `${user.name}'s public decks on Deckwarden.`;
  return { title, description, openGraph: { title, description, type: "profile" } };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const user = await getProfile(username);
  if (!user) notFound();

  const db = getDb();
  const [decks, folders, sessionUserId] = await Promise.all([
    db
      .select()
      .from(schema.decks)
      .where(and(eq(schema.decks.userId, user.id), eq(schema.decks.visibility, "public")))
      .orderBy(desc(schema.decks.updatedAt))
      .limit(100),
    db
      .select({
        publicId: schema.deckFolders.publicId,
        name: schema.deckFolders.name,
        deckCount: sql<number>`count(${schema.decks.id})::int`,
      })
      .from(schema.deckFolders)
      .leftJoin(
        schema.decks,
        and(
          eq(schema.decks.folderId, schema.deckFolders.id),
          ne(schema.decks.visibility, "private"),
        ),
      )
      .where(
        and(eq(schema.deckFolders.userId, user.id), eq(schema.deckFolders.visibility, "public")),
      )
      .groupBy(schema.deckFolders.id)
      .orderBy(sql`lower(${schema.deckFolders.name})`),
    getSessionUserId(await headers()),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <p>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Deckwarden
        </Link>
      </p>

      <section className="mt-6 flex items-center gap-4">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={64}
            height={64}
            referrerPolicy="no-referrer"
            className="size-16 rounded-full border"
          />
        ) : (
          <span
            aria-hidden
            className="bg-muted flex size-16 items-center justify-center rounded-full border text-xl font-semibold"
          >
            {user.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="text-muted-foreground truncate text-sm">
            @{user.username} · Joined {joinedLabel(user.createdAt)}
          </p>
        </div>
      </section>

      {sessionUserId === user.id && (
        <p className="text-muted-foreground mt-4 rounded-lg border px-3 py-2 text-sm">
          This is your public profile — only public decks and folders appear here. Manage them in{" "}
          <Link href="/account" className="underline">
            your account
          </Link>
          .
        </p>
      )}

      {folders.length > 0 && (
        <section aria-label="Public folders" className="mt-8 space-y-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Folders
          </h2>
          <ul className="divide-y rounded-lg border">
            {folders.map((folder) => (
              <li key={folder.publicId}>
                <Link
                  href={`/f/${folder.publicId}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
                >
                  <span className="truncate text-sm font-medium">{folder.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {folder.deckCount === 1 ? "1 deck" : `${folder.deckCount} decks`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Public decks" className="mt-8 space-y-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Public decks
        </h2>
        {decks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No public decks yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {decks.map((deck) => (
              <li key={deck.id}>
                <Link href={`/d/${deck.publicId}`} className="block px-3 py-2 hover:underline">
                  <span className="block truncate text-sm font-medium">{deck.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatLabel(deck.gameId, deck.formatId)} · Updated{" "}
                    {updatedLabel(deck.updatedAt)}
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

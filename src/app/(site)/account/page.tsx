/**
 * /account (P2.1; profile + folders since P2.2): sign-in, the signed-in
 * account view, the deck-claim landing spot, and the deck-organization hub —
 * username picker, folder create/manage, decks grouped by folder. OAuth
 * callbackURL points here; ClaimDecks then redeems this browser's tokens and
 * refreshes the server-rendered deck list.
 *
 * Caching intent: force-dynamic — everything on the page is session-shaped.
 * Avatar uses a plain <img> per house image rules (no Vercel optimization
 * quota on externally hosted avatars). R5a: the deck rows are DeckTiles
 * inside today's folder sections and Unfiled bucket (one batched printing
 * lookup for the images); everything else on the page is R5b's.
 */
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { ArrowRightIcon, FolderIcon } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ClaimDecks } from "@/components/auth/claim-decks";
import { DeleteAccount } from "@/components/auth/delete-account";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { CollectionImport } from "@/components/collection/collection-import";
import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import { RemoveBookmarkButton } from "@/components/deck/engagement-buttons";
import { EmptyState } from "@/components/empty-state";
import { DeckFolderSelect, type FolderOption } from "@/components/folders/deck-folder-select";
import { FolderControls } from "@/components/folders/folder-controls";
import { NewFolderForm } from "@/components/folders/new-folder-form";
import { UsernameForm } from "@/components/profile/username-form";
import { Button } from "@/components/ui/button";
import { getDb, schema } from "@/db";
import { auth } from "@/lib/auth";
import { collectionSummary } from "@/lib/collection/owned";
import { formatLabel, updatedLabel } from "@/lib/decks/display";
import { tileFromDeck } from "@/lib/decks/tiles";
import { loadDefaultPrintings, type DefaultPrinting } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  description: "Sign in to keep your decks across browsers.",
  // Belt-and-suspenders with robots.txt's /account disallow (P2.6).
  robots: { index: false },
};

type DeckRow = typeof schema.decks.$inferSelect;

/**
 * One deck, shared by the folder sections and the unfiled bucket — the
 * shared DeckTile since R5a (G5/G8), keeping the edit link titled
 * "Edit {name}", the visibility word, the folder select and the Share link.
 */
function DeckItem({
  deck,
  printing,
  folders,
}: {
  deck: DeckRow;
  printing: DefaultPrinting | null;
  folders: FolderOption[];
}) {
  return (
    <DeckTile
      tile={tileFromDeck(deck, printing, {
        href: `/decks/${deck.id}/edit`,
        showVisibility: true,
      })}
      linkTitle={`Edit ${deck.name}`}
      actions={
        <>
          <DeckFolderSelect
            deckId={deck.id}
            deckName={deck.name}
            currentFolderId={deck.folderId}
            folders={folders}
          />
          <Link
            href={`/d/${deck.publicId}`}
            className="text-muted-foreground shrink-0 text-xs hover:underline"
          >
            Share page
          </Link>
        </>
      }
    />
  );
}

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="max-w-reading mx-auto flex w-full flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground max-w-md text-center text-sm">
          An account keeps your decks across browsers and devices. Decks you built on this browser
          come along automatically when you sign in.
        </p>
        <SignInButtons />
      </main>
    );
  }

  const db = getDb();
  const [decks, linked, [profile], folders, bookmarks, collection] = await Promise.all([
    db
      .select()
      .from(schema.decks)
      .where(eq(schema.decks.userId, session.user.id))
      .orderBy(desc(schema.decks.updatedAt))
      .limit(100),
    db
      .select({ providerId: schema.accounts.providerId })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, session.user.id)),
    // The session's user object is better-auth's shape — username is our
    // column, so it's read from the row.
    db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1),
    db
      .select()
      .from(schema.deckFolders)
      .where(eq(schema.deckFolders.userId, session.user.id))
      .orderBy(asc(sql`lower(${schema.deckFolders.name})`)),
    // Bookmarks (P2.3): saved decks, newest save first. A bookmarked deck
    // that has since gone private is hidden (unless it's the viewer's own) —
    // the row stays in the table and reappears if the owner reopens it.
    db
      .select({
        deckId: schema.decks.id,
        publicId: schema.decks.publicId,
        name: schema.decks.name,
        gameId: schema.decks.gameId,
        formatId: schema.decks.formatId,
        updatedAt: schema.decks.updatedAt,
        authorName: schema.users.name,
        authorUsername: schema.users.username,
      })
      .from(schema.deckBookmarks)
      .innerJoin(schema.decks, eq(schema.deckBookmarks.deckId, schema.decks.id))
      .leftJoin(schema.users, eq(schema.decks.userId, schema.users.id))
      .where(
        and(
          eq(schema.deckBookmarks.userId, session.user.id),
          or(ne(schema.decks.visibility, "private"), eq(schema.decks.userId, session.user.id)),
        ),
      )
      .orderBy(desc(schema.deckBookmarks.createdAt))
      .limit(100),
    // Collection (P3.7): the import section's summary line.
    collectionSummary(session.user.id),
  ]);
  // Tile images (R5a): the first leader's default printing, one batched query.
  const printings = await loadDefaultPrintings(
    decks.flatMap((deck) => (deck.leaderIds[0] ? [deck.leaderIds[0]] : [])),
  );
  const printingFor = (deck: DeckRow): DefaultPrinting | null =>
    (deck.leaderIds[0] && printings.get(deck.leaderIds[0])) || null;
  const providers = [...new Set(linked.map((a) => a.providerId))]
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(", ");

  const folderOptions: FolderOption[] = folders.map((f) => ({ id: f.id, name: f.name }));
  const decksByFolder = new Map<string | null, DeckRow[]>();
  for (const deck of decks) {
    const list = decksByFolder.get(deck.folderId) ?? [];
    list.push(deck);
    decksByFolder.set(deck.folderId, list);
  }
  const unfiled = decksByFolder.get(null) ?? [];

  return (
    <main className="max-w-reading mx-auto w-full flex-1 px-4 py-12">
      <div className="flex justify-end">
        <SignOutButton />
      </div>

      <section className="mt-4 flex items-center gap-4">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            width={48}
            height={48}
            referrerPolicy="no-referrer"
            className="size-12 rounded-full border"
          />
        ) : (
          <span
            aria-hidden
            className="bg-muted flex size-12 items-center justify-center rounded-full border text-lg font-semibold"
          >
            {session.user.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{session.user.name}</h1>
          <p className="text-muted-foreground truncate text-sm">
            {session.user.email}
            {providers ? ` · via ${providers}` : ""}
          </p>
        </div>
      </section>

      <section aria-label="Public profile" className="mt-6 space-y-2 rounded-lg border p-3">
        <UsernameForm current={profile?.username ?? null} />
        {profile?.username && (
          <p className="text-muted-foreground text-xs">
            <Link href={`/u/${profile.username}`} className="underline">
              View your public profile
              <ArrowRightIcon aria-hidden className="ml-1 inline size-3.5 align-[-0.15em]" />
            </Link>
          </p>
        )}
      </section>

      <section aria-label="Your decks" className="mt-8 space-y-4">
        <ClaimDecks />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Your decks
          </h2>
          <NewFolderForm />
        </div>

        {folders.map((folder) => {
          const inFolder = decksByFolder.get(folder.id) ?? [];
          return (
            <div key={folder.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold">
                  <Link href={`/f/${folder.publicId}`} className="hover:underline">
                    <FolderIcon aria-hidden className="mr-1 inline size-4 align-[-0.2em]" />
                    {folder.name}
                  </Link>{" "}
                  <span className="text-muted-foreground text-xs font-normal tabular-nums">
                    {inFolder.length === 1 ? "1 deck" : `${inFolder.length} decks`}
                  </span>
                </p>
                <FolderControls
                  folderId={folder.id}
                  name={folder.name}
                  visibility={folder.visibility}
                />
              </div>
              {inFolder.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
                  Empty — file a deck into it with the folder picker on any deck row.
                </p>
              ) : (
                <DeckTileGrid className="lg:grid-cols-2">
                  {inFolder.map((deck) => (
                    <DeckItem
                      key={deck.id}
                      deck={deck}
                      printing={printingFor(deck)}
                      folders={folderOptions}
                    />
                  ))}
                </DeckTileGrid>
              )}
            </div>
          );
        })}

        <div className="space-y-1.5">
          {folders.length > 0 && (
            <p className="text-muted-foreground text-sm font-semibold">Unfiled</p>
          )}
          {unfiled.length === 0 && folders.length > 0 ? (
            <p className="text-muted-foreground text-xs">Every deck is in a folder.</p>
          ) : unfiled.length === 0 ? (
            <EmptyState
              title="No decks in this account yet"
              action={
                <Button nativeButton={false} size="sm" render={<Link href="/decks/new" />}>
                  Build one
                </Button>
              }
            />
          ) : (
            <DeckTileGrid className="lg:grid-cols-2">
              {unfiled.map((deck) => (
                <DeckItem
                  key={deck.id}
                  deck={deck}
                  printing={printingFor(deck)}
                  folders={folderOptions}
                />
              ))}
            </DeckTileGrid>
          )}
        </div>
      </section>

      <section aria-label="Bookmarks" className="mt-8 space-y-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Bookmarks
        </h2>
        {bookmarks.length === 0 ? (
          <EmptyState
            title="No bookmarks yet"
            hint="The Bookmark button on any shared deck saves it here."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {bookmarks.map((b) => (
              <li key={b.deckId} className="flex items-center gap-3 px-3 py-2">
                <Link href={`/d/${b.publicId}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm font-medium">{b.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatLabel(b.gameId, b.formatId)}
                    {b.authorUsername ? ` · by ${b.authorName}` : ""} · Updated{" "}
                    {updatedLabel(b.updatedAt)}
                  </span>
                </Link>
                <RemoveBookmarkButton deckId={b.deckId} deckName={b.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Collection import (P3.7): ManaBox / Moxfield CSV → owned badges. */}
      <section aria-label="Collection" className="mt-8 space-y-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Collection
        </h2>
        <CollectionImport summary={collection} />
      </section>

      {/* Self-serve deletion (P2.8) — the privacy page points here now. */}
      <section
        aria-label="Danger zone"
        className="border-destructive/40 mt-10 rounded-lg border p-3"
      >
        <h2 className="text-destructive text-xs font-medium tracking-wide uppercase">
          Danger zone
        </h2>
        <div className="mt-2">
          <DeleteAccount />
        </div>
      </section>
    </main>
  );
}

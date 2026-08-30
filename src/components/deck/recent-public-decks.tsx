/**
 * "Recent public decks" rail (P2.3) — the home page's first discovery
 * surface. Real data only, per the cold-start rule: rows are actual public
 * decks newest-activity-first (updated_at moves only on real edits, never on
 * likes), the like count shows only once someone actually liked, and zero
 * corpus renders an honest one-line empty state instead of a faked shelf.
 *
 * Bylines follow the P2.2 opt-in: an author appears only when they chose a
 * username; guest decks and username-less accounts stay anonymous.
 */
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { getDb, schema } from "@/db";
import { formatLabel, updatedLabel } from "@/lib/decks/display";

export async function RecentPublicDecks() {
  const rows = await getDb()
    .select({
      id: schema.decks.id,
      publicId: schema.decks.publicId,
      name: schema.decks.name,
      gameId: schema.decks.gameId,
      formatId: schema.decks.formatId,
      likesCount: schema.decks.likesCount,
      updatedAt: schema.decks.updatedAt,
      authorName: schema.users.name,
      authorUsername: schema.users.username,
    })
    .from(schema.decks)
    .leftJoin(schema.users, eq(schema.decks.userId, schema.users.id))
    .where(eq(schema.decks.visibility, "public"))
    .orderBy(desc(schema.decks.updatedAt))
    .limit(12);

  return (
    <section aria-label="Recent public decks" className="w-full max-w-2xl space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Recent public decks
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No public decks yet —{" "}
          <Link href="/decks/new" className="underline">
            build one
          </Link>{" "}
          and set it to public, and it will show up here.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/d/${deck.publicId}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{deck.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatLabel(deck.gameId, deck.formatId)}
                    {deck.authorUsername ? ` · by ${deck.authorName}` : ""} · Updated{" "}
                    {updatedLabel(deck.updatedAt)}
                  </span>
                </span>
                {deck.likesCount > 0 && (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    ♥ {deck.likesCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

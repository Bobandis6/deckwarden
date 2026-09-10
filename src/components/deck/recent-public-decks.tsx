/**
 * "Recent public decks" rail (P2.3; tiles since R5a) — the home page's
 * discovery surface. Real data only, per the cold-start rule: rows are
 * actual public decks newest-activity-first (updated_at moves only on real
 * edits, never on likes), the like count shows only once someone actually
 * liked, and zero corpus renders an honest one-line empty state instead of
 * a faked shelf. One statement (lib/decks/collections.ts): the
 * decks_recent_public partial index plus the joined default printing.
 *
 * Bylines follow the P2.2 opt-in: an author appears only when they chose a
 * username; guest decks and username-less accounts stay anonymous.
 */
import Link from "next/link";

import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import { loadRecentPublicDecks } from "@/lib/decks/collections";
import { rowPrinting, tileFromDeck } from "@/lib/decks/tiles";

export async function RecentPublicDecks() {
  const rows = await loadRecentPublicDecks();

  return (
    <section aria-label="Recent public decks" className="w-full space-y-3">
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
        <DeckTileGrid>
          {rows.map((row) => (
            <DeckTile
              key={row.id}
              tile={tileFromDeck(row, rowPrinting(row), { href: `/d/${row.publicId}` })}
            />
          ))}
        </DeckTileGrid>
      )}
    </section>
  );
}

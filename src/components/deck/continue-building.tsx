/**
 * Continue building for an account (R5a, §2 item 3): the signed-in
 * visitor's most recent decks as tiles, every visibility (they are the
 * owner's), newest first, capped at CONTINUE_BUILDING_LIMIT with the link
 * to /account for the rest. Rendered by the home page only when a session
 * exists — home is force-dynamic, so the page may read headers(); the
 * (site) layout still never does. The guest branch is the client
 * `YourDecks` (claim tokens); the two share the `your-decks` id the
 * header's guest "My decks" link targets and never render together.
 * Nothing to continue → nothing rendered: home is not a discovery surface
 * for one's own empty account.
 */
import Link from "next/link";

import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import { CONTINUE_BUILDING_LIMIT, loadOwnerDecks } from "@/lib/decks/collections";
import { rowPrinting, tileFromDeck } from "@/lib/decks/tiles";

export async function ContinueBuilding({ userId }: { userId: string }) {
  const rows = await loadOwnerDecks(userId);
  if (rows.length === 0) return null;
  return (
    <section id="your-decks" aria-label="Continue building" className="w-full space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Continue building
        </h2>
        {rows.length >= CONTINUE_BUILDING_LIMIT && (
          <Link href="/account" className="text-xs underline underline-offset-4">
            All your decks
          </Link>
        )}
      </div>
      <DeckTileGrid>
        {rows.map((row) => (
          <DeckTile
            key={row.id}
            tile={tileFromDeck(row, rowPrinting(row), {
              href: `/decks/${row.id}/edit`,
              showVisibility: true,
              byline: false,
            })}
            linkTitle={`Edit ${row.name}`}
            actions={
              <Link
                href={`/d/${row.publicId}`}
                className="text-muted-foreground text-xs hover:underline"
              >
                Share page
              </Link>
            }
          />
        ))}
      </DeckTileGrid>
    </section>
  );
}

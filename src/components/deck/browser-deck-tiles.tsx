/**
 * A guest's decks as tiles (R5a's tiles, shared since X1): the grid behind
 * home's "Continue building" and the account page's "On this browser". Each
 * tile opens the editor — the claim token in this browser is what lets it
 * save — with the share page as the one action. No "use client": both
 * callers are client components and it only paints.
 */
import Link from "next/link";

import { DeckTile, DeckTileGrid } from "@/components/deck/deck-tile";
import type { BrowserDeck } from "@/components/deck/use-browser-decks";
import { deckTileData } from "@/lib/decks/tiles";

export function BrowserDeckTiles({
  decks,
  className,
}: {
  decks: BrowserDeck[];
  className?: string;
}) {
  return (
    <DeckTileGrid className={className}>
      {decks.map((deck) => (
        <DeckTile
          key={deck.id}
          tile={deckTileData({
            href: `/decks/${deck.id}/edit`,
            name: deck.name,
            game: deck.game,
            formatCode: deck.format,
            visibility: deck.visibility,
            updatedAt: deck.updatedAt,
            likesCount: deck.likesCount,
            ciMask: deck.ciMask,
            leaderImage: deck.leaderImage,
          })}
          linkTitle={`Edit ${deck.name}`}
          actions={
            <Link
              href={`/d/${deck.publicId}`}
              className="text-muted-foreground text-xs hover:underline"
            >
              Share page
            </Link>
          }
        />
      ))}
    </DeckTileGrid>
  );
}

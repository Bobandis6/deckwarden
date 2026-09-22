/**
 * /precons — every Commander preconstructed deck (W8b, WAVE2.md D7): one
 * static page with all ~181 tiles in the HTML grouped by release year, so
 * every precon link is crawlable, and a client-side filter island
 * (PreconsIndexView) that narrows what's shown without any server
 * searchParams.
 *
 * Caching intent: ISR, revalidate daily — the data changes only when the
 * W8a ingest lands a new product (nightly at most), and the page reads the
 * DB only at revalidate time: three statements for ~181 rows, zero per
 * visit. No searchParams by design (D7): filters are client state over the
 * already-shipped tiles.
 *
 * Cold-start rule (WAVE2 §F): precons render AS product lists — the tiles
 * carry "Released Nov 2016", never "Updated", and no community counts.
 */
import type { Metadata } from "next";

import { PreconsIndexView, type PreconItem } from "@/components/deck/precons-index-view";
import { GAME_SWITCH_LABELS } from "@/components/game-switch";
import { normalizeCardName } from "@/lib/cards/normalize";
import { releasedLabel } from "@/lib/decks/precon-info";
import { loadPreconIndex } from "@/lib/decks/precons";
import { deckTileData, leaderTileImage } from "@/lib/decks/tiles";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Precons",
  description:
    "Every Commander preconstructed deck, card for card — browse official precons by year and color, then start from one and make it yours.",
  alternates: { canonical: "/precons" },
};

export default async function PreconsPage() {
  const { rows, leaderNames } = await loadPreconIndex();
  const items: PreconItem[] = rows.map((row) => {
    const leaders = row.leaderIds.flatMap((id) => leaderNames.get(id) ?? []);
    const released = releasedLabel(row.releaseDate);
    return {
      publicId: row.publicId,
      year: row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : null,
      releaseDate: row.releaseDate,
      ciMask: row.ciMask,
      /** One normalized haystack for the search box: deck name + commanders + set. */
      search: normalizeCardName([row.name, ...leaders, row.setName, row.setCode].join(" ")),
      tile: deckTileData({
        href: `/d/${row.publicId}`,
        name: row.name,
        game: "mtg",
        formatCode: "commander",
        updatedAt: row.releaseDate ?? new Date(0),
        likesCount: 0,
        ciMask: row.ciMask,
        leaderImage: leaderTileImage(
          row.printingId ? { id: row.printingId, imageOverride: row.imageOverride } : null,
        ),
        dateLabel: released ? `Released ${released}` : "Release date unknown",
        priceLabel: row.estUsd !== null ? `≈ $${Math.round(row.estUsd)}` : null,
      }),
    };
  });

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Precons</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every Commander preconstructed deck, card for card. Start from one and make it yours.
      </p>

      {/* D7's game pills: One Piece has no starter-deck data yet (LATER.md,
          "One Piece starter decks") — the pill is disabled with the hint,
          never a dead link. Static markup, not GameSwitch: there is no
          second page to switch to. */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Game">
        <span
          aria-current="page"
          className="bg-foreground text-background inline-flex items-center rounded-md border px-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:px-3"
        >
          {GAME_SWITCH_LABELS.mtg}
        </span>
        <span
          aria-disabled="true"
          className="text-muted-foreground inline-flex items-center rounded-md border border-dashed px-2 py-1 text-sm pointer-coarse:min-h-11 pointer-coarse:px-3"
        >
          {GAME_SWITCH_LABELS.optcg} — soon
        </span>
        <span className="text-muted-foreground text-xs">One Piece starter decks are coming.</span>
      </div>

      <PreconsIndexView items={items} />

      <p className="text-muted-foreground mt-12 text-xs">
        Official product lists via{" "}
        <a href="https://mtgjson.com" className="underline" rel="noreferrer" target="_blank">
          MTGJSON
        </a>
        ; card data, images and prices courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        . Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
      </p>
    </main>
  );
}

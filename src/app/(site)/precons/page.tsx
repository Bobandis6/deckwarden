/**
 * /precons — every Commander preconstructed deck (W8b, WAVE2.md D7): one
 * static page with all ~181 tiles in the HTML grouped by release year, so
 * every precon link is crawlable, and a client-side filter island
 * (PreconsIndexView) that narrows what's shown without any server
 * searchParams.
 *
 * Caching intent: ISR, revalidate daily — the data changes only when the
 * W8a ingest lands a new product (nightly at most), and the page reads the
 * DB only at build and revalidate time, zero per visit: three statements
 * for the ~182 index rows, and (LATER row 151) three more for every
 * precon's bracket read at once (loadPreconBracketFacts: the cards, the
 * complete combos, the freshness), never one per tile. So each tile's read
 * is as fresh as the page, a day at most: the nightly ingests move it
 * rarely. No searchParams by design (D7): filters are client state over
 * the already-shipped tiles.
 *
 * The bracket read (LATER row 151, WAVE4 F): each tile says its precon's
 * read in its share page's words (precon-brackets.ts), in the server HTML,
 * and the island filters by its bands. Premium never gates it.
 *
 * Cold-start rule (WAVE2 §F): precons render AS product lists — the tiles
 * carry "Released Nov 2016", never "Updated", and no community counts.
 */
import type { Metadata } from "next";

import { PreconsIndexView, type PreconItem } from "@/components/deck/precons-index-view";
import { GAME_SWITCH_LABELS } from "@/components/game-switch";
import { Chip } from "@/components/ui/chip";
import { nounLabel } from "@/lib/brackets/copy";
import { normalizeCardName } from "@/lib/cards/normalize";
import { preconBracket } from "@/lib/decks/precon-brackets";
import { releasedLabel } from "@/lib/decks/precon-info";
import { loadPreconBracketFacts, loadPreconIndex } from "@/lib/decks/precons";
import { deckTileData, leaderTileImage } from "@/lib/decks/tiles";
import { getAdapter } from "@/lib/games/registry";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Precons",
  description:
    "Every Commander preconstructed deck, card for card. Browse official precons by year and color, then start from one and make it yours.",
  alternates: { canonical: "/precons" },
};

export default async function PreconsPage() {
  // Every precon is a Magic Commander list (the tiles say so below).
  const adapter = getAdapter("mtg");
  const commander = adapter.formats.find((f) => f.code === "commander");
  const [{ rows, leaderNames }, facts] = await Promise.all([
    loadPreconIndex(),
    loadPreconBracketFacts(adapter),
  ]);
  const items: PreconItem[] = rows.map((row) => {
    const leaders = row.leaderIds.flatMap((id) => leaderNames.get(id) ?? []);
    const released = releasedLabel(row.releaseDate);
    const bracket = commander
      ? preconBracket({
          adapter,
          format: commander,
          entries: facts.entries.get(row.id) ?? [],
          cards: facts.cards,
          combos: facts.combos.get(row.id) ?? [],
          freshness: facts.freshness,
        })
      : null;
    return {
      publicId: row.publicId,
      year: row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : null,
      releaseDate: row.releaseDate,
      ciMask: row.ciMask,
      /** One normalized haystack for the search box: deck name + commanders + set. */
      search: normalizeCardName([row.name, ...leaders, row.setName, row.setCode].join(" ")),
      bands: bracket?.bands ?? [],
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
        bracketLine: bracket?.line ?? null,
      }),
    };
  });

  return (
    <main id="main" className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">
      <h1 className="type-title">Precons</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every Commander preconstructed deck, card for card. Start from one and make it yours.
      </p>

      {/* D7's game pills: One Piece has no starter-deck data yet (LATER.md,
          "One Piece starter decks") — the pill is disabled with the hint,
          never a dead link. Static markup, not GameSwitch: there is no
          second page to switch to. role="group" (U7b, LATER row 136): ARIA
          ignores a label on a generic element, so the name needs the role. */}
      <div role="group" aria-label="Game" className="mt-4 flex flex-wrap items-center gap-1.5">
        <Chip aria-current="page" pressed>
          {GAME_SWITCH_LABELS.mtg}
        </Chip>
        <Chip aria-disabled="true">{GAME_SWITCH_LABELS.optcg} (soon)</Chip>
        <span className="text-muted-foreground text-xs">One Piece starter decks are coming.</span>
      </div>

      <PreconsIndexView
        items={items}
        bracketLabel={adapter.brackets ? nounLabel(adapter.brackets) : undefined}
      />

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

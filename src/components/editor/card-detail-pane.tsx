"use client";

/**
 * Card detail pane (P1.2): the card under the cursor — search highlight or a
 * clicked deck row. Full-card Scryfall CDN image via plain <img> (unoptimized
 * by design — CLAUDE.md; artist/© line stays visible in the frame), with the
 * adapter's display contract providing every game-flavored string.
 */
import Link from "next/link";

import { CostPips } from "@/components/deck/cost-pips";
import type { EditorCard } from "@/lib/decks/editor-state";
import type { GameAdapter } from "@/lib/games/types";

export function CardDetailPane({
  adapter,
  card,
}: {
  adapter: GameAdapter;
  card: EditorCard | null;
}) {
  if (!card) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Search or click a card to see it here.
      </div>
    );
  }
  const statLine = adapter.display.statLine?.(card) ?? null;

  return (
    <div className="p-3">
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt={card.name}
          width={488}
          height={680}
          className="mx-auto w-full max-w-72 rounded-[4.75%/3.5%] shadow-md"
        />
      ) : (
        <div className="bg-muted mx-auto flex aspect-488/680 w-full max-w-72 items-center justify-center rounded-xl p-3 text-center text-sm">
          {card.name}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-semibold">{card.name}</h2>
        <CostPips html={adapter.display.costHtml(card)} className="text-xs" />
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm">
        {adapter.display.subtitle(card)}
        {statLine ? ` · ${statLine}` : ""}
      </p>
      <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {adapter.display.bodyText(card)}
      </div>
      <p className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
        <span>{card.cheapestUsd !== null ? `from $${card.cheapestUsd.toFixed(2)}` : ""}</span>
        <Link href={`/cards/${card.id}`} className="hover:underline" target="_blank">
          Card page →
        </Link>
      </p>
    </div>
  );
}

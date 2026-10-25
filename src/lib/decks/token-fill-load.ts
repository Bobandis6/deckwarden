/**
 * The share page's token fill (TOKEN-FILL): the derivation (./token-fill.ts)
 * over the deck's loaded cards, then the token cards themselves in ONE
 * statement — the card wire by external key, scoped to the deck's game and
 * guarded by `tokenSql` (a key is only ever a catalog object's) — and
 * nothing asked when the list links nothing. Tokens have no legality rows,
 * so the legality query is skipped. The order is the section's: name, then
 * caption (fifteen Soldiers read 1/1 white before 2/2 white).
 *
 * Server-only by import (drizzle); the editor derives the same set
 * client-side and hydrates through POST /api/cards/resolve instead.
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { tokenSql } from "@/lib/cards/tokens-sql";
import { toWire, wireSelect } from "@/lib/cards/wire";
import type { CardWire } from "@/lib/decks/editor-state";
import { tokenFill } from "@/lib/decks/token-fill";
import type { CardData, FormatDef, GameAdapter } from "@/lib/games/types";

const { cardIdentities: ci } = schema;

export interface TokenFillItem {
  card: CardWire;
  /** The playable cards that make it, name order. */
  from: string[];
}

export async function loadTokenFill(
  deck: { gameId: number; hiddenTokens: string[] | null },
  cards: readonly { cardId: string; zone: string; card: CardWire }[],
  fmt: { adapter: GameAdapter; format: FormatDef },
): Promise<TokenFillItem[]> {
  const fill = tokenFill({
    adapter: fmt.adapter,
    format: fmt.format,
    entries: cards,
    cards: new Map(cards.map((c) => [c.cardId, c.card])),
    hidden: deck.hiddenTokens,
  });
  const keys = [...fill.shown.keys()];
  if (keys.length === 0) return [];

  const rows = await wireSelect(getDb()).where(
    and(
      eq(ci.gameId, deck.gameId),
      eq(ci.isRemoved, false),
      tokenSql(ci.attrs),
      inArray(ci.externalKey, keys),
    ),
  );
  const noLegality = new Map<string, never[]>();
  const caption = (c: CardWire) =>
    fmt.adapter.display.tokenCaption?.({ ...c, legality: c.legality ?? [] } as CardData) ?? "";
  return rows
    .map((r) => ({ card: toWire(r, noLegality), from: fill.shown.get(r.externalKey) ?? [] }))
    .sort(
      (a, b) =>
        a.card.name.localeCompare(b.card.name) || caption(a.card).localeCompare(caption(b.card)),
    );
}

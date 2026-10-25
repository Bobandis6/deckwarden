/**
 * The token fill (TOKEN-FILL): the tokens a deck's cards make, shown as
 * part of its Tokens list without a click — derived wherever the deck is
 * read, never written to deck_cards. One pure, client-safe, game-ignorant
 * module for the editor's hook (src/components/deck/use-token-fill.ts),
 * the share page's loader (./token-fill-load.ts) and the tests.
 *
 * The derivation runs over the PLAYABLE list (./playable.ts: the leader
 * zone and the counted zones — a token sitting in the token zone makes
 * nothing). Each card's `adapter.tokenLinks` (Magic: attrs.tokens, the
 * oracle ids Scryfall's all_parts names) is a key into the token catalog.
 *   - A key the deck HOLDS as a row in its token zone is the player's own
 *     (a quantity, steppers) and wins: the list never shows Treasure twice,
 *     and a hidden key the player then adds by hand shows as that row.
 *   - A key the owner HID (decks.hidden_tokens) leaves the shown set and,
 *     while the cards still link it, joins the hidden set the chips show.
 *     Once its makers leave the deck it shows nothing and stays stored: cut
 *     Smothering Tithe, add Dockside Extortionist a month later, and
 *     Treasure stays hidden as asked.
 *
 * Hidden keys are a SETTING on the deck, like its goals: their own PATCH
 * body `{hiddenTokens}` (the whole array; null or [] clears), which never
 * moves updated_at; the owner's wire alone carries them; never copied on
 * fork (forks.ts inserts explicit columns); not versioned.
 */
import { z } from "zod";

import { playableEntries, tokenZoneOf } from "@/lib/decks/playable";
import type { CardData, FormatDef, GameAdapter } from "@/lib/games/types";

/** A deck links a handful; the cap bounds the row and the body. */
export const HIDDEN_TOKENS_MAX = 100;
/** An oracle id is 36 chars; One Piece ids are shorter. */
export const HIDDEN_TOKEN_KEY_MAX = 64;

/** The PATCH body's `hiddenTokens` (and the create's, should one ever carry it). */
export const hiddenTokensSchema = z
  .array(z.string().min(1).max(HIDDEN_TOKEN_KEY_MAX))
  .max(HIDDEN_TOKENS_MAX);

/** Sorted and de-duplicated; null when empty (the column's 0-byte state). */
export function normalizeHiddenTokens(keys: readonly string[] | null | undefined): string[] | null {
  if (!keys) return null;
  const unique = [...new Set(keys)].sort();
  return unique.length > 0 ? unique : null;
}

/** The canonical PATCH body — the editor's baseline compares these as strings. */
export function hiddenTokensPatchBody(keys: readonly string[] | null): string {
  return JSON.stringify({ hiddenTokens: normalizeHiddenTokens(keys) });
}

/** What the derivation reads off a card: what `tokenLinks` takes (CardWire and EditorCard both fit). */
export type FillCard = Omit<CardData, "legality">;

export interface TokenFill {
  /** Token key → the names of the playable cards that make it (name order), key order. Shown. */
  shown: ReadonlyMap<string, string[]>;
  /** The hidden keys the cards still link — the chips — with their makers. */
  hidden: ReadonlyMap<string, string[]>;
}

const NONE: TokenFill = { shown: new Map(), hidden: new Map() };

/**
 * The deck's token fill. `entries` is the whole list (every zone); `cards`
 * looks a card up by its id. A format without a token zone, or a game
 * without links, fills nothing.
 */
export function tokenFill<C extends FillCard>({
  adapter,
  format,
  entries,
  cards,
  hidden,
}: {
  adapter: Pick<GameAdapter, "tokenLinks">;
  format: FormatDef;
  entries: readonly { cardId: string; zone: string }[];
  cards: ReadonlyMap<string, C> | ((id: string) => C | undefined);
  hidden?: readonly string[] | null;
}): TokenFill {
  const zone = tokenZoneOf(format);
  const links = adapter.tokenLinks;
  if (!zone || !links) return NONE;
  const get = typeof cards === "function" ? cards : (id: string) => cards.get(id);

  // The player's own rows: their keys are never derived (stored wins).
  const held = new Set<string>();
  for (const e of entries) {
    if (e.zone !== zone.id) continue;
    const key = get(e.cardId)?.externalKey;
    if (key) held.add(key);
  }

  const makers = new Map<string, Set<string>>();
  for (const e of playableEntries(entries, format)) {
    const card = get(e.cardId);
    if (!card) continue;
    for (const key of links(card)) {
      if (held.has(key)) continue;
      let from = makers.get(key);
      if (!from) makers.set(key, (from = new Set()));
      from.add(card.name);
    }
  }
  if (makers.size === 0) return NONE;

  const hiddenKeys = new Set(hidden ?? []);
  const shown = new Map<string, string[]>();
  const kept = new Map<string, string[]>();
  for (const key of [...makers.keys()].sort()) {
    const from = [...(makers.get(key) ?? [])].sort((a, b) => a.localeCompare(b));
    (hiddenKeys.has(key) ? kept : shown).set(key, from);
  }
  return { shown, hidden: kept };
}

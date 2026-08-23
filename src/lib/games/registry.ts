/**
 * The only place game modules are enumerated. Core code imports adapters from
 * here and consumes ONLY the GameAdapter interface — never `./mtg/*` internals.
 *
 * Adapters are registered under the widened GameAdapter type (attrs =
 * Record<string, unknown>): past this door the core is game-ignorant by
 * construction. Azuki (M5) is a new entry here, not a rewrite.
 */
import type { GameAdapter, GameId } from "./types";
import { mtgAdapter } from "./mtg/adapter";
import { optcgAdapter } from "./optcg/adapter";

const ADAPTERS: Partial<Record<GameId, GameAdapter>> = {
  mtg: mtgAdapter,
  optcg: optcgAdapter,
};

export function getAdapter(gameId: GameId): GameAdapter {
  const adapter = ADAPTERS[gameId];
  if (!adapter) throw new Error(`No adapter registered for game "${gameId}"`);
  return adapter;
}

export function listAdapters(): GameAdapter[] {
  return Object.values(ADAPTERS);
}

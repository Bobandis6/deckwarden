/**
 * The only place game modules are enumerated. Core code imports adapters from
 * here and consumes ONLY the GameAdapter interface — never `./mtg/*` internals.
 *
 * Adapters are registered under the widened GameAdapter type (attrs =
 * Record<string, unknown>): past this door the core is game-ignorant by
 * construction. Azuki (M5) is a new entry here, not a rewrite.
 *
 * `GameId` names azuki (seeded as games row 3, typed since M1) while no
 * adapter exists for it, so `getAdapter("azuki")` throws by design. The
 * code that meets a game id from the wire or a database row and must not
 * throw asks `hasAdapter` / `findAdapter` instead (S8, SECURITY-AUDIT-report.md
 * I7) — the one guard where two components each kept a `"mtg" | "optcg"`
 * narrowing of their own. The seed row and the type stay until the owner
 * drops the game (LATER.md: the azuki row).
 */
import type { GameAdapter, GameId } from "./types";
import { mtgAdapter } from "./mtg/adapter";
import { optcgAdapter } from "./optcg/adapter";

const ADAPTERS = {
  mtg: mtgAdapter,
  optcg: optcgAdapter,
} satisfies Partial<Record<GameId, GameAdapter>>;

/** The games that have an adapter today — `GameId` minus the ones only typed and seeded. */
export type AdapterGameId = keyof typeof ADAPTERS;

export function getAdapter(gameId: GameId): GameAdapter {
  const adapter = findAdapter(gameId);
  if (!adapter) throw new Error(`No adapter registered for game "${gameId}"`);
  return adapter;
}

/** Whether a game code (from the wire, a row, a URL) has an adapter; a type guard. */
export function hasAdapter(gameId: string | null | undefined): gameId is AdapterGameId {
  return typeof gameId === "string" && Object.hasOwn(ADAPTERS, gameId);
}

/** The adapter for a game code, or undefined — never a throw — for one without. */
export function findAdapter(gameId: string | null | undefined): GameAdapter | undefined {
  return hasAdapter(gameId) ? (ADAPTERS[gameId] as GameAdapter) : undefined;
}

export function listAdapters(): GameAdapter[] {
  return Object.values(ADAPTERS) as GameAdapter[];
}

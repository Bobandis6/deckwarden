/**
 * Reference rows with FIXED ids. Code elsewhere may hard-code these ids
 * (e.g. GAME_ID.mtg) — never renumber; only append.
 */

export const GAME_ID = { mtg: 1, optcg: 2, azuki: 3 } as const;
export type GameCode = keyof typeof GAME_ID;

export const GAMES: ReadonlyArray<{ id: number; code: GameCode; name: string }> = [
  { id: GAME_ID.mtg, code: "mtg", name: "Magic: The Gathering" },
  { id: GAME_ID.optcg, code: "optcg", name: "One Piece Card Game" },
  { id: GAME_ID.azuki, code: "azuki", name: "Azuki TCG" },
];

export const FORMAT_ID = { commander: 1 } as const;

/**
 * Commander defaults to `legal` — the vast majority of ~35k oracle cards are, so
 * "exceptions only" means the legality differ stores just bans + not_legal (un-cards,
 * digital-only, conspiracies…): a few thousand rows instead of tens of thousands.
 * Preview cards are handled by `is_preview` (adapter → NOT_RELEASED warning), not here.
 */
export const FORMATS: ReadonlyArray<{
  id: number;
  gameId: number;
  code: string;
  name: string;
  defaultLegality: "legal" | "banned" | "restricted" | "not_legal";
}> = [
  {
    id: FORMAT_ID.commander,
    gameId: GAME_ID.mtg,
    code: "commander",
    name: "Commander",
    defaultLegality: "legal",
  },
];

export type SeededFormat = (typeof FORMATS)[number];

/** Resolve a seeded format row from API-facing codes; undefined = not a playable pair yet. */
export function findFormat(game: GameCode, formatCode: string): SeededFormat | undefined {
  return FORMATS.find((f) => f.gameId === GAME_ID[game] && f.code === formatCode);
}

export function findFormatById(formatId: number): SeededFormat | undefined {
  return FORMATS.find((f) => f.id === formatId);
}

export function gameCodeById(gameId: number): GameCode | undefined {
  return (Object.keys(GAME_ID) as GameCode[]).find((code) => GAME_ID[code] === gameId);
}

/**
 * The ruleset watch (Y3a, WAVE4 D3) — pure: compares the Game Changers the
 * latest successful Scryfall run recorded (ingest_runs.stats.game_changers)
 * with the pin in ./bracket-ruleset.ts. scripts/ruleset-watch.ts reads the run
 * and exits 1 on any failure, so the nightly goes red like the DB gauge.
 */
import { BRACKET_RULESET } from "./bracket-ruleset";

export const GAME_CHANGERS_CHANGED =
  "The Game Changers list changed on Scryfall — read Wizards' announcement, then update the ruleset's as-of date and hash.";

export interface WatchedRun {
  id: number;
  startedAt: string;
  stats: unknown;
}

export interface WatchResult {
  ok: boolean;
  message: string;
}

interface PinnedGameChangers {
  asOf: string;
  count: number;
  md5: string;
}

function recorded(stats: unknown): { count: number; md5: string } | null {
  if (typeof stats !== "object" || stats === null) return null;
  const gc = (stats as { game_changers?: unknown }).game_changers;
  if (typeof gc !== "object" || gc === null) return null;
  const { count, md5 } = gc as { count?: unknown; md5?: unknown };
  return typeof count === "number" && typeof md5 === "string" ? { count, md5 } : null;
}

export function watchGameChangers(
  run: WatchedRun | null,
  pinned: PinnedGameChangers = BRACKET_RULESET.gameChangers,
): WatchResult {
  if (!run) return { ok: false, message: "No successful Scryfall run to compare yet." };
  const where = `run #${run.id} of ${run.startedAt}`;
  const seen = recorded(run.stats);
  if (!seen) {
    return {
      ok: false,
      message: `The latest successful Scryfall run (${where}) recorded no Game Changers, so the ruleset watch has nothing to compare.`,
    };
  }
  const ruleset = `the ruleset: ${pinned.count} cards as of ${pinned.asOf} (md5 ${pinned.md5})`;
  if (seen.md5 !== pinned.md5) {
    return {
      ok: false,
      message: `${GAME_CHANGERS_CHANGED}\nScryfall: ${seen.count} cards (md5 ${seen.md5}) in ${where} · ${ruleset}.`,
    };
  }
  return {
    ok: true,
    message: `Game Changers match the ruleset: ${seen.count} cards as of ${pinned.asOf} (${where}).`,
  };
}

/**
 * Which Topdeck events count toward the commander×card aggregate (LATER row
 * 296) — pure, no IO. The ingest asks Topdeck for its "EDH" format, which
 * carries bracket-capped, budget, casual and precon events beside competitive
 * ones, and the aggregate's copy says "competitive".
 *
 * Event names can't tell them apart: over the 180 days to 2026-09-01, 506
 * lists that are a precon as printed sat at events whose names say nothing,
 * and names run in several languages. The lists can: an event counts when at
 * least half of its lists hold more Game Changers than Bracket 3 allows, the
 * line Wizards' own brackets draw. Events barely sit between: 1,583 of 1,893
 * had every list past it, 225 had none, and any floor from 25 % to 75 % moves
 * 70 of the 20,771 lists. The events it keeps were 99.5 % such lists.
 *
 * Whole events, not single lists: keeping only the lists past the line would
 * make every share "among lists that already hold Game Changers", and a list
 * under it at a competitive event is real competitive play.
 */
import { BRACKET_RULESET } from "./bracket-ruleset";

/** Bracket 3 allows this many Game Changers, and a list past it is Bracket 4 or above. */
const BRACKET_3_ALLOWANCE = BRACKET_RULESET.levels.find((l) => l.level === 3)!.gameChangers!;

export const COMPETITIVE_LIST_GAME_CHANGERS = BRACKET_3_ALLOWANCE + 1;

/**
 * Wizards' list held 53 cards at this rule's writing. Far fewer means the feed
 * failed, and every event would read casual and be marked aggregated for good,
 * so the job must stop before it counts anything.
 */
export const GAME_CHANGERS_FLOOR = 20;

interface ListCards {
  leaderIds: readonly string[];
  cardIds: readonly string[];
}

function pastBracket3(list: ListCards, gameChangers: ReadonlySet<string>): boolean {
  // A commander counts: the mapper leaves commanders out of cardIds.
  let held = 0;
  for (const id of list.leaderIds) if (gameChangers.has(id)) held++;
  for (const id of list.cardIds) if (gameChangers.has(id)) held++;
  return held >= COMPETITIVE_LIST_GAME_CHANGERS;
}

/** Whether an event's lists count; an event with no readable lists has nothing to count. */
export function isCompetitiveEvent(
  lists: readonly ListCards[],
  gameChangers: ReadonlySet<string>,
): boolean {
  if (lists.length === 0) return false;
  const past = lists.filter((list) => pastBracket3(list, gameChangers)).length;
  return past * 2 >= lists.length;
}

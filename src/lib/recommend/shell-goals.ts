/**
 * Goals in Autofill (Y6b, WAVE4 D7) — the deck's target, held while a
 * starter shell grows. Pure.
 *
 * The planner asks before it takes a card: would this card sit above the
 * target in the list as it stands now — the leaders, the kept cards and
 * every pick so far? The adapter's `impact` answers, the same rules
 * Suggestions hide by (Y6a), so core names none of them: a Game Changer past
 * the target's allowance, mass land denial, an extra-turn card past what the
 * target allows, a combo above it. Counts run against the growing list (a
 * third Game Changer fits a target of 3 when the deck keeps none, not when
 * it keeps two), and combos against the whole of it: `combos` holds every
 * combo complete within keep ∪ the candidate pool, so two picks that
 * complete one together are caught when the second is asked about.
 *
 * `skippedByGoals` counts what the target kept out, for the notes: the
 * shell the same seed plans with no goals, walked in pick order.
 */
import type {
  BracketAnswers,
  BracketConflict,
  BracketInput,
  BracketRead,
  BracketsMeta,
  CardData,
  CompleteCombo,
  DeckEntry,
  DeckSnapshot,
} from "@/lib/games/types";

/** The goals check for a growing shell. */
export interface ShellGoals {
  /**
   * The reasons `cardId` would sit above the target, joining the kept list
   * plus `picks` (the shell so far, in pick order); empty = it fits.
   */
  conflicts(cardId: string, picks: readonly string[]): BracketConflict[];
}

export interface ShellGoalsInput {
  meta: Pick<BracketsMeta, "assess" | "impact">;
  /** The kept list as the read takes it: the leaders and the kept cards, in their zones. */
  deck: DeckSnapshot;
  /** Its cards, as the read sees them (their declared flags). */
  cards: ReadonlyMap<string, CardData>;
  /** Every candidate the planner may ask about, as the read sees it. */
  candidates: ReadonlyMap<string, CardData>;
  /** Every combo complete within the kept list ∪ the candidates. */
  combos: readonly CompleteCombo[];
  /** The zone picks land in. */
  zone: string;
  targetLevel: number;
  answers: BracketAnswers | null;
}

export function shellGoals(i: ShellGoalsInput): ShellGoals {
  const byPiece = new Map<string, CompleteCombo[]>();
  for (const combo of i.combos) {
    for (const id of combo.cardPieces) {
      const list = byPiece.get(id);
      if (list) list.push(combo);
      else byPiece.set(id, [combo]);
    }
  }
  const keptIds = new Set(Object.values(i.deck.zones).flatMap((z) => z.map((e) => e.cardId)));

  // The list as it stands and its read, for the last `picks` asked about:
  // the planner asks about many cards against one list before it grows.
  let lastKey: string | null = null;
  let last: { input: BracketInput; read: BracketRead } | null = null;
  const stateFor = (picks: readonly string[]) => {
    const key = picks.join(",");
    if (last && key === lastKey) return last;
    const zones: Record<string, DeckEntry[]> = {};
    for (const [zone, entries] of Object.entries(i.deck.zones)) zones[zone] = [...entries];
    const cards = new Map(i.cards);
    for (const id of picks) {
      (zones[i.zone] ??= []).push({ cardId: id, qty: 1, tags: [] });
      const card = i.candidates.get(id);
      if (card) cards.set(id, card);
    }
    const held = new Set([...keptIds, ...picks]);
    const input: BracketInput = {
      deck: { ...i.deck, zones },
      cards,
      combos: i.combos.filter((c) => c.cardPieces.every((id) => held.has(id))),
      freshness: null,
      targetLevel: i.targetLevel,
      answers: i.answers,
    };
    last = { input, read: i.meta.assess(input) };
    lastKey = key;
    return last;
  };

  return {
    conflicts(cardId, picks) {
      const card = i.candidates.get(cardId);
      if (!card) return [];
      const { input, read } = stateFor(picks);
      return i.meta.impact({ ...input, read, card, completes: byPiece.get(cardId) ?? [] });
    },
  };
}

/**
 * What the target kept out of a shell (the notes' counts, by the adapter's
 * rule): `unconstrained` is the shell the same seed plans with no goals,
 * walked in pick order. A pick that would sit above the target counts once
 * under each rule it breaks and stays out of the list the next picks are
 * judged against — so a cap counts only what passed it.
 */
export function skippedByGoals(
  goals: ShellGoals,
  unconstrained: readonly { cardId: string }[],
): Record<string, number> {
  const kept: string[] = [];
  const counts: Record<string, number> = {};
  for (const pick of unconstrained) {
    const found = goals.conflicts(pick.cardId, kept);
    if (found.length === 0) {
      kept.push(pick.cardId);
      continue;
    }
    for (const rule of new Set(found.map((c) => c.rule))) counts[rule] = (counts[rule] ?? 0) + 1;
  }
  return counts;
}

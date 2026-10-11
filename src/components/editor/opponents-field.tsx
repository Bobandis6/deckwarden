"use client";

/**
 * The opponents' leaders (Y9b, WAVE4 D10) — one of the Games dialog's
 * folded details, through X2's suggest box in pick mode. Optional, like
 * every detail: an empty field sends nothing.
 *
 * - **Rows**: each picked opponent is a row of chips (the leader's name, a
 *   remove button); one empty box asks for the next opponent while the
 *   table has room — at most pod − 1 opponents.
 * - **A second leader** (the adapter's `opponentLeaders` ≥ 2 — Magic's
 *   partners): "Add a second commander" under a picked opponent opens a
 *   box for it, one at a time. That box asks for every card (`cards`
 *   scope): Magic's Backgrounds aren't leader candidates, so the `leaders`
 *   scope — the first box's — would never offer one. One Piece names one
 *   leader, so no second box ever shows.
 * - **What's stored** is each leader's external key off the suggest row
 *   (Magic: the Scryfall oracle id; One Piece: the printed id) — an entry
 *   of one or two per opponent. The route checks the shape only.
 * - **The chip names the card the way the game tells cards apart**: where
 *   the adapter surfaces a printed id (`showKey` — One Piece's 17 printed
 *   Enels), the chip reads "Enel (OP15-058)", the import format; Magic's
 *   names are unique, so its chips are the name alone.
 * - **The boxes are controlled** by the dialog (a folded Collapsible
 *   unmounts its panel; the text must survive it, because typed text that
 *   was never picked stops the log — `hasUnpickedText`). Each box is keyed
 *   by `serial`, which a pick bumps: Base UI fills the picked row's name
 *   into the box after the pick's own handler, and the guarded updater
 *   drops that late write instead of leaving the name in the next box.
 */
import { XIcon } from "lucide-react";

import { NameSuggest } from "@/components/search/name-suggest";
import { Button } from "@/components/ui/button";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import type { SuggestRow } from "@/lib/search/suggest";

/** One leader as picked: the key the game stores and the name the chip shows. */
export interface OpponentLeader {
  key: string;
  name: string;
}
/** One opponent: one leader, or two (partners). */
export type Opponent = OpponentLeader[];

/** The boxes' typed text — `secondFor` is the opponent whose second box is open. */
export interface OpponentBoxes {
  next: string;
  second: string;
  secondFor: number | null;
  /** Bumped by every pick: the boxes' React key, and the guard on a late fill. */
  serial: number;
}

export const EMPTY_BOXES: OpponentBoxes = { next: "", second: "", secondFor: null, serial: 0 };

/** The route's `opponents`: each opponent's keys, in the order picked. */
export function opponentsWire(opponents: readonly Opponent[]): string[][] {
  return opponents.map((o) => o.map((l) => l.key));
}

/** The table shrank: opponents past pod − 1 go, and a second box past them closes. */
export function fitOpponents(
  opponents: readonly Opponent[],
  boxes: OpponentBoxes,
  podSize: number,
): { opponents: Opponent[]; boxes: OpponentBoxes } {
  const kept = opponents.slice(0, Math.max(0, podSize - 1));
  const secondOpen = boxes.secondFor !== null && boxes.secondFor < kept.length;
  return {
    opponents: kept,
    boxes: secondOpen ? boxes : { ...boxes, secondFor: null, second: "" },
  };
}

/** Typed text in a box on screen that no pick backs — logging it would drop it silently. */
export function hasUnpickedText(
  opponents: readonly Opponent[],
  boxes: OpponentBoxes,
  maxOpponents: number,
): boolean {
  const nextShown = opponents.length < maxOpponents;
  return (
    (nextShown && boxes.next.trim() !== "") ||
    (boxes.secondFor !== null && boxes.second.trim() !== "")
  );
}

const toLeader = (row: SuggestRow, showKey: boolean): OpponentLeader => ({
  key: row.externalKey,
  name: showKey ? `${row.name} (${row.externalKey})` : row.name,
});

export function OpponentsField({
  game,
  noun,
  maxOpponents,
  leadersPerOpponent,
  showKey,
  opponents,
  boxes,
  onChange,
}: {
  game: "mtg" | "optcg";
  /** The adapter's leader noun ("Commander" / "Leader"). */
  noun: string;
  /** Pod size − 1. */
  maxOpponents: number;
  leadersPerOpponent: number;
  /** The game tells cards apart by a printed id (the adapter's `idBadge`): the chip shows it. */
  showKey: boolean;
  opponents: readonly Opponent[];
  boxes: OpponentBoxes;
  onChange: (
    next:
      { opponents: Opponent[]; boxes: OpponentBoxes } | ((prev: OpponentBoxes) => OpponentBoxes),
  ) => void;
}) {
  if (maxOpponents < 1) return null;
  const detail = game === "mtg" ? "colors" : "number";
  const serial = boxes.serial;
  /** A box's typed text — dropped once a pick has moved the serial on (Base UI's late fill). */
  const typed = (field: "next" | "second") => (value: string) =>
    onChange((prev) => (prev.serial === serial ? { ...prev, [field]: value } : prev));

  const remove = (o: number, l: number) => {
    const next = opponents
      .map((opponent, i) => (i === o ? opponent.filter((_, j) => j !== l) : opponent))
      .filter((opponent) => opponent.length > 0);
    // A second box under a removed opponent closes; one under a later
    // opponent follows its row up.
    const removedRow = opponents[o].length === 1;
    let secondFor = boxes.secondFor;
    if (removedRow && secondFor !== null) {
      secondFor = secondFor === o ? null : secondFor > o ? secondFor - 1 : secondFor;
    }
    if (secondFor !== null && next[secondFor].length >= leadersPerOpponent) secondFor = null;
    onChange({
      opponents: next,
      boxes: { ...boxes, secondFor, second: secondFor === null ? "" : boxes.second },
    });
  };

  return (
    // The boxes are 44 px on touch like the dialog's other controls (X2's input is 32 px site-wide).
    <fieldset className="space-y-1.5 pointer-coarse:[&_input]:min-h-11" data-slot="games-opponents">
      <legend className="text-muted-foreground mb-1 block text-xs">
        {JOURNAL_COPY.opponentsLabel(noun, maxOpponents)}
      </legend>
      {opponents.length > 0 && (
        <ol className="space-y-1.5">
          {opponents.map((opponent, o) => (
            // By position: two players may sit down with the same commander.
            <li key={o} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {maxOpponents > 1 && (
                  <span aria-hidden className="text-muted-foreground w-4 text-xs tabular-nums">
                    {o + 1}
                  </span>
                )}
                {opponent.map((leader, l) => (
                  <span
                    key={leader.key}
                    data-slot="opponent-chip"
                    className="bg-muted inline-flex max-w-full items-center gap-0.5 rounded-full py-0.5 pr-0.5 pl-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{leader.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="rounded-full"
                      aria-label={JOURNAL_COPY.removeLeader(leader.name)}
                      onClick={() => remove(o, l)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </span>
                ))}
                {opponent.length < leadersPerOpponent && boxes.secondFor !== o && (
                  <button
                    type="button"
                    className="text-foreground cursor-pointer text-xs font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
                    onClick={() =>
                      onChange({
                        opponents: [...opponents],
                        boxes: { ...boxes, secondFor: o, second: "" },
                      })
                    }
                  >
                    {JOURNAL_COPY.addSecond(noun)}
                  </button>
                )}
              </div>
              {boxes.secondFor === o && (
                <NameSuggest
                  key={`second-${serial}`}
                  game={game}
                  scope="cards"
                  detail={detail}
                  type="text"
                  autoFocus
                  value={boxes.second}
                  onValueChange={typed("second")}
                  placeholder={JOURNAL_COPY.searchLeader(noun)}
                  aria-label={JOURNAL_COPY.secondBox(noun, o + 1)}
                  onPick={(row) => {
                    const next = opponents.map((opponent, i) =>
                      i === o && !opponent.some((l) => l.key === row.externalKey)
                        ? [...opponent, toLeader(row, showKey)]
                        : opponent,
                    );
                    onChange({
                      opponents: next,
                      boxes: { ...boxes, second: "", secondFor: null, serial: serial + 1 },
                    });
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {opponents.length < maxOpponents && (
        <NameSuggest
          key={`next-${serial}`}
          game={game}
          scope="leaders"
          detail={detail}
          type="text"
          value={boxes.next}
          onValueChange={typed("next")}
          placeholder={JOURNAL_COPY.searchLeader(noun)}
          aria-label={JOURNAL_COPY.opponentBox(noun, opponents.length + 1, maxOpponents)}
          onPick={(row) =>
            onChange({
              opponents: [...opponents, [toLeader(row, showKey)]],
              boxes: { ...boxes, next: "", serial: serial + 1 },
            })
          }
        />
      )}
    </fieldset>
  );
}

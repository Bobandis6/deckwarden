"use client";

/**
 * The Games dialog (Y9a, WAVE4 D10) — More → "Games…", live decks only.
 * The editor's dialog slot `"games"`: a bottom Drawer on phones, a Modal
 * from md (the swap sheets' SheetShell).
 *
 * "Log a game" sits at the top: the players (remembered per browser and
 * game), then Won / Lost / Draw — each logs at once. The optional details
 * (date, the turn it ended, the table's level where the adapter declares
 * one, the seat, the opponents' leaders, notes) stay folded.
 * Before the POST the editor flushes autosave, so the list the game keeps
 * is the list on screen; when that save fails, nothing is logged and the
 * dialog says so (the snapshot must equal the screen). On success the
 * editor closes the dialog and raises the toast "Logged a win · Undo" — a
 * modal would keep the toast's Undo out of reach.
 *
 * Account-only: a guest deck (this browser holds its edit key) reads the
 * sign-in sentence with `?next=` back to where it opened (`returnPath`: the
 * editor by default) and asks nothing; a signed-out owner (a 401) reads the
 * same. Below the log: the recent games (Y10 adds their numbers).
 *
 * Y9b: three doors open it — the editor's More → Games…, the share page's
 * "Log a game" and `/account`'s tile ⋯ "Log a game…" (those two load it on
 * demand, log-game-dialog.tsx; their saved list IS the screen, so their
 * `onBeforeLog` answers true at once). The opponents' leaders come through
 * X2's suggest box (opponents-field.tsx), stored as external keys; typed
 * text that was never picked stops the log and says so, like a turn
 * outside 1–99.
 */
import Link from "next/link";
import { useEffect, useId, useState, type ComponentProps } from "react";

import { Segmented } from "@/components/deck/segmented";
import { journalHeaders } from "@/components/editor/logged-toast";
import {
  EMPTY_BOXES,
  fitOpponents,
  hasUnpickedText,
  OpponentsField,
  opponentsWire,
  type Opponent,
  type OpponentBoxes,
} from "@/components/editor/opponents-field";
import { SheetShell } from "@/components/editor/sheet-shell";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { GameResult } from "@/db/schema";
import { accountHref } from "@/lib/auth/next-path";
import type { GameAdapter, JournalMeta } from "@/lib/games/types";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import type { GamesList, LogResult } from "@/lib/journal/games";
import { MAX_PLAYED_SNAPSHOTS_PER_DECK } from "@/lib/journal/limits";

const RESULTS: readonly GameResult[] = ["win", "loss", "draw"];
/** Recent games shown under the log (the route returns up to 50). */
const RECENT_SHOWN = 10;
/**
 * A Segmented's segments are as wide as its widest label (segmented.tsx):
 * short labels ("2"…"8", "1st"…"8th") fit eight to a 390 px phone, a
 * "Not set" among them six. Past that a choice is a select (Magic seats at
 * six or more players).
 */
export function fitsSegmented(options: readonly { label: string }[]): boolean {
  return options.length <= (options.some((o) => o.label.length > 3) ? 6 : 8);
}
/** "Not set" — a ToggleGroup never presses an empty value, so the sentinel is a word. */
const NOT_SET = "none";

function podKey(game: string): string {
  return `deckwarden:journal-pod:${game}`;
}

/** The remembered pod size (a per-browser convenience — storage may be gone). */
function readPod(game: string, journal: JournalMeta): number {
  try {
    const n = Number(window.localStorage.getItem(podKey(game)));
    if (Number.isInteger(n) && n >= journal.pod.min && n <= journal.pod.max) return n;
  } catch {
    /* private mode or blocked storage: the default stands */
  }
  return journal.pod.default;
}

function writePod(game: string, pod: number): void {
  try {
    window.localStorage.setItem(podKey(game), String(pod));
  } catch {
    /* the pick still applies to this log */
  }
}

/** Today on this device's calendar — what "today" means to the person at the table. */
function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A Segmented while it fits a phone, a select beyond (Magic seats at 6+ players). */
function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  if (fitsSegmented(options)) {
    return (
      <div className="space-y-1">
        <span className="text-muted-foreground block text-xs">{label}</span>
        <Segmented ariaLabel={label} options={options} value={value} onChange={onChange} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-muted-foreground block text-xs">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input focus-visible:ring-ring/50 bg-background rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type ListState =
  | { state: "loading" }
  | { state: "ready"; list: GamesList }
  | { state: "signed-out" }
  | { state: "error"; message: string };

export function GamesDialog({
  deckId,
  adapter,
  accountDeck,
  phone,
  returnPath,
  finalFocus,
  onBeforeLog,
  onLogged,
  onClose,
}: {
  deckId: string;
  adapter: GameAdapter;
  /** Owned through the session (this browser holds no edit key) — the journal is account-only. */
  accountDeck: boolean;
  phone: boolean;
  /** Where the sign-in sentence's `?next=` returns — the editor unless the door says otherwise (the share page: itself). */
  returnPath?: string;
  /** Where focus goes on close (the door that opened it: More, the row's button, the tile's ⋯). */
  finalFocus?: ComponentProps<typeof SheetShell>["finalFocus"];
  /** Flush pending autosaves; true once the list on screen is the saved list. */
  onBeforeLog: () => Promise<boolean>;
  /** A game logged: the editor closes the dialog and raises the toast with Undo. */
  onLogged: (logged: LogResult) => void;
  onClose: () => void;
}) {
  const journal = adapter.journal;
  const [list, setList] = useState<ListState>(() =>
    accountDeck ? { state: "loading" } : { state: "signed-out" },
  );
  const [pod, setPod] = useState(() => (journal ? readPod(adapter.id, journal) : 2));
  const [playedOn, setPlayedOn] = useState(() => localDay());
  const [endTurn, setEndTurn] = useState("");
  const [tableLevel, setTableLevel] = useState(NOT_SET);
  const [seat, setSeat] = useState(NOT_SET);
  const [notes, setNotes] = useState("");
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [boxes, setBoxes] = useState<OpponentBoxes>(EMPTY_BOXES);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountDeck) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/decks/${deckId}/games`, {
          headers: journalHeaders(deckId),
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 401) return setList({ state: "signed-out" });
        if (!res.ok) {
          return setList({ state: "error", message: JOURNAL_COPY.loadFailed(res.status) });
        }
        setList({ state: "ready", list: (await res.json()) as GamesList });
      } catch (err) {
        if (controller.signal.aborted) return;
        setList({ state: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => controller.abort();
  }, [accountDeck, deckId]);

  if (!journal) return null;
  const title = JOURNAL_COPY.title;

  if (list.state === "signed-out") {
    return (
      <SheetShell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
        <div data-slot="games-dialog" className="space-y-1 pb-1">
          <p className="text-sm">
            <Link
              href={accountHref(returnPath ?? `/decks/${deckId}/edit`)}
              className="font-medium underline underline-offset-4"
            >
              {JOURNAL_COPY.signIn}
            </Link>
          </p>
          <p className="text-muted-foreground text-xs">{JOURNAL_COPY.signInWhy}</p>
        </div>
      </SheetShell>
    );
  }

  const seats = journal.seats(pod);
  const seatOptions = [
    ...seats.map((s) => ({ value: String(s.seat), label: s.label })),
    { value: NOT_SET, label: JOURNAL_COPY.notSet },
  ];
  const levelOptions = journal.tableLevel
    ? [
        ...journal.tableLevel.levels.map((l) => ({
          value: String(l.level),
          label: String(l.level),
        })),
        { value: NOT_SET, label: JOURNAL_COPY.notSet },
      ]
    : null;
  const onePod = journal.pod.min === journal.pod.max;
  const noun = adapter.display.leaderNoun;
  // The suggest box knows the two games with card data; a game without one has no opponents field.
  const suggestGame = adapter.id === "mtg" || adapter.id === "optcg" ? adapter.id : null;
  const ready = list.state === "ready" ? list.list : null;
  const atAllowance = ready !== null && ready.playedSnapshots >= ready.playedAllowance;

  const changePod = (value: string) => {
    const next = Number(value);
    setPod(next);
    writePod(adapter.id, next);
    // A seat past the new table's size can't stand, nor opponents past pod − 1.
    if (seat !== NOT_SET && Number(seat) > next) setSeat(NOT_SET);
    const fitted = fitOpponents(opponents, boxes, next);
    setOpponents(fitted.opponents);
    setBoxes(fitted.boxes);
  };

  const changeOpponents = (
    next:
      { opponents: Opponent[]; boxes: OpponentBoxes } | ((prev: OpponentBoxes) => OpponentBoxes),
  ) => {
    if (typeof next === "function") return setBoxes(next);
    setOpponents(next.opponents);
    setBoxes(next.boxes);
  };

  const log = async (result: GameResult) => {
    if (busy) return;
    // The turn it ended, when given, is a whole number the route accepts — said
    // here rather than sent and answered "Invalid body".
    const turn = Number(endTurn);
    if (endTurn.trim() && !(Number.isInteger(turn) && turn >= 1 && turn <= 99)) {
      setError(JOURNAL_COPY.turnRange);
      return;
    }
    // A name typed but never picked has no key to keep — said, not dropped.
    if (hasUnpickedText(opponents, boxes, pod - 1)) {
      setError(JOURNAL_COPY.opponentUnpicked(noun));
      setDetailsOpen(true); // the box it names is in the folded details
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!(await onBeforeLog())) {
        setError(JOURNAL_COPY.flushFailed);
        return;
      }
      const res = await fetch(`/api/decks/${deckId}/games`, {
        method: "POST",
        headers: journalHeaders(deckId),
        body: JSON.stringify({
          result,
          podSize: pod,
          playedOn,
          ...(endTurn.trim() ? { endTurn: turn } : {}),
          ...(tableLevel !== NOT_SET ? { tableLevel: Number(tableLevel) } : {}),
          ...(seat !== NOT_SET ? { seat: Number(seat) } : {}),
          ...(opponents.length ? { opponents: opponentsWire(opponents) } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (res.status === 401) {
        setList({ state: "signed-out" });
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          res.status === 400 && json?.error ? json.error : JOURNAL_COPY.logFailed(res.status),
        );
        return;
      }
      onLogged((await res.json()) as LogResult);
    } catch {
      setError(JOURNAL_COPY.offline);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
      <div data-slot="games-dialog" className="space-y-4">
        <section aria-labelledby={`${deckId}-log`} className="space-y-3">
          <h3 id={`${deckId}-log`} className="text-sm font-medium">
            {JOURNAL_COPY.logHeading}
          </h3>
          {!onePod && (
            <Choice
              label={JOURNAL_COPY.players}
              options={Array.from({ length: journal.pod.max - journal.pod.min + 1 }, (_, i) => {
                const n = String(journal.pod.min + i);
                return { value: n, label: n };
              })}
              value={String(pod)}
              onChange={changePod}
            />
          )}
          <div className="flex gap-2" role="group" aria-label="Result">
            {RESULTS.map((result) => (
              <Button
                key={result}
                variant="outline"
                className="flex-1 pointer-coarse:min-h-11"
                disabled={busy}
                data-result={result}
                onClick={() => void log(result)}
              >
                {JOURNAL_COPY.resultButton(result)}
              </Button>
            ))}
          </div>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger className="text-foreground cursor-pointer text-xs font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11">
              {JOURNAL_COPY.moreDetails}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2" data-slot="games-details">
              <div className="flex flex-wrap gap-3">
                <label className="space-y-1">
                  <span className="text-muted-foreground block text-xs">{JOURNAL_COPY.date}</span>
                  <input
                    type="date"
                    value={playedOn}
                    max={localDay()}
                    required
                    onChange={(e) => setPlayedOn(e.target.value || localDay())}
                    className="border-input focus-visible:ring-ring/50 bg-background rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground block text-xs">
                    {JOURNAL_COPY.endTurn}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={endTurn}
                    onChange={(e) => setEndTurn(e.target.value)}
                    className="border-input focus-visible:ring-ring/50 bg-background w-20 rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
                  />
                </label>
              </div>
              {levelOptions && journal.tableLevel && (
                <Choice
                  label={`${journal.tableLevel.noun[0].toUpperCase()}${journal.tableLevel.noun.slice(1)}`}
                  options={levelOptions}
                  value={tableLevel}
                  onChange={setTableLevel}
                />
              )}
              <Choice
                label={JOURNAL_COPY.seat}
                options={seatOptions}
                value={seat}
                onChange={setSeat}
              />
              {suggestGame && (
                <OpponentsField
                  game={suggestGame}
                  noun={noun}
                  maxOpponents={pod - 1}
                  leadersPerOpponent={journal.opponentLeaders}
                  showKey={adapter.display.idBadge !== undefined}
                  opponents={opponents}
                  boxes={boxes}
                  onChange={changeOpponents}
                />
              )}
              <label className="block space-y-1">
                <span className="text-muted-foreground block text-xs">{JOURNAL_COPY.notes}</span>
                <textarea
                  value={notes}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  className="border-input focus-visible:ring-ring/50 bg-background w-full rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2"
                />
              </label>
            </CollapsibleContent>
          </Collapsible>
          {error && (
            <p aria-live="polite" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {ready && atAllowance
              ? JOURNAL_COPY.atAllowance(ready.playedAllowance)
              : JOURNAL_COPY.keepsList(MAX_PLAYED_SNAPSHOTS_PER_DECK)}
          </p>
        </section>

        <section aria-labelledby={`${deckId}-recent`}>
          <h3
            id={`${deckId}-recent`}
            className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase"
          >
            {JOURNAL_COPY.recentHeading}
          </h3>
          {list.state === "loading" ? (
            <p className="text-muted-foreground mt-2 text-xs">{JOURNAL_COPY.loading}</p>
          ) : list.state === "error" ? (
            <p className="text-destructive mt-2 text-xs">{list.message}</p>
          ) : list.list.games.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-xs">{JOURNAL_COPY.noGames}</p>
          ) : (
            <ul className="mt-1 divide-y text-sm" data-slot="games-recent">
              {list.list.games.slice(0, RECENT_SHOWN).map((game) => (
                <li key={game.id} className="py-1.5">
                  {JOURNAL_COPY.gameLine({
                    playedOn: game.playedOn,
                    result: game.result,
                    podSize: game.podSize,
                    seatPhrase:
                      game.seat === null
                        ? null
                        : (journal.seats(game.podSize).find((s) => s.seat === game.seat)?.phrase ??
                          null),
                    version: game.version,
                    onePod,
                  })}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SheetShell>
  );
}

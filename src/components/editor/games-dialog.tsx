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
 * same.
 *
 * Y9b: three doors open it — the editor's More → Games…, the share page's
 * "Log a game" and `/account`'s tile ⋯ "Log a game…" (those two load it on
 * demand, log-game-dialog.tsx; their saved list IS the screen, so their
 * `onBeforeLog` answers true at once). The opponents' leaders come through
 * X2's suggest box (opponents-field.tsx), stored as external keys; typed
 * text that was never picked stops the log and says so, like a turn
 * outside 1–99.
 *
 * Y10 — the record, honest about small numbers (record.ts): "N games ·
 * W–L–D" counted over every game (the GET's grouped cells, not only the
 * recent ones), split by players with the table's baseline ("an even
 * table wins 1 in 4"; One Piece's 1v1 says it once), then by list — the
 * newest lists played, each with `diffSummary` since the list played
 * before it, "Too few games to compare" below 5 games, and the games
 * logged with no list kept in their own row. A percentage only from 10
 * games. Below it the recent games name their opponents ("vs …", LATER
 * row 199) and each one is editable: the same fields as the log, filled
 * with the game as stored, saved through PATCH (only what changed), or
 * deleted; the list it was played with never moves.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";

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
import type { GameWire, GamesList, LogResult } from "@/lib/journal/games";
import { MAX_PLAYED_SNAPSHOTS_PER_DECK } from "@/lib/journal/limits";
import { shownPercent, summarizeRecord, tooFewToCompare } from "@/lib/journal/record";

const RESULTS: readonly GameResult[] = ["win", "loss", "draw"];
/** Recent games shown under the record (the route returns up to 50). */
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

/** A game's fields as the form holds them — the log's and an edit's. */
interface GameForm {
  pod: number;
  playedOn: string;
  endTurn: string;
  tableLevel: string;
  seat: string;
  notes: string;
  opponents: Opponent[];
  boxes: OpponentBoxes;
}

/** The table changed size: a seat past it can't stand, nor opponents past pod − 1. */
function withPod(form: GameForm, pod: number): GameForm {
  const fitted = fitOpponents(form.opponents, form.boxes, pod);
  return {
    ...form,
    pod,
    seat: form.seat !== NOT_SET && Number(form.seat) > pod ? NOT_SET : form.seat,
    opponents: fitted.opponents,
    boxes: fitted.boxes,
  };
}

/** What the form would say before anything is sent, or null when it can be sent. */
function formProblem(form: GameForm, noun: string): { message: string; unfold: boolean } | null {
  // The turn it ended, when given, is a whole number the route accepts — said
  // here rather than sent and answered "Invalid body".
  const turn = Number(form.endTurn);
  if (form.endTurn.trim() && !(Number.isInteger(turn) && turn >= 1 && turn <= 99)) {
    return { message: JOURNAL_COPY.turnRange, unfold: false };
  }
  // A name typed but never picked has no key to keep — said, not dropped.
  if (hasUnpickedText(form.opponents, form.boxes, form.pod - 1)) {
    return { message: JOURNAL_COPY.opponentUnpicked(noun), unfold: true };
  }
  return null;
}

/** The form as the routes' fields; null = not set. */
function formValues(form: GameForm) {
  return {
    podSize: form.pod,
    playedOn: form.playedOn,
    endTurn: form.endTurn.trim() ? Number(form.endTurn) : null,
    tableLevel: form.tableLevel !== NOT_SET ? Number(form.tableLevel) : null,
    seat: form.seat !== NOT_SET ? Number(form.seat) : null,
    opponents: form.opponents.length ? opponentsWire(form.opponents) : null,
    notes: form.notes.trim() || null,
  };
}

/** A leader's chip name off the GET's names — the printed id beside it where the game shows one. */
function leaderName(key: string, names: Record<string, string>, showKey: boolean): string {
  const name = names[key];
  if (!name) return key;
  return showKey ? `${name} (${key})` : name;
}

/** A stored game, as the form shows it for an edit — what it shows is what it saves. */
function formFromGame(game: GameWire, names: Record<string, string>, showKey: boolean): GameForm {
  return {
    pod: game.podSize,
    playedOn: game.playedOn,
    endTurn: game.endTurn !== null ? String(game.endTurn) : "",
    tableLevel: game.tableLevel !== null ? String(game.tableLevel) : NOT_SET,
    seat: game.seat !== null ? String(game.seat) : NOT_SET,
    notes: game.notes ?? "",
    opponents: (game.opponents ?? []).map((o) =>
      o.map((key) => ({ key, name: leaderName(key, names, showKey) })),
    ),
    boxes: EMPTY_BOXES,
  };
}

/** The players choice (Magic's 2–8; One Piece's 1v1 shows none). */
function PlayersChoice({
  journal,
  value,
  onChange,
}: {
  journal: JournalMeta;
  value: number;
  onChange: (pod: number) => void;
}) {
  return (
    <Choice
      label={JOURNAL_COPY.players}
      options={Array.from({ length: journal.pod.max - journal.pod.min + 1 }, (_, i) => {
        const n = String(journal.pod.min + i);
        return { value: n, label: n };
      })}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
    />
  );
}

/** The optional details — folded under the log, open in an edit. */
function DetailsFields({
  adapter,
  journal,
  form,
  onChange,
  maxDay,
  fallbackDay,
}: {
  adapter: GameAdapter;
  journal: JournalMeta;
  form: GameForm;
  onChange: (next: GameForm | ((prev: GameForm) => GameForm)) => void;
  maxDay: string;
  /** What an emptied date falls back to: today for a log, the game's own day for an edit. */
  fallbackDay: string;
}) {
  const seatOptions = [
    ...journal.seats(form.pod).map((s) => ({ value: String(s.seat), label: s.label })),
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
  // The suggest box knows the two games with card data; a game without one has no opponents field.
  const suggestGame = adapter.id === "mtg" || adapter.id === "optcg" ? adapter.id : null;
  const set = (patch: Partial<GameForm>) => onChange((prev) => ({ ...prev, ...patch }));
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">{JOURNAL_COPY.date}</span>
          <input
            type="date"
            value={form.playedOn}
            max={maxDay}
            required
            onChange={(e) => set({ playedOn: e.target.value || fallbackDay })}
            className="border-input focus-visible:ring-ring/50 bg-background rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground block text-xs">{JOURNAL_COPY.endTurn}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={form.endTurn}
            onChange={(e) => set({ endTurn: e.target.value })}
            className="border-input focus-visible:ring-ring/50 bg-background w-20 rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2 pointer-coarse:min-h-11"
          />
        </label>
      </div>
      {levelOptions && journal.tableLevel && (
        <Choice
          label={`${journal.tableLevel.noun[0].toUpperCase()}${journal.tableLevel.noun.slice(1)}`}
          options={levelOptions}
          value={form.tableLevel}
          onChange={(tableLevel) => set({ tableLevel })}
        />
      )}
      <Choice
        label={JOURNAL_COPY.seat}
        options={seatOptions}
        value={form.seat}
        onChange={(seat) => set({ seat })}
      />
      {suggestGame && (
        <OpponentsField
          game={suggestGame}
          noun={adapter.display.leaderNoun}
          maxOpponents={form.pod - 1}
          leadersPerOpponent={journal.opponentLeaders}
          showKey={adapter.display.idBadge !== undefined}
          opponents={form.opponents}
          boxes={form.boxes}
          onChange={(next) =>
            typeof next === "function"
              ? onChange((prev) => ({ ...prev, boxes: next(prev.boxes) }))
              : set({ opponents: next.opponents, boxes: next.boxes })
          }
        />
      )}
      <label className="block space-y-1">
        <span className="text-muted-foreground block text-xs">{JOURNAL_COPY.notes}</span>
        <textarea
          value={form.notes}
          maxLength={500}
          rows={2}
          onChange={(e) => set({ notes: e.target.value })}
          className="border-input focus-visible:ring-ring/50 bg-background w-full rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2"
        />
      </label>
    </>
  );
}

/** "5–6–1" for the eye, "5 wins, 6 losses, 1 draw" for a screen reader. */
function Score({ tally }: { tally: { win: number; loss: number; draw: number } }) {
  return (
    <>
      <span aria-hidden className="tabular-nums">
        {JOURNAL_COPY.score(tally)}
      </span>
      <span className="sr-only">{JOURNAL_COPY.scoreWords(tally)}</span>
    </>
  );
}

/** The record (Y10): every game counted, by players and by list — counts always, judgments gated. */
function RecordSection({
  headingId,
  list,
  journal,
}: {
  headingId: string;
  list: GamesList;
  journal: JournalMeta;
}) {
  const summary = summarizeRecord(list.record, list.lists);
  if (summary.games === 0) return null;
  const percent = shownPercent(summary);
  const onePod = journal.pod.min === journal.pod.max;
  return (
    <section aria-labelledby={headingId} data-slot="games-record" className="space-y-2">
      <h3
        id={headingId}
        className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase"
      >
        {JOURNAL_COPY.recordHeading}
      </h3>
      <p className="text-sm font-medium" data-slot="games-record-line">
        {JOURNAL_COPY.gamesCount(summary.games)} · <Score tally={summary} />
        {percent !== null && ` · ${JOURNAL_COPY.wonPercent(percent)}`}
      </p>
      {onePod ? (
        <p className="text-muted-foreground text-xs">
          {JOURNAL_COPY.baselineSentence(journal.pod.min)}
        </p>
      ) : (
        <div>
          <h4 className="text-xs font-medium">{JOURNAL_COPY.byPlayers}</h4>
          <ul className="text-xs" data-slot="games-record-pods">
            {summary.pods.map((p) => (
              <li key={p.podSize} className="py-0.5">
                {JOURNAL_COPY.podLabel(p.podSize)} ·{" "}
                <span className="tabular-nums">
                  {JOURNAL_COPY.wonOf(p.win, p.games, shownPercent(p))}
                </span>{" "}
                · <span className="text-muted-foreground">{JOURNAL_COPY.baseline(p.podSize)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.lists.length > 0 && (
        <div>
          <h4 className="text-xs font-medium">{JOURNAL_COPY.byList}</h4>
          <ul className="divide-y text-xs" data-slot="games-record-lists">
            {summary.lists.map((l) => (
              <li
                key={l.version ?? "none"}
                className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1"
              >
                <span className="min-w-0 break-words">
                  {l.version === null
                    ? JOURNAL_COPY.noListKept
                    : JOURNAL_COPY.listLabel(l.version, l.since, l.change)}
                </span>
                <span className="tabular-nums">
                  {JOURNAL_COPY.wonOf(l.win, l.games, shownPercent(l))}
                </span>
                {tooFewToCompare(l) && (
                  <span className="text-muted-foreground basis-full">{JOURNAL_COPY.tooFew}</span>
                )}
              </li>
            ))}
          </ul>
          {summary.moreLists > 0 && (
            <p className="text-muted-foreground pt-1 text-xs">
              {JOURNAL_COPY.moreLists(summary.moreLists)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type EditOutcome = "edited" | "deleted" | null;

/**
 * One recent game, edited (Y10): the log's fields filled with the game as
 * stored (its opponents by name — LATER row 199), saved through PATCH with
 * only what changed, or deleted. The list it was played with never moves,
 * and the edit says so.
 */
function GameEdit({
  deckId,
  adapter,
  journal,
  game,
  names,
  onDone,
  onSignedOut,
}: {
  deckId: string;
  adapter: GameAdapter;
  journal: JournalMeta;
  game: GameWire;
  names: Record<string, string>;
  onDone: (outcome: EditOutcome) => void;
  onSignedOut: () => void;
}) {
  const showKey = adapter.display.idBadge !== undefined;
  const [result, setResult] = useState<GameResult>(game.result);
  const [form, setForm] = useState(() => formFromGame(game, names, showKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onePod = journal.pod.min === journal.pod.max;

  // Focus lands on what the view is now about.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const send = async (init: RequestInit, failed: (status: number) => string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/games/${game.id}`, {
        ...init,
        headers: journalHeaders(deckId),
      });
      if (res.status === 401) {
        onSignedOut();
        return false;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(res.status === 400 && json?.error ? json.error : failed(res.status));
        return false;
      }
      return true;
    } catch {
      setError(JOURNAL_COPY.editOffline);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    const problem = formProblem(form, adapter.display.leaderNoun);
    if (problem) return setError(problem.message);
    // Only what changed goes in the PATCH (null clears a detail).
    const now = { result, ...formValues(form) };
    const was = {
      result: game.result,
      podSize: game.podSize,
      playedOn: game.playedOn,
      endTurn: game.endTurn,
      tableLevel: game.tableLevel,
      seat: game.seat,
      opponents: game.opponents,
      notes: game.notes,
    };
    const change = Object.fromEntries(
      (Object.keys(now) as (keyof typeof now)[])
        .filter((k) => JSON.stringify(now[k]) !== JSON.stringify(was[k]))
        .map((k) => [k, now[k]]),
    );
    if (Object.keys(change).length === 0) return onDone(null);
    if (await send({ method: "PATCH", body: JSON.stringify(change) }, JOURNAL_COPY.editFailed)) {
      onDone("edited");
    }
  };

  const remove = async () => {
    if (busy || !window.confirm(JOURNAL_COPY.confirmDelete)) return;
    if (await send({ method: "DELETE" }, JOURNAL_COPY.deleteFailed)) onDone("deleted");
  };

  return (
    <section aria-labelledby={`${deckId}-edit`} data-slot="game-edit" className="space-y-3">
      <h3
        id={`${deckId}-edit`}
        ref={headingRef}
        tabIndex={-1}
        className="text-sm font-medium outline-none"
      >
        {JOURNAL_COPY.editGame(game.playedOn)}
      </h3>
      <p className="text-muted-foreground text-xs">{JOURNAL_COPY.playedWith(game.version)}</p>
      <Choice
        label={JOURNAL_COPY.result}
        options={RESULTS.map((r) => ({ value: r, label: JOURNAL_COPY.resultButton(r) }))}
        value={result}
        onChange={(v) => setResult(v as GameResult)}
      />
      {!onePod && (
        <PlayersChoice
          journal={journal}
          value={form.pod}
          onChange={(pod) => setForm((prev) => withPod(prev, pod))}
        />
      )}
      <DetailsFields
        adapter={adapter}
        journal={journal}
        form={form}
        onChange={setForm}
        maxDay={localDay()}
        fallbackDay={game.playedOn}
      />
      {error && (
        <p aria-live="polite" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="pointer-coarse:min-h-11" disabled={busy} onClick={() => void save()}>
          {JOURNAL_COPY.saveEdit}
        </Button>
        <Button
          variant="outline"
          className="pointer-coarse:min-h-11"
          disabled={busy}
          onClick={() => onDone(null)}
        >
          {JOURNAL_COPY.cancelEdit}
        </Button>
        <Button
          variant="ghost"
          className="text-destructive ml-auto pointer-coarse:min-h-11"
          disabled={busy}
          onClick={() => void remove()}
        >
          {JOURNAL_COPY.deleteGame}
        </Button>
      </div>
    </section>
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
  /** Bumped after an edit or a delete: the list (and the record) load again. */
  const [reloads, setReloads] = useState(0);
  const [form, setForm] = useState<GameForm>(() => ({
    pod: journal ? readPod(adapter.id, journal) : 2,
    playedOn: localDay(),
    endTurn: "",
    tableLevel: NOT_SET,
    seat: NOT_SET,
    notes: "",
    opponents: [],
    boxes: EMPTY_BOXES,
  }));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GameWire | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  /** Where focus goes once the list shows again: the edited game's Edit button, or the heading after a delete. */
  const focusAfterEdit = useRef<number | "heading" | null>(null);

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
  }, [accountDeck, deckId, reloads]);

  // Back from an edit: focus returns to the game's Edit button — or, when
  // the game was deleted, to the recent games' heading.
  useEffect(() => {
    const target = focusAfterEdit.current;
    if (editing !== null || target === null) return;
    focusAfterEdit.current = null;
    if (target === "heading") document.getElementById(`${deckId}-recent`)?.focus();
    else editButtons.current.get(target)?.focus();
  }, [editing, deckId]);

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

  const onePod = journal.pod.min === journal.pod.max;
  const noun = adapter.display.leaderNoun;
  const showKey = adapter.display.idBadge !== undefined;
  const ready = list.state === "ready" ? list.list : null;
  const atAllowance = ready !== null && ready.playedSnapshots >= ready.playedAllowance;

  const changePod = (pod: number) => {
    writePod(adapter.id, pod);
    setForm((prev) => withPod(prev, pod));
  };

  const log = async (result: GameResult) => {
    if (busy) return;
    const problem = formProblem(form, noun);
    if (problem) {
      setError(problem.message);
      if (problem.unfold) setDetailsOpen(true); // the box it names is in the folded details
      return;
    }
    const values = formValues(form);
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
          podSize: values.podSize,
          playedOn: values.playedOn,
          ...(values.endTurn !== null ? { endTurn: values.endTurn } : {}),
          ...(values.tableLevel !== null ? { tableLevel: values.tableLevel } : {}),
          ...(values.seat !== null ? { seat: values.seat } : {}),
          ...(values.opponents !== null ? { opponents: values.opponents } : {}),
          ...(values.notes !== null ? { notes: values.notes } : {}),
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

  const finishEdit = (gameId: number, outcome: EditOutcome) => {
    focusAfterEdit.current = outcome === "deleted" ? "heading" : gameId;
    setEditing(null);
    setStatus(
      outcome === "edited"
        ? JOURNAL_COPY.edited
        : outcome === "deleted"
          ? JOURNAL_COPY.deleted
          : null,
    );
    if (outcome) setReloads((n) => n + 1);
  };

  if (editing && ready) {
    return (
      <SheetShell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
        <div data-slot="games-dialog" className="space-y-4">
          <GameEdit
            key={editing.id}
            deckId={deckId}
            adapter={adapter}
            journal={journal}
            game={editing}
            names={ready.names}
            onDone={(outcome) => finishEdit(editing.id, outcome)}
            onSignedOut={() => {
              setEditing(null);
              setList({ state: "signed-out" });
            }}
          />
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
      <div data-slot="games-dialog" className="space-y-4">
        <section aria-labelledby={`${deckId}-log`} className="space-y-3">
          <h3 id={`${deckId}-log`} className="text-sm font-medium">
            {JOURNAL_COPY.logHeading}
          </h3>
          {!onePod && <PlayersChoice journal={journal} value={form.pod} onChange={changePod} />}
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
              <DetailsFields
                adapter={adapter}
                journal={journal}
                form={form}
                onChange={setForm}
                maxDay={localDay()}
                fallbackDay={localDay()}
              />
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

        {ready && <RecordSection headingId={`${deckId}-record`} list={ready} journal={journal} />}

        <section aria-labelledby={`${deckId}-recent`}>
          <h3
            id={`${deckId}-recent`}
            tabIndex={-1}
            className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase outline-none"
          >
            {JOURNAL_COPY.recentHeading}
          </h3>
          {status && (
            <p aria-live="polite" className="mt-2 text-xs">
              {status}
            </p>
          )}
          {list.state === "loading" ? (
            <p className="text-muted-foreground mt-2 text-xs">{JOURNAL_COPY.loading}</p>
          ) : list.state === "error" ? (
            <p className="text-destructive mt-2 text-xs">{list.message}</p>
          ) : list.list.games.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-xs">{JOURNAL_COPY.noGames}</p>
          ) : (
            <ul className="mt-1 divide-y text-sm" data-slot="games-recent">
              {list.list.games.slice(0, RECENT_SHOWN).map((game) => {
                const lineId = `${deckId}-game-${game.id}`;
                const names = list.list.names;
                return (
                  <li key={game.id} className="flex items-center gap-2 py-1.5">
                    <span id={lineId} className="min-w-0 flex-1">
                      <span data-slot="game-line">
                        {JOURNAL_COPY.gameLine({
                          playedOn: game.playedOn,
                          result: game.result,
                          podSize: game.podSize,
                          seatPhrase:
                            game.seat === null
                              ? null
                              : (journal.seats(game.podSize).find((s) => s.seat === game.seat)
                                  ?.phrase ?? null),
                          version: game.version,
                          onePod,
                        })}
                      </span>
                      {game.opponents && game.opponents.length > 0 && (
                        <span
                          data-slot="game-vs"
                          className="text-muted-foreground block text-xs break-words"
                        >
                          {JOURNAL_COPY.vsLine(
                            game.opponents.map((o) =>
                              o.map((key) => leaderName(key, names, showKey)),
                            ),
                          )}
                        </span>
                      )}
                    </span>
                    <Button
                      ref={(el) => {
                        if (el) editButtons.current.set(game.id, el);
                        else editButtons.current.delete(game.id);
                      }}
                      variant="ghost"
                      size="xs"
                      className="shrink-0 pointer-coarse:min-h-11"
                      aria-describedby={lineId}
                      onClick={() => {
                        setStatus(null);
                        setEditing(game);
                      }}
                    >
                      {JOURNAL_COPY.edit}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </SheetShell>
  );
}

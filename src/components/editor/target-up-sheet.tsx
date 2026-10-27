"use client";

/**
 * The "Upgrade toward" sheet (BRACKET-UP, the owner's ask of 2026-10-27:
 * "build an Upgrade toward Bracket N button for when the target is above
 * what the cards show. The Suggestions list comes in, each card paired with
 * the weakest card it replaces, in one review sheet with the check of the
 * list after, the cost of the new cards, and one Undo"): BRACKET-FIT's
 * upward twin. The editor's dialog slot ("target-up"), opened only by Your
 * target's "Below your target" box in the Why sheet: the Fit shell (a
 * full-height Drawer on phones, the wide Modal from md), so the hotkeys
 * stand down.
 *
 * - **The asks**, once per open and nothing before it: ONE `POST
 *   /api/recommendations` with the live list as Suggestions send a draft's
 *   (`snapshotBody`: the deck's per-card budget goal as the budget, the
 *   goals as `suggestionGoals` sends them, so nothing above the target
 *   comes back; the panel's limit, 25), even for a saved deck: the GET
 *   would read a target the autosave may not have written yet. Then ONE
 *   `POST /api/cards/resolve` for the names, with the panel's id guard: a
 *   name that resolves to another card drops its row, and the sheet says
 *   how many. A 429 says so, with Try again; closing aborts, and an aborted
 *   ask writes nothing and is asked again (StrictMode's twin included).
 *   Opening, asking and reviewing write nothing.
 * - **The plan** is ../../lib/brackets/target-up.ts': each card, in
 *   Suggestions' order, for Swap in's cut partner at its cost (the Cut
 *   Coach over the editor's cards and the bracket line's combo facts, so a
 *   complete-combo piece never goes), or, with none left at its cost, the
 *   weakest card left at another (the row says so); no card cut twice. A
 *   row whose card would put the list above the target once the rows above
 *   it are in (the adapter's `impact`, the goals' own rule, against
 *   `assess` of that list) starts unchecked and says why in the adapter's
 *   words.
 * - **The review**: each row the card coming in (its price, its first
 *   evidence line and sources, as Suggestions show them), its check, and
 *   the card it replaces in a native chooser (its bucket, then the rest).
 *   A card with nothing to cut starts unchecked with the reason; choosing a
 *   card checks it.
 * - **The after-check**: the list after the checked swaps goes to
 *   `useBracketFacts` (the hook, unchanged), then `assess` with the cards
 *   coming in. The footer says what those cards prove in the level's own
 *   words, "That's your target." only when that read reaches it, the
 *   read's sentences for what proves it, and anything above the target
 *   (two cards that complete a combo together) in the read's sentences.
 *   Short of the target it says a list proves only a floor and points at
 *   How it plays: no card list proves the top level, and part of the one
 *   below it is how the deck plays.
 * - **The price** of the cards coming in, BRACKET-FIT's line over the
 *   editor's owned set (a collection's identities and an owned precon's).
 * - **The apply** is the editor's ONE `applyListSwap` ("Swapped N cards",
 *   one Undo): `fitList` in place, each card where its old one was, every
 *   other row untouched, the size kept.
 */
import { GaugeIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { useBracketFacts } from "@/components/deck/use-bracket-facts";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { costOf, FitShell, type TargetFitApply } from "@/components/editor/target-fit-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Modal } from "@/components/ui/modal";
import { BRACKET_COPY, levelLabel, levelNumberLabel } from "@/lib/brackets/copy";
import { factsIds, type BracketFactsState } from "@/lib/brackets/facts";
import {
  NO_UP_OVERRIDES,
  planTargetUp,
  targetUpJudge,
  targetUpSlots,
  type TargetUpOverrides,
  type TargetUpPair,
  type TargetUpRow,
} from "@/lib/brackets/target-up";
import {
  toEditorCard,
  type CardWire,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import { suggestionGoals, type DeckGoals } from "@/lib/decks/goals";
import { hasLeader, snapshotBody } from "@/lib/decks/panel-view";
import { playableEntries } from "@/lib/decks/playable";
import { toDeckSnapshot } from "@/lib/decks/validation";
import type {
  BracketFreshness,
  BracketRead,
  BracketsMeta,
  CompleteCombo,
  FormatDef,
  GameAdapter,
  SwapMeta,
} from "@/lib/games/types";
import { tierOf, usdOf } from "@/lib/recommend/budget";
import { completeCombosByCard, type CutEntryInput } from "@/lib/recommend/cuts";
import { FIT_COPY, fitList } from "@/lib/recommend/fit";
import type { GoalConflict } from "@/lib/recommend/goals";
import { cutCombosFromFacts } from "@/lib/recommend/swap-in";
import type { Recommendation } from "@/lib/recommend/types";
import { orderEvidence } from "@/lib/recommend/view";

type FinalFocus = ComponentProps<typeof Modal>["finalFocus"];

/** A row as the route answers it: the recommendation, its goal conflicts beside the evidence. */
type SuggestionRec = Recommendation & { conflicts?: GoalConflict[] };

/** A Suggestions row with its card: what the plan pairs and Swap brings in. */
interface UpRow extends TargetUpRow {
  card: EditorCard;
  rec: SuggestionRec;
  wire: CardWire;
}

type Ask =
  | { status: "asking" }
  | { status: "done"; rows: UpRow[]; dropped: number }
  | { status: "error"; limited: boolean };

class RateLimited extends Error {}

const NO_ROWS: UpRow[] = [];
/** A text control after a gap in a line (U9). */
const INLINE_ACTION = "cursor-pointer underline underline-offset-4 pointer-coarse:min-h-11";
/** A native select in Input's look (U10a, the Games dialog's): the edge token, 44 px on touch. */
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-(--border-control) bg-transparent px-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 pointer-coarse:min-h-11";

export function TargetUpSheet({
  adapter,
  format,
  entries,
  cards,
  goals,
  combos,
  freshness,
  factsState,
  owned,
  phone,
  finalFocus,
  onApply,
  onClose,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  /** The deck's goals: the target the upgrade aims at, the answers the read takes, the ask's goals and budget. */
  goals: DeckGoals | null;
  /** The bracket line's combo facts and freshness: what protects combo pieces, and what the reads take. */
  combos: readonly CompleteCombo[] | null;
  freshness: BracketFreshness | null;
  factsState: BracketFactsState;
  /** The owned set (identity ids), as FitSheet takes it; null = nothing is owned. */
  owned: ReadonlySet<string> | null;
  phone: boolean;
  /** Where focus goes on close, over Base UI's default (the editor names "Why?"). */
  finalFocus?: FinalFocus;
  onApply: (apply: TargetFitApply) => void;
  onClose: () => void;
}) {
  const brackets = adapter.brackets;
  const recommend = adapter.recommend;
  const swap = recommend?.swap;
  const target = goals?.targetLevel ?? null;
  const level = brackets && target !== null ? levelNumberLabel(brackets, target) : "";
  const title = BRACKET_COPY.upTitle(level);
  const leader = hasLeader(entries, format);
  const mainZone = format.zones.find((z) => !z.isLeaderZone);
  const leaderZones = useMemo(
    () => new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id)),
    [format],
  );

  const [ask, setAsk] = useState<Ask>({ status: "asking" });
  const [nonce, setNonce] = useState(0);
  const [overrides, setOverrides] = useState<TargetUpOverrides>(NO_UP_OVERRIDES);
  // The ask whose answer landed: a re-run of the effect never asks it again.
  const settledRef = useRef<number | null>(null);

  // Suggestions' own request for the live list: the deck's budget goal, the goals as sent.
  const bodyKey = useMemo(
    () =>
      brackets && swap && leader && target !== null
        ? JSON.stringify(
            snapshotBody(
              adapter.id,
              format,
              entries,
              usdOf(tierOf(goals?.budget?.perCardUsd)) ?? undefined,
              suggestionGoals(goals),
            ),
          )
        : null,
    [brackets, swap, leader, target, adapter.id, format, entries, goals],
  );

  // ONE Suggestions POST, then ONE resolve for its names. The list can't
  // change under a modal, so the body is fixed; closing aborts, and an
  // aborted ask writes nothing.
  useEffect(() => {
    if (bodyKey === null || settledRef.current === nonce) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyKey,
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 429) throw new RateLimited();
        if (!res.ok) throw new Error(`Suggestions failed (${res.status})`);
        const { recommendations } = (await res.json()) as { recommendations: SuggestionRec[] };
        if (controller.signal.aborted) return;
        const rows: UpRow[] = [];
        let dropped = 0;
        if (recommendations.length > 0) {
          const resolved = await fetch("/api/cards/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              game: adapter.id,
              format: format.code,
              names: recommendations.map((r) => r.name),
            }),
            cache: "no-store",
            signal: controller.signal,
          });
          if (resolved.status === 429) throw new RateLimited();
          if (!resolved.ok) throw new Error(`Resolve failed (${resolved.status})`);
          const { results } = (await resolved.json()) as {
            results: { match: CardWire | null }[];
          };
          recommendations.forEach((rec, i) => {
            // The id guard (useResolvedAdd's): never a different card than the row named.
            const match = results[i]?.match;
            if (!match || match.id !== rec.cardId) {
              dropped += 1;
              return;
            }
            rows.push({
              cardId: rec.cardId,
              name: rec.name,
              card: toEditorCard(match),
              rec,
              wire: match,
            });
          });
        }
        if (controller.signal.aborted) return;
        settledRef.current = nonce;
        setAsk({ status: "done", rows, dropped });
      } catch (err) {
        if (controller.signal.aborted) return;
        settledRef.current = nonce;
        setAsk({ status: "error", limited: err instanceof RateLimited });
      }
    })();
    return () => controller.abort();
  }, [bodyKey, nonce, adapter.id, format.code]);

  const retry = () => {
    setAsk({ status: "asking" });
    setNonce((n) => n + 1);
  };

  // A card already in the list never comes in (Suggestions leave them out; belt and braces).
  const rows = useMemo(() => {
    if (ask.status !== "done") return NO_ROWS;
    const inList = new Set(entries.map((e) => e.cardId));
    return ask.rows.filter((r) => !inList.has(r.cardId));
  }, [ask, entries]);

  // Swap in's input: the playable list's cards, the leaders left out, the combo facts.
  const cut = useMemo(() => {
    if (!recommend || !mainZone) return null;
    const cutEntries: CutEntryInput[] = [];
    for (const e of playableEntries(entries, format)) {
      const card = cards.get(e.cardId);
      if (card) cutEntries.push({ card, zone: e.zone, qty: e.qty, tags: e.tags });
    }
    return {
      meta: recommend,
      roleTargets: adapter.hub?.roles ?? [],
      entries: cutEntries,
      excludedZones: leaderZones,
      completeCombosByCard: completeCombosByCard(
        cutCombosFromFacts(combos, cards),
        new Set(entries.map((e) => e.cardId)),
      ),
      zone: mainZone.id,
    };
  }, [recommend, mainZone, entries, format, cards, adapter, leaderZones, combos]);
  const slots = useMemo(() => (cut ? targetUpSlots({ rows, cut }) : []), [rows, cut]);

  // Every card the reads take: the list's and the ones coming in.
  const allCards = useMemo(() => {
    const all = new Map<string, EditorCard>(cards);
    for (const r of rows) if (!all.has(r.cardId)) all.set(r.cardId, r.card);
    return all;
  }, [cards, rows]);
  // The goals, row by row: the adapter's impact against the list after the checked rows above.
  const judge = useMemo(
    () =>
      brackets
        ? targetUpJudge<UpRow>({
            brackets,
            game: adapter.id,
            format,
            entries,
            cards: allCards,
            combos,
            freshness,
            goals,
          })
        : undefined,
    [brackets, adapter.id, format, entries, allCards, combos, freshness, goals],
  );
  const plan = useMemo(
    () => planTargetUp({ slots, zone: mainZone?.id ?? "", overrides, judge }),
    [slots, mainZone, overrides, judge],
  );

  // The list after the checked swaps, in place, and its read.
  const afterEntries = useMemo(
    () => fitList(entries, format, plan.swaps),
    [entries, format, plan.swaps],
  );
  const afterIds = useMemo(
    () => factsIds(playableEntries(afterEntries, format)),
    [afterEntries, format],
  );
  const facts = useBracketFacts({
    game: adapter.id,
    enabled: brackets !== undefined && leader && ask.status === "done" && plan.swaps.length > 0,
    ids: afterIds,
  });
  const afterRead = useMemo(() => {
    if (!brackets || facts.state !== "ready" || plan.swaps.length === 0) return null;
    return brackets.assess({
      deck: toDeckSnapshot(adapter.id, format, afterEntries),
      cards: allCards,
      combos: facts.combos,
      freshness,
      targetLevel: target,
      answers: goals?.answers ?? null,
    });
  }, [
    brackets,
    facts.state,
    facts.combos,
    plan.swaps,
    adapter.id,
    format,
    afterEntries,
    allCards,
    freshness,
    target,
    goals,
  ]);

  const check = (id: string, next: boolean) =>
    setOverrides((o) => ({
      ...o,
      checked: next ? withId(o.checked, id) : withoutId(o.checked, id),
      unchecked: next ? withoutId(o.unchecked, id) : withId(o.unchecked, id),
    }));
  // A card chosen to cut swaps the row in.
  const pick = (id: string, outId: string) =>
    setOverrides((o) => ({
      unchecked: withoutId(o.unchecked, id),
      checked: withId(o.checked, id),
      picks: new Map(o.picks).set(id, outId),
    }));

  const chosen = plan.pairs.filter((p) => p.checked);
  const apply = () => {
    if (chosen.length === 0) return;
    onApply({
      entries: afterEntries,
      cards: chosen.map((p) => p.row.wire),
      swapped: chosen.length,
    });
  };

  if (!brackets || !swap || target === null) return null;

  const state =
    bodyKey === null
      ? "none"
      : ask.status === "asking"
        ? "asking"
        : ask.status === "error"
          ? "error"
          : rows.length === 0
            ? "none"
            : "ready";
  const nameOf = new Map(rows.map((r) => [r.cardId, r.name]));
  const costLine = costOf(
    chosen.map((p) => ({ cardId: p.row.cardId, cheapestUsd: p.row.rec.cheapestUsd })),
    owned,
  );
  // The combo signal's honest status, Swap in's rule: say so whenever it can't protect.
  const comboNote =
    !recommend?.combos || combos !== null
      ? null
      : factsState === "checking"
        ? FIT_COPY.combosChecking
        : FIT_COPY.combosUnknown;

  const content = (
    <div
      data-slot="target-up-sheet"
      data-up-state={state}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <p data-slot="target-up-lead" className="text-muted-foreground text-sm">
        {BRACKET_COPY.upLead}
      </p>
      {comboNote && state === "ready" && (
        <p className="text-muted-foreground text-xs">{comboNote}</p>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {state === "asking" && (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {BRACKET_COPY.upAsking}
          </p>
        )}
        {state === "error" && ask.status === "error" && (
          <p className="text-destructive text-sm">
            {ask.limited ? BRACKET_COPY.upLimited : BRACKET_COPY.upFailed}{" "}
            <button type="button" onClick={retry} className={INLINE_ACTION}>
              {FIT_COPY.retry}
            </button>
          </p>
        )}
        {state === "none" && <p className="text-sm">{BRACKET_COPY.upNone}</p>}
        {ask.status === "done" && ask.dropped > 0 && (
          <p data-slot="target-up-dropped" className="text-muted-foreground text-xs">
            {BRACKET_COPY.upDropped(ask.dropped)}
          </p>
        )}

        {state === "ready" && (
          <ul className="space-y-2">
            {plan.pairs.map((pair) => (
              <UpRowView
                key={pair.row.cardId}
                pair={pair}
                adapter={adapter}
                swap={swap}
                nameOf={(id) => nameOf.get(id) ?? id}
                onCheck={check}
                onPick={pick}
              />
            ))}
          </ul>
        )}
        {state === "ready" && (
          <p className="text-muted-foreground text-xs">{BRACKET_COPY.fitPrices}</p>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <UpAfterLine
            brackets={brackets}
            target={target}
            swaps={plan.swaps.length}
            state={facts.state}
            read={afterRead}
            onRetry={facts.retry}
          />
          {costLine && (
            <p data-slot="target-up-cost" className="text-muted-foreground text-xs">
              {costLine}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state === "none" ? (
            <Button size="sm" onClick={onClose}>
              {BRACKET_COPY.fitDone}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {BRACKET_COPY.cancel}
              </Button>
              <Button size="sm" disabled={state !== "ready" || chosen.length === 0} onClick={apply}>
                {FIT_COPY.apply(chosen.length)}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <FitShell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
      {content}
    </FitShell>
  );
}

const withId = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);
const withoutId = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

/**
 * The footer's verdict, from the read of the list after the checked swaps:
 * what the cards prove in the level's own words, "That's your target."
 * only when that read reaches it, the read's sentences for what proves the
 * floor, and anything above the target in the read's own sentences. A
 * short polite status says the verdict alone (never "Checking…").
 */
function UpAfterLine({
  brackets,
  target,
  swaps,
  state,
  read,
  onRetry,
}: {
  brackets: BracketsMeta;
  target: number;
  swaps: number;
  state: BracketFactsState;
  read: BracketRead | null;
  onRetry: () => void;
}) {
  const C = BRACKET_COPY;
  const lowest = brackets.levels[0]?.level ?? 1;
  const above = read ? read.factors.filter((f) => read.conflicts.includes(f.id)) : [];
  const reached = read !== null && above.length === 0 && (read.suggested ?? read.minimum) >= target;
  const head = !read
    ? null
    : above.length > 0
      ? C.upAfterAboveCount(above.length, levelNumberLabel(brackets, target))
      : read.suggested !== null
        ? C.upAfterAnswers(levelLabel(brackets, read.suggested))
        : read.minimum <= lowest
          ? C.upAfterNothing(brackets.noun)
          : C.upAfter(levelLabel(brackets, read.minimum));
  const verdict = swaps === 0 || head === null ? null : reached ? `${head} ${C.upReached}` : head;
  // What proves the floor: the findings at the read's minimum.
  const proving =
    read && read.minimum > lowest
      ? read.factors.filter((f) => f.atLeast !== null && f.atLeast === read.minimum)
      : [];

  let body = null;
  if (swaps > 0) {
    if (state === "failed" || state === "over") {
      body = (
        <p data-slot="target-up-after" data-after="failed" className="text-sm">
          {C.fitAfterFailed}
          {state === "failed" && (
            <>
              {" "}
              <button type="button" onClick={onRetry} className={INLINE_ACTION}>
                {C.retry}
              </button>
            </>
          )}
        </p>
      );
    } else if (!read) {
      body = (
        <p
          data-slot="target-up-after"
          data-after="checking"
          className="text-muted-foreground text-sm"
        >
          {C.fitAfterChecking}
        </p>
      );
    } else if (above.length > 0) {
      body = (
        <div data-slot="target-up-after" data-after="above" className="text-sm">
          <p className="font-medium">{C.upAfterAbove(levelNumberLabel(brackets, target))}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
            {above.map((f) => (
              <li key={f.id} data-after-conflict={f.id} className="break-words">
                {f.sentence}
              </li>
            ))}
          </ul>
        </div>
      );
    } else {
      body = (
        <div
          data-slot="target-up-after"
          data-after={reached ? "reached" : "below"}
          className="text-sm"
        >
          <p className="font-medium">
            {head}
            {reached && ` ${C.upReached}`}
          </p>
          {proving.length > 0 && (
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
              {proving.map((f) => (
                <li key={f.id} data-after-finding={f.id} className="break-words">
                  {f.sentence}
                </li>
              ))}
            </ul>
          )}
          {!reached && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {C.upFloor(levelLabel(brackets, target))}
            </p>
          )}
        </div>
      );
    }
  }
  return (
    <>
      {body}
      <span role="status" data-slot="target-up-status" className="sr-only">
        {verdict ?? ""}
      </span>
    </>
  );
}

/** One card coming in: its check, its evidence, and the card it replaces. */
function UpRowView({
  pair,
  adapter,
  swap,
  nameOf,
  onCheck,
  onPick,
}: {
  pair: TargetUpPair<UpRow>;
  adapter: GameAdapter;
  swap: SwapMeta;
  /** A row's card name by its id: who holds a card another row takes. */
  nameOf: (id: string) => string;
  onCheck: (id: string, next: boolean) => void;
  onPick: (id: string, outId: string) => void;
}) {
  const selectId = useId();
  const { row, out, via, checked, above, unpaired, choices, bucketWords } = pair;
  const evidence = orderEvidence(row.rec.evidence);
  const top = evidence[0];
  const sources = [...new Set(evidence.map((e) => sourceMeta(adapter, e.source).label))];
  const usd = row.rec.cheapestUsd === null ? NaN : Number(row.rec.cheapestUsd);
  const bucketName = bucketWords !== null ? swap.bucketName(bucketWords) : null;
  const same = choices.filter((c) => c.sameBucket);
  const rest = choices.filter((c) => !c.sameBucket);
  const option = (c: (typeof choices)[number]) => (
    <option key={c.option.cardId} value={c.option.cardId} disabled={c.byPick}>
      {c.heldBy ? BRACKET_COPY.upOutFor(c.option.name, nameOf(c.heldBy)) : c.option.name}
    </option>
  );
  const why = out?.cut?.evidence[0]?.why ?? null;
  return (
    <li
      data-up-row={row.cardId}
      data-checked={checked ? "" : undefined}
      className="min-w-0 rounded-md border px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm pointer-coarse:min-h-11">
          <Checkbox
            aria-label={BRACKET_COPY.upSwapIn(row.name)}
            checked={checked}
            disabled={out === null}
            onCheckedChange={(next) => onCheck(row.cardId, next)}
          />
          <CardNamePreview name={row.name} image={row.wire.image}>
            <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
          </CardNamePreview>
        </label>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {Number.isFinite(usd) ? `$${usd.toFixed(2)}` : BRACKET_COPY.fitNoPrice}
        </span>
      </div>
      <div className="min-w-0 space-y-0.5 pl-6 text-xs break-words">
        {top && <p className="line-clamp-2 leading-relaxed">{top.why}</p>}
        {sources.length > 0 && <p className="text-muted-foreground">{sources.join(", ")}</p>}
        {/* Goals (Y6a's lines beside the evidence), then why the goals leave it out here. */}
        {(row.rec.conflicts ?? []).map((c) => (
          <p key={`${c.rule}:${c.why}`} className="text-muted-foreground flex items-baseline gap-1">
            <GaugeIcon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
            <span>{c.why}</span>
          </p>
        ))}
        {above.map((line) => (
          <p
            key={line}
            data-up-above=""
            className="text-muted-foreground flex items-baseline gap-1"
          >
            <GaugeIcon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
            <span>{line}</span>
          </p>
        ))}
        {unpaired && (
          <p data-up-unpaired={unpaired} className="text-muted-foreground">
            {unpaired === "no-bucket" ? swap.unmatched(row.card) : BRACKET_COPY.upNoCut}
          </p>
        )}
        {via === "elsewhere" && bucketName !== null && (
          <p data-up-elsewhere="" className="text-muted-foreground">
            {BRACKET_COPY.upElsewhere(bucketName)}
          </p>
        )}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-6">
        <label htmlFor={selectId} className="text-muted-foreground shrink-0 text-xs">
          {BRACKET_COPY.upReplaces}
        </label>
        <select
          id={selectId}
          aria-label={BRACKET_COPY.upCutFor(row.name)}
          value={out?.cardId ?? ""}
          onChange={(e) => onPick(row.cardId, e.target.value)}
          className={SELECT_CLASS}
        >
          {out === null && (
            <option value="" disabled>
              {BRACKET_COPY.upChoose}
            </option>
          )}
          {same.length > 0 && bucketName !== null ? (
            <>
              <optgroup label={BRACKET_COPY.upAt(bucketName)}>{same.map(option)}</optgroup>
              {rest.length > 0 && (
                <optgroup label={BRACKET_COPY.upOthers}>{rest.map(option)}</optgroup>
              )}
            </>
          ) : (
            choices.map(option)
          )}
        </select>
      </div>
      {why && <p className="text-muted-foreground mt-0.5 pl-6 text-xs break-words">{why}</p>}
    </li>
  );
}

"use client";

/**
 * The "Swap to fit" sheet (BRACKET-FIT, the owner's ask of 2026-10-24:
 * "once you set a target bracket after your deck is built can we have a
 * button to swap all the suggested cards all at once to make it that
 * desired bracket"): the fewest swaps that bring the deck to its target,
 * reviewed, then applied as one edit. The editor's dialog slot
 * ("target-fit"), opened only by the Why sheet's conflict callout: a
 * full-height bottom Drawer on phones, the wide Modal from md (the Fit
 * sheet's shell), so the hotkeys stand down.
 *
 * - **The plan** is ../../lib/brackets/target-fit.ts': the adapter's fixes
 *   for the read the Why sheet showed, the fewest cards that meet them,
 *   each one's best-ranked option under the goals. Every card the plan
 *   takes out is replaced, never just cut: the deck keeps its size.
 * - **The asks** are Swap Lab's route, one card per POST with Swap Lab's
 *   own body (`suggestionGoals`: the target rides every ask, so each
 *   option was judged in that card's place under it), in plan order,
 *   TARGET_FIT_BATCH at a time, at most TARGET_FIT_ASK_LIMIT per open. A
 *   card with no option is planned around ("Remove A or B": A has none, so
 *   B is asked). A 429 stops the asking and says so; Try again asks the
 *   failed cards again; closing aborts what's in flight. Nothing is asked
 *   until the sheet opens, and opening, asking and reviewing write nothing.
 * - **The review**: the rows under each conflict's own sentence, each card
 *   going out with swap or keep and its one to three options (what they
 *   share, each card's cheapest printing); a fix that needs one card offers
 *   its other cards instead. What the swaps can't fix comes last, every
 *   card that stays named with its reason.
 * - **The after-check** is the proof: the list after the checked swaps
 *   goes to `useBracketFacts` for its id set (the hook, unchanged), then
 *   the adapter's `assess` runs on it with the incoming cards' wires, those
 *   facts, the editor's freshness, the target and the answers. The footer
 *   says the deck fits only when that read finds nothing above the target;
 *   otherwise it quotes the read's own sentences. Swap stays the player's
 *   call either way.
 * - **The price** of the cards coming in, the ones the player owns (`owned`,
 *   FitSheet's prop) left out.
 * - **The apply** is the editor's ONE `applyListSwap` (fitList, in place:
 *   each new card where its old one was, every other row untouched).
 */
import { XIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { useBracketFacts } from "@/components/deck/use-bracket-facts";
import type {
  AlternativeRow,
  AlternativesResponse,
} from "@/components/editor/alternatives-section";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { BRACKET_COPY, levelNumberLabel } from "@/lib/brackets/copy";
import { factsIds } from "@/lib/brackets/facts";
import {
  NO_OVERRIDES,
  planTargetFit,
  targetFitCards,
  targetFitFixes,
  targetFitOptions,
  TARGET_FIT_ASK_LIMIT,
  TARGET_FIT_BATCH,
  type TargetFitAnswer,
  type TargetFitCard,
  type TargetFitOverrides,
  type TargetFitShort,
} from "@/lib/brackets/target-fit";
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
  BracketFix,
  BracketFreshness,
  BracketRead,
  CompleteCombo,
  FormatDef,
  GameAdapter,
} from "@/lib/games/types";
import { FIT_COPY, fitList } from "@/lib/recommend/fit";

/** What Swap hands back: the full next list, the incoming wires, the count. */
export interface TargetFitApply {
  entries: EditorEntry[];
  cards: CardWire[];
  swapped: number;
}

type Answer = TargetFitAnswer<AlternativeRow>;
type FinalFocus = ComponentProps<typeof Modal>["finalFocus"];

class RateLimited extends Error {}

const SECTION_HEADING = "text-muted-foreground text-xs font-medium tracking-wide uppercase";
/** A text control after a gap in a line (U9). */
const INLINE_ACTION = "cursor-pointer underline underline-offset-4 pointer-coarse:min-h-11";

export function TargetFitSheet({
  adapter,
  format,
  entries,
  cards,
  goals,
  read,
  combos,
  freshness,
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
  /** The deck's goals: the target the plan fits, the answers the read takes, the asks' goals. */
  goals: DeckGoals | null;
  /** The read the Why sheet showed: its conflicts are what the plan fixes. */
  read: BracketRead;
  /** The list's combo facts and freshness, as that read took them. */
  combos: readonly CompleteCombo[] | null;
  freshness: BracketFreshness | null;
  /** The owned set (identity ids), as FitSheet takes it; null = nothing is owned. */
  owned: ReadonlySet<string> | null;
  phone: boolean;
  /** Where focus goes on close, over Base UI's default (the editor names "Why?"). */
  finalFocus?: FinalFocus;
  onApply: (apply: TargetFitApply) => void;
  onClose: () => void;
}) {
  const brackets = adapter.brackets;
  const swap = adapter.recommend?.swap;
  const target = goals?.targetLevel ?? null;
  const level = brackets && target !== null ? levelNumberLabel(brackets, target) : "";
  const title = BRACKET_COPY.fitTitle(level);
  const leader = hasLeader(entries, format);
  const leftId = useId();
  const groupId = useId();

  const [asked, setAsked] = useState<readonly string[]>([]);
  const [results, setResults] = useState<ReadonlyMap<string, Answer>>(() => new Map());
  const [overrides, setOverrides] = useState<TargetFitOverrides>(NO_OVERRIDES);
  const [nonce, setNonce] = useState(0);
  // Cards whose answer landed: a re-run of the ask effect never asks them again.
  const settledRef = useRef<Set<string>>(new Set());

  const fixes = useMemo(
    () =>
      targetFitFixes({
        adapter,
        format,
        entries,
        cards,
        read,
        combos,
        freshness,
        goals,
      }),
    [adapter, format, entries, cards, read, combos, freshness, goals],
  );
  const fitCards = useMemo(
    () =>
      swap
        ? targetFitCards({ fixes, entries, cards, format, swap })
        : new Map<string, TargetFitCard>(),
    [swap, fixes, entries, cards, format],
  );
  const askedSet = useMemo(() => new Set(asked), [asked]);
  const plan = useMemo(
    () =>
      planTargetFit<AlternativeRow>({
        fixes,
        cards: fitCards,
        answers: results,
        asked: askedSet,
        canAsk: asked.length < TARGET_FIT_ASK_LIMIT,
        overrides,
      }),
    [fixes, fitCards, results, askedSet, asked.length, overrides],
  );

  // Every ask is Swap Lab's body plus the card: the goals as Swap Lab sends them.
  const baseKey = useMemo(
    () =>
      swap && leader
        ? JSON.stringify(
            snapshotBody(adapter.id, format, entries, undefined, suggestionGoals(goals)),
          )
        : null,
    [swap, leader, adapter.id, format, entries, goals],
  );

  const pending = asked.filter((id) => !results.has(id));
  const failed = asked.filter((id) => results.get(id)?.status === "error");
  const limited = failed.some((id) => {
    const a = results.get(id);
    return a?.status === "error" && a.limited;
  });

  // The next batch, in plan order, once the last one settled (the
  // adjust-state-during-render pattern: it converges, since the new cards
  // wait until they answer). At the limit the plan asks for nothing more.
  if (
    baseKey !== null &&
    pending.length === 0 &&
    failed.length === 0 &&
    plan.ask.length > 0 &&
    asked.length < TARGET_FIT_ASK_LIMIT
  ) {
    const next = plan.ask.slice(0, Math.min(TARGET_FIT_BATCH, TARGET_FIT_ASK_LIMIT - asked.length));
    setAsked([...asked, ...next]);
  }

  // One POST per asked card not yet answered. The list can't change under a
  // modal, so the key only grows; closing aborts what's in flight, and an
  // aborted ask (StrictMode's twin included) writes nothing and is asked again.
  const askedKey = asked.join(",");
  useEffect(() => {
    if (baseKey === null || askedKey === "") return;
    const controller = new AbortController();
    const base = JSON.parse(baseKey) as Record<string, unknown>;
    for (const id of askedKey.split(",")) {
      if (settledRef.current.has(id)) continue;
      void (async () => {
        try {
          const res = await fetch("/api/alternatives", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, cardId: id }),
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.status === 429) throw new RateLimited();
          if (!res.ok) throw new Error(`Alternatives failed (${res.status})`);
          const data = (await res.json()) as AlternativesResponse;
          settledRef.current.add(id);
          setResults((prev) => new Map(prev).set(id, { status: "done", rows: data.alternatives }));
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          settledRef.current.add(id);
          setResults((prev) =>
            new Map(prev).set(id, { status: "error", limited: err instanceof RateLimited }),
          );
        }
      })();
    }
    return () => controller.abort();
  }, [baseKey, askedKey, nonce]);

  const retry = () => {
    for (const id of failed) settledRef.current.delete(id);
    setResults((prev) => {
      const next = new Map(prev);
      for (const id of failed) next.delete(id);
      return next;
    });
    setNonce((n) => n + 1);
  };

  // The list after the checked swaps, in place.
  const chosen = plan.outs.filter((o) => o.pick !== null);
  const afterEntries = useMemo(
    () =>
      fitList(
        entries,
        format,
        plan.outs.flatMap((o) =>
          o.pick ? [{ outId: o.id, inId: o.pick.cardId, zone: o.zone }] : [],
        ),
      ),
    [entries, format, plan],
  );
  const afterIds = useMemo(
    () => factsIds(playableEntries(afterEntries, format)),
    [afterEntries, format],
  );
  // The after-check's facts: the list's id set once the asks are in (the hook, unchanged).
  const facts = useBracketFacts({
    game: adapter.id,
    enabled: brackets !== undefined && leader && pending.length === 0 && plan.swaps > 0,
    ids: afterIds,
  });
  const afterRead = useMemo(() => {
    if (!brackets || facts.state !== "ready" || plan.swaps === 0) return null;
    const all = new Map(cards);
    for (const o of plan.outs) {
      if (o.pick && !all.has(o.pick.cardId)) all.set(o.pick.cardId, toEditorCard(o.pick.card));
    }
    return brackets.assess({
      deck: toDeckSnapshot(adapter.id, format, afterEntries),
      cards: all,
      combos: facts.combos,
      freshness,
      targetLevel: target,
      answers: goals?.answers ?? null,
    });
  }, [
    brackets,
    facts.state,
    facts.combos,
    plan,
    cards,
    adapter.id,
    format,
    afterEntries,
    freshness,
    target,
    goals,
  ]);

  const setOverride = (change: (o: TargetFitOverrides) => TargetFitOverrides) =>
    setOverrides((prev) => change(prev));
  const keepCard = (id: string) =>
    setOverride((o) => ({ ...o, keep: withId(o.keep, id), swap: withoutId(o.swap, id) }));
  const swapCard = (id: string) =>
    setOverride((o) => ({ ...o, keep: withoutId(o.keep, id), swap: withId(o.swap, id) }));
  const pickFor = (id: string, inId: string) =>
    setOverride((o) => ({
      keep: withoutId(o.keep, id),
      swap: withId(o.swap, id),
      picks: new Map(o.picks).set(id, inId),
    }));
  const instead = (e: MouseEvent<HTMLButtonElement>, outId: string, inId: string) => {
    // The row stays (kept now) while its button goes: its check keeps focus.
    e.currentTarget
      .closest("[data-fit-row]")
      ?.querySelector<HTMLElement>("[data-slot=checkbox]")
      ?.focus();
    setOverride((o) => ({
      ...o,
      keep: withId(o.keep, outId),
      swap: withId(withoutId(o.swap, outId), inId),
    }));
  };

  const apply = () => {
    if (chosen.length === 0) return;
    onApply({
      entries: afterEntries,
      cards: chosen.map((o) => o.pick!.card),
      swapped: chosen.length,
    });
  };

  if (!brackets || !swap) return null;

  const factors = new Map(read.factors.map((f) => [f.id, f]));
  const fixOf = new Map(fixes.map((f) => [f.factor, f]));
  const nameOf = (id: string) => cards.get(id)?.name ?? fitCards.get(id)?.name ?? id;
  const labels = new Map(swap.roles.map((r) => [r.key, r.label]));
  const source = sourceMeta(adapter, swap.source);
  // Which card each incoming option is coming in for: never twice.
  const pickedFor = new Map<string, string>();
  for (const o of plan.outs) if (o.pick) pickedFor.set(o.pick.cardId, o.name);
  // A row sits under the first fix it serves; a kept card under the first fix naming it.
  const firstFix = (id: string) => fixes.find((f) => f.from.includes(id))?.factor;
  const rows: RowView[] = [
    ...plan.outs
      .filter((o) => o.options.length > 0)
      .map((o) => ({ id: o.id, name: o.name, options: o.options, pick: o.pick, kept: false })),
    // A kept row keeps its options: choosing one swaps the card again.
    ...plan.kept.map((id) => {
      const answer = results.get(id);
      return {
        id,
        name: nameOf(id),
        options: answer?.status === "done" ? targetFitOptions(answer.rows) : [],
        pick: null,
        kept: true,
      };
    }),
  ];
  const groups = fixes.flatMap((fix) => {
    // The fix's own order, so a row never moves when another is kept or swapped instead.
    const own = rows
      .filter((r) => firstFix(r.id) === fix.factor)
      .sort((a, b) => fix.from.indexOf(a.id) - fix.from.indexOf(b.id));
    const also = plan.outs.filter(
      (o) => o.options.length > 0 && o.fixes.includes(fix.factor) && o.fixes[0] !== fix.factor,
    );
    return own.length > 0 || also.length > 0 ? [{ fix, own, also }] : [];
  });
  const costLine = costOf(chosen, owned);
  const state =
    !leader || fixes.length === 0
      ? "nothing"
      : pending.length > 0
        ? "asking"
        : plan.outs.length === 0 && failed.length === 0
          ? "nothing"
          : "ready";

  const content = (
    <div
      data-slot="target-fit-sheet"
      data-fit-state={state}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <p className="text-muted-foreground text-sm">{BRACKET_COPY.fitLead}</p>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {groups.map(({ fix, own, also }, i) => (
          <div
            key={fix.factor}
            role="group"
            aria-labelledby={`${groupId}-${i}`}
            data-fit-fix={fix.factor}
            className="min-w-0 space-y-1.5 break-words"
          >
            <p id={`${groupId}-${i}`} className="text-sm">
              {factors.get(fix.factor)?.sentence}
            </p>
            {own.length > 0 && (
              <ul className="space-y-2">
                {own.map((row) => (
                  <TargetFitRowView
                    key={row.id}
                    row={row}
                    image={cards.get(row.id)?.image ?? null}
                    labels={labels}
                    pickedFor={pickedFor}
                    others={row.kept ? [] : (plan.instead.get(fix.factor) ?? [])}
                    nameOf={nameOf}
                    onKeep={keepCard}
                    onSwap={swapCard}
                    onPick={pickFor}
                    onInstead={instead}
                  />
                ))}
              </ul>
            )}
            {also.map((o) => (
              <p key={o.id} className="text-muted-foreground text-xs">
                {BRACKET_COPY.fitAlso(o.name)}
              </p>
            ))}
          </div>
        ))}

        {pending.length > 0 && (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {BRACKET_COPY.fitAsking(pending.length)}
          </p>
        )}
        {failed.length > 0 && (
          <p className="text-destructive text-xs">
            {limited ? FIT_COPY.limited : FIT_COPY.failed}{" "}
            <button type="button" onClick={retry} className={INLINE_ACTION}>
              {FIT_COPY.retry}
            </button>
          </p>
        )}
        {plan.notAsked > 0 && (
          <p data-slot="target-fit-not-looked" className="text-muted-foreground text-xs">
            {BRACKET_COPY.fitNotLooked(plan.notAsked)}
          </p>
        )}

        {plan.short.length > 0 && (
          <section
            aria-labelledby={leftId}
            data-slot="target-fit-left"
            className="space-y-1.5 pt-1"
          >
            <h3 id={leftId} className={SECTION_HEADING}>
              {BRACKET_COPY.fitLeft}
            </h3>
            <ul className="space-y-1.5">
              {plan.short.map((s) => (
                <li
                  key={s.factor}
                  data-fit-short={s.factor}
                  className="min-w-0 rounded-md border border-dashed px-2.5 py-2 break-words"
                >
                  <p className="text-sm">{factors.get(s.factor)?.sentence}</p>
                  {stayLines(s, fixOf.get(s.factor), factors.get(s.factor)?.cards ?? [], {
                    nameOf,
                    qtyOf: (id) => fitCards.get(id)?.qty ?? 1,
                    leaderNoun: adapter.display.leaderNoun,
                  }).map((line) => (
                    <p key={line} className="text-muted-foreground mt-0.5 text-xs">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-muted-foreground text-xs">
          {BRACKET_COPY.fitCredit}{" "}
          {source.href ? (
            <a href={source.href} target="_blank" rel="noreferrer" className="underline">
              {source.label}
            </a>
          ) : (
            source.label
          )}
          . {BRACKET_COPY.fitPrices}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <AfterLine
            swaps={plan.swaps}
            waiting={pending.length > 0}
            state={facts.state}
            read={afterRead}
            level={level}
            onRetry={facts.retry}
          />
          {costLine && (
            <p data-slot="target-fit-cost" className="text-muted-foreground text-xs">
              {costLine}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {BRACKET_COPY.cancel}
          </Button>
          <Button size="sm" disabled={plan.swaps === 0 || pending.length > 0} onClick={apply}>
            {FIT_COPY.apply(plan.swaps)}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Shell title={title} phone={phone} finalFocus={finalFocus} onClose={onClose}>
      {content}
    </Shell>
  );
}

const withId = (set: ReadonlySet<string>, id: string) => new Set(set).add(id);
const withoutId = (set: ReadonlySet<string>, id: string) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

/** What the cards coming in cost: the ones the player owns left out, the unpriced counted beside. */
function costOf(
  chosen: readonly { pick: AlternativeRow | null }[],
  owned: ReadonlySet<string> | null,
): string | null {
  if (chosen.length === 0) return null;
  let usd = 0;
  let mine = 0;
  let unpriced = 0;
  for (const { pick } of chosen) {
    if (!pick) continue;
    if (owned?.has(pick.cardId)) {
      mine += 1;
      continue;
    }
    const price = pick.cheapestUsd === null ? NaN : Number(pick.cheapestUsd);
    if (Number.isFinite(price)) usd += Math.round(price * 100);
    else unpriced += 1;
  }
  return BRACKET_COPY.fitCost(usd / 100, mine, unpriced, chosen.length);
}

/** Why part of a fix stays, one line per reason, every card named. */
function stayLines(
  short: TargetFitShort,
  fix: BracketFix | undefined,
  factorCards: readonly string[],
  {
    nameOf,
    qtyOf,
    leaderNoun,
  }: { nameOf: (id: string) => string; qtyOf: (id: string) => number; leaderNoun: string },
): string[] {
  const C = BRACKET_COPY;
  const lines: string[] = [];
  if (short.commander > 0) {
    // The factor's cards a fix leaves out are the commanders'.
    const commanders = factorCards.filter((id) => !fix?.from.includes(id)).map(nameOf);
    if (commanders.length > 0) lines.push(C.fitStaysCommander(commanders, leaderNoun));
  }
  for (const { reason, ids } of short.stays) {
    const names = ids.map(nameOf);
    if (reason === "copies")
      lines.push(...ids.map((id) => C.fitStaysCopies(nameOf(id), qtyOf(id))));
    else if (reason === "not-offered") lines.push(C.fitStaysNotOffered(names));
    else if (reason === "no-roles") lines.push(C.fitStaysNoRoles(names));
    else if (reason === "none") lines.push(C.fitStaysNone(names));
    else if (reason === "kept") lines.push(C.fitStaysKept(names));
    else lines.push(C.fitStaysNotAsked(names));
  }
  return lines;
}

/**
 * The footer's verdict: only the read of the list after the swaps says the
 * deck fits, and only when it finds nothing above the target; otherwise it
 * names what still does, in the read's own sentences. A short polite status
 * says the verdict alone (never "Checking…").
 */
function AfterLine({
  swaps,
  waiting,
  state,
  read,
  level,
  onRetry,
}: {
  swaps: number;
  waiting: boolean;
  state: ReturnType<typeof useBracketFacts>["state"];
  read: BracketRead | null;
  level: string;
  onRetry: () => void;
}) {
  const C = BRACKET_COPY;
  const above = read ? read.factors.filter((f) => read.conflicts.includes(f.id)) : [];
  const verdict =
    swaps === 0 || waiting || !read
      ? null
      : above.length === 0
        ? C.fitAfterFits(level)
        : C.fitAfterStill(level);
  let body: ReactNode = null;
  if (swaps > 0 && !waiting) {
    if (state === "failed" || state === "over") {
      body = (
        <p data-slot="target-fit-after" data-after="failed" className="text-sm">
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
          data-slot="target-fit-after"
          data-after="checking"
          className="text-muted-foreground text-sm"
        >
          {C.fitAfterChecking}
        </p>
      );
    } else if (above.length === 0) {
      body = (
        <p data-slot="target-fit-after" data-after="fits" className="text-sm font-medium">
          {C.fitAfterFits(level)}
        </p>
      );
    } else {
      body = (
        <div data-slot="target-fit-after" data-after="still" className="text-sm">
          <p className="font-medium">{C.fitAfterStill(level)}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
            {above.map((f) => (
              <li key={f.id} data-after-conflict={f.id} className="break-words">
                {f.sentence}
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
  return (
    <>
      {body}
      <span role="status" data-slot="target-fit-status" className="sr-only">
        {verdict ?? ""}
      </span>
    </>
  );
}

interface RowView {
  id: string;
  name: string;
  options: AlternativeRow[];
  pick: AlternativeRow | null;
  kept: boolean;
}

/** One card going out (or kept): swap or keep, and which of its options comes in. */
function TargetFitRowView({
  row,
  image,
  labels,
  pickedFor,
  others,
  nameOf,
  onKeep,
  onSwap,
  onPick,
  onInstead,
}: {
  row: RowView;
  /** The card's image: its name previews on hover, as in the Fit sheet. */
  image: string | null;
  labels: ReadonlyMap<string, string>;
  /** Options already coming in, by the card they replace. */
  pickedFor: ReadonlyMap<string, string>;
  /** A one-card fix's other cards, to swap instead. */
  others: readonly string[];
  nameOf: (id: string) => string;
  onKeep: (id: string) => void;
  onSwap: (id: string) => void;
  onPick: (id: string, inId: string) => void;
  onInstead: (e: MouseEvent<HTMLButtonElement>, outId: string, inId: string) => void;
}) {
  const { id, name, options, pick, kept } = row;
  return (
    <li
      data-fit-row={id}
      data-kept={kept ? "" : undefined}
      className="min-w-0 rounded-md border px-2.5 py-2"
    >
      <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
        <Checkbox checked={!kept} onCheckedChange={(next) => (next ? onSwap(id) : onKeep(id))} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {BRACKET_COPY.fitSwap}{" "}
          <CardNamePreview name={name} image={image}>
            <span>{name}</span>
          </CardNamePreview>
        </span>
      </label>
      {options.length > 0 && (
        <div
          role="radiogroup"
          aria-label={BRACKET_COPY.fitInsteadOf(name)}
          className="mt-1.5 space-y-1 pl-6"
        >
          {options.map((o) => {
            const taken = pickedFor.has(o.cardId) && pick?.cardId !== o.cardId;
            const usd = o.cheapestUsd === null ? NaN : Number(o.cheapestUsd);
            return (
              <div key={o.cardId}>
                <label
                  className={`flex items-center gap-2 text-sm pointer-coarse:min-h-11 ${taken ? "text-muted-foreground" : ""}`}
                >
                  <input
                    type="radio"
                    name={`target-fit-${id}`}
                    className="accent-primary size-4 shrink-0"
                    checked={!kept && pick?.cardId === o.cardId}
                    disabled={taken}
                    onChange={() => onPick(id, o.cardId)}
                  />
                  <CardNamePreview name={o.name} image={o.card.image}>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  </CardNamePreview>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {Number.isFinite(usd) ? `$${usd.toFixed(2)}` : BRACKET_COPY.fitNoPrice}
                  </span>
                </label>
                <p className="text-muted-foreground pl-6 text-xs break-words">
                  {BRACKET_COPY.fitShares(o.shared.map((k) => labels.get(k) ?? k))}
                </p>
                {/* Its own line: a long name never pushes the row past a phone's width. */}
                {taken && (
                  <p className="text-muted-foreground pl-6 text-xs break-words">
                    {BRACKET_COPY.fitComingFor(pickedFor.get(o.cardId)!)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {others.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
          {others.map((other) => (
            <Button
              key={other}
              type="button"
              variant="outline"
              size="xs"
              className="max-w-full pointer-coarse:h-11 pointer-coarse:px-3"
              onClick={(e) => onInstead(e, id, other)}
            >
              <span className="truncate">{BRACKET_COPY.fitInstead(nameOf(other))}</span>
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/** FitSheet's shell, copied: a full-height Drawer on phones, the wide Modal from md. */
function Shell({
  title,
  phone,
  finalFocus,
  onClose,
  children,
}: {
  title: string;
  phone: boolean;
  finalFocus?: FinalFocus;
  onClose: () => void;
  children: ReactNode;
}) {
  if (phone) {
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        showSwipeHandle
      >
        <DrawerContent
          aria-label={title}
          finalFocus={finalFocus}
          className="[--drawer-height:calc(100dvh-3rem)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            <DrawerTitle className="truncate text-sm font-semibold">{title}</DrawerTitle>
            <DrawerClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  className="pointer-coarse:size-11"
                />
              }
            >
              <XIcon />
            </DrawerClose>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Modal label={title} onClose={onClose} finalFocus={finalFocus} wide>
      {children}
    </Modal>
  );
}

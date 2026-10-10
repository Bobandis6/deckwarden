"use client";

/**
 * The Fit sheet (Y8, WAVE4 D9 — Budget Twin): fit the deck under a total
 * budget through reviewed swaps. The editor's dialog slot ("fit"): a
 * full-height bottom Drawer on phones, the wide Modal from md (the
 * AutofillSheet shell), so the hotkeys stand down.
 *
 * - **The total is set here**, and only here: "Deck total" — a whole-dollar
 *   field with presets (budget.ts' TOTAL_PRESETS_USD). Typing commits
 *   nothing; Fit, Enter or a preset does. A committed total is the plan's
 *   target, not yet the deck's: Apply saves it with the swaps (one edit),
 *   and "Save $150 as this deck's total" saves it alone when nothing needs
 *   to change — so opening and reviewing never write (a draft mints its row
 *   on the apply, exactly once).
 * - **The asks** are Swap Lab's route, one card per POST, the priciest
 *   considered card first (../../lib/recommend/fit.ts says which cards),
 *   FIT_BATCH at a time, until the checked swaps reach the total or
 *   FIT_ASK_LIMIT cards were asked — never more per open. A 429 stops the
 *   asking and says so; Try again asks the failed cards again. The goals
 *   ride every ask as Swap Lab sends them (`suggestionGoals`: no total, so
 *   a new total never re-asks).
 * - **The review**: each answered card with one to three cheaper
 *   alternatives inside the goals, a checkbox (swap it or keep it) and a
 *   choice among them; the sheet's own picks are the fewest swaps of the
 *   priciest cards that reach the total (each card's cheapest option, said
 *   aloud, when the best-ranked can't), and the player's checks win. The
 *   running estimate reads in the footer — "est. $148 of your $150", or
 *   "Gets you to $172 of your $150" when the swaps can't reach it.
 * - **The apply** is ONE `applyListSwap` (D9): every checked card out and
 *   its pick in, in place, one toast and one Undo for the batch.
 *
 * Honest about what it leaves out: cards without a price (counted beside
 * the estimate, never as $0), the pricey cards it didn't look at (no
 * community roles yet, combo pieces — the bracket line's facts keep them),
 * cards you own (with a collection — $0, and they stay), and "No suitable
 * alternative under your goals." when nothing can be swapped down.
 */
import { GaugeIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { GoalsLine } from "@/components/deck/goals-line";
import type {
  AlternativeRow,
  AlternativesResponse,
} from "@/components/editor/alternatives-section";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { BracketFactsState } from "@/lib/brackets/facts";
import { formatUsd } from "@/lib/collection/ownership";
import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { suggestionGoals, withTotal, type DeckGoals } from "@/lib/decks/goals";
import { snapshotBody } from "@/lib/decks/panel-view";
import type { CompleteCombo, FormatDef, GameAdapter } from "@/lib/games/types";
import { TOTAL_MAX_USD, TOTAL_PRESETS_USD } from "@/lib/recommend/budget";
import {
  FIT_ASK_LIMIT,
  FIT_BATCH,
  FIT_COPY,
  afterPhrase,
  fitConsidered,
  fitList,
  planFit,
  skippedLine,
  totalPhrase,
  type FitEstimate,
  type FitRow,
} from "@/lib/recommend/fit";

/** What Apply hands back: the full next list, the incoming wires, the count, the total it fits. */
export interface FitApply {
  entries: EditorEntry[];
  cards: CardWire[];
  swapped: number;
  totalUsd: number;
}

type Answer = { status: "done"; rows: AlternativeRow[] } | { status: "error"; limited: boolean };
type FinalFocus = ComponentProps<typeof Modal>["finalFocus"];

class RateLimited extends Error {}

export function FitSheet({
  adapter,
  format,
  entries,
  cards,
  goals,
  estimate,
  owned,
  combos,
  factsState,
  phone,
  finalFocus,
  onApply,
  onSaveTotal,
  onClose,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  goals: DeckGoals | null;
  /** The deck's estimate now (owned copies at $0 only with a collection). */
  estimate: FitEstimate;
  /** The owned set — only when a collection exists; null = nothing is owned. */
  owned: ReadonlySet<string> | null;
  /** The bracket line's complete combos — their pieces are never swapped out. */
  combos: readonly CompleteCombo[] | null;
  factsState: BracketFactsState;
  phone: boolean;
  /** Where focus goes on close, over Base UI's default (the goals line's door — the editor names it). */
  finalFocus?: FinalFocus;
  onApply: (apply: FitApply) => void;
  /** Saves the total alone (null removes it) — the goals edit. */
  onSaveTotal: (totalUsd: number | null) => void;
  onClose: () => void;
}) {
  const swap = adapter.recommend?.swap;
  const hasLeader = format.zones.some(
    (z) => z.isLeaderZone && entries.some((e) => e.zone === z.id),
  );
  const savedTotal = goals?.budget?.totalUsd ?? null;
  const [committed, setCommitted] = useState<number | null>(savedTotal);
  const [editing, setEditing] = useState(savedTotal === null);
  const [field, setField] = useState(savedTotal === null ? "" : String(savedTotal));
  const [fieldError, setFieldError] = useState(false);
  const [asked, setAsked] = useState<readonly string[]>([]);
  const [results, setResults] = useState<ReadonlyMap<string, Answer>>(() => new Map());
  const [overrides, setOverrides] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const [nonce, setNonce] = useState(0);
  // Cards whose answer landed: a re-run of the ask effect never asks them again.
  const settledRef = useRef<Set<string>>(new Set());
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const comboPieceIds = useMemo(
    () => (combos ? new Set(combos.flatMap((c) => c.cardPieces)) : null),
    [combos],
  );
  const { considered, skipped } = useMemo(
    () =>
      swap
        ? fitConsidered({ entries, cards, format, swap, owned, comboPieceIds })
        : { considered: [], skipped: [] },
    [swap, entries, cards, format, owned, comboPieceIds],
  );
  const answers = useMemo(() => {
    const done = new Map<string, AlternativeRow[]>();
    for (const [id, a] of results) if (a.status === "done") done.set(id, a.rows);
    return done;
  }, [results]);
  const over = committed !== null && estimate.usd > committed;
  const plan = useMemo(
    () =>
      committed === null
        ? null
        : planFit({
            considered,
            answers,
            estimateUsd: estimate.usd,
            totalUsd: committed,
            overrides,
          }),
    [committed, considered, answers, estimate.usd, overrides],
  );

  // Every ask is Swap Lab's draft body plus the card: the goals as Swap Lab
  // sends them (no total — a new total never re-asks).
  const baseKey = useMemo(
    () =>
      swap && hasLeader
        ? JSON.stringify(
            snapshotBody(adapter.id, format, entries, undefined, suggestionGoals(goals)),
          )
        : null,
    [swap, hasLeader, adapter.id, format, entries, goals],
  );

  const pending = asked.filter((id) => !results.has(id));
  const failed = asked.filter((id) => results.get(id)?.status === "error");
  const limited = failed.some((id) => {
    const a = results.get(id);
    return a?.status === "error" && a.limited;
  });

  // The next batch, once the last one settled and the checked swaps still
  // fall short (the adjust-state-during-render pattern: it converges, since
  // the new cards are pending until they answer). At FIT_ASK_LIMIT the
  // batch is empty, and nothing more is asked.
  if (
    baseKey !== null &&
    over &&
    plan !== null &&
    !plan.fits &&
    pending.length === 0 &&
    failed.length === 0
  ) {
    const already = new Set(asked);
    const next = considered
      .filter((c) => !already.has(c.id))
      .slice(0, Math.min(FIT_BATCH, FIT_ASK_LIMIT - asked.length))
      .map((c) => c.id);
    if (next.length > 0) setAsked([...asked, ...next]);
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

  const commit = (usd: number) => {
    setCommitted(usd);
    setField(String(usd));
    setEditing(false);
    setFieldError(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const usd = Number(field.replace(/[$,\s]/g, ""));
    if (!Number.isInteger(usd) || usd < 1 || usd > TOTAL_MAX_USD) {
      setFieldError(true);
      return;
    }
    commit(usd);
  };
  const removeTotal = () => {
    onSaveTotal(null);
    setCommitted(null);
    setField("");
    setEditing(true);
  };

  const setPick = (cardId: string, inId: string | null) =>
    setOverrides((prev) => new Map(prev).set(cardId, inId));
  // Which alternative is already coming in for which card: never twice.
  const pickedFor = new Map<string, string>();
  for (const row of plan?.rows ?? []) if (row.chosen) pickedFor.set(row.chosen, row.card.name);

  const apply = () => {
    if (!plan || committed === null) return;
    const chosen = plan.rows.filter((r) => r.chosen !== null);
    if (chosen.length === 0) return;
    const next = fitList(
      entries,
      format,
      chosen.map((r) => ({ outId: r.card.id, inId: r.chosen!, zone: r.card.zone })),
    );
    onApply({
      entries: next,
      cards: chosen.map((r) => r.options.find((o) => o.cardId === r.chosen)!.card),
      swapped: chosen.length,
      totalUsd: committed,
    });
  };

  if (!swap) return null;

  const offered = plan?.rows.filter((r) => r.options.length > 0) ?? [];
  const empty = plan?.rows.filter((r) => r.options.length === 0) ?? [];
  const nothing = over && pending.length === 0 && failed.length === 0 && offered.length === 0;
  // The pricey cards it didn't look at: the ones at least as pricey as the
  // cheapest card it asked about (all of them when it could ask about none).
  const floor = considered.filter((c) => asked.includes(c.id)).at(-1)?.usd ?? null;
  const notLookedAt = skippedLine(
    skipped.filter((s) => floor === null || (s.usd !== null && s.usd >= floor)),
  );
  const comboNote =
    !adapter.recommend?.combos || comboPieceIds !== null
      ? null
      : factsState === "checking"
        ? FIT_COPY.combosChecking
        : FIT_COPY.combosUnknown;
  const source = sourceMeta(adapter, swap.source);
  const labels = new Map(swap.roles.map((r) => [r.key, r.label]));
  const state = !hasLeader
    ? "no-leader"
    : committed === null
      ? "set-total"
      : !over
        ? "within"
        : nothing
          ? "nothing"
          : pending.length > 0
            ? "asking"
            : "ready";

  const content = (
    <div
      data-slot="fit-sheet"
      data-fit-state={state}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <p className="text-muted-foreground text-sm">{FIT_COPY.lead}</p>
      {/* The goals the alternatives keep to (read-only — the total is this sheet's). */}
      {(goals?.targetLevel !== undefined || goals?.budget?.perCardUsd !== undefined) && (
        <GoalsLine brackets={adapter.brackets} goals={withTotal(goals, null)} />
      )}

      <section aria-label={FIT_COPY.totalLabel} className="space-y-1">
        {editing || committed === null ? (
          <form onSubmit={submit} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <label htmlFor={fieldId} className="text-sm font-medium">
              {FIT_COPY.totalLabel}
            </label>
            <span className="flex items-center gap-1">
              <span aria-hidden className="text-muted-foreground text-sm">
                $
              </span>
              <Input
                ref={fieldRef}
                id={fieldId}
                inputMode="numeric"
                autoComplete="off"
                value={field}
                aria-invalid={fieldError || undefined}
                onChange={(e) => {
                  setField(e.target.value);
                  setFieldError(false);
                }}
                className="h-8 w-24 tabular-nums"
              />
            </span>
            <Button type="submit" size="sm">
              {FIT_COPY.fit}
            </Button>
            <span className="flex flex-wrap gap-1">
              {TOTAL_PRESETS_USD.map((usd) => (
                <Button
                  key={usd}
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-pressed={committed === usd}
                  onClick={() => commit(usd)}
                  className="pointer-coarse:min-h-11"
                >
                  {formatUsd(usd)}
                </Button>
              ))}
            </span>
          </form>
        ) : (
          <p className="text-sm">
            <span className="font-medium">{FIT_COPY.totalLabel}</span> {formatUsd(committed)}
            {" · "}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
            >
              {FIT_COPY.change}
            </button>
          </p>
        )}
        {fieldError && (
          <p role="alert" className="text-destructive text-xs">
            {FIT_COPY.invalidTotal}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{FIT_COPY.now(estimate)}</p>
        {owned !== null && skipped.some((s) => s.reason === "owned") && (
          <p className="text-muted-foreground text-xs">{FIT_COPY.owned}</p>
        )}
        {savedTotal !== null && (
          <button
            type="button"
            onClick={removeTotal}
            className="text-muted-foreground cursor-pointer text-xs underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
          >
            {FIT_COPY.removeTotal}
          </button>
        )}
      </section>

      {state === "no-leader" && (
        <p className="text-muted-foreground text-sm">
          {FIT_COPY.noLeader(adapter.display.leaderNoun)}
        </p>
      )}
      {state === "set-total" && (
        <p className="text-muted-foreground text-sm">{FIT_COPY.setTotal}</p>
      )}
      {state === "within" && committed !== null && (
        <div className="space-y-1.5">
          <p className="text-sm">{FIT_COPY.within(totalPhrase(committed, estimate))}</p>
          {committed !== savedTotal && (
            <Button size="sm" variant="outline" onClick={() => onSaveTotal(committed)}>
              {FIT_COPY.saveTotal(committed)}
            </Button>
          )}
        </div>
      )}

      {hasLeader && over && plan && (
        <>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {offered.length > 0 && (
              <ul aria-label="Swaps" className="space-y-2">
                {offered.map((row) => (
                  <FitRowView
                    key={row.card.id}
                    row={row}
                    image={cards.get(row.card.id)?.image ?? null}
                    labels={labels}
                    pickedFor={pickedFor}
                    onPick={setPick}
                  />
                ))}
              </ul>
            )}
            {nothing && <p className="text-sm">{FIT_COPY.nothing}</p>}
            {plan.prefer === "price" && pending.length === 0 && (
              <p className="text-muted-foreground text-xs">{FIT_COPY.cheapest}</p>
            )}
            {pending.length > 0 && (
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {FIT_COPY.asking(pending.length)}
              </p>
            )}
            {failed.length > 0 && (
              <p className="text-destructive text-xs">
                {limited ? FIT_COPY.limited : FIT_COPY.failed}{" "}
                <button
                  type="button"
                  onClick={retry}
                  className="cursor-pointer underline pointer-coarse:min-h-11"
                >
                  {FIT_COPY.retry}
                </button>
              </p>
            )}
            {offered.length > 0 && empty.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {FIT_COPY.noneFor(empty.map((r) => r.card.name))}
              </p>
            )}
            {notLookedAt && <p className="text-muted-foreground text-xs">{notLookedAt}</p>}
            {comboNote && <p className="text-muted-foreground text-xs">{comboNote}</p>}
            <p className="text-muted-foreground text-xs">
              Alternatives share a job by community tags on{" "}
              {source.href ? (
                <a href={source.href} target="_blank" rel="noreferrer" className="underline">
                  {source.label}
                </a>
              ) : (
                source.label
              )}
              . Prices are each card&apos;s cheapest printing.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p data-slot="fit-after" className="text-sm font-medium tabular-nums">
              {afterPhrase(plan.afterUsd, committed!, plan.fits)}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={plan.swaps === 0 || pending.length > 0} onClick={apply}>
                {FIT_COPY.apply(plan.swaps)}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Shell
      phone={phone}
      initialFocus={editing ? fieldRef : undefined}
      finalFocus={finalFocus}
      onClose={onClose}
    >
      {content}
    </Shell>
  );
}

function Shell({
  phone,
  initialFocus,
  finalFocus,
  onClose,
  children,
}: {
  phone: boolean;
  initialFocus?: RefObject<HTMLInputElement | null>;
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
          aria-label={FIT_COPY.title}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className="[--drawer-height:calc(100dvh-3rem)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            <DrawerTitle className="truncate text-sm font-semibold">{FIT_COPY.title}</DrawerTitle>
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
    <Modal
      label={FIT_COPY.title}
      onClose={onClose}
      initialFocus={initialFocus}
      finalFocus={finalFocus}
      wide
    >
      {children}
    </Modal>
  );
}

/** One card: swap it or keep it, and which of its one to three alternatives comes in. */
function FitRowView({
  row,
  image,
  labels,
  pickedFor,
  onPick,
}: {
  row: FitRow<AlternativeRow>;
  /** The outgoing card's image — names preview on hover, as in the Autofill sheet. */
  image: string | null;
  labels: ReadonlyMap<string, string>;
  /** Alternatives already coming in, by the card they replace. */
  pickedFor: ReadonlyMap<string, string>;
  onPick: (cardId: string, inId: string | null) => void;
}) {
  const { card, options, chosen } = row;
  const takenElsewhere = (id: string) => chosen !== id && pickedFor.has(id);
  const free = options.find((o) => !takenElsewhere(o.cardId));
  return (
    <li data-fit-row={card.id} className="rounded-md border px-2.5 py-2">
      <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
        <input
          type="checkbox"
          className="accent-primary size-4 shrink-0"
          checked={chosen !== null}
          disabled={chosen === null && !free}
          onChange={() => onPick(card.id, chosen !== null ? null : (free?.cardId ?? null))}
        />
        <span className="min-w-0 flex-1 truncate font-medium">
          Swap{" "}
          <CardNamePreview name={card.name} image={image}>
            <span>{card.name}</span>
          </CardNamePreview>
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          ${card.usd.toFixed(2)}
        </span>
      </label>
      <div
        role="radiogroup"
        aria-label={`Instead of ${card.name}`}
        className="mt-1.5 space-y-1 pl-6"
      >
        {options.map((o) => {
          const usd = Number(o.cheapestUsd);
          const taken = takenElsewhere(o.cardId);
          const flags = o.conflicts.filter((c) => c.rule !== "budget");
          return (
            <div key={o.cardId}>
              <label
                className={`flex items-center gap-2 text-sm pointer-coarse:min-h-11 ${taken ? "text-muted-foreground" : ""}`}
              >
                <input
                  type="radio"
                  name={`fit-${card.id}`}
                  className="accent-primary size-4 shrink-0"
                  checked={chosen === o.cardId}
                  disabled={taken}
                  onChange={() => onPick(card.id, o.cardId)}
                />
                <CardNamePreview name={o.name} image={o.card.image}>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                </CardNamePreview>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  ${usd.toFixed(2)} ·{" "}
                  {taken
                    ? FIT_COPY.pickedFor(pickedFor.get(o.cardId)!)
                    : FIT_COPY.saves(card.usd - usd)}
                </span>
              </label>
              <p className="text-muted-foreground pl-6 text-xs">
                Both: {o.shared.map((k) => labels.get(k) ?? k).join(" · ")}
              </p>
              {flags.map((c) => (
                <p
                  key={`${c.rule}:${c.why}`}
                  data-conflict={c.rule}
                  className="text-muted-foreground flex items-baseline gap-1 pl-6 text-xs"
                >
                  <GaugeIcon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
                  <span>{c.why}</span>
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </li>
  );
}

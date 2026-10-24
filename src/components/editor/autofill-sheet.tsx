"use client";

/**
 * The autofill review sheet (W9b, D8): renders POST /api/decks/autofill —
 * every pick with its evidence, price and a checkbox — and applies the
 * checked picks as ONE whole-list swap through the editor's applyListSwap
 * (Undo built in). The sheet itself never writes: Reroll and the control
 * changes re-POST (the route writes nothing), and only Apply touches the
 * deck.
 *
 * State model (pinned): everything lives in this component, which mounts on
 * open and unmounts on close — nothing survives a close/reopen, and
 * reopening refetches. Stale-shell invalidation is structural: the sheet is
 * modal, so the deck cannot change underneath an open shell. The response's
 * seed is held with the shell (a "same view" is reproducible in state) but
 * rendered nowhere — a shareable seed is W9c-adjacent, deliberately not
 * free-lanced here.
 *
 * Request semantics: leaders come from the leader zone; "Keep my N cards"
 * checked sends every non-leader entry as `keep`, unchecked sends none —
 * and Apply then REPLACES the non-leader list (the plan was built without
 * those cards; stacking picks on top would overfill). Reroll and every
 * control change POST without a seed (the server rolls). A 429 renders its
 * sentence with Retry disabled for the advertised window — never an
 * auto-retry.
 *
 * Row identity (pinned): one row per pick entry (zone, cardId) — a filler
 * entry renders once as "Wastes × 11", matching D8's one-row-per-card.
 * Validation `issues` (adapter validate over keep + picks, server-side)
 * surface as a warning block above the footer — the cheap honest slot.
 *
 * Pinned pieces (X3, WAVE3.md D3): with `pinned` (a combo from the hub
 * door's seed or the Combo Radar's "Suggest full list") the sheet is
 * "Build around this combo" — the lead names the combo, its pieces in the
 * deck render first as "Combo pieces · N" (always kept, no checkbox, each
 * labeled "Combo piece"), they are ALWAYS in the request's `keep` and
 * always in the list Apply builds, and "Keep my N cards" governs the other
 * cards only. Leader-zone pieces (the commander) ride `leaderIds`, never
 * `keep`, and are not counted. Without `pinned` nothing above changes.
 *
 * Goals (Y6b, WAVE4 D7): the deck's goals ride the request as Suggestions'
 * draft POST sends them (`suggestionGoals` — the target, the budget, the
 * answers; spread only when there are any, so a deck without goals sends
 * today's exact body), and the route keeps the shell inside the target. The
 * budget control starts from the deck's per-card goal, as Suggestions' does;
 * a pick of the sheet's own wins for as long as it's open (the sheet is
 * one-shot — no "Save as this deck's budget" here). With a target or a
 * budget, the goals line reads above the controls, without its Change: the
 * Why sheet is another dialog. The notes say what the target kept out.
 */
import { CheckIcon, ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { CardNamePreview } from "@/components/deck/card-name-preview";
import { GoalsLine } from "@/components/deck/goals-line";
import { Segmented } from "@/components/deck/segmented";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { alsoNeedsLine, type ComboPin } from "@/lib/combos/view";
import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { suggestionGoals, type DeckGoals } from "@/lib/decks/goals";
import { isPlayableZone, playableEntries } from "@/lib/decks/playable";
import type { FormatDef, GameAdapter, ValidationIssue } from "@/lib/games/types";
import type { ShellGroup, ShellPick } from "@/lib/recommend/autofill";
import type { FitEstimate } from "@/lib/recommend/fit";
import { BUDGET_OPTIONS, tierOf, type BudgetTier } from "@/lib/recommend/budget";
import type { RecommendationEvidence } from "@/lib/recommend/types";

export const SHEET_TITLE = "Autofill a starter shell";
/** The title with a pinned combo (X3, D3). */
export const COMBO_SHEET_TITLE = "Build around this combo";

/** What Apply hands back: the full next list (pre-merge) + wires + the toast count. */
export interface AutofillApply {
  entries: EditorEntry[];
  cards: CardWire[];
  added: number;
}

/** The route's response, as W9a shipped it (shapes shared via the planner's types). */
interface ShellResponse {
  seed: number;
  picks: ShellPick[];
  groups: ShellGroup[];
  notes: string[];
  totals: { picks: number; estUsd: number | null; unpriced: number };
  issues: ValidationIssue[];
  cards: CardWire[];
}

type SheetState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; shell: ShellResponse };

/**
 * Retry's reason while a 429's window runs (U1, disabled with a reason): the
 * Button's `title`, which keeps it focusable and hoverable, and — U10a,
 * WAVE5.md D10's home for D1's reason — a `FieldDescription` beside the
 * button for as long as the lock runs, on every pointer: a phone has no
 * hover, and a control change during the window can replace the 429
 * sentence above with another error while Retry stays locked (LATER row
 * 216), so the line under Retry is what always says why.
 */
const RETRY_WAIT_REASON = "Too many requests. Retry works again after the wait.";

const pickKey = (p: { zone: string; cardId: string }) => `${p.zone}\u0000${p.cardId}`;

export function AutofillSheet({
  adapter,
  format,
  entries,
  cards,
  phone,
  pinned,
  goals = null,
  estimate = null,
  onApply,
  onClose,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  /** The editor's CURRENT list — leaders drive the request, non-leaders are the keeps. */
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  /** Phone tier renders the bottom Drawer; md+ the wide Dialog (D8). */
  phone: boolean;
  /** The combo this sheet is built around (X3): its pieces are always kept. */
  pinned?: ComboPin;
  /** The deck's goals (Y6b): the shell keeps inside the target; the budget starts from them. */
  goals?: DeckGoals | null;
  /** Y8: the deck's estimate — the goals line reads it beside a total. */
  estimate?: FitEstimate | null;
  onApply: (apply: AutofillApply) => void;
  onClose: () => void;
}) {
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  const leaders = useMemo(
    () => (leaderZone ? entries.filter((e) => e.zone === leaderZone.id) : []),
    [entries, leaderZone],
  );
  // The playable list's non-leader cards (DECK-TOKENS): tokens are neither kept nor counted.
  const keeps = useMemo(
    () => playableEntries(entries, format).filter((e) => e.zone !== leaderZone?.id),
    [entries, format, leaderZone],
  );
  // Pinned (X3): the combo's pieces among the keeps — always sent, always
  // applied. "Keep my N cards" counts and governs only the rest.
  const pinnedIds = useMemo(() => new Set(pinned?.pieceIds ?? []), [pinned]);
  const pinnedKeeps = useMemo(
    () => keeps.filter((e) => pinnedIds.has(e.cardId)),
    [keeps, pinnedIds],
  );
  const keepCount = keeps.filter((e) => !pinnedIds.has(e.cardId)).reduce((n, e) => n + e.qty, 0);

  // The budget starts from the deck's goal (Y6b, as Suggestions'); a pick of its own wins.
  const [pick, setPick] = useState<BudgetTier | null>(null);
  const budget = pick ?? tierOf(goals?.budget?.perCardUsd);
  const sentGoals = useMemo(() => suggestionGoals(goals), [goals]);
  const [keepChecked, setKeepChecked] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [sheet, setSheet] = useState<SheetState>({ state: "loading" });
  /** Unchecked pick keys (default: everything checked) and expanded evidence keys. */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  /** 429: Retry stays disabled for the advertised window (never auto-retried). */
  const [retryLocked, setRetryLocked] = useState(false);
  const retryReasonId = useId();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  // One POST per open and per control change / reroll; the cleanup abort
  // means a closed sheet never spends another rate unit and a superseded
  // request never lands (the reroll budget IS the rate budget).
  const leaderIds = leaders.map((e) => e.cardId).join(",");
  useEffect(() => {
    if (!leaderZone || leaderIds === "") return;
    const controller = new AbortController();
    void (async () => {
      setSheet({ state: "loading" });
      try {
        const res = await fetch("/api/decks/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            game: adapter.id,
            format: format.code,
            leaderIds: leaderIds.split(","),
            keep: keeps
              .filter((e) => keepChecked || pinnedIds.has(e.cardId))
              .map((e) => ({ cardId: e.cardId, zone: e.zone, qty: e.qty })),
            ...(budget !== "all" ? { budgetUsd: Number(budget) } : {}),
            ...(sentGoals ? { goals: sentGoals } : {}),
          }),
        });
        if (res.status === 429) {
          const after = Math.max(1, Number(res.headers.get("Retry-After")) || 30);
          setRetryLocked(true);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => setRetryLocked(false), after * 1000);
          setSheet({
            state: "error",
            message: `Too many autofill requests. Try again in ${after} seconds.`,
          });
          return;
        }
        if (!res.ok) throw new Error(`Autofill failed (${res.status})`);
        const shell: ShellResponse = await res.json();
        setExcluded(new Set());
        setExpanded(new Set());
        setSheet({ state: "ready", shell });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSheet({
          state: "error",
          message: "Couldn't build the shell. Check your connection and try again.",
        });
      }
    })();
    return () => controller.abort();
    // keeps derives from entries and pinnedIds from the pin — both stable
    // while this modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter.id, format.code, leaderZone, leaderIds, keepChecked, budget, sentGoals, nonce]);

  const shell = sheet.state === "ready" ? sheet.shell : null;
  const checkedPicks = useMemo(
    () => (shell ? shell.picks.filter((p) => !excluded.has(pickKey(p))) : []),
    [shell, excluded],
  );
  const addedCount = checkedPicks.reduce((n, p) => n + p.qty, 0);
  // Live totals over the CHECKED picks (the server's totals cover them all).
  const est = useMemo(() => {
    let usd = 0;
    let priced = false;
    let unpriced = 0;
    for (const p of checkedPicks) {
      if (p.cheapestUsd !== null) {
        usd += Number(p.cheapestUsd) * p.qty;
        priced = true;
      } else {
        unpriced += p.qty;
      }
    }
    return { usd: priced ? usd : null, unpriced };
  }, [checkedPicks]);

  /** "41 from Topdeck.gg, 21 from EDHREC, 37 from Land template" — adapter labels (U9: one dot a line). */
  const sourceLine = useMemo(() => {
    if (!shell) return null;
    const byLabel = new Map<string, number>();
    for (const p of shell.picks) {
      const source = p.evidence[0]?.source;
      if (!source) continue;
      const { label } = sourceMeta(adapter, source);
      byLabel.set(label, (byLabel.get(label) ?? 0) + p.qty);
    }
    if (byLabel.size === 0) return null;
    return [...byLabel].map(([label, qty]) => `${qty} from ${label}`).join(", ");
  }, [shell, adapter]);

  const toggle = (key: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleGroup = (picks: readonly ShellPick[], allChecked: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const p of picks) {
        if (allChecked) next.add(pickKey(p));
        else next.delete(pickKey(p));
      }
      return next;
    });
  };

  const apply = useCallback(() => {
    if (!shell || addedCount === 0) return;
    // Keep checked: picks land on top of the whole current list. Unchecked:
    // the plan was built without the non-leader cards, so Apply replaces
    // them — leaders + picks (see the module doc; pinned in tests) — except
    // a pinned combo's pieces, which the plan was built around (X3), and the
    // Tokens zone (DECK-TOKENS), which was never part of the 100 it rebuilt.
    const base = keepChecked
      ? [...entries]
      : entries.filter(
          (e) =>
            (leaderZone && e.zone === leaderZone.id) ||
            pinnedIds.has(e.cardId) ||
            !isPlayableZone(format, e.zone),
        );
    const next: EditorEntry[] = [
      ...base,
      ...checkedPicks.map((p) => ({ cardId: p.cardId, zone: p.zone, qty: p.qty, tags: [] })),
    ];
    onApply({ entries: next, cards: shell.cards, added: addedCount });
  }, [
    shell,
    addedCount,
    keepChecked,
    entries,
    format,
    leaderZone,
    pinnedIds,
    checkedPicks,
    onApply,
  ]);

  const leaderNames = leaders
    .map((e) => cards.get(e.cardId)?.name)
    .filter((n): n is string => Boolean(n))
    .join(" + ");
  const wireById = useMemo(() => {
    const map = new Map<string, CardWire>();
    if (shell) for (const w of shell.cards) map.set(w.id, w);
    return map;
  }, [shell]);

  const title = pinned ? COMBO_SHEET_TITLE : SHEET_TITLE;
  const alsoNeeds = pinned ? alsoNeedsLine(pinned.templates) : null;
  const content =
    leaders.length === 0 ? (
      <p className="text-muted-foreground text-sm">
        Set a {adapter.display.leaderNoun.toLowerCase()} first. The starter shell is built around
        one.
      </p>
    ) : (
      <>
        <p className="text-muted-foreground text-sm">
          {pinned ? (
            <>
              {pinned.label}. The rest comes from real decklists and tournament results. Every pick
              shows why.
            </>
          ) : (
            <>
              Built from real decklists and tournament results for{" "}
              {leaderNames || `your ${adapter.display.leaderNoun}`}. Every pick shows why.
            </>
          )}
        </p>

        {/* The deck's goals (Y6b): read-only here — the Why sheet is another dialog. */}
        {(goals?.targetLevel !== undefined ||
          goals?.budget?.perCardUsd !== undefined ||
          goals?.budget?.totalUsd !== undefined) && (
          <GoalsLine brackets={adapter.brackets} goals={goals} estimate={estimate} />
        )}

        {/* Controls: budget chips · keep checkbox · Reroll (D8). */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented label="Budget" options={BUDGET_OPTIONS} value={budget} onChange={setPick} />
          {keepCount > 0 && (
            <Field orientation="horizontal" className="w-auto gap-1.5">
              <Checkbox checked={keepChecked} onCheckedChange={(next) => setKeepChecked(next)} />
              <FieldLabel className="cursor-pointer">
                Keep my {keepCount} card{keepCount === 1 ? "" : "s"}
              </FieldLabel>
            </Field>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={sheet.state === "loading"}
            onClick={() => setNonce((n) => n + 1)}
          >
            <RotateCcwIcon aria-hidden />
            Reroll
          </Button>
        </div>

        {sheet.state === "loading" && (
          <div className="space-y-2" aria-label="Building the shell…">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        {sheet.state === "error" && (
          <Field className="gap-2">
            <p className="text-destructive text-sm">{sheet.message}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                variant="outline"
                size="sm"
                disabled={retryLocked}
                title={retryLocked ? RETRY_WAIT_REASON : undefined}
                aria-describedby={retryLocked ? retryReasonId : undefined}
                onClick={() => setNonce((n) => n + 1)}
              >
                Retry
              </Button>
              {retryLocked && (
                <FieldDescription id={retryReasonId}>{RETRY_WAIT_REASON}</FieldDescription>
              )}
            </div>
          </Field>
        )}

        {shell && (
          <>
            {sourceLine && <p className="text-muted-foreground text-xs">{sourceLine}</p>}
            {/* The planner's notes, verbatim (vocabulary pinned server-side). */}
            {shell.notes.map((note) => (
              <p key={note} className="text-sm">
                {note}
              </p>
            ))}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {pinnedKeeps.length > 0 && <PinnedGroup entries={pinnedKeeps} cards={cards} />}
              {shell.groups.map((group) => (
                <PickGroup
                  key={group.id}
                  adapter={adapter}
                  group={group}
                  picks={shell.picks.filter((p) => p.group === group.id)}
                  excluded={excluded}
                  expanded={expanded}
                  wireById={wireById}
                  onToggle={toggle}
                  onToggleGroup={toggleGroup}
                  onToggleEvidence={(key) =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                />
              ))}
            </div>

            {/* The pinned combo's non-card requirements (D3), in the Radar's words. */}
            {alsoNeeds && <p className="text-xs text-amber-700 dark:text-amber-400">{alsoNeeds}</p>}

            {shell.picks.length > 0 && (
              <p className="text-muted-foreground text-xs">
                A starter shell, not a tuned list. Swap in your{" "}
                {adapter.display.leaderNoun.toLowerCase()}&apos;s synergy pieces.
              </p>
            )}

            {/* Server-side validate over keep + picks — the honest slot above Apply. */}
            {shell.issues.length > 0 && (
              <div className="space-y-0.5">
                {shell.issues.map((issue, i) => (
                  <p
                    key={i}
                    className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-muted-foreground text-xs">
                {addedCount > 0 &&
                  (est.usd !== null
                    ? `Est. total $${est.usd.toFixed(0)} (cheapest printings)`
                    : "No price data for these picks.")}
                {est.unpriced > 0 && ` · ${est.unpriced} unpriced`}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" disabled={addedCount === 0} onClick={apply}>
                  Add {addedCount} card{addedCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </>
        )}
      </>
    );

  // Dialog (wide) from md; full-height bottom Drawer on phones (D8; the W5
  // printing drawer and R4 card sheet are the house styles).
  if (phone) {
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        showSwipeHandle
      >
        <DrawerContent aria-label={title} className="[--drawer-height:calc(100dvh-3rem)]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Modal label={title} onClose={onClose} wide>
      {content}
    </Modal>
  );
}

/** The pinned combo's pieces (X3, D3): first, always kept — no checkbox, nothing to toggle. */
function PinnedGroup({
  entries,
  cards,
}: {
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
}) {
  return (
    <section aria-label="Combo pieces" className="rounded-lg border">
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium">
        <span className="min-w-0 flex-1 truncate">
          Combo pieces · {entries.reduce((n, e) => n + e.qty, 0)}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs font-normal">always kept</span>
      </div>
      <ul className="space-y-1 border-t px-2.5 py-1.5">
        {entries.map((entry) => {
          const card = cards.get(entry.cardId);
          const name = card?.name ?? "Combo piece";
          return (
            <li key={pickKey(entry)} className="flex items-center gap-2 text-sm">
              {/* The Radar's "complete" green: text-primary is 1.49:1 on the dark sheet. */}
              <CheckIcon
                aria-hidden
                className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              />
              <CardNamePreview name={name} image={card?.image ?? null}>
                <Link
                  href={`/cards/${entry.cardId}`}
                  target="_blank"
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {name}
                </Link>
              </CardNamePreview>
              <span className="text-muted-foreground shrink-0 text-xs">Combo piece</span>
              {card?.cheapestUsd != null && (
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  ${card.cheapestUsd.toFixed(2)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PickGroup({
  adapter,
  group,
  picks,
  excluded,
  expanded,
  wireById,
  onToggle,
  onToggleGroup,
  onToggleEvidence,
}: {
  adapter: GameAdapter;
  group: ShellGroup;
  picks: readonly ShellPick[];
  excluded: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  wireById: ReadonlyMap<string, CardWire>;
  onToggle: (key: string) => void;
  onToggleGroup: (picks: readonly ShellPick[], allChecked: boolean) => void;
  onToggleEvidence: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const checked = picks.filter((p) => !excluded.has(pickKey(p)));
  const allChecked = checked.length === picks.length;
  const someChecked = checked.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Checkbox
          aria-label={`Include ${group.label}`}
          checked={allChecked}
          indeterminate={someChecked && !allChecked}
          onCheckedChange={() => onToggleGroup(picks, allChecked)}
        />
        <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-sm font-medium">
          <span className="min-w-0 flex-1 truncate">
            {group.label} · {checked.reduce((n, p) => n + p.qty, 0)}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={`size-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="space-y-1 border-t px-2.5 py-1.5">
          {picks.map((pick) => (
            <PickRow
              key={pickKey(pick)}
              adapter={adapter}
              pick={pick}
              checked={!excluded.has(pickKey(pick))}
              expanded={expanded.has(pickKey(pick))}
              wire={wireById.get(pick.cardId)}
              onToggle={() => onToggle(pickKey(pick))}
              onToggleEvidence={() => onToggleEvidence(pickKey(pick))}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PickRow({
  adapter,
  pick,
  checked,
  expanded,
  wire,
  onToggle,
  onToggleEvidence,
}: {
  adapter: GameAdapter;
  pick: ShellPick;
  checked: boolean;
  expanded: boolean;
  wire: CardWire | undefined;
  onToggle: () => void;
  onToggleEvidence: () => void;
}) {
  const top = pick.evidence[0];
  const more = pick.evidence.length - 1;
  const price = pick.cheapestUsd !== null ? `$${Number(pick.cheapestUsd).toFixed(2)}` : null;
  // One row per pick entry: a filler's quantity rides the row ("Wastes × 11").
  const label = pick.qty > 1 ? `${pick.name} × ${pick.qty}` : pick.name;

  return (
    <li className="text-sm">
      <div className="flex items-center gap-2">
        <Checkbox aria-label={`Include ${label}`} checked={checked} onCheckedChange={onToggle} />
        <CardNamePreview name={pick.name} image={wire?.image ?? null}>
          <Link
            href={`/cards/${pick.cardId}`}
            target="_blank"
            className="min-w-0 flex-1 truncate font-medium hover:underline"
          >
            {label}
          </Link>
        </CardNamePreview>
        {price && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{price}</span>
        )}
      </div>
      {top && (
        <p className="text-muted-foreground mt-0.5 pl-6 text-xs leading-relaxed">
          {top.why}
          <SourceCredit adapter={adapter} evidence={top} />
          {more > 0 && (
            <button
              type="button"
              className="ml-1.5 cursor-pointer underline"
              aria-expanded={expanded}
              onClick={onToggleEvidence}
            >
              {expanded ? "less" : `+${more} more`}
            </button>
          )}
        </p>
      )}
      {expanded &&
        pick.evidence.slice(1).map((e, i) => (
          <p key={i} className="text-muted-foreground mt-0.5 pl-6 text-xs leading-relaxed">
            {e.why}
            <SourceCredit adapter={adapter} evidence={e} />
          </p>
        ))}
    </li>
  );
}

/** The evidence entry's source label — linked when declared (Topdeck.gg credit
 *  is the hard attribution rule wherever tournament evidence renders). */
function SourceCredit({
  adapter,
  evidence,
}: {
  adapter: GameAdapter;
  evidence: RecommendationEvidence;
}) {
  const src = sourceMeta(adapter, evidence.source);
  return (
    <>
      {" ("}
      {src.href ? (
        <a href={src.href} target="_blank" rel="noreferrer" className="underline">
          {src.label}
        </a>
      ) : (
        src.label
      )}
      {")"}
    </>
  );
}

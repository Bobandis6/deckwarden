"use client";

/**
 * Cut Coach panel (P3.4) — the right pane's fourth tab: when the deck
 * exceeds its legal size, rank the deck's OWN cards for removal, every row
 * leading with its TRADEOFF (what cutting costs the deck) — never a bare
 * ordered list. The inverse of Suggestions, sharing its evidence contract:
 * that tab ranks outside cards to add; this one ranks in-deck cards to cut.
 *
 * Architecture (the validate/analyze precedent, stated in cuts.ts): the
 * ranker is pure and runs HERE, on every edit — the editor already holds
 * full CardData per card, tags per entry, and both editorial templates off
 * the adapter, so cuts re-rank instantly mid-edit with zero server cost.
 * The ONE client-missing signal, combo membership, reuses the Combo Radar's
 * route (GET /api/decks/[id]/combos) under the same fetch policy (active
 * tab + leader + deck row + autosave settled + deckStateKey change) — never
 * a second combo query path, and at most one panel fetches per edit since
 * only one tab is active. While combo data is pending, absent (no leader:
 * deck ci_mask 0 would hide colored combos and mislabel their pieces as
 * ordinary cuts), or failed, the panel says so explicitly — rankings
 * without combo protection are disclosed, never silent.
 *
 * The gate is the deck's size computation, not a new one: deckSizeCount
 * over countsTowardSize zones vs FormatDef.deckSize.max — exactly what the
 * deck list header and validate count. Under the limit the tab stays (no
 * layout shift) with an honest "nothing needs cutting" state.
 *
 * A cut is a DECREMENT through the editor's own edit path: one click =
 * setQty(qty − 1) on that entry (the last copy removes the row) → the same
 * applyEdit → autosave as every other edit. Over-limit is counted in
 * copies, so one click always takes exactly one card off the count. The
 * leader zone is never ranked.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfidenceChip, sourceMeta } from "@/components/editor/recommendations-panel";
import type { DeckComboView } from "@/lib/combos/queries";
import { deckSizeCount, type EditorCard, type EditorEntry } from "@/lib/decks/editor-state";
import { deckStateKey, hasLeader } from "@/lib/decks/panel-view";
import { getDeckToken } from "@/lib/decks/token-store";
import {
  completeCombosByCard,
  rankCuts,
  type CutCandidate,
  type CutEntryInput,
} from "@/lib/recommend/cuts";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

interface CutCoachPanelProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Live deck id — null until draft mode's first autosave creates the row. */
  deckId: string | null;
  /** Full entries (tags included — the role signal reads them). */
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  saveStatus: "saved" | "dirty" | "saving" | "error";
  /** Tab visibility: no fetching (lazy) and no work while hidden. */
  active: boolean;
  /** The editor's own edit path — a cut is one decrement on its entry. */
  onSetQty: (zoneId: string, cardId: string, qty: number) => string | undefined;
}

export function CutCoachPanel({
  adapter,
  format,
  deckId,
  entries,
  cards,
  saveStatus,
  active,
  onSetQty,
}: CutCoachPanelProps) {
  const [combosInDeck, setCombosInDeck] = useState<DeckComboView[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const lastKeyRef = useRef<string | null>(null);

  const max = format.deckSize.max;
  const total = deckSizeCount(entries, format);
  const overBy = max !== null ? total - max : 0;
  const leader = hasLeader(entries, format);
  const fetchKey = `${deckStateKey(entries)}§n:${nonce}`;

  // Combo membership via the Radar's route — same fetch policy, PLUS the
  // over-limit gate: under the limit nothing here needs combo data at all.
  useEffect(() => {
    if (!active || overBy <= 0 || !leader || !deckId || saveStatus !== "saved") return;
    if (fetchKey === lastKeyRef.current) return;
    const controller = new AbortController();
    void (async () => {
      setFetching(true);
      setFetchError(null);
      try {
        const token = getDeckToken(deckId);
        const res = await fetch(`/api/decks/${deckId}/combos`, {
          headers: token ? { "x-deck-token": token } : {},
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 429) {
          throw new Error("The combo check is rate-limited for a moment — try again shortly.");
        }
        if (!res.ok) throw new Error(`The combo check failed (${res.status}).`);
        const json: { inDeck: DeckComboView[] } = await res.json();
        lastKeyRef.current = fetchKey;
        setCombosInDeck(json.inDeck);
        setFetching(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetching(false);
        setFetchError(err instanceof Error ? err.message : "The combo check failed.");
      }
    })();
    return () => controller.abort();
  }, [active, overBy, leader, deckId, saveStatus, fetchKey]);

  // The pure ranking — instant on every edit, no save gate. Combo data may
  // lag a fetch behind; completeCombosByCard re-verifies each combo against
  // the CURRENT entries, so a just-cut partner demotes its warning now.
  const ranking = useMemo(() => {
    if (overBy <= 0) return null;
    const cutEntries: CutEntryInput[] = [];
    for (const e of entries) {
      const card = cards.get(e.cardId);
      if (card) cutEntries.push({ card, zone: e.zone, qty: e.qty, tags: e.tags });
    }
    const excludedZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
    const presentIds = new Set(entries.map((e) => e.cardId));
    return rankCuts({
      meta: adapter.recommend ?? {},
      roleTargets: adapter.hub?.roles ?? [],
      entries: cutEntries,
      excludedZones,
      completeCombosByCard: completeCombosByCard(combosInDeck ?? [], presentIds),
    });
  }, [overBy, entries, cards, format, adapter, combosInDeck]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  if (max === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        {format.label} has no maximum deck size — nothing to cut down to.
      </div>
    );
  }

  if (overBy <= 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        {total} of {max} — nothing needs cutting.
      </div>
    );
  }

  // The combo signal's honest status — one line, only while it's not live.
  const comboNote = !leader
    ? `Combo warnings need a ${adapter.display.leaderNoun} — rankings don't include combo protection yet.`
    : fetchError
      ? null // rendered with its retry button below
      : combosInDeck === null
        ? deckId && saveStatus === "saved"
          ? "Checking combos…"
          : "Combo check runs after the deck saves."
        : fetching
          ? "Updating combo check…"
          : null;

  return (
    <div className="p-3">
      <p className="text-sm font-medium">
        Over by {overBy} — cut {overBy} card{overBy === 1 ? "" : "s"} to reach {max}.
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Each cut removes one copy. Ranked by what cutting costs the deck, cheapest tradeoff first.
      </p>

      {comboNote && <p className="text-muted-foreground mt-1.5 text-xs">{comboNote}</p>}
      {fetchError && (
        <p className="mt-1.5 text-xs">
          <span className="text-destructive">
            {fetchError} Rankings don’t include combo protection.
          </span>{" "}
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="text-muted-foreground cursor-pointer underline"
          >
            Try again
          </button>
        </p>
      )}

      {ranking && ranking.cuts.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          No signal data for these cards — nothing honest to rank. Cut from the deck list instead.
        </p>
      ) : (
        ranking && (
          <ul className="mt-2 space-y-1.5">
            {ranking.cuts.map((cut) => {
              const key = `${cut.zone}:${cut.cardId}`;
              return (
                <CutRow
                  key={key}
                  adapter={adapter}
                  cut={cut}
                  expanded={expanded.has(key)}
                  onToggle={() => toggleExpanded(key)}
                  onCut={() => onSetQty(cut.zone, cut.cardId, cut.qty - 1)}
                />
              );
            })}
          </ul>
        )
      )}

      {ranking && ranking.unranked > 0 && (
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          {ranking.unranked} card{ranking.unranked === 1 ? " carries" : "s carry"} no signal data
          and {ranking.unranked === 1 ? "isn't" : "aren't"} ranked.
        </p>
      )}
    </div>
  );
}

function CutRow({
  adapter,
  cut,
  expanded,
  onToggle,
  onCut,
}: {
  adapter: GameAdapter;
  cut: CutCandidate;
  expanded: boolean;
  onToggle: () => void;
  onCut: () => void;
}) {
  // Machine order is presentation order: the tradeoff that matters most
  // (a combo it breaks) leads; keep-side lines render as the cost they are.
  const top = cut.evidence[0];
  const sourceLabels = [...new Set(cut.evidence.map((e) => sourceMeta(adapter, e.source).label))];
  const price = cut.cheapestUsd !== null ? `$${cut.cheapestUsd.toFixed(2)}` : null;

  return (
    <li
      className={`rounded-lg border px-2.5 py-2 ${cut.inCompleteCombo ? "border-amber-600/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} tradeoffs for ${cut.name}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {cut.name}
            {cut.qty > 1 && <span className="text-muted-foreground font-normal"> ×{cut.qty}</span>}
          </span>
          {cut.inCompleteCombo && (
            <span className="shrink-0 rounded-full border border-amber-600/40 px-1.5 text-xs leading-4 text-amber-600 dark:text-amber-400">
              in combo
            </span>
          )}
          <ConfidenceChip level={cut.confidence} />
        </button>
        <Button
          size="xs"
          variant="secondary"
          aria-label={`Cut one copy of ${cut.name}`}
          onClick={onCut}
        >
          Cut
        </Button>
      </div>

      {/* The tradeoff leads even collapsed — never a bare "remove this". */}
      <p
        className={`mt-1 text-xs leading-relaxed ${expanded ? "" : "line-clamp-2"} ${
          top.side === "keep" ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {top.why}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {sourceLabels.join(" · ")}
        {price ? ` · ${price}` : ""}
      </p>

      {expanded && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {cut.evidence.map((e, i) => {
            const src = sourceMeta(adapter, e.source);
            return (
              <div key={i} className="text-xs">
                <p className="flex items-center gap-1.5">
                  {src.href ? (
                    <a
                      href={src.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground underline"
                    >
                      {src.label} ↗
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{src.label}</span>
                  )}
                  <ConfidenceChip level={e.confidence} />
                </p>
                {/* The top entry's why is already shown in full above. */}
                {i > 0 && (
                  <p
                    className={`mt-0.5 leading-relaxed ${
                      e.side === "keep" ? "text-amber-600 dark:text-amber-400" : ""
                    }`}
                  >
                    {e.why}
                  </p>
                )}
                {e.with.length > 0 && (
                  <p className="text-muted-foreground mt-0.5">
                    with{" "}
                    {e.with.map((w, j) => (
                      <span key={w.cardId}>
                        {j > 0 && " + "}
                        <Link
                          href={`/cards/${w.cardId}`}
                          target="_blank"
                          className="hover:underline"
                        >
                          {w.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                {e.howOften && <p className="text-muted-foreground mt-0.5">{e.howOften}</p>}
              </div>
            );
          })}
          <p className="text-xs">
            <Link
              href={`/cards/${cut.cardId}`}
              target="_blank"
              className="text-muted-foreground hover:underline"
            >
              Card page →
            </Link>
          </p>
        </div>
      )}
    </li>
  );
}

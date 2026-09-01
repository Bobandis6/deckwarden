"use client";

/**
 * Suggestions panel (P3.2) — the right pane's second tab, rendering the
 * recommendation engine's evidence payload (P3.1). Never a bare "add this":
 * every row leads with its strongest evidence sentence and keeps its source
 * names visible even collapsed; expanding shows every evidence entry — why,
 * the deck partners involved (linked), how often the source has seen it, and
 * a per-evidence confidence rendered exactly as reported ("low" says low —
 * the honesty is the product, so it is never restyled away).
 *
 * Fetch policy (the P3.2 decision): one GET per settled autosave burst.
 * Fetch only while the tab is visible AND a leader-zone card exists (no
 * leader = ci_mask 0 = colorless-only noise; the empty state says to add
 * one) AND the deck row exists (draft mode creates lazily — never fetch a
 * deck that isn't there) AND autosave reports "saved" (the server rows ARE
 * the engine's input) AND the (card, zone, qty) key changed. Tag and meta
 * edits never refetch; the budget toggle and Refresh do.
 *
 * Adds ride the editor's normal path via the shared useResolvedAdd hook
 * (resolve once with the id guard, then onAdd → addCard → autosave); the
 * refetch-key/leader-gate helpers live in decks/panel-view.ts — both shared
 * with the Combo Radar (P3.3). Game knowledge (leader noun, source
 * labels/links) comes off the adapter.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/deck/segmented";
import { useResolvedAdd } from "@/components/editor/use-resolved-add";
import type { EditorCard } from "@/lib/decks/editor-state";
import { deckStateKey, hasLeader } from "@/lib/decks/panel-view";
import { getDeckToken } from "@/lib/decks/token-store";
import type { Confidence, Recommendation } from "@/lib/recommend/types";
import { orderEvidence } from "@/lib/recommend/view";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

/** Matches the hub staples table's tiers — one budget vocabulary site-wide. */
type BudgetTier = "all" | "5" | "1";
const BUDGET_OPTIONS: { value: BudgetTier; label: string }[] = [
  { value: "all", label: "All" },
  { value: "5", label: "Under $5" },
  { value: "1", label: "Under $1" },
];

interface RecommendationsPanelProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Live deck id — null until draft mode's first autosave creates the row. */
  deckId: string | null;
  entries: readonly { cardId: string; zone: string; qty: number }[];
  /** Total copies already in the deck (any zone) — rows flip to "in deck". */
  inDeckQty: ReadonlyMap<string, number>;
  saveStatus: "saved" | "dirty" | "saving" | "error";
  /** Tab visibility: no fetching (lazy) and no work while hidden. */
  active: boolean;
  /** Quiet add to the main zone via the editor's own edit path. */
  onAdd: (card: EditorCard) => string | undefined;
}

export function RecommendationsPanel({
  adapter,
  format,
  deckId,
  entries,
  inDeckQty,
  saveStatus,
  active,
  onAdd,
}: RecommendationsPanelProps) {
  const [budget, setBudget] = useState<BudgetTier>("all");
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Force-refetch counter (Refresh button / error retry) — part of the key.
  const [nonce, setNonce] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  const { pendingAdd, notice, add } = useResolvedAdd(adapter, format, onAdd);

  const leader = hasLeader(entries, format);
  const fetchKey = `${deckStateKey(entries)}§b:${budget}§n:${nonce}`;

  useEffect(() => {
    if (!active || !leader || !deckId || saveStatus !== "saved") return;
    if (fetchKey === lastKeyRef.current) return;
    const controller = new AbortController();
    void (async () => {
      setFetching(true);
      setFetchError(null);
      try {
        const params = budget === "all" ? "" : `?budget=${budget}`;
        const token = getDeckToken(deckId);
        const res = await fetch(`/api/decks/${deckId}/recommendations${params}`, {
          headers: token ? { "x-deck-token": token } : {},
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 429) {
          throw new Error("Suggestions are rate-limited for a moment — try again shortly.");
        }
        if (!res.ok) throw new Error(`Suggestions failed to load (${res.status}).`);
        const json: { recommendations: Recommendation[] } = await res.json();
        lastKeyRef.current = fetchKey;
        setRecs(json.recommendations);
        setFetching(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetching(false);
        setFetchError(err instanceof Error ? err.message : "Suggestions failed to load.");
      }
    })();
    return () => controller.abort();
  }, [active, leader, deckId, saveStatus, fetchKey, budget]);

  const toggleExpanded = (cardId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });
  };

  if (!leader) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Add a {adapter.display.leaderNoun} to get suggestions — they’re built on its color identity.
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Budget" options={BUDGET_OPTIONS} value={budget} onChange={setBudget} />
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setNonce((n) => n + 1)}
          disabled={fetching}
        >
          Refresh
        </Button>
      </div>

      <p
        aria-live="polite"
        className={`mt-1 min-h-5 text-xs ${notice?.tone === "err" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {notice?.text ?? (fetching && recs !== null ? "Updating…" : "")}
      </p>

      {fetchError ? (
        <div className="mt-2 text-sm">
          <p className="text-destructive">{fetchError}</p>
          <Button
            variant="outline"
            size="xs"
            className="mt-2"
            onClick={() => setNonce((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      ) : recs === null ? (
        // With the gate passed, either the fetch is in flight or it's waiting
        // on the settle (draft creation included) — the effect fires on save.
        <p className="text-muted-foreground mt-2 text-sm">
          {fetching ? "Finding suggestions…" : "Suggestions appear once the deck saves."}
        </p>
      ) : recs.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {budget === "all"
            ? "No suggestions right now."
            : `No suggestions with a known price under $${budget} — try a wider budget.`}
        </p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {recs.map((rec) => (
            <SuggestionRow
              key={rec.cardId}
              adapter={adapter}
              rec={rec}
              inDeck={(inDeckQty.get(rec.cardId) ?? 0) > 0}
              expanded={expanded.has(rec.cardId)}
              pending={pendingAdd === rec.cardId}
              onToggle={() => toggleExpanded(rec.cardId)}
              onAdd={() => void add({ cardId: rec.cardId, name: rec.name })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Confidence exactly as the engine reports it — text, not just color.
 *  Exported for the Cut Coach panel (P3.4) — one confidence rendering. */
export function ConfidenceChip({ level }: { level: Confidence }) {
  const tone =
    level === "high"
      ? "border-emerald-600/40 text-emerald-600 dark:text-emerald-400"
      : level === "medium"
        ? "border-amber-600/40 text-amber-600 dark:text-amber-400"
        : "border-border text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full border px-1.5 text-xs leading-4 ${tone}`}>{level}</span>
  );
}

/** Adapter-declared display name for a source slug; the raw slug otherwise.
 *  Exported for the Cut Coach panel (P3.4) — one attribution lookup. */
export function sourceMeta(adapter: GameAdapter, source: string): { label: string; href?: string } {
  return adapter.recommend?.sources?.[source] ?? { label: source };
}

function SuggestionRow({
  adapter,
  rec,
  inDeck,
  expanded,
  pending,
  onToggle,
  onAdd,
}: {
  adapter: GameAdapter;
  rec: Recommendation;
  inDeck: boolean;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const evidence = orderEvidence(rec.evidence);
  const top = evidence[0];
  const sourceLabels = [...new Set(evidence.map((e) => sourceMeta(adapter, e.source).label))];
  const price = rec.cheapestUsd !== null ? `$${Number(rec.cheapestUsd).toFixed(2)}` : null;

  return (
    <li className="rounded-lg border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} evidence for ${rec.name}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{rec.name}</span>
          <ConfidenceChip level={rec.confidence} />
        </button>
        {inDeck ? (
          <span className="text-muted-foreground shrink-0 text-xs">In deck ✓</span>
        ) : (
          <Button
            size="xs"
            variant="secondary"
            disabled={pending}
            aria-label={`Add ${rec.name} to the deck`}
            onClick={onAdd}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        )}
      </div>

      {/* Strongest evidence leads even collapsed — never a bare "add this". */}
      <p className={`mt-1 text-xs leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>{top.why}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {sourceLabels.join(" · ")}
        {price ? ` · ${price}` : ""}
      </p>

      {expanded && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {evidence.map((e, i) => {
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
                {i > 0 && <p className="mt-0.5 leading-relaxed">{e.why}</p>}
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
              href={`/cards/${rec.cardId}`}
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

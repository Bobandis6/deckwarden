"use client";

/**
 * The Card tab's "Alternatives" (Y7a, WAVE4 D8 — Swap Lab): cards that share
 * a job with the shown card, inside the deck's goals, each one a swap.
 *
 * The Printings precedent (W6): a collapsible, closed by default, that asks
 * POST /api/alternatives only once it's opened — never per card shown — and
 * keeps each answer per list, so closing and reopening asks nothing; a list
 * edited while it's open asks again. It renders only where the editor hands
 * it a swap (the card is in the main list and the adapter offers it; One
 * Piece declares no swap, so nothing at all).
 *
 * The words are the evidence's: "Both: ramp · mana rock — community-tagged
 * on Scryfall Tagger", each role linked to its tag (D0's attribution), then
 * the adapter's chips (Magic: mana value, the Game Changer status) and the
 * price beside the shown card's, then the ranker's own lead line. Nothing
 * here claims two cards do exactly the same thing. The shown card's
 * tradeoff (the Cut Coach's lines) heads the list when it has one, and the
 * empty answers say why — never a bare blank.
 *
 * A pick is the editor's swap (`onSwap`): one copy out, one in, with a
 * "Swapped A → B · Undo" toast; an error comes back as a line here.
 */
import { ArrowUpRightIcon, ChevronDownIcon, GaugeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CardImage } from "@/components/cards/card-image";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BRACKET_COPY } from "@/lib/brackets/copy";
import { thumbnailUrl } from "@/lib/cards/images";
import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import type { SnapshotBody } from "@/lib/decks/panel-view";
import type { GameAdapter, SwapMeta } from "@/lib/games/types";
import type { CutEvidence } from "@/lib/recommend/cuts";
import type { GoalConflict } from "@/lib/recommend/goals";
import type { RecommendationEvidence } from "@/lib/recommend/types";

/** POST /api/alternatives' body: the draft Suggestions snapshot plus the card to swap. */
export type AlternativesBody = Omit<SnapshotBody, "budget"> & { cardId: string };

/** Present only when the shown card is a main-list card the adapter offers alternatives for. */
export interface SwapEditing {
  /** The request for this card, or null while the deck has no leader (no color identity yet). */
  body: AlternativesBody | null;
  /** Swap the shown card for this one — the editor's real edit with Undo; an error line, or nothing. */
  onSwap: (card: CardWire) => string | undefined;
}

/** One row as the route answers it. */
export interface AlternativeRow {
  cardId: string;
  name: string;
  costValue: number | null;
  cheapestUsd: string | null;
  evidence: RecommendationEvidence[];
  conflicts: GoalConflict[];
  shared: string[];
  card: CardWire;
}

export interface AlternativesResponse {
  cardId: string;
  roles: string[];
  alternatives: AlternativeRow[];
  hidden: AlternativeRow[];
  combosTruncated: boolean;
  tradeoff: CutEvidence[] | null;
  reason?: "no-roles" | "not-offered" | "goals" | "none";
}

type AlternativesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: AlternativesResponse };

/** The candidate's price beside the shown card's, in plain words; null when either is unknown. */
export function priceDelta(outUsd: number | null, inUsd: string | null): string | null {
  if (outUsd === null || inUsd === null) return null;
  const cents = Math.round((Number(inUsd) - outUsd) * 100);
  if (!Number.isFinite(cents)) return null;
  if (cents === 0) return "Same price";
  return `$${(Math.abs(cents) / 100).toFixed(2)} ${cents > 0 ? "more" : "less"}`;
}

export function AlternativesSection({
  adapter,
  card,
  swap,
}: {
  adapter: GameAdapter;
  card: EditorCard;
  swap: SwapEditing;
}) {
  const meta = adapter.recommend?.swap;
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ReadonlyMap<string, AlternativesState>>(() => new Map());
  const [nonce, setNonce] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  // Keys answered: closing and reopening asks nothing. A request cut short
  // (closed mid-flight, StrictMode's twin) never lands here, so it asks again.
  const doneRef = useRef<Set<string>>(new Set());
  const key = swap.body ? JSON.stringify(swap.body) : null;

  useEffect(() => {
    if (!open || key === null || doneRef.current.has(key)) return;
    const controller = new AbortController();
    void (async () => {
      setResults((prev) => new Map(prev).set(key, { status: "loading" }));
      try {
        const res = await fetch("/api/alternatives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 429) {
          throw new Error("Alternatives are rate-limited for a moment — try again shortly.");
        }
        if (!res.ok) throw new Error(`Alternatives failed to load (${res.status}).`);
        const data = (await res.json()) as AlternativesResponse;
        doneRef.current.add(key);
        setResults((prev) => new Map(prev).set(key, { status: "done", data }));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults((prev) =>
          new Map(prev).set(key, {
            status: "error",
            message: err instanceof Error ? err.message : "Alternatives failed to load.",
          }),
        );
      }
    })();
    return () => controller.abort();
  }, [open, key, nonce]);

  if (!meta) return null;
  const state = key ? (results.get(key) ?? null) : null;
  const done = state?.status === "done" ? state.data : null;
  const count = done ? done.alternatives.length : null;

  const pick = (row: AlternativeRow) => {
    setSwapError(swap.onSwap(row.card) ?? null);
  };

  return (
    <Collapsible
      className="mt-2 border-t pt-2"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSwapError(null);
      }}
    >
      <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium tracking-wide uppercase hover:underline pointer-coarse:min-h-11">
        Alternatives
        {count !== null && count > 0 ? ` · ${count}` : ""}
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 motion-safe:transition-transform motion-safe:duration-150 group-data-panel-open/trigger:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5" data-slot="alternatives">
        {key === null ? (
          <p className="text-muted-foreground text-xs">
            Add a {adapter.display.leaderNoun} first — alternatives follow its color identity.
          </p>
        ) : state?.status === "error" ? (
          <p className="text-destructive text-xs">
            {state.message}{" "}
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="cursor-pointer underline pointer-coarse:min-h-11"
            >
              Try again
            </button>
          </p>
        ) : done === null ? (
          <p className="text-muted-foreground text-xs">Finding alternatives…</p>
        ) : (
          <AlternativesBodyView
            adapter={adapter}
            meta={meta}
            card={card}
            data={done}
            showHidden={showHidden}
            onToggleHidden={() => setShowHidden((v) => !v)}
            onPick={pick}
          />
        )}
        {swapError && (
          <p role="alert" className="text-destructive mt-1 text-xs">
            {swapError}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AlternativesBodyView({
  adapter,
  meta,
  card,
  data,
  showHidden,
  onToggleHidden,
  onPick,
}: {
  adapter: GameAdapter;
  meta: SwapMeta;
  card: EditorCard;
  data: AlternativesResponse;
  showHidden: boolean;
  onToggleHidden: () => void;
  onPick: (row: AlternativeRow) => void;
}) {
  const source = sourceMeta(adapter, meta.source);
  const credit = (
    <SourceLink label={source.label} href={source.href} className="underline underline-offset-2" />
  );

  if (data.reason === "no-roles") {
    return (
      <p className="text-muted-foreground text-xs">
        No community roles for this card yet — {credit}
      </p>
    );
  }
  if (data.reason === "not-offered") {
    return <p className="text-muted-foreground text-xs">No alternatives for this kind of card.</p>;
  }

  const rowProps = { adapter, meta, out: card, onPick };
  return (
    <div className="space-y-1.5">
      {data.tradeoff && data.tradeoff.length > 0 && (
        <div data-slot="tradeoff" className="text-xs">
          <p className="text-muted-foreground font-medium">If you cut {card.name}</p>
          <ul className="mt-0.5 space-y-0.5">
            {data.tradeoff.slice(0, 3).map((e, i) => (
              <li key={i} className="leading-relaxed">
                {e.why}{" "}
                <span className="text-muted-foreground">
                  ({sourceMeta(adapter, e.source).label})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.alternatives.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {data.reason === "goals"
            ? "No cards tagged like this one fit your goals."
            : "No cards tagged like this one fit this deck."}
        </p>
      ) : (
        <ul aria-label={`Alternatives to ${card.name}`} className="space-y-1">
          {data.alternatives.map((row) => (
            <AlternativeItem key={row.cardId} row={row} {...rowProps} />
          ))}
        </ul>
      )}
      {data.hidden.length > 0 && (
        <div data-slot="goals-hidden">
          <p className="text-muted-foreground text-xs">
            {BRACKET_COPY.hiddenByGoals(data.hidden.length)}
            {" · "}
            <button
              type="button"
              aria-expanded={showHidden}
              onClick={onToggleHidden}
              className="text-foreground cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              {showHidden ? BRACKET_COPY.hideHidden : BRACKET_COPY.showHidden}
            </button>
          </p>
          {showHidden && (
            <ul aria-label="Hidden by your goals" className="mt-1 space-y-1">
              {data.hidden.map((row) => (
                <AlternativeItem key={row.cardId} row={row} hidden {...rowProps} />
              ))}
            </ul>
          )}
        </div>
      )}
      {data.combosTruncated && (
        <p className="text-muted-foreground text-xs">{BRACKET_COPY.combosCapped}</p>
      )}
    </div>
  );
}

function AlternativeItem({
  adapter,
  meta,
  out,
  row,
  hidden = false,
  onPick,
}: {
  adapter: GameAdapter;
  meta: SwapMeta;
  out: EditorCard;
  row: AlternativeRow;
  hidden?: boolean;
  onPick: (row: AlternativeRow) => void;
}) {
  const labels = new Map(meta.roles.map((r) => [r.key, r]));
  const source = sourceMeta(adapter, meta.source);
  const candidate = toEditorCard(row.card);
  const chips = [
    ...meta.chips(out, candidate),
    ...[priceDelta(out.cheapestUsd, row.cheapestUsd)].filter((c): c is string => c !== null),
  ];
  // The ranker's own lead line, after the role match the route put first.
  const lead = row.evidence.find((e) => e.source !== meta.source);
  const thumb = thumbnailUrl(row.card.image);

  return (
    <li
      data-goals={hidden ? "hidden" : row.conflicts.length ? "flagged" : undefined}
      className={`rounded-md border px-2 py-1.5 ${hidden ? "border-dashed" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-9 w-[1.625rem] shrink-0 overflow-hidden rounded-[2px]">
          {thumb && (
            <CardImage src={thumb} alt="" width={146} height={204} className="h-9 w-auto" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
        <Button
          size="xs"
          variant="secondary"
          aria-label={`Swap ${out.name} for ${row.name}`}
          onClick={() => onPick(row)}
        >
          Swap
        </Button>
      </div>
      <p className="mt-1 text-xs leading-relaxed">
        Both:{" "}
        {row.shared.map((k, i) => {
          const role = labels.get(k);
          return (
            <span key={k}>
              {i > 0 && " · "}
              {role ? (
                <SourceLink label={role.label} href={role.href} className="hover:underline" />
              ) : (
                k
              )}
            </span>
          );
        })}{" "}
        — community-tagged on{" "}
        <SourceLink
          label={source.label}
          href={source.href}
          className="underline underline-offset-2"
        />
      </p>
      {chips.length > 0 && (
        <p className="text-muted-foreground mt-0.5 text-xs">{chips.join(" · ")}</p>
      )}
      {lead && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{lead.why}</p>}
      {row.conflicts.map((c) => (
        <p
          key={`${c.rule}:${c.why}`}
          data-conflict={c.rule}
          className="text-muted-foreground mt-0.5 flex items-baseline gap-1 text-xs"
        >
          {c.rule !== "budget" && (
            <GaugeIcon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
          )}
          <span>{c.why}</span>
        </p>
      ))}
    </li>
  );
}

function SourceLink({
  label,
  href,
  className,
}: {
  label: string;
  href?: string;
  className?: string;
}) {
  if (!href) return <>{label}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
      <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3 align-[-0.1em]" />
    </a>
  );
}

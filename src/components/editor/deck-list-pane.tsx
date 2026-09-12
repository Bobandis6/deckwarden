"use client";

/**
 * Deck pane (P1.3): the middle pane's two toggleable renderings — grouped text
 * view and image grid — with the leader zone shown prominently above both.
 * Grouping/sorting are pure functions in src/lib/decks/view-model.ts (shared
 * with P1.7's share pages); this component owns only the toggle state, which
 * persists to localStorage as a UI preference (view-prefs.ts). Group default
 * comes from adapter.display.defaultGroupBy — nothing game-specific here.
 *
 * R3 (REDESIGN.md §2 "Deck pane"): the order is summary (count with the
 * import count-up F10, the completion ring F2, ownership, the over-limit
 * action) · validation (the Warden line F1) · leader zone (with "Choose
 * commander / leader") · view controls · card groups (sticky headers, the
 * badge pop F3) · analytics and the sample hand as labelled collapsibles.
 *
 * R4: "Add cards" beside the heading on phones (`md:hidden`) and as the
 * empty state's action at every tier — the phone's obvious way into Search;
 * `extras` false drops the analytics and sample hand (the phone's Tools tab
 * hosts them); the segmented controls, rows and steppers grow to 44 px on
 * coarse pointers.
 */
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AnalyticsPanel } from "@/components/deck/analytics-blocks";
import { CompletionRing } from "@/components/deck/completion-ring";
import { DeckGridView } from "@/components/deck/deck-grid-view";
import { DeckTextView } from "@/components/deck/deck-text-view";
import { LeaderZone } from "@/components/deck/leader-zone";
import { SampleHand } from "@/components/deck/sample-hand";
import { GROUP_OPTIONS, Segmented, SORT_OPTIONS, VIEW_OPTIONS } from "@/components/deck/segmented";
import { ValidationPanel } from "@/components/deck/validation-panel";
import { useCountUp } from "@/components/editor/use-count-up";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { OWNERSHIP_METHOD, ownershipLine, type OwnershipSummary } from "@/lib/collection/ownership";
import {
  deckSizeCount,
  singleQtyIncrease,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import { issueSeverityByCard } from "@/lib/decks/validation";
import {
  groupDeckEntries,
  splitLeaderEntries,
  type GroupKey,
  type SortKey,
} from "@/lib/decks/view-model";
import { loadViewPrefs, saveViewPrefs, type DeckViewMode } from "@/lib/decks/view-prefs";
import type { AnalyticsBlock, FormatDef, GameAdapter, ValidationIssue } from "@/lib/games/types";

interface DeckListPaneProps {
  adapter: GameAdapter;
  format: FormatDef;
  entries: EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  issues: ValidationIssue[];
  analytics: AnalyticsBlock[];
  onSetQty: (zoneId: string, cardId: string, qty: number) => string | undefined;
  onRemove: (zoneId: string, cardId: string) => void;
  onPreview: (card: EditorCard) => void;
  /** Opens the Cut Coach tab (P3.4); absent when the game declares no cuts. */
  onOpenCuts?: (() => void) | undefined;
  /** The empty leader zone's "Choose commander / leader" — focuses search (R3). */
  onChooseLeader?: () => void;
  /** Card ids the owner owns any printing of (P3.7); undefined = no collection imported. */
  owned?: ReadonlySet<string>;
  /** "You own N/100 · missing ≈ $Y" (P3.7); null = no collection imported, nothing shown. */
  ownership?: OwnershipSummary | null;
  /**
   * "Add cards" (R4): the phone's way into Search — the summary row's
   * primary action (phones only) and the empty state's action (every tier;
   * it focuses the search box the way "Choose commander" does).
   */
  onAddCards?: () => void;
  /** Analytics and the sample hand below the list; false on phones (R4: the Tools tab hosts them). */
  extras?: boolean;
}

export function DeckListPane({
  adapter,
  format,
  entries,
  cards,
  issues,
  analytics,
  onSetQty,
  onRemove,
  onPreview,
  onOpenCuts,
  onChooseLeader,
  owned,
  ownership = null,
  onAddCards,
  extras = true,
}: DeckListPaneProps) {
  // Stored preference wins; absent fields fall back (group to the adapter's
  // default). Read once — this pane only mounts client-side, after deck load.
  const [stored] = useState(() => loadViewPrefs());
  const [view, setView] = useState<DeckViewMode>(stored.view ?? "text");
  const [groupBy, setGroupBy] = useState<GroupKey>(
    stored.groupBy ?? adapter.display.defaultGroupBy,
  );
  const [sortBy, setSortBy] = useState<SortKey>(stored.sortBy ?? "name");
  const [error, setError] = useState<string | null>(null);

  // The badge pop (F3): the one row whose quantity grew since the previous
  // entries — "storing information from previous renders" (react.dev), so
  // an import (many rows) pops nothing and the count-up carries that moment.
  const [prevEntries, setPrevEntries] = useState(entries);
  const [pop, setPop] = useState<{ key: string; nonce: number } | null>(null);
  if (prevEntries !== entries) {
    setPrevEntries(entries);
    const key = singleQtyIncrease(prevEntries, entries);
    if (key) setPop((p) => ({ key, nonce: (p?.nonce ?? 0) + 1 }));
  }

  const persist = (next: { view?: DeckViewMode; groupBy?: GroupKey; sortBy?: SortKey }) => {
    saveViewPrefs({ view, groupBy, sortBy, ...next });
  };

  const total = deckSizeCount(entries, format);
  const shownTotal = useCountUp(total);
  const max = format.deckSize.max;
  const sizeLabel = max !== null ? `${shownTotal} / ${max}` : `${shownTotal}`;

  const { leader, rest } = splitLeaderEntries(entries, format);
  const groups = groupDeckEntries(rest, cards, groupBy, sortBy);
  const severity = issueSeverityByCard(issues);
  const leaderZoneDef = format.zones.find((z) => z.isLeaderZone);
  const leaderItems = leader.flatMap((entry) => {
    const card = cards.get(entry.cardId);
    return card ? [{ entry, card }] : [];
  });

  const setQtyChecked = (zoneId: string, cardId: string, qty: number) => {
    setError(onSetQty(zoneId, cardId, qty) ?? null);
  };

  return (
    <div className="p-3">
      {/* Summary (R3): count · ring · ownership · the over-limit action. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Deck</h2>
          {onAddCards && (
            <Button size="sm" className="pointer-coarse:min-h-11 md:hidden" onClick={onAddCards}>
              <PlusIcon aria-hidden />
              Add cards
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {/* The over-limit pain point (the DECK_SIZE error's always-visible
              face) links straight to the Cut Coach (P3.4). */}
          {onOpenCuts && max !== null && total > max && (
            <button
              type="button"
              onClick={onOpenCuts}
              className="text-destructive cursor-pointer text-xs font-medium hover:underline"
            >
              Over by {total - max} — rank cuts
            </button>
          )}
          {/* Collection line (P3.7): only for owners with an imported
              collection — never a fake "0/100" for someone who has none. */}
          {ownership && (
            <span
              className="text-muted-foreground text-xs tabular-nums"
              title={OWNERSHIP_METHOD}
              data-testid="ownership-line"
            >
              {ownershipLine(ownership)} ·
            </span>
          )}
          <span className="text-muted-foreground text-sm tabular-nums">{sizeLabel} cards</span>
          <CompletionRing value={total} max={max} />
        </div>
      </div>

      <ValidationPanel
        formatLabel={format.label}
        issues={issues}
        cards={cards}
        onPreview={onPreview}
      />

      {leaderZoneDef && (
        <LeaderZone
          zone={leaderZoneDef}
          items={leaderItems}
          severity={severity}
          onRemove={onRemove}
          onPreview={onPreview}
          onChooseLeader={onChooseLeader}
          adapter={adapter}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        <Segmented
          label="View"
          touch
          options={VIEW_OPTIONS}
          value={view}
          onChange={(v) => {
            setView(v);
            persist({ view: v });
          }}
        />
        <Segmented
          label="Group"
          touch
          options={GROUP_OPTIONS}
          value={groupBy}
          onChange={(v) => {
            setGroupBy(v);
            persist({ groupBy: v });
          }}
        />
        <Segmented
          label="Sort"
          touch
          options={SORT_OPTIONS}
          value={sortBy}
          onChange={(v) => {
            setSortBy(v);
            persist({ sortBy: v });
          }}
        />
      </div>

      {error && (
        <p aria-live="polite" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}

      {rest.length === 0 ? (
        // C8 copy fix (R1b): a phone has no "left" — R4 puts Search in a tab.
        <EmptyState
          className="mt-4"
          title="No cards yet"
          hint="Add them from Search."
          mark
          action={
            onAddCards ? (
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={onAddCards}
              >
                Add cards
              </Button>
            ) : undefined
          }
        />
      ) : view === "text" ? (
        <DeckTextView
          adapter={adapter}
          groups={groups}
          severity={severity}
          onSetQty={setQtyChecked}
          onRemove={onRemove}
          onPreview={onPreview}
          owned={owned}
          stickyHeaders
          pop={pop}
        />
      ) : (
        <DeckGridView
          groups={groups}
          severity={severity}
          onPreview={onPreview}
          owned={owned}
          adapter={adapter}
          stickyHeaders
        />
      )}

      {extras && (
        <>
          <AnalyticsPanel blocks={analytics} />
          {/* P2.7: same widget as the share page — pure client state, below the
              list so drawing a hand never shoves the deck out of view. */}
          <SampleHand entries={entries} cards={cards} format={format} onPreview={onPreview} />
        </>
      )}
    </div>
  );
}

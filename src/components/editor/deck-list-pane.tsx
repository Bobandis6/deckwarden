"use client";

/**
 * Deck pane (P1.3): the middle pane's two toggleable renderings — grouped text
 * view and image grid — with the leader zone shown prominently above both.
 * Grouping/sorting are pure functions in src/lib/decks/view-model.ts (shared
 * with P1.7's share pages); this component owns only the toggle state, which
 * persists to localStorage as a UI preference (view-prefs.ts). Group default
 * comes from adapter.display.defaultGroupBy — nothing game-specific here.
 */
import { AnalyticsPanel } from "@/components/editor/analytics-blocks";
import { DeckGridView } from "@/components/editor/deck-grid-view";
import { DeckTextView } from "@/components/editor/deck-text-view";
import { LeaderZone } from "@/components/editor/leader-zone";
import { ValidationPanel } from "@/components/editor/validation-panel";
import { deckSizeCount, type EditorCard, type EditorEntry } from "@/lib/decks/editor-state";
import { issueSeverityByCard } from "@/lib/decks/validation";
import {
  groupDeckEntries,
  splitLeaderEntries,
  type GroupKey,
  type SortKey,
} from "@/lib/decks/view-model";
import { loadViewPrefs, saveViewPrefs, type DeckViewMode } from "@/lib/decks/view-prefs";
import type { AnalyticsBlock, FormatDef, GameAdapter, ValidationIssue } from "@/lib/games/types";
import { useState } from "react";

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
}

const VIEW_OPTIONS: { value: DeckViewMode; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "grid", label: "Grid" },
];
const GROUP_OPTIONS: { value: GroupKey; label: string }[] = [
  { value: "primaryType", label: "Type" },
  { value: "costValue", label: "Cost" },
  { value: "tags", label: "Tags" },
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "price", label: "Price" },
];

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

  const persist = (next: { view?: DeckViewMode; groupBy?: GroupKey; sortBy?: SortKey }) => {
    saveViewPrefs({ view, groupBy, sortBy, ...next });
  };

  const total = deckSizeCount(entries, format);
  const sizeLabel = format.deckSize.max !== null ? `${total} / ${format.deckSize.max}` : `${total}`;

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
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Deck</h2>
        <span className="text-muted-foreground text-sm tabular-nums">{sizeLabel} cards</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        <Segmented
          label="View"
          options={VIEW_OPTIONS}
          value={view}
          onChange={(v) => {
            setView(v);
            persist({ view: v });
          }}
        />
        <Segmented
          label="Group"
          options={GROUP_OPTIONS}
          value={groupBy}
          onChange={(v) => {
            setGroupBy(v);
            persist({ groupBy: v });
          }}
        />
        <Segmented
          label="Sort"
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

      <ValidationPanel
        formatLabel={format.label}
        issues={issues}
        cards={cards}
        onPreview={onPreview}
      />

      <AnalyticsPanel blocks={analytics} />

      {leaderZoneDef && (
        <LeaderZone
          zone={leaderZoneDef}
          items={leaderItems}
          severity={severity}
          onRemove={onRemove}
          onPreview={onPreview}
        />
      )}

      {rest.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-xs">
          No cards yet — search on the left and press Enter.
        </p>
      ) : view === "text" ? (
        <DeckTextView
          adapter={adapter}
          groups={groups}
          severity={severity}
          onSetQty={setQtyChecked}
          onRemove={onRemove}
          onPreview={onPreview}
        />
      ) : (
        <DeckGridView groups={groups} severity={severity} onPreview={onPreview} />
      )}
    </div>
  );
}

/** Compact segmented toggle: a labeled group of aria-pressed buttons. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="border-input flex overflow-hidden rounded-md border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`px-2 py-0.5 text-xs transition-colors ${
              option.value === value
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

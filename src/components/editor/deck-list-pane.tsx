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
 *
 * Y2a (WAVE4 D2, a quiet first screen): the summary reads "98 / 100 · 2 to
 * go" under the minimum (the count otherwise); the validation slot gets the
 * progress line ("Choose a commander · 100 to go"); View / Group / Sort
 * render only once the list has a card; the summary's "Add cards" steps
 * aside while the empty state shows its own, so a phone sees one. A stepper
 * reaching zero is a removal (`onRemove`), which the editor answers with
 * one Undo.
 *
 * Y2b (WAVE4 D2, start doors): the empty list also offers the doors the
 * editor hands it (`doors`, from src/lib/decks/start-doors.ts) after Add
 * cards — Paste a list for any deck, Start from a precon and Surprise me
 * for a draft, those two only while the leader zone is empty (each starts
 * a deck from nothing; the zone's own Browse link is the Pick door). And
 * `onShare` puts the first approval's "Share this deck" under the Warden
 * line.
 *
 * Y4a (WAVE4 D5): `bracket` — the editor's BracketLine — renders directly
 * after the validation panel: the bracket lives on the legality line, with
 * no tab of its own.
 *
 * Y7b (WAVE4 D8): `onSwap` / `canSwap` give the text rows "Swap…". The
 * grid gets none — its top corners carry the badges and its bottom edge the
 * artist / © line, and a card's click already opens the Card tab's
 * Alternatives.
 *
 * U3a (WAVE5 D4, nothing shifts after load): from md the summary's right
 * cluster never wraps (the ownership line truncates), and on a phone the
 * row keeps "Add cards"' 44 px before it appears; the Warden or progress
 * line and the bracket line sit in one status slot whose height doesn't
 * move when a read lands; while a URL seed is on its way (`seeding`) the
 * leader zone holds the card's box and the analytics and sample hand wait,
 * so the seed lands in place. The leader image is the pane's LCP
 * (`priority`), and View / Group / Sort fit one line at wide, "View" named
 * rather than labelled.
 *
 * U3b (WAVE5 D4, the materials): the leader card is `raised` (from md, a
 * 180 px card with its facts beside it, its Skeleton the same row), and a
 * group heading is the chrome material only while stuck.
 *
 * U4a (WAVE5 D5, the phone Deck tab): one count on a phone. The tab says
 * "Deck · N", so the pane's heading is sr-only there; the ring leads the
 * count ("100 / 100" in the foreground at 500, "cards" muted beside it) and
 * "Add cards" sits at the row's right. The raised leader row runs at every
 * tier (the card at 160 px, 45 % at most, its facts beside it). View stays
 * one Segmented while Group and Sort fold into a "Group · Sort" popover
 * (`phone`, the editor's tier), so the controls are one 44 px row on touch.
 *
 * DECK-TOKENS: the type groups read in the adapter's `typeOrder` (Magic:
 * Creatures, Sorceries, Instants, Artifacts, Enchantments, Planeswalkers,
 * Battles, Lands), and the format's token zone follows them as the Tokens
 * section (tokens-section.tsx) — collapsed until opened, the open state kept
 * with the view preferences, "From your cards" loading only while open. It
 * waits for the first card like View / Group / Sort do (the quiet first
 * screen), unless the deck already holds a token.
 */
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { AnalyticsPanel } from "@/components/deck/analytics-blocks";
import { CompletionRing } from "@/components/deck/completion-ring";
import { DeckGridView } from "@/components/deck/deck-grid-view";
import { DeckTextView } from "@/components/deck/deck-text-view";
import { LeaderZone } from "@/components/deck/leader-zone";
import { SampleHand } from "@/components/deck/sample-hand";
import { TokensSection } from "@/components/deck/tokens-section";
import { useTokenSuggestions } from "@/components/deck/use-token-suggestions";
import { GROUP_OPTIONS, Segmented, SORT_OPTIONS, VIEW_OPTIONS } from "@/components/deck/segmented";
import { ValidationPanel } from "@/components/deck/validation-panel";
import { useCountUp } from "@/components/editor/use-count-up";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { OWNERSHIP_METHOD, ownershipLine, type OwnershipSummary } from "@/lib/collection/ownership";
import {
  deckSizeCount,
  singleQtyIncrease,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import { deckProgress, progressLine, toGoPhrase } from "@/lib/decks/progress";
import { tokenZoneOf } from "@/lib/decks/playable";
import type { StartDoor } from "@/lib/decks/start-doors";
import { issueSeverityByCard } from "@/lib/decks/validation";
import {
  groupDeckEntries,
  splitLeaderEntries,
  type GroupKey,
  type SortKey,
} from "@/lib/decks/view-model";
import { loadViewPrefs, saveViewPrefs, type DeckViewMode } from "@/lib/decks/view-prefs";
import type { AnalyticsBlock, FormatDef, GameAdapter, ValidationIssue } from "@/lib/games/types";
import { cn } from "@/lib/utils";

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
  /** Y7b: a text row's "Swap…" — the editor's swap sheet; absent = no row has one. */
  onSwap?: (card: EditorCard) => void;
  /** Which rows get "Swap…" (the editor: main-list cards the adapter offers alternatives for). */
  canSwap?: (entry: EditorEntry, card: EditorCard) => boolean;
  /** Opens the Cut Coach tab (P3.4); absent when the game declares no cuts. */
  onOpenCuts?: (() => void) | undefined;
  /** The empty leader zone's ghost "Search by name" — focuses search (R3, demoted in W4). */
  onChooseLeader?: () => void;
  /** The Browse link's click (W4): the editor writes the saved-deck pick intent here. */
  onBrowseLeader?: () => void;
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
  /**
   * "Autofill a starter shell" (W9b): opens the review sheet. Passed only
   * when the adapter declares `recommend.autofill`; the pane renders the
   * door only once a leader is set (the shell is built around one).
   */
  onAutofill?: (() => void) | undefined;
  /**
   * The start doors the empty list offers (Y2b): Paste a list for any deck,
   * Start from a precon and Surprise me for a draft — the editor's choice;
   * the pane shows those two only while the leader zone is empty.
   */
  doors?: readonly StartDoor[];
  /** "Paste a list": opens the Import dialog. */
  onPasteList?: () => void;
  /** "Surprise me": rolls a random leader into the draft, state only. */
  onSurprise?: () => void;
  /** A roll is in flight — the Surprise door waits. */
  rolling?: boolean;
  /** The first approval's "Share this deck" (Y2b); absent = no link. */
  onShare?: () => void;
  /** The bracket line (Y4a), rendered directly after the validation panel; absent = none. */
  bracket?: ReactNode;
  /** Analytics and the sample hand below the list; false on phones (R4: the Tools tab hosts them). */
  extras?: boolean;
  /** A URL seed is on its way (U3a): the leader zone holds the card's box, the extras wait. */
  seeding?: boolean;
  /** The phone tier (U4a): Group and Sort fold into the "Group · Sort" popover beside View. */
  phone?: boolean;
  /** DECK-TOKENS: adds into the token zone (one, or Add all's several); absent = the section is read-only. */
  onAddTokens?: (cards: EditorCard[]) => string | undefined;
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
  onSwap,
  canSwap,
  onOpenCuts,
  onChooseLeader,
  onBrowseLeader,
  owned,
  ownership = null,
  onAddCards,
  onAutofill,
  doors = [],
  onPasteList,
  onSurprise,
  rolling = false,
  onShare,
  bracket,
  extras = true,
  seeding = false,
  phone = false,
  onAddTokens,
}: DeckListPaneProps) {
  // Stored preference wins; absent fields fall back (group to the adapter's
  // default). Read once — this pane only mounts client-side, after deck load.
  const [stored] = useState(() => loadViewPrefs());
  const [view, setView] = useState<DeckViewMode>(stored.view ?? "text");
  const [groupBy, setGroupBy] = useState<GroupKey>(
    stored.groupBy ?? adapter.display.defaultGroupBy,
  );
  const [sortBy, setSortBy] = useState<SortKey>(stored.sortBy ?? "name");
  const [tokensOpen, setTokensOpen] = useState(stored.tokensOpen ?? false);
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

  const persist = (next: {
    view?: DeckViewMode;
    groupBy?: GroupKey;
    sortBy?: SortKey;
    tokensOpen?: boolean;
  }) => {
    saveViewPrefs({ view, groupBy, sortBy, tokensOpen, ...next });
  };

  const total = deckSizeCount(entries, format);
  const shownTotal = useCountUp(total);
  const max = format.deckSize.max;
  // "· N to go" follows the counted-up number so the two never disagree
  // mid-animation; at or over the minimum the label keeps saying "cards".
  const toGo = toGoPhrase(format.deckSize.min - shownTotal);
  // U4a: the count and its words in two spans (the phone sets the count in
  // the foreground); the label's text is unchanged.
  const sizeCount = max !== null ? `${shownTotal} / ${max}` : `${shownTotal}`;
  const sizeWords = toGo ? ` · ${toGo}` : " cards";
  const progress = progressLine(deckProgress(entries, format), adapter.display.leaderNoun);

  const { leader, rest, aside } = splitLeaderEntries(entries, format);
  const groups = groupDeckEntries(rest, cards, groupBy, sortBy, adapter.display.typeOrder);
  const tokenZone = tokenZoneOf(format);
  const tokenItems = aside.flatMap((entry) => {
    const card = entry.zone === tokenZone?.id ? cards.get(entry.cardId) : undefined;
    return card ? [{ entry, card }] : [];
  });
  const tokenSuggestions = useTokenSuggestions({
    adapter,
    format,
    zone: tokenZone,
    entries,
    cards,
    enabled: tokensOpen && onAddTokens !== undefined,
  });
  const severity = issueSeverityByCard(issues);
  const leaderZoneDef = format.zones.find((z) => z.isLeaderZone);
  const leaderItems = leader.flatMap((entry) => {
    const card = cards.get(entry.cardId);
    return card ? [{ entry, card }] : [];
  });

  // A stepper reaching zero is a plain removal (Y2a): the editor's Undo path.
  const setQtyChecked = (zoneId: string, cardId: string, qty: number) => {
    if (qty <= 0) {
      setError(null);
      onRemove(zoneId, cardId);
      return;
    }
    setError(onSetQty(zoneId, cardId, qty) ?? null);
  };
  const listed = rest.length > 0;

  // View / Group / Sort: one row from md; on a phone Group and Sort sit in the popover (U4a).
  const viewControl = (
    <Segmented
      ariaLabel="View"
      touch
      options={VIEW_OPTIONS}
      value={view}
      onChange={(v) => {
        setView(v);
        persist({ view: v });
      }}
    />
  );
  const groupControl = (
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
  );
  const sortControl = (
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
  );

  return (
    <div className="p-3">
      {/* Summary (R3): count · ring · ownership · the over-limit action. U3a:
          on a phone the row keeps "Add cards"' 44 px before it appears; from
          md the right cluster never wraps — the ownership line truncates.
          U4a: on a phone one count — the heading sr-only (the tab is the
          title), the ring before its count at the left, "Add cards" at the
          right. */}
      <div className="flex items-center justify-between gap-2 max-md:pointer-coarse:min-h-11">
        {/* Stretched to the row, so "Add cards" arriving never moves its box. */}
        <div className="flex shrink-0 items-center gap-2 self-stretch max-md:order-last">
          <h2 className="text-sm font-semibold max-md:sr-only">Deck</h2>
          {/* The empty state carries its own (Y2a: a phone shows one). */}
          {onAddCards && listed && (
            <Button size="sm" className="pointer-coarse:min-h-11 md:hidden" onClick={onAddCards}>
              <PlusIcon aria-hidden />
              Add cards
            </Button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 max-md:justify-start max-md:gap-x-1.5 md:flex-nowrap">
          {/* The over-limit pain point (the DECK_SIZE error's always-visible
              face) links straight to the Cut Coach (P3.4). */}
          {onOpenCuts && max !== null && total > max && (
            <button
              type="button"
              onClick={onOpenCuts}
              className="text-destructive shrink-0 cursor-pointer text-xs font-medium whitespace-nowrap hover:underline max-md:pointer-coarse:min-h-11"
            >
              Over by {total - max}: rank cuts
            </button>
          )}
          {/* Collection line (P3.7): only for owners with an imported
              collection — never a fake "0/100" for someone who has none. */}
          {ownership && (
            <span
              className="text-muted-foreground min-w-0 truncate text-xs tabular-nums"
              title={OWNERSHIP_METHOD}
              data-testid="ownership-line"
            >
              {ownershipLine(ownership)} ·
            </span>
          )}
          <span
            className="text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums"
            data-slot="deck-size"
          >
            <span className="max-md:text-foreground max-md:font-medium">{sizeCount}</span>
            {sizeWords}
          </span>
          <CompletionRing value={total} max={max} className="max-md:order-first" />
        </div>
      </div>

      {/* The status slot (U3a): the Warden or progress line, then the bracket
          line — present and empty before a read — so neither arriving moves
          the leader zone. */}
      <div data-slot="status-slot">
        <ValidationPanel
          formatLabel={format.label}
          issues={issues}
          cards={cards}
          onPreview={onPreview}
          progress={progress}
          approvalAction={
            onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
              >
                Share this deck
              </button>
            ) : undefined
          }
        />
        {/* The bracket line (Y4a): on the legality line, never inside it. */}
        {bracket}
      </div>

      {leaderZoneDef && (
        <LeaderZone
          zone={leaderZoneDef}
          items={leaderItems}
          severity={severity}
          onRemove={onRemove}
          onPreview={onPreview}
          onChooseLeader={onChooseLeader}
          onBrowseLeader={onBrowseLeader}
          adapter={adapter}
          priority
          pending={seeding}
          raised
        />
      )}

      {/* A quiet first screen (Y2a): nothing to view, group or sort yet.
          U3a: "View" is the group's name, not a label (Text / Grid says it).
          U4a: on a phone one row, View then a "Group · Sort" popover holding
          the other two; the popover returns focus to its trigger on close. */}
      {listed &&
        (phone ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            {viewControl}
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                Group · Sort
                <ChevronDownIcon data-icon="inline-end" aria-hidden />
              </PopoverTrigger>
              {/* Each Segmented's wrapper steps aside (*:contents), so the two
                  labels share a column and the two groups line up beside them. */}
              <PopoverContent
                align="end"
                className="grid w-auto grid-cols-[auto_auto] items-center gap-x-2 gap-y-3 *:contents"
              >
                {groupControl}
                {sortControl}
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {viewControl}
            {groupControl}
            {sortControl}
          </div>
        ))}

      {error && (
        <p aria-live="polite" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}

      {!listed ? (
        // C8 copy fix (R1b): a phone has no "left" — R4 puts Search in a tab.
        <EmptyState
          className="mt-4"
          title="No cards yet"
          hint="Add them from Search."
          mark
          action={emptyActions(
            [
              // The autofill door (W9b, D8): only once a leader is set — the
              // shell is built around one. "Add cards" stays beside it.
              onAutofill && leader.length > 0 && (
                <Button
                  key="autofill"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={onAutofill}
                >
                  Autofill a starter shell
                </Button>
              ),
              onAddCards && (
                <Button
                  key="add"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={onAddCards}
                >
                  Add cards
                </Button>
              ),
              // The start doors (Y2b): a precon or a roll starts from nothing.
              ...doors
                .filter((door) => door.kind === "paste" || leader.length === 0)
                .map((door) =>
                  door.kind === "paste" && onPasteList ? (
                    <Button
                      key="paste"
                      variant="outline"
                      size="sm"
                      className="pointer-coarse:min-h-11"
                      onClick={onPasteList}
                    >
                      {door.label}
                    </Button>
                  ) : door.kind === "precon" ? (
                    <Link
                      key="precon"
                      href={door.href}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "pointer-coarse:min-h-11",
                      )}
                    >
                      {door.label}
                    </Link>
                  ) : door.kind === "surprise" && onSurprise ? (
                    <Button
                      key="surprise"
                      variant="outline"
                      size="sm"
                      className="pointer-coarse:min-h-11"
                      disabled={rolling}
                      aria-busy={rolling || undefined}
                      onClick={onSurprise}
                    >
                      {rolling && (
                        <Spinner
                          aria-hidden
                          role={undefined}
                          aria-label={undefined}
                          className="size-3.5"
                        />
                      )}
                      {door.label}
                    </Button>
                  ) : null,
                ),
            ].filter(Boolean),
          )}
        />
      ) : view === "text" ? (
        <DeckTextView
          adapter={adapter}
          groups={groups}
          severity={severity}
          onSetQty={setQtyChecked}
          onRemove={onRemove}
          onSwap={onSwap}
          canSwap={canSwap}
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

      {/* DECK-TOKENS: after the 100, never part of it; waits for the first card unless it holds one. */}
      {tokenZone && (listed || tokenItems.length > 0) && (
        <TokensSection
          className="mt-2"
          adapter={adapter}
          zone={tokenZone}
          items={tokenItems}
          view={view}
          open={tokensOpen}
          onOpenChange={(open) => {
            setTokensOpen(open);
            persist({ tokensOpen: open });
          }}
          onPreview={onPreview}
          owned={owned}
          onSetQty={setQtyChecked}
          onRemove={onRemove}
          onAdd={onAddTokens}
          suggestions={
            onAddTokens
              ? {
                  count: tokenSuggestions.count,
                  items: tokenSuggestions.suggestions,
                  state: tokenSuggestions.state,
                  retry: tokenSuggestions.retry,
                }
              : undefined
          }
        />
      )}

      {/* U3a: not while a seed is landing — the list arrives above them. */}
      {extras && !seeding && (
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

/** The empty state's actions as one centered, wrapping row; none → no action slot. */
function emptyActions(nodes: ReactNode[]): ReactNode {
  if (nodes.length === 0) return undefined;
  return <div className="flex flex-wrap items-center justify-center gap-2">{nodes}</div>;
}

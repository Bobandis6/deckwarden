"use client";

/**
 * Read-only deck rendering for the share page (P1.7). Reuses the editor's
 * building blocks with their mutation handlers omitted: LeaderZone,
 * DeckTextView/DeckGridView over the pure view-model grouping, the
 * ValidationPanel status line, and the bare AnalyticsBlocks list. Clicking a
 * card navigates to its card page. Mobile-first single column.
 *
 * View toggles are deliberately not persisted here (unlike the editor):
 * loading localStorage prefs during render would break SSR hydration, and a
 * share-page viewer doesn't need their reading preference remembered.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { AnalyticsBlocks } from "@/components/deck/analytics-blocks";
import { DeckGridView } from "@/components/deck/deck-grid-view";
import { DeckTextView } from "@/components/deck/deck-text-view";
import { EngagementButtons, type EngagementViewer } from "@/components/deck/engagement-buttons";
import { ForkButton, ForkCreditLine } from "@/components/deck/fork-button";
import { LeaderZone } from "@/components/deck/leader-zone";
import { SampleHand } from "@/components/deck/sample-hand";
import { GROUP_OPTIONS, Segmented, SORT_OPTIONS, VIEW_OPTIONS } from "@/components/deck/segmented";
import { ValidationPanel } from "@/components/deck/validation-panel";
import { Button } from "@/components/ui/button";
import { OWNERSHIP_METHOD, ownershipLine, type OwnershipSummary } from "@/lib/collection/ownership";
import {
  deckSizeCount,
  toEditorCard,
  type CardWire,
  type EditorCard,
  type EditorEntry,
} from "@/lib/decks/editor-state";
import type { ForkCredit } from "@/lib/decks/fork-credit";
import { getDeckToken } from "@/lib/decks/token-store";
import { issueSeverityByCard, toDeckSnapshot } from "@/lib/decks/validation";
import {
  groupDeckEntries,
  splitLeaderEntries,
  type GroupKey,
  type SortKey,
} from "@/lib/decks/view-model";
import type { DeckViewMode } from "@/lib/decks/view-prefs";
import { getAdapter } from "@/lib/games/registry";
import type { GameId } from "@/lib/games/types";

/** Structural subset of deckMetaJson / the GET /api/decks/[id] `deck` object. */
export interface ShareDeckMeta {
  id: string;
  publicId: string;
  game: GameId | null;
  format: string | null;
  name: string;
  description: string | null;
  notes: string | null;
  visibility: "public" | "unlisted" | "private";
  likesCount: number;
  updatedAt: string | Date;
}

export interface ShareDeckCard {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId: string | null;
  card: CardWire;
}

/** Byline (P2.2) — present only when the owner opted into a public username. */
export interface ShareDeckAuthor {
  name: string;
  username: string;
}

const noopSubscribe = () => () => {};

export function DeckShareView({
  deck,
  cards,
  author = null,
  viewer = null,
  forkedFrom = null,
  ownership = null,
  owned,
}: {
  deck: ShareDeckMeta;
  cards: ShareDeckCard[];
  author?: ShareDeckAuthor | null;
  /** Signed-in viewer's like/bookmark state (P2.3); null = signed out. */
  viewer?: EngagementViewer | null;
  /** Fork credit (P3.6), resolved for this viewer; null = not a fork. */
  forkedFrom?: ForkCredit | null;
  /** "You own N/100 · missing ≈ $Y" for the signed-in viewer (P3.7); null = signed out or no collection. */
  ownership?: OwnershipSummary | null;
  /** The viewer's owned card ids among this deck (P3.7) — drives the ✓ marks. */
  owned?: ReadonlySet<string>;
}) {
  const router = useRouter();

  // localStorage is client-only: null during SSR, the token after hydration.
  // useSyncExternalStore keeps the read out of render on the server pass.
  const editToken = useSyncExternalStore(
    noopSubscribe,
    () => getDeckToken(deck.id),
    () => null,
  );

  const adapter = deck.game ? getAdapter(deck.game) : null;
  const format = adapter?.formats.find((f) => f.code === deck.format);

  const [view, setView] = useState<DeckViewMode>("text");
  const [groupBy, setGroupBy] = useState<GroupKey>(
    adapter?.display.defaultGroupBy ?? "primaryType",
  );
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [copied, setCopied] = useState(false);

  const entries = useMemo<EditorEntry[]>(
    () =>
      cards.map((c) => ({
        cardId: c.cardId,
        zone: c.zone,
        qty: c.qty,
        tags: c.tags,
        ...(c.printingId ? { printingId: c.printingId } : {}),
      })),
    [cards],
  );
  const cardMap = useMemo<ReadonlyMap<string, EditorCard>>(
    () => new Map(cards.map((c) => [c.cardId, toEditorCard(c.card)])),
    [cards],
  );

  const snapshot = useMemo(
    () => (adapter && format ? toDeckSnapshot(adapter.id, format, entries) : null),
    [adapter, format, entries],
  );
  const issues = useMemo(
    () => (adapter && snapshot ? adapter.validate(snapshot, cardMap) : []),
    [adapter, snapshot, cardMap],
  );
  const analytics = useMemo(
    () => (adapter && snapshot ? adapter.analyze(snapshot, cardMap) : []),
    [adapter, snapshot, cardMap],
  );

  if (!adapter || !format || !snapshot) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="max-w-md text-center">This deck has an unknown game or format.</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
          Back to Deckwarden
        </Button>
      </main>
    );
  }

  const { leader, rest } = splitLeaderEntries(entries, format);
  const groups = groupDeckEntries(rest, cardMap, groupBy, sortBy);
  const severity = issueSeverityByCard(issues);
  const leaderZoneDef = format.zones.find((z) => z.isLeaderZone);
  const leaderItems = leader.flatMap((entry) => {
    const card = cardMap.get(entry.cardId);
    return card ? [{ entry, card }] : [];
  });

  const total = deckSizeCount(entries, format);
  const sizeLabel = format.deckSize.max !== null ? `${total} / ${format.deckSize.max}` : `${total}`;
  const updated = new Date(deck.updatedAt);

  const onPreview = (card: EditorCard) => router.push(`/cards/${card.id}`);

  const copyDecklist = () => {
    void navigator.clipboard
      .writeText(adapter.serializeDecklist(snapshot, cardMap))
      .then(() => setCopied(true));
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <p>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Deckwarden
        </Link>
      </p>
      <header className="mt-2">
        <h1 className="text-2xl font-bold tracking-tight break-words">{deck.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {author && (
            <>
              by{" "}
              <Link href={`/u/${author.username}`} className="text-foreground hover:underline">
                {author.name}
              </Link>{" "}
              ·{" "}
            </>
          )}
          {format.label} · <span className="tabular-nums">{sizeLabel}</span> cards · Updated{" "}
          {/* timeZone pinned: this SSRs on the server (UTC) and hydrates in the
              viewer's zone — an unpinned date string mismatches and throws
              React #418. UTC-dated "Updated" is fine for a share page. */}
          {updated.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
        {forkedFrom && (
          <p className="mt-1">
            <ForkCreditLine credit={forkedFrom} className="text-sm" />
          </p>
        )}
        {/* Collection line (P3.7): server-computed for THIS signed-in viewer
            against their own collection — never rendered signed out. */}
        {ownership && (
          <p
            className="text-muted-foreground mt-1 text-sm tabular-nums"
            title={OWNERSHIP_METHOD}
            data-testid="ownership-line"
          >
            {ownershipLine(ownership)}
          </p>
        )}
        {deck.description && <p className="mt-2 text-sm whitespace-pre-wrap">{deck.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EngagementButtons deckId={deck.id} likesCount={deck.likesCount} viewer={viewer} />
          <ForkButton deckId={deck.id} signedIn={viewer !== null} />
          <Button variant="outline" size="sm" onClick={copyDecklist}>
            {copied ? "Copied ✓" : "Copy decklist"}
          </Button>
          {editToken !== null && (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={`/decks/${deck.id}/edit`} />}
            >
              Open in editor
            </Button>
          )}
        </div>
      </header>

      <ValidationPanel
        formatLabel={format.label}
        issues={issues}
        cards={cardMap}
        onPreview={onPreview}
      />

      {leaderZoneDef && (
        <LeaderZone
          zone={leaderZoneDef}
          items={leaderItems}
          severity={severity}
          onPreview={onPreview}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        <Segmented label="View" options={VIEW_OPTIONS} value={view} onChange={setView} />
        <Segmented label="Group" options={GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />
        <Segmented label="Sort" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
      </div>

      {rest.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-xs">This deck has no cards yet.</p>
      ) : view === "text" ? (
        <DeckTextView
          adapter={adapter}
          groups={groups}
          severity={severity}
          onPreview={onPreview}
          owned={owned}
        />
      ) : (
        <DeckGridView groups={groups} severity={severity} onPreview={onPreview} owned={owned} />
      )}

      {deck.notes && (
        <section className="mt-6">
          <h2 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            Notes
          </h2>
          <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {deck.notes}
          </p>
        </section>
      )}

      <SampleHand entries={entries} cards={cardMap} format={format} onPreview={onPreview} />

      {analytics.length > 0 && (
        <section className="mt-6">
          <h2 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            Analytics
          </h2>
          <div className="mt-2">
            <AnalyticsBlocks blocks={analytics} />
          </div>
        </section>
      )}
    </main>
  );
}

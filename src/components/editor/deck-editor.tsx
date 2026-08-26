"use client";

/**
 * The deck editor (P1.2): three panes — card search | deck list | card detail.
 *
 * The in-memory list is the single source of truth: every edit applies
 * optimistically via the pure helpers in src/lib/decks/editor-state.ts, then a
 * debounced (~1s) autosave PUTs the full list (the P1.1 route built for exactly
 * this) with the claim token from localStorage. Reload hydrates from GET
 * /api/decks/[id]; pagehide/unmount flush with keepalive fetch so no edit is
 * lost mid-navigation.
 *
 * Game-agnostic by construction: zones, labels, and card display all come off
 * the adapter registry (FormatDef, display.*) — nothing MTG-specific here.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardDetailPane } from "@/components/editor/card-detail-pane";
import { DeckListPane } from "@/components/editor/deck-list-pane";
import { ExportDialog, ImportDialog } from "@/components/editor/import-export";
import { SearchPane } from "@/components/editor/search-pane";
import { ShareDialog, type DeckVisibility } from "@/components/editor/share-dialog";
import { useAutosave } from "@/components/editor/use-autosave";
import { Button } from "@/components/ui/button";
import {
  addCard,
  removeCard,
  setQty,
  toEditorCard,
  toSavePayload,
  type CardWire,
  type EditorCard,
  type EditorEntry,
  type EditResult,
} from "@/lib/decks/editor-state";
import type { ImportOutcome } from "@/lib/decks/import";
import { getDeckToken } from "@/lib/decks/token-store";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { getAdapter } from "@/lib/games/registry";
import type {
  AnalyticsBlock,
  FormatDef,
  GameAdapter,
  GameId,
  ValidationIssue,
} from "@/lib/games/types";

interface DeckResponse {
  deck: {
    id: string;
    publicId: string;
    game: GameId | null;
    format: string | null;
    name: string;
    visibility: DeckVisibility;
    isOwner: boolean;
  };
  cards: {
    cardId: string;
    zone: string;
    qty: number;
    tags: string[];
    printingId: string | null;
    card: CardWire;
  }[];
}

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; adapter: GameAdapter; format: FormatDef };

const TOKEN_HEADER = "x-deck-token";

export function DeckEditor({ deckId }: { deckId: string }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [deckName, setDeckName] = useState("");
  const [entries, setEntries] = useState<EditorEntry[]>([]);
  const [cards, setCards] = useState<ReadonlyMap<string, EditorCard>>(new Map());
  const [preview, setPreview] = useState<EditorCard | null>(null);
  const [dialog, setDialog] = useState<"import" | "export" | "share" | null>(null);
  const [share, setShare] = useState<{ publicId: string; visibility: DeckVisibility } | null>(null);

  // Refs mirror the state the save callback needs, so an autosave always
  // serializes the latest edits regardless of when the debounce fires.
  const entriesRef = useRef<EditorEntry[]>([]);
  const nameRef = useRef("");
  const lastSavedRef = useRef({ cards: "", name: "" });

  const save = useCallback(async () => {
    const token = getDeckToken(deckId);
    if (!token) throw new Error("Missing deck token");
    const cardsBody = JSON.stringify({ cards: toSavePayload(entriesRef.current) });
    if (cardsBody !== lastSavedRef.current.cards) {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
        body: cardsBody,
      });
      if (!res.ok) throw new Error(`Card save failed (${res.status})`);
      lastSavedRef.current.cards = cardsBody;
    }
    const name = nameRef.current.trim();
    if (name && name !== lastSavedRef.current.name) {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`Name save failed (${res.status})`);
      lastSavedRef.current.name = name;
    }
  }, [deckId]);

  const autosave = useAutosave(save);
  const { markDirty, isDirty } = autosave;

  // Hydrate from the server once (GET joins card data — no N+1).
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = getDeckToken(deckId);
        const res = await fetch(`/api/decks/${deckId}`, {
          headers: token ? { [TOKEN_HEADER]: token } : {},
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 404) throw new Error("Deck not found.");
        if (res.status === 403) throw new Error("This deck is private and you don't have its key.");
        if (!res.ok) throw new Error(`Failed to load deck (${res.status}).`);
        const json: DeckResponse = await res.json();
        if (!json.deck.isOwner) {
          throw new Error(
            "You don't have edit access to this deck on this browser. " +
              "The edit key lives where the deck was created.",
          );
        }
        const adapter = json.deck.game ? getAdapter(json.deck.game) : null;
        const format = adapter?.formats.find((f) => f.code === json.deck.format);
        if (!adapter || !format) throw new Error("This deck has an unknown game or format.");

        const loadedEntries: EditorEntry[] = json.cards.map((c) => ({
          cardId: c.cardId,
          zone: c.zone,
          qty: c.qty,
          tags: c.tags,
          ...(c.printingId ? { printingId: c.printingId } : {}),
        }));
        entriesRef.current = loadedEntries;
        nameRef.current = json.deck.name;
        lastSavedRef.current = {
          cards: JSON.stringify({ cards: toSavePayload(loadedEntries) }),
          name: json.deck.name,
        };
        setEntries(loadedEntries);
        setCards(new Map(json.cards.map((c) => [c.cardId, toEditorCard(c.card)])));
        setDeckName(json.deck.name);
        setShare({ publicId: json.deck.publicId, visibility: json.deck.visibility });
        setLoad({ state: "ready", adapter, format });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => controller.abort();
  }, [deckId]);

  // Flush pending edits when the tab closes (pagehide) or the component
  // unmounts on client-side navigation. keepalive lets the request outlive
  // the page; the await-less send is the best a closing tab allows.
  useEffect(() => {
    const flushKeepalive = () => {
      if (!isDirty()) return;
      const token = getDeckToken(deckId);
      if (!token) return;
      const headers = { "Content-Type": "application/json", [TOKEN_HEADER]: token };
      const cardsBody = JSON.stringify({ cards: toSavePayload(entriesRef.current) });
      if (cardsBody !== lastSavedRef.current.cards) {
        lastSavedRef.current.cards = cardsBody;
        void fetch(`/api/decks/${deckId}/cards`, {
          method: "PUT",
          headers,
          body: cardsBody,
          keepalive: true,
        });
      }
      const name = nameRef.current.trim();
      if (name && name !== lastSavedRef.current.name) {
        lastSavedRef.current.name = name;
        void fetch(`/api/decks/${deckId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ name }),
          keepalive: true,
        });
      }
    };
    window.addEventListener("pagehide", flushKeepalive);
    return () => {
      window.removeEventListener("pagehide", flushKeepalive);
      flushKeepalive();
    };
  }, [deckId, isDirty]);

  /** Apply a pure edit result; returns the error (if any) for pane-local display. */
  const applyEdit = useCallback(
    (result: EditResult): string | undefined => {
      if (!result.error) {
        entriesRef.current = result.entries;
        setEntries(result.entries);
        markDirty();
      }
      return result.error;
    },
    [markDirty],
  );

  const format = load.state === "ready" ? load.format : null;

  const handleAdd = useCallback(
    (card: EditorCard, zoneId: string, qty: number): string | undefined => {
      if (!format) return "Deck not loaded yet";
      setCards((prev) => (prev.has(card.id) ? prev : new Map(prev).set(card.id, card)));
      setPreview(card);
      return applyEdit(addCard(entriesRef.current, format, zoneId, card.id, qty));
    },
    [format, applyEdit],
  );

  const handleSetQty = useCallback(
    (zoneId: string, cardId: string, qty: number): string | undefined => {
      if (!format) return undefined;
      return applyEdit(setQty(entriesRef.current, format, zoneId, cardId, qty));
    },
    [format, applyEdit],
  );

  const handleRemove = useCallback(
    (zoneId: string, cardId: string) => {
      applyEdit({ entries: removeCard(entriesRef.current, zoneId, cardId) });
    },
    [applyEdit],
  );

  // Import applies as one whole-list swap: the pure applyImport already
  // merged/spilled per format rules, so the result is save-ready as-is.
  const handleImport = useCallback(
    (outcome: ImportOutcome) => {
      setCards((prev) => {
        const next = new Map(prev);
        for (const card of outcome.cards)
          if (!next.has(card.id)) next.set(card.id, toEditorCard(card));
        return next;
      });
      entriesRef.current = outcome.entries;
      setEntries(outcome.entries);
      markDirty();
    },
    [markDirty],
  );

  // Visibility PATCHes immediately (not via autosave): it's a deliberate,
  // rare action and the Share dialog wants the result before it re-renders.
  const setVisibility = useCallback(
    async (visibility: DeckVisibility) => {
      const token = getDeckToken(deckId);
      if (!token) throw new Error("Missing deck token");
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) throw new Error(`Visibility change failed (${res.status})`);
      setShare((prev) => (prev ? { ...prev, visibility } : prev));
    },
    [deckId],
  );

  const inDeckQty = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.qty);
    return counts;
  }, [entries]);

  // Live validation (P1.4) and analytics (P1.5): the adapter's pure functions
  // on every edit, over one shared snapshot. validate is the same code the PUT
  // route re-runs server-side on save; analyze feeds the middle pane's blocks.
  const snapshot = useMemo(
    () => (load.state === "ready" ? toDeckSnapshot(load.adapter.id, load.format, entries) : null),
    [load, entries],
  );
  const issues = useMemo<ValidationIssue[]>(
    () => (load.state === "ready" && snapshot ? load.adapter.validate(snapshot, cards) : []),
    [load, snapshot, cards],
  );
  const analytics = useMemo<AnalyticsBlock[]>(
    () => (load.state === "ready" && snapshot ? load.adapter.analyze(snapshot, cards) : []),
    [load, snapshot, cards],
  );

  if (load.state !== "ready") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        {load.state === "loading" ? (
          <p className="text-muted-foreground">Loading deck…</p>
        ) : (
          <>
            <p className="max-w-md text-center">{load.message}</p>
            <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
              Back to Deckwarden
            </Button>
          </>
        )}
      </main>
    );
  }

  return (
    // Mobile (<lg): panes stack and the page scrolls; the header wraps to two
    // rows (name input drops to its own line). Desktop keeps the app-like
    // fixed-viewport three-pane grid.
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 lg:h-14 lg:flex-nowrap lg:py-0">
        <Link
          href="/"
          className="text-muted-foreground shrink-0 text-sm hover:underline"
          aria-label="Back to home"
        >
          ← Deckwarden
        </Link>
        <input
          value={deckName}
          onChange={(e) => {
            setDeckName(e.target.value);
            nameRef.current = e.target.value;
            markDirty();
          }}
          aria-label="Deck name"
          maxLength={120}
          className="focus-visible:ring-ring/50 order-last min-w-0 basis-full rounded-md bg-transparent px-2 py-1 font-semibold outline-none focus-visible:ring-2 lg:order-none lg:flex-1 lg:basis-auto"
        />
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <Button variant="outline" size="xs" onClick={() => setDialog("import")}>
            Import
          </Button>
          <Button variant="outline" size="xs" onClick={() => setDialog("export")}>
            Export
          </Button>
          {share && (
            <Button variant="outline" size="xs" onClick={() => setDialog("share")}>
              Share
            </Button>
          )}
          <SaveIndicator status={autosave.status} onRetry={() => void autosave.flush()} />
        </div>
      </header>

      {dialog === "import" && (
        <ImportDialog
          adapter={load.adapter}
          format={load.format}
          entries={entries}
          onApply={handleImport}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "export" && snapshot && (
        <ExportDialog
          text={load.adapter.serializeDecklist(snapshot, cards)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "share" && share && (
        <ShareDialog
          publicId={share.publicId}
          visibility={share.visibility}
          onSetVisibility={setVisibility}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="min-h-0 flex-1 gap-0 lg:grid lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)_minmax(16rem,22rem)]">
        <section
          aria-label="Card search"
          className="min-h-0 border-b lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          <SearchPane
            adapter={load.adapter}
            format={load.format}
            inDeckQty={inDeckQty}
            onAdd={handleAdd}
            onPreview={setPreview}
          />
        </section>
        <section
          aria-label="Deck list"
          className="min-h-0 border-b lg:overflow-y-auto lg:border-b-0"
        >
          <DeckListPane
            adapter={load.adapter}
            format={load.format}
            entries={entries}
            cards={cards}
            issues={issues}
            analytics={analytics}
            onSetQty={handleSetQty}
            onRemove={handleRemove}
            onPreview={setPreview}
          />
        </section>
        <section aria-label="Card detail" className="min-h-0 lg:overflow-y-auto lg:border-l">
          <CardDetailPane adapter={load.adapter} card={preview} />
        </section>
      </div>
    </div>
  );
}

function SaveIndicator({ status, onRetry }: { status: string; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span className="flex shrink-0 items-center gap-2 text-sm">
        <span className="text-destructive">Save failed</span>
        <Button variant="destructive" size="xs" onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  }
  const label = status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved…" : "Saved";
  return (
    <span className="text-muted-foreground shrink-0 text-sm tabular-nums" aria-live="polite">
      {label}
    </span>
  );
}

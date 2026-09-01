"use client";

/**
 * The deck editor (P1.2): three panes — card search | deck list | card detail.
 * P3.2 makes the right pane tabbed (Card | Suggestions) for games whose
 * adapter declares recommendation signals; explicit card interactions
 * anywhere (search preview, deck-row click) flip back to the Card tab, while
 * adds from the Suggestions panel stay put and update the preview silently.
 *
 * The in-memory list is the single source of truth: every edit applies
 * optimistically via the pure helpers in src/lib/decks/editor-state.ts, then a
 * debounced (~1s) autosave PUTs the full list (the P1.1 route built for exactly
 * this). Ownership proof is the claim token from localStorage when this
 * browser holds one, else the Better Auth session cookie (claimed/account
 * decks, P2.1) that rides along automatically. Reload hydrates from GET
 * /api/decks/[id]; pagehide/unmount flush with keepalive fetch so no edit is
 * lost mid-navigation.
 *
 * Game-agnostic by construction: zones, labels, and card display all come off
 * the adapter registry (FormatDef, display.*) — nothing MTG-specific here.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardDetailPane } from "@/components/editor/card-detail-pane";
import { DeckListPane } from "@/components/editor/deck-list-pane";
import { DetailsDialog, type DeckDetails } from "@/components/editor/details-dialog";
import { ExportDialog, ImportDialog } from "@/components/editor/import-export";
import { RecommendationsPanel } from "@/components/editor/recommendations-panel";
import { SearchPane } from "@/components/editor/search-pane";
import { ShareDialog, type DeckVisibility } from "@/components/editor/share-dialog";
import { useAutosave } from "@/components/editor/use-autosave";
import { Button } from "@/components/ui/button";
import {
  addCard,
  removeCard,
  setQty,
  setTags,
  toEditorCard,
  toSavePayload,
  type CardWire,
  type EditorCard,
  type EditorEntry,
  type EditResult,
} from "@/lib/decks/editor-state";
import type { ImportOutcome } from "@/lib/decks/import";
import { getDeckToken, removeDeckToken, setDeckToken } from "@/lib/decks/token-store";
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
    description: string | null;
    notes: string | null;
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

/** Write headers: token when this browser holds one, else the session cookie authenticates. */
function writeHeaders(deckId: string): Record<string, string> {
  const token = getDeckToken(deckId);
  return { "Content-Type": "application/json", ...(token ? { [TOKEN_HEADER]: token } : {}) };
}

/**
 * One PATCH body for every autosaved meta field (name + P2.7's details).
 * Deterministic serialization doubles as the dirty check; an empty name is
 * omitted (the route requires min 1 — the old name simply stands), empty
 * description/notes save as null.
 */
function metaPatchBody(meta: { name: string; description: string; notes: string }): string {
  const name = meta.name.trim();
  return JSON.stringify({
    ...(name ? { name } : {}),
    description: meta.description.trim() ? meta.description : null,
    notes: meta.notes.trim() ? meta.notes : null,
  });
}

export function DeckEditor({
  deckId: initialDeckId,
  draftGame,
  draftFormat,
}: {
  /** null = draft mode (/decks/new): no server deck exists until the first real edit. */
  deckId: string | null;
  /** Draft mode only: what the lazily-created deck will be. */
  draftGame?: GameId;
  draftFormat?: string;
}) {
  const router = useRouter();
  // Draft mode is ready (or misconfigured) synchronously — only a real deck
  // id has anything to load.
  const [load, setLoad] = useState<LoadState>(() => {
    if (initialDeckId !== null) return { state: "loading" };
    const adapter = draftGame ? getAdapter(draftGame) : null;
    const format = adapter?.formats.find((f) => f.code === draftFormat);
    if (!adapter || !format) {
      return { state: "error", message: "This editor link is missing its game or format." };
    }
    return { state: "ready", adapter, format };
  });
  const [deckName, setDeckName] = useState("");
  const [details, setDetails] = useState<DeckDetails>({ description: "", notes: "" });
  const [entries, setEntries] = useState<EditorEntry[]>([]);
  const [cards, setCards] = useState<ReadonlyMap<string, EditorCard>>(new Map());
  const [preview, setPreview] = useState<EditorCard | null>(null);
  const [dialog, setDialog] = useState<"import" | "export" | "share" | "details" | null>(null);
  const [share, setShare] = useState<{ publicId: string; visibility: DeckVisibility } | null>(null);
  // Right pane tab (P3.2). liveDeckId mirrors deckIdRef as STATE so the
  // Suggestions panel re-renders when draft mode's first save mints the row.
  const [rightTab, setRightTab] = useState<"card" | "suggest">("card");
  const [liveDeckId, setLiveDeckId] = useState<string | null>(initialDeckId);

  // Refs mirror the state the save callback needs, so an autosave always
  // serializes the latest edits regardless of when the debounce fires. The
  // initial baselines are exactly what a fresh server deck would save, which
  // is what draft mode needs; server hydration overwrites them before any
  // save can fire.
  const entriesRef = useRef<EditorEntry[]>([]);
  const metaRef = useRef({ name: "", description: "", notes: "" });
  const lastSavedRef = useRef({
    cards: JSON.stringify({ cards: toSavePayload([]) }),
    meta: metaPatchBody({ name: "", description: "", notes: "" }),
  });

  // The live deck id: the prop for existing decks, set by ensureDeck once a
  // draft's first save creates the row. A ref because save/keepalive closures
  // must see the fresh id without re-subscribing.
  const deckIdRef = useRef<string | null>(initialDeckId);
  const createChainRef = useRef<Promise<string> | null>(null);

  /**
   * Draft mode's whole point (P2.8 follow-up): the deck row is created by the
   * FIRST flush that has something to say — a card added or a name typed —
   * never by merely opening /decks/new. Click around and leave, and nothing
   * lands on your account. Single-flight so a debounce/flush race can't mint
   * two decks; a failed create clears the chain so autosave's retry re-runs
   * it instead of wedging.
   */
  const ensureDeck = useCallback(async (): Promise<string> => {
    if (deckIdRef.current) return deckIdRef.current;
    createChainRef.current ??= (async () => {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `website` is the create route's honeypot — always sent empty.
        body: JSON.stringify({ game: draftGame, format: draftFormat, website: "" }),
      });
      if (!res.ok) throw new Error(`Deck creation failed (${res.status})`);
      const json: {
        deck: { id: string; publicId: string; visibility: DeckVisibility };
        claimToken: string | null;
      } = await res.json();
      // Adopt the deck before the token check: if storage is broken the row
      // exists either way, and retrying must not mint duplicates.
      deckIdRef.current = json.deck.id;
      setLiveDeckId(json.deck.id);
      setShare({ publicId: json.deck.publicId, visibility: json.deck.visibility });
      // Same editor, real URL from here on — reloads and back/forward land on
      // /decks/[id]/edit; no remount, no lost pane state.
      window.history.replaceState(null, "", `/decks/${json.deck.id}/edit`);
      if (json.claimToken && !setDeckToken(json.deck.id, json.claimToken)) {
        throw new Error(
          "Couldn't store this deck's edit key — enable browser storage and try again.",
        );
      }
      return json.deck.id;
    })().catch((err: unknown) => {
      if (!deckIdRef.current) createChainRef.current = null;
      throw err;
    });
    return createChainRef.current;
  }, [draftGame, draftFormat]);

  const save = useCallback(async () => {
    const deckId = await ensureDeck();
    const headers = writeHeaders(deckId);
    const cardsBody = JSON.stringify({ cards: toSavePayload(entriesRef.current) });
    if (cardsBody !== lastSavedRef.current.cards) {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "PUT",
        headers,
        body: cardsBody,
      });
      if (!res.ok) throw new Error(`Card save failed (${res.status})`);
      lastSavedRef.current.cards = cardsBody;
    }
    const metaBody = metaPatchBody(metaRef.current);
    if (metaBody !== lastSavedRef.current.meta) {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers,
        body: metaBody,
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      lastSavedRef.current.meta = metaBody;
    }
  }, [ensureDeck]);

  const autosave = useAutosave(save);
  const { markDirty, isDirty } = autosave;

  // Hydrate from the server once (GET joins card data — no N+1). Draft mode
  // has no server row yet — its ready state and baselines were set at init.
  useEffect(() => {
    if (initialDeckId === null) return;
    const deckId = initialDeckId;
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
              "The edit key lives where the deck was created — and if you've " +
              "claimed it into an account, sign in from the Account page first.",
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
        metaRef.current = {
          name: json.deck.name,
          description: json.deck.description ?? "",
          notes: json.deck.notes ?? "",
        };
        lastSavedRef.current = {
          cards: JSON.stringify({ cards: toSavePayload(loadedEntries) }),
          meta: metaPatchBody(metaRef.current),
        };
        setEntries(loadedEntries);
        setCards(new Map(json.cards.map((c) => [c.cardId, toEditorCard(c.card)])));
        setDeckName(json.deck.name);
        setDetails({ description: json.deck.description ?? "", notes: json.deck.notes ?? "" });
        setShare({ publicId: json.deck.publicId, visibility: json.deck.visibility });
        setLoad({ state: "ready", adapter, format });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => controller.abort();
  }, [initialDeckId]);

  // Flush pending edits when the tab closes (pagehide) or the component
  // unmounts on client-side navigation. keepalive lets the request outlive
  // the page; the await-less send is the best a closing tab allows. A draft
  // whose deck doesn't exist yet has nothing persisted to protect — leaving
  // inside the first debounce window drops that sliver of input rather than
  // minting the empty deck this feature exists to prevent.
  useEffect(() => {
    const flushKeepalive = () => {
      const deckId = deckIdRef.current;
      if (!deckId || !isDirty()) return;
      const headers = writeHeaders(deckId);
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
      const metaBody = metaPatchBody(metaRef.current);
      if (metaBody !== lastSavedRef.current.meta) {
        lastSavedRef.current.meta = metaBody;
        void fetch(`/api/decks/${deckId}`, {
          method: "PATCH",
          headers,
          body: metaBody,
          keepalive: true,
        });
      }
    };
    window.addEventListener("pagehide", flushKeepalive);
    return () => {
      window.removeEventListener("pagehide", flushKeepalive);
      flushKeepalive();
    };
  }, [isDirty]);

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

  // Explicit card interactions (search preview/add, deck-row clicks) show the
  // card — including flipping the right pane back to the Card tab (P3.2).
  const showCard = useCallback((card: EditorCard) => {
    setPreview(card);
    setRightTab("card");
  }, []);

  const handleAdd = useCallback(
    (card: EditorCard, zoneId: string, qty: number): string | undefined => {
      if (!format) return "Deck not loaded yet";
      setCards((prev) => (prev.has(card.id) ? prev : new Map(prev).set(card.id, card)));
      showCard(card);
      return applyEdit(addCard(entriesRef.current, format, zoneId, card.id, qty));
    },
    [format, applyEdit, showCard],
  );

  // Adds from the Suggestions panel (P3.2): same edit path as handleAdd, but
  // the preview updates without stealing the tab — the user is mid-scan.
  const handleAddSuggestion = useCallback(
    (card: EditorCard): string | undefined => {
      if (!format) return "Deck not loaded yet";
      const mainZone = format.zones.find((z) => !z.isLeaderZone);
      if (!mainZone) return "This format has no main zone";
      setCards((prev) => (prev.has(card.id) ? prev : new Map(prev).set(card.id, card)));
      setPreview(card);
      return applyEdit(addCard(entriesRef.current, format, mainZone.id, card.id, 1));
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
  // Unreachable in a pre-create draft (the Share button needs `share`, which
  // ensureDeck sets) — the guard is belt-and-suspenders.
  const setVisibility = useCallback(async (visibility: DeckVisibility) => {
    const deckId = deckIdRef.current;
    if (!deckId) return;
    const res = await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: writeHeaders(deckId),
      body: JSON.stringify({ visibility }),
    });
    if (!res.ok) throw new Error(`Visibility change failed (${res.status})`);
    setShare((prev) => (prev ? { ...prev, visibility } : prev));
  }, []);

  const handleDetailsChange = useCallback(
    (next: DeckDetails) => {
      setDetails(next);
      metaRef.current = { ...metaRef.current, ...next };
      markDirty();
    },
    [markDirty],
  );

  // Deck deletion (P2.8 follow-up): the dialog owns the confirm; this owns
  // the call and the exit. Guest decks (this browser holds a token) land on
  // home, account decks on /account. A debounced autosave may still fire
  // against the dead id during navigation — a harmless 404. Deleting a draft
  // whose deck was never created is just leaving.
  const handleDeleteDeck = useCallback(async (): Promise<string | null> => {
    const deckId = deckIdRef.current;
    if (!deckId) {
      router.replace("/");
      return null;
    }
    const token = getDeckToken(deckId);
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "DELETE",
        headers: token ? { [TOKEN_HEADER]: token } : {},
      });
      if (!res.ok && res.status !== 204) return `Couldn't delete the deck (${res.status}).`;
    } catch {
      return "Couldn't delete — check your connection and try again.";
    }
    removeDeckToken(deckId);
    router.replace(token !== null ? "/" : "/account");
    router.refresh();
    return null;
  }, [router]);

  const inDeckQty = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.qty);
    return counts;
  }, [entries]);

  // Tag editing (P2.7): the detail pane edits the previewed card's entry.
  // Prefer a non-leader entry — tags group the main list — but the leader
  // entry is still taggable when it's all there is.
  const tagging = useMemo(() => {
    if (!preview || !format) return null;
    const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
    const entry =
      entries.find((e) => e.cardId === preview.id && !leaderZones.has(e.zone)) ??
      entries.find((e) => e.cardId === preview.id);
    if (!entry) return null;
    return {
      tags: entry.tags,
      onSetTags: (tags: string[]) =>
        applyEdit({ entries: setTags(entriesRef.current, entry.zone, entry.cardId, tags) }),
    };
  }, [preview, format, entries, applyEdit]);

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
            metaRef.current = { ...metaRef.current, name: e.target.value };
            markDirty();
          }}
          aria-label="Deck name"
          placeholder="Untitled — click to name your deck"
          maxLength={120}
          className="focus-visible:ring-ring/50 order-last min-w-0 basis-full rounded-md bg-transparent px-2 py-1 font-semibold outline-none focus-visible:ring-2 lg:order-none lg:flex-1 lg:basis-auto"
        />
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <Button variant="outline" size="xs" onClick={() => setDialog("details")}>
            Details
          </Button>
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

      {dialog === "details" && (
        <DetailsDialog
          details={details}
          deckName={deckName}
          onChange={handleDetailsChange}
          onDelete={handleDeleteDeck}
          onClose={() => setDialog(null)}
        />
      )}
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
            onPreview={showCard}
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
            onPreview={showCard}
          />
        </section>
        <section
          aria-label="Card detail and suggestions"
          className="min-h-0 lg:overflow-y-auto lg:border-l"
        >
          {load.adapter.recommend ? (
            <>
              <div role="tablist" aria-label="Right pane view" className="flex gap-1 border-b p-2">
                <RightTab active={rightTab === "card"} onClick={() => setRightTab("card")}>
                  Card
                </RightTab>
                <RightTab active={rightTab === "suggest"} onClick={() => setRightTab("suggest")}>
                  Suggestions
                </RightTab>
              </div>
              <div role="tabpanel" hidden={rightTab !== "card"}>
                <CardDetailPane adapter={load.adapter} card={preview} tagging={tagging} />
              </div>
              {/* Mounted while hidden so results survive tab flips; `active`
                  keeps the hidden panel from fetching. */}
              <div role="tabpanel" hidden={rightTab !== "suggest"}>
                <RecommendationsPanel
                  adapter={load.adapter}
                  format={load.format}
                  deckId={liveDeckId}
                  entries={entries}
                  inDeckQty={inDeckQty}
                  saveStatus={autosave.status}
                  active={rightTab === "suggest"}
                  onAdd={handleAddSuggestion}
                />
              </div>
            </>
          ) : (
            <CardDetailPane adapter={load.adapter} card={preview} tagging={tagging} />
          )}
        </section>
      </div>
    </div>
  );
}

function RightTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
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

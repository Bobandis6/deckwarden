"use client";

/**
 * Combo Radar panel (P3.3) — the right pane's third tab: what the deck
 * already does and what it is one card from doing, organized BY COMBO. The
 * complement of the Suggestions panel, never a duplicate: Suggestions ranks
 * candidate cards (combo participation is one signal among several); the
 * Radar lists combos exhaustively over the stored set up to a disclosed
 * scan cap, ordered by the source's play counts alone.
 *
 * Honesty rules carried from the engine (and the LATER.md decision this
 * package fired): a template-requirement combo is never "complete" on cards
 * alone — deckComboStatus + the "Also needs …" line say so; unranked combos
 * render with an explicit no-plays note, not hidden, not inflated; the
 * popularity-floor ingest bound and any scan-cap truncation are disclosed
 * in the footer instead of silently narrowing "exhaustive".
 *
 * Fetch policy and add path are the P3.2 machinery, shared not re-derived:
 * deckStateKey/hasLeader gates (fetch only while visible, leader present,
 * deck row known, autosave settled, key changed) and useResolvedAdd
 * (resolve with the id guard → quiet add → autosave).
 *
 * "With your commander" (W9c): the leader's own most popular combos off
 * GET /api/cards/[id]/combos?fit= — fetched once per leader change (the
 * useLeaderArt discipline: keyed on (anchor, fit), aborted when stale), so
 * it works in a seeded DRAFT with no deck row and adds no per-edit request.
 * "In deck" marks are computed client-side from inDeckQty. "Add N pieces"
 * hydrates every missing piece in ONE resolve call by externalKey (pass 0)
 * and lands ONE toast.
 *
 * "Suggest full list" (X3, WAVE3.md D3 — W9c's "Build around", renamed to
 * say what it does) sits on all three kinds of row: "With your commander",
 * "In your deck" and "One card away" (which adds its missing piece first).
 * It does the same add quietly — real edits: they save, and cancelling the
 * sheet leaves them — then opens the autofill sheet with the combo PINNED
 * (comboPin): its pieces are always kept and render as their own "Combo
 * pieces" group, each labeled "Combo piece" (LATER row 104, fired — the
 * label rides the pinned context, not a `tags` value).
 *
 * Badges (Y6b, WAVE4 D7): every deck-relative row ("In your deck", "One card
 * away") says what its combo alone makes a deck, in the adapter's words —
 * `brackets.comboBadge`, read exactly as the list's read reads it, from the
 * tag and "relevant" mark the deck route already sends — crediting its
 * source, plus "above your target" when either of its levels is above the
 * deck's. Badges never filter: the rows are the route's, exhaustive up to
 * the disclosed cap, and the Cut Coach reads the same `inDeck` list. The
 * commander rows carry none: the card route's public combos have no rating.
 *
 * Adds (Y6b, LATER row 179): the editor announces them — one card toasts
 * "Added X" with an Undo (the live line keeps failures only), a combo's
 * pieces toast once for the batch with ONE Undo for all of them; "Suggest
 * full list" adds quietly, as before.
 */
import { ArrowUpRightIcon, GaugeIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useResolvedAdd } from "@/components/editor/use-resolved-add";
import { toast } from "@/components/ui/toast";
import { BRACKET_COPY } from "@/lib/brackets/copy";
import type { ComboPieceRef, ComboView, DeckComboView } from "@/lib/combos/queries";
import {
  alsoNeedsLine,
  comboPin,
  deckComboStatus,
  orderDeckCombos,
  type ComboPin,
} from "@/lib/combos/view";
import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import type { DeckGoals } from "@/lib/decks/goals";
import { deckStateKey, hasLeader } from "@/lib/decks/panel-view";
import { getDeckToken } from "@/lib/decks/token-store";
import type { BracketComboBadge, FormatDef, GameAdapter } from "@/lib/games/types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Commander combos shown (W9c) — the API returns its top 10; the panel keeps the densest slice. */
const LEADER_COMBOS_SHOWN = 5;

/** The combo door's label and title (X3, D3 — the owner kept the default on 2026-09-28). */
const SUGGEST_LABEL = "Suggest full list";
const SUGGEST_TITLE = "Keeps these pieces and suggests the rest of the deck";

/** A deck-relative combo's every card piece — held and missing — for its pin and its adds. */
const allPieces = (combo: DeckComboView): ComboPieceRef[] => [
  ...combo.inDeckPieces,
  ...combo.missingPieces,
];

/** A row's badge (Y6b): what the combo alone makes a deck, and whether that's above the target. */
interface RowBadge {
  badge: BracketComboBadge;
  aboveTarget: boolean;
}

interface RadarData {
  inDeck: DeckComboView[];
  oneAway: DeckComboView[];
  truncated: boolean;
}

interface LeaderCombosData {
  total: number;
  combos: ComboView[];
}

interface ComboRadarPanelProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Live deck id — null until draft mode's first autosave creates the row. */
  deckId: string | null;
  entries: readonly { cardId: string; zone: string; qty: number }[];
  /** The editor's card map — the leaders' ciMasks feed the `fit` filter (W9c). */
  cards: ReadonlyMap<string, EditorCard>;
  /** Copies already in the deck — flips Add to "In deck ✓" pre-refetch. */
  inDeckQty: ReadonlyMap<string, number>;
  saveStatus: "saved" | "dirty" | "saving" | "error";
  /** Tab visibility: no fetching (lazy) and no work while hidden. */
  active: boolean;
  /**
   * One card to the main zone via the editor's own edit path — the editor
   * announces it ("Added X · Undo", Y6b); the live line keeps failures.
   */
  onAdd: (card: EditorCard) => string | undefined;
  /**
   * A combo's missing pieces, together (Y6b, LATER row 179): `announce`
   * toasts once for the batch with one Undo; "Suggest full list" adds
   * quietly (the sheet opening is the feedback). Returns the first error.
   */
  onAddPieces: (cards: readonly EditorCard[], announce: boolean) => string | undefined;
  /** The deck's goals (Y6b): the badges' "above your target" and the answers they count. */
  goals?: DeckGoals | null;
  /**
   * "Suggest full list" (X3; W9c's "Build around") — opens the autofill
   * review sheet built around one combo. Passed only when the adapter
   * declares recommend.autofill (the every-door gate); no row renders the
   * button without it.
   */
  onOpenAutofill?: (pin: ComboPin) => void;
}

export function ComboRadarPanel({
  adapter,
  format,
  deckId,
  entries,
  cards,
  inDeckQty,
  saveStatus,
  active,
  onAdd,
  onAddPieces,
  goals = null,
  onOpenAutofill,
}: ComboRadarPanelProps) {
  const [data, setData] = useState<RadarData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Force-refetch counter (Refresh button / error retry) — part of the key.
  const [nonce, setNonce] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  // Y6b: the editor's toast announces an add; the live line keeps failures.
  const { pendingAdd, notice, add } = useResolvedAdd(adapter, format, onAdd, {
    announce: false,
  });

  const combosMeta = adapter.capabilities.combos;
  const leader = hasLeader(entries, format);
  const fetchKey = `${deckStateKey(entries)}§n:${nonce}`;

  // "With your commander" (W9c): keyed on (anchor, fit) only — a deck edit
  // never refetches; a leader swap or a partner landing (fit widens) does.
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  const leaderEntries = leaderZone ? entries.filter((e) => e.zone === leaderZone.id) : [];
  const anchorId = leaderEntries[0]?.cardId ?? null;
  const fitMask = leaderEntries.reduce((m, e) => m | (cards.get(e.cardId)?.ciMask ?? 0), 0);

  // Badges (Y6b): each deck-relative combo read on its own by the adapter,
  // the deck's leaders as its commander, the deck's answers counted.
  const brackets = adapter.brackets;
  const leaderKey = leaderEntries.map((e) => e.cardId).join(",");
  const targetLevel = goals?.targetLevel ?? null;
  const answers = goals?.answers ?? null;
  const badgeOf = useMemo(() => {
    const commanderIds = new Set(leaderKey ? leaderKey.split(",") : []);
    return (combo: DeckComboView): RowBadge | null => {
      const badge = brackets?.comboBadge(
        {
          key: combo.externalKey,
          cardPieces: allPieces(combo)
            .map((p) => p.id)
            .sort(),
          templates: combo.templates,
          tag: combo.tag,
          relevant: combo.relevant,
          results: combo.results,
          popularity: combo.popularity,
        },
        commanderIds,
        answers,
      );
      if (!badge) return null;
      const top = Math.max(badge.level, badge.callLevel ?? 0);
      return { badge, aboveTarget: targetLevel !== null && top > targetLevel };
    };
  }, [brackets, leaderKey, targetLevel, answers]);
  const leaderComboKey = anchorId === null ? null : `${anchorId}:${fitMask}`;
  const [leaderCombos, setLeaderCombos] = useState<LeaderCombosData | null>(null);
  const [leaderFetching, setLeaderFetching] = useState(false);
  const [leaderError, setLeaderError] = useState<string | null>(null);
  const leaderKeyRef = useRef<string | null>(null);
  /** The combo whose pieces are resolving — disables that row's buttons. */
  const [pendingCombo, setPendingCombo] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !anchorId || leaderComboKey === leaderKeyRef.current) return;
    const controller = new AbortController();
    void (async () => {
      setLeaderFetching(true);
      setLeaderError(null);
      try {
        // No cache directive: the route is edge-cached (s-maxage) by design.
        const res = await fetch(`/api/cards/${anchorId}/combos?fit=${fitMask}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`failed (${res.status})`);
        const json: LeaderCombosData = await res.json();
        leaderKeyRef.current = leaderComboKey;
        setLeaderCombos(json);
        setLeaderFetching(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLeaderFetching(false);
        setLeaderError(
          `Combos for your ${adapter.display.leaderNoun.toLowerCase()} failed to load.`,
        );
      }
    })();
    return () => controller.abort();
  }, [active, anchorId, fitMask, leaderComboKey, adapter.display.leaderNoun]);

  /** ONE resolve call for every missing piece (pass 0 by externalKey), id-guarded. */
  const hydratePieces = async (pieces: readonly ComboPieceRef[]): Promise<EditorCard[]> => {
    const res = await fetch("/api/cards/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: adapter.id,
        format: format.code,
        names: pieces.map((p) => p.externalKey),
      }),
    });
    if (!res.ok) throw new Error(`Couldn't load the combo pieces (${res.status}).`);
    const json: { results: { match: CardWire | null }[] } = await res.json();
    return pieces.map((piece, i) => {
      const match = json.results[i]?.match;
      // The id guard (useResolvedAdd's honesty check): a key that resolves
      // to a different card than shown fails instead of adding it.
      if (!match || match.id !== piece.id) {
        throw new Error(`Couldn't load ${piece.name} — try adding it from search.`);
      }
      return toEditorCard(match);
    });
  };

  /**
   * Shared by every combo button: add the missing pieces, then open the
   * sheet — or let the editor announce the batch (one toast, one Undo).
   */
  const addComboPieces = async (
    combo: { id: number; pieces: readonly ComboPieceRef[]; templates: readonly string[] },
    openSheet: boolean,
  ) => {
    if (pendingCombo !== null) return;
    setPendingCombo(combo.id);
    try {
      const missing = combo.pieces.filter((p) => (inDeckQty.get(p.id) ?? 0) === 0);
      const added = missing.length > 0 ? await hydratePieces(missing) : [];
      const error = added.length > 0 ? onAddPieces(added, !openSheet) : undefined;
      if (openSheet) {
        // Suggest full list: the pieces ride into the plan PINNED — the
        // sheet opening is the feedback, no toast on top.
        onOpenAutofill?.(comboPin(combo.pieces, combo.templates));
        return;
      }
      if (error) toast.add({ title: error, type: "error" });
    } catch (err) {
      toast.add({
        title: err instanceof Error ? err.message : "Add failed — check your connection.",
        type: "error",
      });
    } finally {
      setPendingCombo(null);
    }
  };

  useEffect(() => {
    if (!active || !leader || !deckId || saveStatus !== "saved") return;
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
          throw new Error("Combo detection is rate-limited for a moment — try again shortly.");
        }
        if (!res.ok) throw new Error(`Combos failed to load (${res.status}).`);
        const json: RadarData = await res.json();
        lastKeyRef.current = fetchKey;
        setData(json);
        setFetching(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetching(false);
        setFetchError(err instanceof Error ? err.message : "Combos failed to load.");
      }
    })();
    return () => controller.abort();
  }, [active, leader, deckId, saveStatus, fetchKey]);

  // The tab only renders when the capability is declared; belt-and-braces.
  if (!combosMeta) return null;

  if (!leader) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Add a {adapter.display.leaderNoun} to scan for combos — detection runs inside its color
        identity.
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          In-deck lines and one-card upgrades, by combo.
        </p>
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
        {notice?.text ?? (fetching && data !== null ? "Updating…" : "")}
      </p>

      {/* With your commander (W9c): the leader's own most popular lines —
          renders in a seeded draft too (no deck row needed). */}
      {anchorId !== null && combosMeta && (
        <section className="mt-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            With your {adapter.display.leaderNoun.toLowerCase()}
          </h3>
          {leaderError ? (
            <p className="text-destructive mt-1 text-sm">{leaderError}</p>
          ) : leaderCombos === null ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {leaderFetching ? "Loading combos…" : ""}
            </p>
          ) : leaderCombos.combos.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              No {combosMeta.sourceLabel}-listed combos for your{" "}
              {adapter.display.leaderNoun.toLowerCase()} in these colors.
            </p>
          ) : (
            <>
              <ul className="mt-1 space-y-1.5">
                {leaderCombos.combos.slice(0, LEADER_COMBOS_SHOWN).map((combo) => (
                  <LeaderComboRow
                    key={combo.id}
                    combo={combo}
                    inDeckQty={inDeckQty}
                    externalUrl={combosMeta.externalUrl}
                    pending={pendingCombo === combo.id}
                    busy={pendingCombo !== null}
                    onAddPieces={() => void addComboPieces(combo, false)}
                    onSuggest={onOpenAutofill ? () => void addComboPieces(combo, true) : undefined}
                  />
                ))}
              </ul>
              {leaderCombos.total > Math.min(leaderCombos.combos.length, LEADER_COMBOS_SHOWN) && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Showing the {Math.min(leaderCombos.combos.length, LEADER_COMBOS_SHOWN)} most
                  popular of {fmt(leaderCombos.total)}.
                </p>
              )}
            </>
          )}
        </section>
      )}

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
      ) : data === null ? (
        <p className="text-muted-foreground mt-2 text-sm">
          {fetching ? "Scanning for combos…" : "Combos appear once the deck saves."}
        </p>
      ) : (
        <>
          {data.inDeck.length === 0 && data.oneAway.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              No {combosMeta.sourceLabel}-listed combos in this deck yet — and none are one card
              away.
            </p>
          ) : (
            <>
              {data.inDeck.length > 0 && (
                <section className="mt-2">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    In your deck
                  </h3>
                  <ul className="mt-1 space-y-1.5">
                    {orderDeckCombos(data.inDeck).map((combo) => (
                      <InDeckComboRow
                        key={combo.id}
                        combo={combo}
                        badge={badgeOf(combo)}
                        externalUrl={combosMeta.externalUrl}
                        busy={pendingCombo !== null}
                        onSuggest={
                          onOpenAutofill
                            ? () =>
                                void addComboPieces({ ...combo, pieces: allPieces(combo) }, true)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              )}
              {data.oneAway.length > 0 && (
                <section className="mt-3">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    One card away
                  </h3>
                  <ul className="mt-1 space-y-1.5">
                    {data.oneAway.map((combo) => (
                      <OneAwayComboRow
                        key={combo.id}
                        combo={combo}
                        badge={badgeOf(combo)}
                        externalUrl={combosMeta.externalUrl}
                        inDeck={(inDeckQty.get(combo.missingPieces[0]?.id ?? "") ?? 0) > 0}
                        pending={pendingAdd === combo.missingPieces[0]?.id}
                        onAdd={() => {
                          const target = combo.missingPieces[0];
                          if (target) void add({ cardId: target.id, name: target.name });
                        }}
                        busy={pendingCombo !== null}
                        suggestPending={pendingCombo === combo.id}
                        onSuggest={
                          onOpenAutofill
                            ? () =>
                                void addComboPieces({ ...combo, pieces: allPieces(combo) }, true)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* The honest bounds: source credit, the ingest floor, the scan cap. */}
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            <a href={combosMeta.sourceHref} target="_blank" rel="noreferrer" className="underline">
              Combos and deck counts from {combosMeta.sourceLabel}
              <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
            </a>{" "}
            — detection covers combos with recorded play there, plus unranked new ones.
            {data.truncated ? " Scan capped at the most popular matches for this deck." : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Piece names joined with + — combo-list.tsx's convention, editor-safe links.
 *  `inDeck` (W9c) appends a ✓ to pieces the deck already holds. */
function PieceNames({
  pieces,
  inDeck,
}: {
  pieces: { id: string; name: string }[];
  inDeck?: (id: string) => boolean;
}) {
  return (
    <>
      {pieces.map((piece, i) => (
        <span key={piece.id}>
          {i > 0 && <span className="text-muted-foreground font-normal"> + </span>}
          <Link href={`/cards/${piece.id}`} target="_blank" className="hover:underline">
            {piece.name}
          </Link>
          {inDeck?.(piece.id) && (
            <span
              className="text-muted-foreground font-normal"
              aria-label={`${piece.name} is in the deck`}
            >
              {" "}
              ✓
            </span>
          )}
        </span>
      ))}
    </>
  );
}

/** Shared tail: open templates, results, play count + walkthrough link.
 *  Structural subset so the deck-relative and commander (W9c) rows share it. */
function ComboRowDetails({
  combo,
  externalUrl,
}: {
  combo: Pick<DeckComboView, "externalKey" | "results" | "templates" | "popularity">;
  externalUrl: (externalKey: string) => string;
}) {
  const needs = alsoNeedsLine(combo.templates);
  return (
    <>
      {needs && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{needs}</p>}
      {combo.results.length > 0 && (
        <p className="text-muted-foreground mt-0.5 text-xs">{combo.results.join(" · ")}</p>
      )}
      <p className="text-muted-foreground mt-0.5 text-xs">
        {combo.popularity !== null
          ? `In ${fmt(combo.popularity)} decks`
          : "Unranked — no tracked plays yet"}
        {" · "}
        <a
          href={externalUrl(combo.externalKey)}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          How it works
          <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
        </a>
      </p>
    </>
  );
}

/**
 * A combo's weight (Y6b): the adapter's words, its credit, and "above your
 * target" when it is — the Suggestions flags' gauge line.
 */
function ComboBadgeLine({ row }: { row: RowBadge | null }) {
  if (!row) return null;
  return (
    <p
      data-slot="combo-badge"
      data-above-target={row.aboveTarget ? "" : undefined}
      className="text-muted-foreground mt-0.5 flex items-baseline gap-1 text-xs"
    >
      <GaugeIcon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
      <span>
        {row.badge.words} — {row.badge.source}
        {row.aboveTarget && (
          <>
            {" · "}
            <span className="text-amber-700 dark:text-amber-400">
              {BRACKET_COPY.aboveTargetInline}
            </span>
          </>
        )}
      </span>
    </p>
  );
}

/** "Suggest full list" (X3): the same small outline button on every kind of combo row. */
function SuggestButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button size="xs" variant="outline" disabled={busy} title={SUGGEST_TITLE} onClick={onClick}>
      {SUGGEST_LABEL}
    </Button>
  );
}

/** One commander combo (W9c): pieces with in-deck ✓s, evidence tail, the two doors. */
function LeaderComboRow({
  combo,
  inDeckQty,
  externalUrl,
  pending,
  busy,
  onAddPieces,
  onSuggest,
}: {
  combo: ComboView;
  inDeckQty: ReadonlyMap<string, number>;
  externalUrl: (externalKey: string) => string;
  /** This row's pieces are resolving. */
  pending: boolean;
  /** ANY row is resolving — one in-flight resolve at a time. */
  busy: boolean;
  onAddPieces: () => void;
  onSuggest?: () => void;
}) {
  const missing = combo.pieces.filter((p) => (inDeckQty.get(p.id) ?? 0) === 0).length;
  return (
    <li className="rounded-lg border px-2.5 py-2">
      <p className="min-w-0 text-sm leading-relaxed font-medium">
        <PieceNames pieces={combo.pieces} inDeck={(id) => (inDeckQty.get(id) ?? 0) > 0} />
      </p>
      <ComboRowDetails combo={combo} externalUrl={externalUrl} />
      <div className="mt-1.5 flex items-center gap-2">
        {missing > 0 ? (
          <Button size="xs" variant="secondary" disabled={busy} onClick={onAddPieces}>
            {pending ? "Adding…" : `Add ${missing} piece${missing === 1 ? "" : "s"}`}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">All pieces in deck ✓</span>
        )}
        {onSuggest && <SuggestButton busy={busy} onClick={onSuggest} />}
      </div>
    </li>
  );
}

function InDeckComboRow({
  combo,
  badge,
  externalUrl,
  busy,
  onSuggest,
}: {
  combo: DeckComboView;
  badge: RowBadge | null;
  externalUrl: (externalKey: string) => string;
  /** ANY combo row is resolving — one in-flight resolve at a time. */
  busy: boolean;
  onSuggest?: () => void;
}) {
  const complete = deckComboStatus(combo) === "complete";
  return (
    <li className="rounded-lg border px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm leading-relaxed font-medium">
          <PieceNames pieces={combo.inDeckPieces} />
        </p>
        <span
          className={`mt-0.5 shrink-0 rounded-full border px-1.5 text-xs leading-4 ${
            complete
              ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
              : "border-amber-600/40 text-amber-700 dark:text-amber-400"
          }`}
        >
          {complete ? "complete" : "incomplete"}
        </span>
      </div>
      <ComboBadgeLine row={badge} />
      <ComboRowDetails combo={combo} externalUrl={externalUrl} />
      {onSuggest && (
        <div className="mt-1.5 flex items-center gap-2">
          <SuggestButton busy={busy} onClick={onSuggest} />
        </div>
      )}
    </li>
  );
}

function OneAwayComboRow({
  combo,
  badge,
  externalUrl,
  inDeck,
  pending,
  onAdd,
  busy,
  suggestPending,
  onSuggest,
}: {
  combo: DeckComboView;
  badge: RowBadge | null;
  externalUrl: (externalKey: string) => string;
  inDeck: boolean;
  pending: boolean;
  onAdd: () => void;
  /** ANY combo row is resolving — one in-flight resolve at a time. */
  busy: boolean;
  /** This row's missing piece is resolving for "Suggest full list". */
  suggestPending: boolean;
  onSuggest?: () => void;
}) {
  const target = combo.missingPieces[0];
  if (!target) return null;
  return (
    <li className="rounded-lg border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          <Link href={`/cards/${target.id}`} target="_blank" className="hover:underline">
            {target.name}
          </Link>
        </span>
        {inDeck ? (
          <span className="text-muted-foreground shrink-0 text-xs">In deck ✓</span>
        ) : (
          <Button
            size="xs"
            variant="secondary"
            disabled={pending}
            aria-label={`Add ${target.name} to the deck`}
            onClick={onAdd}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed">
        <span className="text-muted-foreground">with </span>
        <PieceNames pieces={combo.inDeckPieces} />
      </p>
      <ComboBadgeLine row={badge} />
      <ComboRowDetails combo={combo} externalUrl={externalUrl} />
      {onSuggest && (
        <div className="mt-1.5 flex items-center gap-2">
          <SuggestButton busy={busy} onClick={onSuggest} />
          {suggestPending && <span className="text-muted-foreground text-xs">Adding…</span>}
        </div>
      )}
    </li>
  );
}

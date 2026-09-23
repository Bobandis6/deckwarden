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
 * "With your commander" (W9c): the leader's own most-played combos off
 * GET /api/cards/[id]/combos?fit= — fetched once per leader change (the
 * useLeaderArt discipline: keyed on (anchor, fit), aborted when stale), so
 * it works in a seeded DRAFT with no deck row and adds no per-edit request.
 * "In deck" marks are computed client-side from inDeckQty. "Add N pieces"
 * hydrates every missing piece in ONE resolve call by externalKey (pass 0)
 * and lands ONE toast; "Build around" does the same add quietly and opens
 * the autofill sheet — the pieces ride into the plan as normal main-zone
 * entries (keeps), per the W9b sheet contract. No "Combo piece" tag on the
 * seeded entries — the sheet doesn't render tags, so the label would be
 * invisible state (disclosed W9c decision).
 */
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useResolvedAdd } from "@/components/editor/use-resolved-add";
import { toast } from "@/components/ui/toast";
import type { ComboPieceRef, ComboView, DeckComboView } from "@/lib/combos/queries";
import { alsoNeedsLine, deckComboStatus, orderDeckCombos } from "@/lib/combos/view";
import { toEditorCard, type CardWire, type EditorCard } from "@/lib/decks/editor-state";
import { deckStateKey, hasLeader } from "@/lib/decks/panel-view";
import { getDeckToken } from "@/lib/decks/token-store";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Commander combos shown (W9c) — the API returns its top 10; the panel keeps the densest slice. */
const LEADER_COMBOS_SHOWN = 5;

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
  /** Quiet add to the main zone via the editor's own edit path. */
  onAdd: (card: EditorCard) => string | undefined;
  /**
   * "Build around" door (W9c) — opens the autofill review sheet. Passed only
   * when the adapter declares recommend.autofill (the every-door gate); the
   * button doesn't render without it.
   */
  onOpenAutofill?: () => void;
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
  onOpenAutofill,
}: ComboRadarPanelProps) {
  const [data, setData] = useState<RadarData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Force-refetch counter (Refresh button / error retry) — part of the key.
  const [nonce, setNonce] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  const { pendingAdd, notice, add } = useResolvedAdd(adapter, format, onAdd);

  const combosMeta = adapter.capabilities.combos;
  const leader = hasLeader(entries, format);
  const fetchKey = `${deckStateKey(entries)}§n:${nonce}`;

  // "With your commander" (W9c): keyed on (anchor, fit) only — a deck edit
  // never refetches; a leader swap or a partner landing (fit widens) does.
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  const leaderEntries = leaderZone ? entries.filter((e) => e.zone === leaderZone.id) : [];
  const anchorId = leaderEntries[0]?.cardId ?? null;
  const fitMask = leaderEntries.reduce((m, e) => m | (cards.get(e.cardId)?.ciMask ?? 0), 0);
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

  /** Shared by both buttons: add the missing pieces, then toast OR open the sheet. */
  const addComboPieces = async (combo: ComboView, openSheet: boolean) => {
    if (pendingCombo !== null) return;
    setPendingCombo(combo.id);
    try {
      const missing = combo.pieces.filter((p) => (inDeckQty.get(p.id) ?? 0) === 0);
      const added = missing.length > 0 ? await hydratePieces(missing) : [];
      const errors = added.map((card) => onAdd(card)).filter((e): e is string => Boolean(e));
      if (openSheet) {
        // Build around: whatever landed rides into the plan as keeps — the
        // sheet opening is the feedback, no toast on top.
        onOpenAutofill?.();
        return;
      }
      if (errors.length > 0) {
        toast.add({ title: errors[0], type: "error" });
      } else {
        toast.add({
          title: `Added ${added.length} combo piece${added.length === 1 ? "" : "s"}`,
          type: "success",
        });
      }
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

      {/* With your commander (W9c): the leader's own most-played lines —
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
                    onBuildAround={
                      onOpenAutofill ? () => void addComboPieces(combo, true) : undefined
                    }
                  />
                ))}
              </ul>
              {leaderCombos.total > Math.min(leaderCombos.combos.length, LEADER_COMBOS_SHOWN) && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Showing the {Math.min(leaderCombos.combos.length, LEADER_COMBOS_SHOWN)}{" "}
                  most-played of {fmt(leaderCombos.total)}.
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
                        externalUrl={combosMeta.externalUrl}
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
                        externalUrl={combosMeta.externalUrl}
                        inDeck={(inDeckQty.get(combo.missingPieces[0]?.id ?? "") ?? 0) > 0}
                        pending={pendingAdd === combo.missingPieces[0]?.id}
                        onAdd={() => {
                          const target = combo.missingPieces[0];
                          if (target) void add({ cardId: target.id, name: target.name });
                        }}
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
            {data.truncated ? " Scan capped at the most-played matches for this deck." : ""}
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

/** One commander combo (W9c): pieces with in-deck ✓s, evidence tail, the two doors. */
function LeaderComboRow({
  combo,
  inDeckQty,
  externalUrl,
  pending,
  busy,
  onAddPieces,
  onBuildAround,
}: {
  combo: ComboView;
  inDeckQty: ReadonlyMap<string, number>;
  externalUrl: (externalKey: string) => string;
  /** This row's pieces are resolving. */
  pending: boolean;
  /** ANY row is resolving — one in-flight resolve at a time. */
  busy: boolean;
  onAddPieces: () => void;
  onBuildAround?: () => void;
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
        {onBuildAround && (
          <Button size="xs" variant="outline" disabled={busy} onClick={onBuildAround}>
            Build around
          </Button>
        )}
      </div>
    </li>
  );
}

function InDeckComboRow({
  combo,
  externalUrl,
}: {
  combo: DeckComboView;
  externalUrl: (externalKey: string) => string;
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
      <ComboRowDetails combo={combo} externalUrl={externalUrl} />
    </li>
  );
}

function OneAwayComboRow({
  combo,
  externalUrl,
  inDeck,
  pending,
  onAdd,
}: {
  combo: DeckComboView;
  externalUrl: (externalKey: string) => string;
  inDeck: boolean;
  pending: boolean;
  onAdd: () => void;
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
      <ComboRowDetails combo={combo} externalUrl={externalUrl} />
    </li>
  );
}

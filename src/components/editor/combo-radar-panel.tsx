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
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useResolvedAdd } from "@/components/editor/use-resolved-add";
import type { DeckComboView } from "@/lib/combos/queries";
import { alsoNeedsLine, deckComboStatus, orderDeckCombos } from "@/lib/combos/view";
import type { EditorCard } from "@/lib/decks/editor-state";
import { deckStateKey, hasLeader } from "@/lib/decks/panel-view";
import { getDeckToken } from "@/lib/decks/token-store";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

const fmt = (n: number) => n.toLocaleString("en-US");

interface RadarData {
  inDeck: DeckComboView[];
  oneAway: DeckComboView[];
  truncated: boolean;
}

interface ComboRadarPanelProps {
  adapter: GameAdapter;
  format: FormatDef;
  /** Live deck id — null until draft mode's first autosave creates the row. */
  deckId: string | null;
  entries: readonly { cardId: string; zone: string; qty: number }[];
  /** Copies already in the deck — flips Add to "In deck ✓" pre-refetch. */
  inDeckQty: ReadonlyMap<string, number>;
  saveStatus: "saved" | "dirty" | "saving" | "error";
  /** Tab visibility: no fetching (lazy) and no work while hidden. */
  active: boolean;
  /** Quiet add to the main zone via the editor's own edit path. */
  onAdd: (card: EditorCard) => string | undefined;
}

export function ComboRadarPanel({
  adapter,
  format,
  deckId,
  entries,
  inDeckQty,
  saveStatus,
  active,
  onAdd,
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
              Combos and deck counts from {combosMeta.sourceLabel} ↗
            </a>{" "}
            — detection covers combos with recorded play there, plus unranked new ones.
            {data.truncated ? " Scan capped at the most-played matches for this deck." : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Piece names joined with + — combo-list.tsx's convention, editor-safe links. */
function PieceNames({ pieces }: { pieces: { id: string; name: string }[] }) {
  return (
    <>
      {pieces.map((piece, i) => (
        <span key={piece.id}>
          {i > 0 && <span className="text-muted-foreground font-normal"> + </span>}
          <Link href={`/cards/${piece.id}`} target="_blank" className="hover:underline">
            {piece.name}
          </Link>
        </span>
      ))}
    </>
  );
}

/** Shared tail: open templates, results, play count + walkthrough link. */
function ComboRowDetails({
  combo,
  externalUrl,
}: {
  combo: DeckComboView;
  externalUrl: (externalKey: string) => string;
}) {
  const needs = alsoNeedsLine(combo.templates);
  return (
    <>
      {needs && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{needs}</p>}
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
          How it works ↗
        </a>
      </p>
    </>
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
              ? "border-emerald-600/40 text-emerald-600 dark:text-emerald-400"
              : "border-amber-600/40 text-amber-600 dark:text-amber-400"
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

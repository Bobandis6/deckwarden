"use client";

/**
 * History dialog (P3.6): the deck-level versioning surface, opened from the
 * editor header (versioning is a deck concern, not a fourth right-pane tab).
 *
 *   - Save version: freeze the live list under a note. Shows n / cap and
 *     says so when the cap is hit — nothing is evicted behind the user.
 *   - Versions list: note, date, card count; Compare (diff to the live
 *     list, via the pure diff), Restore (confirmed; the editor flushes
 *     pending edits first and re-hydrates after), Delete (confirmed).
 *   - Upstream (forks only): the credit line plus "their changes since you
 *     forked" (baseline v1 -> upstream's current list) and "your changes
 *     since forking" (baseline v1 -> live list).
 *
 * All requests carry the editor's ownership proof (claim token header when
 * this browser holds one, else the session cookie).
 */
import { useCallback, useEffect, useState } from "react";

import { DeckDiffView } from "@/components/deck/deck-diff-view";
import { ForkCreditLine } from "@/components/deck/fork-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { diffDeckLists, type DeckDiff, type FrozenCard } from "@/lib/decks/diff";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { ForkCredit } from "@/lib/decks/fork-credit";
import { getDeckToken } from "@/lib/decks/token-store";
import type { FormatDef } from "@/lib/games/types";

interface VersionSummary {
  version: number;
  note: string | null;
  createdAt: string;
  cardCount: number;
}

interface VersionsResponse {
  versions: VersionSummary[];
  currentVersion: number;
  cap: number;
}

interface VersionDetail extends VersionSummary {
  cards: FrozenCard[];
  names: Record<string, string>;
}

interface UpstreamResponse {
  credit: ForkCredit | null;
  baseline: FrozenCard[] | null;
  baselineNote: string | null;
  upstream: FrozenCard[] | null;
  names: Record<string, string>;
}

export interface RestoreOutcome {
  restoredVersion: number;
  safetyVersion: number;
  count: number;
  printingsReset: number;
  cardsDropped: number;
}

function authHeaders(deckId: string): Record<string, string> {
  const token = getDeckToken(deckId);
  return { "Content-Type": "application/json", ...(token ? { "x-deck-token": token } : {}) };
}

function toFrozen(entries: readonly EditorEntry[]): FrozenCard[] {
  return entries.map((e) => ({
    cardId: e.cardId,
    zone: e.zone,
    qty: e.qty,
    tags: e.tags,
    printingId: e.printingId ?? null,
  }));
}

function versionLabel(v: VersionSummary): string {
  return v.note?.trim() ? v.note : `Version ${v.version}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HistoryDialog({
  deckId,
  format,
  entries,
  cards,
  forkedFrom,
  onBeforeRestore,
  onRestored,
  onClose,
}: {
  deckId: string;
  format: FormatDef;
  /** The live list (in-memory truth) — the "now" side of every comparison. */
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  forkedFrom: ForkCredit | null;
  /** Flush pending autosaves so the safety snapshot captures what's on screen. */
  onBeforeRestore: () => Promise<void>;
  /** Re-hydrate the editor from the server after a restore. */
  onRestored: (outcome: RestoreOutcome) => Promise<void>;
  onClose: () => void;
}) {
  const [list, setList] = useState<VersionsResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<{
    version: number;
    label: string;
    diff: DeckDiff;
    names: Record<string, string>;
  } | null>(null);
  const [upstream, setUpstream] = useState<UpstreamResponse | null>(null);

  const liveNames = useCallback(
    (extra: Record<string, string>): Record<string, string> => {
      const merged: Record<string, string> = { ...extra };
      for (const [id, card] of cards) merged[id] = card.name;
      return merged;
    },
    [cards],
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/decks/${deckId}/versions`, {
      headers: authHeaders(deckId),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Couldn't load versions (${res.status}).`);
    setList((await res.json()) as VersionsResponse);
  }, [deckId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      }
    })();
    if (forkedFrom) {
      void (async () => {
        try {
          const res = await fetch(`/api/decks/${deckId}/upstream`, {
            headers: authHeaders(deckId),
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`Couldn't load the upstream deck (${res.status}).`);
          const json = (await res.json()) as UpstreamResponse;
          if (!cancelled) setUpstream(json);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [deckId, forkedFrom, refresh]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveVersion = () =>
    run(async () => {
      const res = await fetch(`/api/decks/${deckId}/versions`, {
        method: "POST",
        headers: authHeaders(deckId),
        body: JSON.stringify({ note: note.trim() }),
      });
      if (res.status === 409) {
        const json = (await res.json()) as { error: string };
        throw new Error(json.error);
      }
      if (!res.ok) throw new Error(`Couldn't save the version (${res.status}).`);
      const saved = (await res.json()) as { version: number; cardCount: number };
      setNote("");
      setStatus(`Saved version ${saved.version} (${saved.cardCount} cards).`);
      await refresh();
    });

  const compareVersion = (v: VersionSummary) =>
    run(async () => {
      const res = await fetch(`/api/decks/${deckId}/versions/${v.version}`, {
        headers: authHeaders(deckId),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Couldn't load version ${v.version} (${res.status}).`);
      const detail = (await res.json()) as VersionDetail;
      setCompare({
        version: v.version,
        label: versionLabel(v),
        diff: diffDeckLists(detail.cards, toFrozen(entries)),
        names: liveNames(detail.names),
      });
    });

  const restoreVersion = (v: VersionSummary) =>
    run(async () => {
      if (
        !window.confirm(
          `Restore “${versionLabel(v)}”? The current list is saved as a new version first, so this can be undone.`,
        )
      ) {
        return;
      }
      await onBeforeRestore();
      const res = await fetch(`/api/decks/${deckId}/versions/${v.version}/restore`, {
        method: "POST",
        headers: authHeaders(deckId),
      });
      if (res.status === 409 || res.status === 422) {
        const json = (await res.json()) as { error: string };
        throw new Error(json.error);
      }
      if (!res.ok) throw new Error(`Couldn't restore (${res.status}).`);
      const outcome = (await res.json()) as RestoreOutcome;
      const notes: string[] = [
        `Restored version ${outcome.restoredVersion}; the previous list is version ${outcome.safetyVersion}.`,
      ];
      if (outcome.printingsReset > 0) {
        notes.push(
          `${outcome.printingsReset} chosen printing${outcome.printingsReset === 1 ? "" : "s"} no longer exist and fell back to the default printing.`,
        );
      }
      if (outcome.cardsDropped > 0) {
        notes.push(
          `${outcome.cardsDropped} card${outcome.cardsDropped === 1 ? "" : "s"} no longer exist in the card database and could not be restored.`,
        );
      }
      setStatus(notes.join(" "));
      setCompare(null);
      await refresh();
      await onRestored(outcome);
    });

  const deleteVersion = (v: VersionSummary) =>
    run(async () => {
      if (!window.confirm(`Delete “${versionLabel(v)}”? This can't be undone.`)) return;
      const res = await fetch(`/api/decks/${deckId}/versions/${v.version}`, {
        method: "DELETE",
        headers: authHeaders(deckId),
      });
      if (!res.ok && res.status !== 204) throw new Error(`Couldn't delete (${res.status}).`);
      if (compare?.version === v.version) setCompare(null);
      setStatus(`Deleted version ${v.version}.`);
      await refresh();
    });

  const atCap = list !== null && list.versions.length >= list.cap;
  const live = toFrozen(entries);

  return (
    <Modal label="Deck history" onClose={onClose} wide>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void saveVersion();
        }}
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          disabled={busy || atCap}
          aria-label="Version note"
          placeholder="Note for this version (e.g. “post-FNM cuts”)"
          className="border-input focus-visible:ring-ring/50 min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-2"
        />
        <Button type="submit" size="sm" disabled={busy || atCap || list === null}>
          Save version
        </Button>
        {list && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {list.versions.length} / {list.cap}
          </span>
        )}
      </form>
      {atCap && (
        <p className="text-destructive text-xs">
          This deck has reached the {list?.cap}-version limit. Delete an old version to save or
          restore.
        </p>
      )}
      {status && (
        <p aria-live="polite" className="text-xs">
          {status}
        </p>
      )}
      {error && (
        <p aria-live="polite" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <section>
        <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
          Versions
        </h3>
        {listError ? (
          <p className="text-destructive mt-2 text-xs">{listError}</p>
        ) : list === null ? (
          <p className="text-muted-foreground mt-2 text-xs">Loading…</p>
        ) : list.versions.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            No versions yet. Save one to mark a milestone you can compare against or restore later.
          </p>
        ) : (
          <ul className="mt-1 divide-y">
            {list.versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium break-words">{versionLabel(v)}</span>
                  <span className="text-muted-foreground block text-xs">
                    v{v.version} · {dateLabel(v.createdAt)} ·{" "}
                    <span className="tabular-nums">{v.cardCount}</span> cards
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy}
                    aria-pressed={compare?.version === v.version}
                    onClick={() => void compareVersion(v)}
                  >
                    Compare
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy || atCap}
                    onClick={() => void restoreVersion(v)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    aria-label={`Delete version ${v.version}`}
                    onClick={() => void deleteVersion(v)}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {compare && (
        <section>
          <div className="flex items-baseline justify-between border-b pb-1">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {compare.label} → now
            </h3>
            <Button variant="ghost" size="xs" onClick={() => setCompare(null)}>
              Close
            </Button>
          </div>
          <div className="mt-2">
            <DeckDiffView
              diff={compare.diff}
              names={compare.names}
              format={format}
              emptyLabel="No card changes since this version (tags and printings aren't compared)."
            />
          </div>
        </section>
      )}

      {forkedFrom && (
        <section>
          <h3 className="text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase">
            Upstream
          </h3>
          <p className="mt-2">
            <ForkCreditLine credit={forkedFrom} className="text-sm" />
          </p>
          {upstream === null ? (
            <p className="text-muted-foreground mt-2 text-xs">Loading…</p>
          ) : upstream.baseline === null ? (
            <p className="text-muted-foreground mt-2 text-xs">
              The fork baseline (version 1, the upstream list at fork time) was deleted, so changes
              since forking can’t be shown.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <div>
                <h4 className="text-xs font-medium">Their changes since you forked</h4>
                <div className="mt-1">
                  {upstream.upstream === null ? (
                    <p className="text-muted-foreground text-xs">
                      The upstream deck is private now, so its current list can’t be shown.
                    </p>
                  ) : (
                    <DeckDiffView
                      diff={diffDeckLists(upstream.baseline, upstream.upstream)}
                      names={upstream.names}
                      format={format}
                      emptyLabel="The upstream list hasn't changed since you forked."
                    />
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium">Your changes since forking</h4>
                <div className="mt-1">
                  <DeckDiffView
                    diff={diffDeckLists(upstream.baseline, live)}
                    names={liveNames(upstream.names)}
                    format={format}
                    emptyLabel="You haven't changed the list since forking."
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </Modal>
  );
}

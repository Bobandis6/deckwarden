"use client";

/**
 * Collection import on /account (P3.7): pick a ManaBox or Moxfield CSV →
 * parse in the browser (src/lib/collection/parse.ts — pure, so the smoke
 * and this component share one parser and no file ever needs a real
 * <input type=file> to be exercised) → preview every count (rows, rejects
 * with line numbers, skipped proxies, unknown finishes) → choose merge or
 * replace → POST typed rows → render the server's report (matched-by
 * counts, unresolved list with reasons, finish adjustments, cap notice).
 * Only printing + finish + quantity leave the browser; purchase prices,
 * conditions, languages and binder names never do (the privacy page says
 * so). The wipe is a confirmed action; re-importing the file undoes it.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  formatRejects,
  parseCollectionCsv,
  REJECT_LABELS,
  type ParseResult,
} from "@/lib/collection/parse";
import { foldRows } from "@/lib/collection/plan";
import {
  COLLECTION_LIMITS,
  type CollectionRow,
  type CollectionSummary,
  type ImportMode,
  type ImportReport,
  type UnresolvedReason,
} from "@/lib/collection/types";

const FORMAT_LABEL = { manabox: "ManaBox", moxfield: "Moxfield" } as const;

const UNRESOLVED_LABELS: Record<UnresolvedReason, string> = {
  "unknown-scryfall-id": "Scryfall ID not in our card data",
  "unknown-set-number": "set + collector number not found",
  "unknown-name": "card name not found",
  "no-key": "nothing to match on",
};

interface Prepared {
  fileName: string;
  parsed: ParseResult;
  /** Folded rows, capped to the per-request limit — what gets POSTed. */
  rows: CollectionRow[];
  merged: number;
  /** Folded rows beyond COLLECTION_LIMITS.rowsPerImport, not sent. */
  overflow: number;
}

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CollectionImport({ summary: initial }: { summary: CollectionSummary }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File | undefined) => {
    setReport(null);
    setError(null);
    setPrepared(null);
    setParseError(null);
    if (!file) return;
    const text = await file.text();
    const outcome = parseCollectionCsv(text);
    if (!outcome.ok) {
      setParseError(
        outcome.header.length > 0
          ? `${outcome.error} Header seen: ${outcome.header.slice(0, 8).join(", ")}${outcome.header.length > 8 ? ", …" : ""}`
          : outcome.error,
      );
      return;
    }
    const folded = foldRows(outcome.result.rows);
    const rows: CollectionRow[] = folded.rows
      .slice(0, COLLECTION_LIMITS.rowsPerImport)
      .map((r) => ({
        name: r.name,
        finish: r.finish,
        quantity: r.quantity,
        ...(r.scryfallId ? { scryfallId: r.scryfallId } : {}),
        ...(r.setCode ? { setCode: r.setCode } : {}),
        ...(r.collectorNumber ? { collectorNumber: r.collectorNumber } : {}),
      }));
    setPrepared({
      fileName: file.name,
      parsed: outcome.result,
      rows,
      merged: folded.merged,
      overflow: Math.max(0, folded.rows.length - rows.length),
    });
  };

  const runImport = async () => {
    if (!prepared || prepared.rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: prepared.rows, mode }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json && typeof json === "object" && "error" in json ? String(json.error) : null;
        throw new Error(
          res.status === 429
            ? "Imports are limited to 10 per hour — try again later."
            : (message ?? `Import failed (${res.status})`),
        );
      }
      const result = json as ImportReport;
      setReport(result);
      setSummary(result.summary);
      setPrepared(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runWipe = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collection", { method: "DELETE" });
      if (!res.ok) throw new Error(`Couldn't delete the collection (${res.status})`);
      setSummary({ rows: 0, printings: 0, identities: 0, updatedAt: null });
      setReport(null);
      setConfirmWipe(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const updated = dateLabel(summary.updatedAt);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" data-testid="collection-summary">
          {summary.rows === 0 ? (
            <>
              <span className="font-medium">No collection imported yet.</span>{" "}
              <span className="text-muted-foreground">
                Import a ManaBox or Moxfield CSV export to see which cards you own in the deck
                builder and on shared decks.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums">
                {summary.identities.toLocaleString("en-US")} cards
              </span>{" "}
              <span className="text-muted-foreground tabular-nums">
                · {summary.printings.toLocaleString("en-US")} printings ·{" "}
                {summary.rows.toLocaleString("en-US")} rows
                {updated ? ` · updated ${updated}` : ""}
              </span>
            </>
          )}
        </p>
        {summary.rows > 0 && (
          <Button
            variant="outline"
            size="xs"
            className="text-destructive shrink-0"
            disabled={busy}
            onClick={() => setConfirmWipe(true)}
          >
            Delete collection…
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          aria-label="Collection CSV export"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="text-sm file:mr-2 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-xs"
        />
        <span className="text-muted-foreground text-xs">
          ManaBox: Collection → Export → CSV. Moxfield: Collection → Export → CSV. Only printing,
          finish and quantity are uploaded.
        </span>
      </div>

      {parseError && (
        <p className="text-destructive text-sm" role="alert">
          {parseError}
        </p>
      )}

      {prepared && (
        <div className="space-y-2 rounded-md border border-dashed p-2 text-sm">
          <p>
            <span className="font-medium">{FORMAT_LABEL[prepared.parsed.format]} export</span>{" "}
            <span className="text-muted-foreground">({prepared.fileName})</span> —{" "}
            <span className="tabular-nums">
              {prepared.parsed.lineCount.toLocaleString("en-US")} lines →{" "}
              {prepared.rows.length.toLocaleString("en-US")} printings to import
            </span>
            {prepared.merged > 0 && (
              <span className="text-muted-foreground">
                {" "}
                ({prepared.merged.toLocaleString("en-US")} duplicate lines summed)
              </span>
            )}
          </p>
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {prepared.parsed.rejects.length > 0 && (
              <li>
                <details>
                  <summary className="cursor-pointer">
                    {prepared.parsed.rejects.length} line
                    {prepared.parsed.rejects.length === 1 ? "" : "s"} skipped (unreadable)
                  </summary>
                  <ul className="mt-1 ml-3 list-disc space-y-0.5">
                    {prepared.parsed.rejects.slice(0, 20).map((r) => (
                      <li key={r.line}>
                        line {r.line} — {REJECT_LABELS[r.reason]}:{" "}
                        <span className="font-mono">{r.text.slice(0, 80)}</span>
                      </li>
                    ))}
                    {prepared.parsed.rejects.length > 20 && (
                      <li>…and {prepared.parsed.rejects.length - 20} more</li>
                    )}
                  </ul>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="mt-1"
                    onClick={() => void copy("rejects", formatRejects(prepared.parsed.rejects))}
                  >
                    {copied === "rejects" ? "Copied ✓" : "Copy skipped lines"}
                  </Button>
                </details>
              </li>
            )}
            {prepared.parsed.proxiesSkipped > 0 && (
              <li>
                {prepared.parsed.proxiesSkipped} proxy line(s) skipped — proxies aren’t owned cards.
              </li>
            )}
            {prepared.parsed.unknownFinishes.count > 0 && (
              <li>
                {prepared.parsed.unknownFinishes.count} line(s) with an unrecognized finish (
                {prepared.parsed.unknownFinishes.examples.map((e) => `“${e}”`).join(", ")}) will
                import as non-foil.
              </li>
            )}
            {prepared.parsed.quantityClamped > 0 && (
              <li>
                {prepared.parsed.quantityClamped} quantity value(s) above{" "}
                {COLLECTION_LIMITS.maxQuantity.toLocaleString("en-US")} were clamped.
              </li>
            )}
            {prepared.overflow > 0 && (
              <li className="text-destructive">
                This file has more than {COLLECTION_LIMITS.rowsPerImport.toLocaleString("en-US")}{" "}
                distinct printings — only the first{" "}
                {COLLECTION_LIMITS.rowsPerImport.toLocaleString("en-US")} will be sent (
                {prepared.overflow.toLocaleString("en-US")} left out).
              </li>
            )}
          </ul>
          <fieldset className="space-y-1 text-xs">
            <legend className="sr-only">Import mode</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="collection-mode"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
                disabled={busy}
              />
              <span>
                <span className="font-medium">Merge</span> — update quantities from this file; cards
                not in the file stay as they are. Re-importing a fresh export never double counts.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="collection-mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                disabled={busy}
              />
              <span>
                <span className="font-medium">Replace</span> — delete my current collection first;
                this file becomes the whole collection.
              </span>
            </label>
          </fieldset>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || prepared.rows.length === 0}
              onClick={() => void runImport()}
              data-testid="collection-import-button"
            >
              {busy
                ? "Importing…"
                : `Import ${prepared.rows.length.toLocaleString("en-US")} printing${prepared.rows.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="space-y-1 rounded-md border p-2 text-sm" data-testid="collection-report">
          <p className="font-medium">
            Imported{report.mode === "replace" ? " (replaced)" : ""}:{" "}
            <span className="tabular-nums">
              {report.inserted.toLocaleString("en-US")} new ·{" "}
              {report.updated.toLocaleString("en-US")} updated
              {report.deleted > 0
                ? ` · ${report.deleted.toLocaleString("en-US")} removed first`
                : ""}
            </span>
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            Matched {report.resolved.toLocaleString("en-US")} of{" "}
            {report.received.toLocaleString("en-US")} rows — by Scryfall ID{" "}
            {report.resolvedBy.scryfallId.toLocaleString("en-US")}, by set + number{" "}
            {report.resolvedBy.setNumber.toLocaleString("en-US")}, by name{" "}
            {report.resolvedBy.name.toLocaleString("en-US")}.
            {report.merged > 0 ? ` ${report.merged} rows folded into the same printing.` : ""}
            {report.finishAdjusted > 0
              ? ` ${report.finishAdjusted} stored under a finish the printing actually comes in.`
              : ""}
          </p>
          {report.capped && (
            <p className="text-destructive text-xs">
              Collection cap reached ({report.capped.limit.toLocaleString("en-US")} printings) —{" "}
              {report.capped.dropped.toLocaleString("en-US")} new printings were not imported.
            </p>
          )}
          {report.unresolvedTotal > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                {report.unresolvedTotal.toLocaleString("en-US")} row
                {report.unresolvedTotal === 1 ? "" : "s"} couldn’t be matched to a card
              </summary>
              <ul className="mt-1 ml-3 list-disc space-y-0.5">
                {report.unresolved.slice(0, 50).map((u) => (
                  <li key={u.index}>
                    {u.name}
                    {u.setCode
                      ? ` (${u.setCode.toUpperCase()}${u.collectorNumber ? ` ${u.collectorNumber}` : ""})`
                      : ""}{" "}
                    — {UNRESOLVED_LABELS[u.reason]}
                  </li>
                ))}
                {report.unresolvedTotal > 50 && (
                  <li>
                    …and {report.unresolvedTotal - 50} more
                    {report.unresolvedTotal > report.unresolved.length
                      ? ` (list shows the first ${report.unresolved.length})`
                      : ""}
                  </li>
                )}
              </ul>
              <Button
                variant="ghost"
                size="xs"
                className="mt-1"
                onClick={() =>
                  void copy(
                    "unresolved",
                    report.unresolved
                      .map(
                        (u) =>
                          `${u.name}${u.setCode ? ` (${u.setCode.toUpperCase()}${u.collectorNumber ? ` ${u.collectorNumber}` : ""})` : ""}${u.scryfallId ? ` ${u.scryfallId}` : ""} — ${UNRESOLVED_LABELS[u.reason]}`,
                      )
                      .join("\n"),
                  )
                }
              >
                {copied === "unresolved" ? "Copied ✓" : "Copy unmatched rows"}
              </Button>
            </details>
          )}
        </div>
      )}

      {confirmWipe && (
        <Modal label="Delete collection" onClose={() => (busy ? null : setConfirmWipe(false))}>
          <p className="text-sm">
            This removes every imported card from your collection (
            {summary.rows.toLocaleString("en-US")} rows). Owned badges disappear until you import
            again. Your decks are untouched.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmWipe(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void runWipe()}>
              {busy ? "Deleting…" : "Delete collection"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

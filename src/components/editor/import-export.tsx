"use client";

/**
 * Import/export dialogs (P1.6). Import: paste → adapter.parseDecklist
 * (client, pure) → POST /api/cards/resolve → review unresolved lines with
 * clickable fuzzy suggestions → apply as add or replace (pure shaping in
 * src/lib/decks/import.ts). Export: adapter.serializeDecklist text + copy.
 * Game-ignorant: tokenizing and zone knowledge come off the adapter/format.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CardWire, EditorEntry } from "@/lib/decks/editor-state";
import {
  applyImport,
  buildImportItems,
  type ImportItem,
  type ImportOutcome,
  type Resolution,
} from "@/lib/decks/import";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

interface ImportDialogProps {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly EditorEntry[];
  onApply: (outcome: ImportOutcome) => void;
  onClose: () => void;
}

type ImportStep =
  | { step: "paste" }
  | { step: "review"; items: ImportItem[]; parseWarnings: string[] }
  | { step: "done"; outcome: ImportOutcome };

export function ImportDialog({ adapter, format, entries, onApply, onClose }: ImportDialogProps) {
  const [text, setText] = useState("");
  const [state, setState] = useState<ImportStep>({ step: "paste" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const parse = async () => {
    setError(null);
    const { lines, warnings } = adapter.parseDecklist(text);
    if (lines.length === 0) {
      setError(warnings[0] ?? "Nothing to import — paste a decklist first.");
      return;
    }
    setBusy(true);
    try {
      const names = [...new Set(lines.map((l) => l.rawName))];
      const res = await fetch("/api/cards/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: adapter.id, format: format.code, names }),
      });
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const json: { results: Resolution[] } = await res.json();
      setState({
        step: "review",
        items: buildImportItems(format, lines, json.results),
        parseWarnings: warnings,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = (index: number, card: CardWire) => {
    setState((prev) =>
      prev.step === "review"
        ? {
            ...prev,
            items: prev.items.map((item, i) => (i === index ? { ...item, card } : item)),
          }
        : prev,
    );
  };

  const apply = (mode: "add" | "replace") => {
    if (state.step !== "review") return;
    const outcome = applyImport(entries, state.items, format, mode);
    onApply(outcome);
    if (outcome.warnings.length > 0) setState({ step: "done", outcome });
    else onClose();
  };

  if (state.step === "done") {
    return (
      <Modal label="Import decklist" onClose={onClose}>
        <p className="text-sm">
          Imported {state.outcome.entries.length} entr
          {state.outcome.entries.length === 1 ? "y" : "ies"} with {state.outcome.warnings.length}{" "}
          warning{state.outcome.warnings.length === 1 ? "" : "s"}:
        </p>
        <ul className="space-y-1 text-xs">
          {state.outcome.warnings.map((w, i) => (
            <li key={i} className="text-amber-600 dark:text-amber-400">
              {w}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  if (state.step === "review") {
    const unresolved = state.items.filter((i) => !i.card);
    const zoneless = state.items.filter((i) => i.card && !i.zone);
    const ready = state.items.filter((i) => i.card && i.zone);
    return (
      <Modal label="Import decklist" onClose={onClose}>
        <p className="text-muted-foreground text-xs">
          {ready.length} of {state.items.length} lines matched
          {zoneless.length > 0 &&
            ` · ${zoneless.length} in sections ${format.label} doesn't use (skipped)`}
        </p>

        {state.parseWarnings.length > 0 && (
          <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
            {state.parseWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        {unresolved.length > 0 && (
          <div>
            <h3 className="text-xs font-medium">Not found — pick a match or leave to skip:</h3>
            <ul className="mt-1 space-y-1.5">
              {state.items.map((item, index) =>
                item.card ? null : (
                  <li key={index} className="text-xs">
                    <span className="font-medium">
                      {item.line.qty > 1 ? `${item.line.qty}× ` : ""}
                      {item.line.rawName}
                    </span>
                    {item.suggestions.length > 0 ? (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {item.suggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => pick(index, s)}
                            className="bg-muted hover:bg-muted/70 rounded px-1.5 py-0.5 hover:underline"
                          >
                            {s.name}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground"> — no close matches</span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setState({ step: "paste" })}>
            Back
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={ready.length === 0}
            onClick={() => apply("replace")}
          >
            Replace deck
          </Button>
          <Button size="sm" disabled={ready.length === 0} onClick={() => apply("add")}>
            Add to deck
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label="Import decklist" onClose={onClose}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder={
          "1 Sol Ring\n1 Arcane Signet (AFC) 95\n…paste from Moxfield, Arena, Archidekt, anywhere."
        }
        aria-label="Decklist text"
        className="border-input focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-2"
      />
      {error && (
        <p aria-live="polite" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || text.trim() === ""} onClick={() => void parse()}>
          {busy ? "Looking up cards…" : "Next"}
        </Button>
      </div>
    </Modal>
  );
}

export function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal label="Export decklist" onClose={onClose}>
      <textarea
        readOnly
        value={text}
        rows={16}
        aria-label="Exported decklist"
        onFocus={(e) => e.currentTarget.select()}
        className="border-input w-full resize-y rounded-md border bg-transparent p-2 font-mono text-xs outline-none"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied ✓" : "Copy to clipboard"}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

/**
 * Renders a DeckDiff (P3.6, src/lib/decks/diff.ts): per zone, what was
 * added, removed, or changed in quantity, then moves between zones. Zone
 * labels come from the FormatDef here — the diff itself carries only zone
 * ids. Names come from the caller (frozen snapshots carry ids only); an id
 * the caller can't name renders as such rather than blank.
 */
import { diffSummary, isEmptyDiff, type DeckDiff } from "@/lib/decks/diff";
import type { FormatDef } from "@/lib/games/types";

export function DeckDiffView({
  diff,
  names,
  format,
  emptyLabel = "No card changes.",
}: {
  diff: DeckDiff;
  names: Readonly<Record<string, string>>;
  format: FormatDef;
  emptyLabel?: string;
}) {
  if (isEmptyDiff(diff)) {
    return <p className="text-muted-foreground text-xs">{emptyLabel}</p>;
  }
  const name = (id: string) => names[id] ?? "Unknown card";
  const zoneLabel = (id: string) => format.zones.find((z) => z.id === id)?.label ?? id;
  const zoneIds = [
    ...format.zones.map((z) => z.id),
    ...new Set(
      [...diff.added, ...diff.removed, ...diff.qtyChanged]
        .map((e) => e.zone)
        .filter((z) => !format.zones.some((f) => f.id === z)),
    ),
  ];

  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground text-xs">{diffSummary(diff)}</p>
      {zoneIds.map((zone) => {
        const added = diff.added.filter((e) => e.zone === zone);
        const removed = diff.removed.filter((e) => e.zone === zone);
        const qty = diff.qtyChanged.filter((e) => e.zone === zone);
        if (added.length + removed.length + qty.length === 0) return null;
        return (
          <section key={zone}>
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {zoneLabel(zone)}
            </h4>
            <ul className="mt-0.5 space-y-0.5">
              {added.map((e) => (
                <li key={`+${e.cardId}`} className="flex gap-2">
                  <span className="w-8 shrink-0 text-right font-mono text-emerald-700 tabular-nums">
                    +{e.qty}
                  </span>
                  <span className="min-w-0 break-words">{name(e.cardId)}</span>
                </li>
              ))}
              {removed.map((e) => (
                <li key={`-${e.cardId}`} className="flex gap-2">
                  <span className="text-destructive w-8 shrink-0 text-right font-mono tabular-nums">
                    -{e.qty}
                  </span>
                  <span className="min-w-0 break-words line-through">{name(e.cardId)}</span>
                </li>
              ))}
              {qty.map((e) => (
                <li key={`~${e.cardId}`} className="flex gap-2">
                  <span className="text-muted-foreground w-8 shrink-0 text-right font-mono tabular-nums">
                    {e.from}→{e.to}
                  </span>
                  <span className="min-w-0 break-words">{name(e.cardId)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {diff.moved.length > 0 && (
        <section>
          <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Moved
          </h4>
          <ul className="mt-0.5 space-y-0.5">
            {diff.moved.map((m) => (
              <li key={`${m.fromZone}>${m.toZone}:${m.cardId}`} className="flex gap-2">
                <span className="w-8 shrink-0 text-right font-mono tabular-nums">{m.qty}</span>
                <span className="min-w-0 break-words">
                  {name(m.cardId)}{" "}
                  <span className="text-muted-foreground text-xs">
                    {zoneLabel(m.fromZone)} → {zoneLabel(m.toZone)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

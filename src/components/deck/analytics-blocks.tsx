"use client";

/**
 * Generic analytics renderer (P1.5): draws the adapter contract's four
 * AnalyticsBlock kinds — histogram, breakdown, stat, table. Blocks are DATA
 * (build plan §3); this component knows nothing game-specific. Colors come
 * only from each bucket/slice's optional colorVar (a CSS custom property the
 * theme defines, e.g. --mana-u), falling back to the neutral chart color.
 * Plain CSS bars — no chart library. P1.7's share pages reuse AnalyticsBlocks
 * directly; AnalyticsPanel is the editor's collapsible wrapper around it.
 */
import { useState } from "react";

import type { AnalyticsBlock } from "@/lib/games/types";

function barColor(colorVar?: string): string {
  return colorVar ? `var(${colorVar})` : "var(--chart-2)";
}

function Histogram({ block }: { block: Extract<AnalyticsBlock, { kind: "histogram" }> }) {
  const max = Math.max(...block.buckets.map((b) => b.value), 1);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <div className="mt-1 flex items-stretch gap-1">
        {block.buckets.map((bucket) => (
          <div key={bucket.label} className="min-w-0 flex-1 text-center">
            <div className="text-muted-foreground text-[0.65rem] tabular-nums">
              {bucket.value > 0 ? bucket.value : " "}
            </div>
            <div className="border-border flex h-16 items-end border-b">
              <div
                className="w-full rounded-t-sm"
                style={{
                  // Nonzero buckets stay visible even next to a tall max.
                  height: bucket.value > 0 ? `${Math.max((bucket.value / max) * 100, 5)}%` : 0,
                  background: barColor(bucket.colorVar),
                }}
              />
            </div>
            <div className="text-muted-foreground mt-0.5 text-[0.65rem]">{bucket.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Breakdown({ block }: { block: Extract<AnalyticsBlock, { kind: "breakdown" }> }) {
  const max = Math.max(...block.slices.map((s) => s.value), 1);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <ul className="mt-1 space-y-1">
        {block.slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-20 shrink-0 truncate">{slice.label}</span>
            <span className="bg-muted h-2.5 flex-1 overflow-hidden rounded-sm">
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${(slice.value / max) * 100}%`,
                  background: barColor(slice.colorVar),
                }}
              />
            </span>
            <span className="w-7 shrink-0 text-right tabular-nums">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAT_TONE = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
} as const;

function Stat({ block }: { block: Extract<AnalyticsBlock, { kind: "stat" }> }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <p
        className={`text-sm font-semibold tabular-nums ${block.tone ? STAT_TONE[block.tone] : ""}`}
      >
        {block.value}
      </p>
      {block.hint && <p className="text-muted-foreground text-[0.65rem]">{block.hint}</p>}
    </div>
  );
}

function DataTable({ block }: { block: Extract<AnalyticsBlock, { kind: "table" }> }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left">
              {block.columns.map((col, i) => (
                <th key={col} className={`py-0.5 pr-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-border/50 border-b last:border-b-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`py-0.5 pr-2 ${typeof cell === "number" ? "text-right tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The bare block list — stats gather into one tile row, other kinds stack. */
export function AnalyticsBlocks({ blocks }: { blocks: AnalyticsBlock[] }) {
  const stats = blocks.filter((b) => b.kind === "stat");
  const rest = blocks.filter((b) => b.kind !== "stat");
  return (
    <div className="space-y-3">
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((b) => (
            <Stat key={b.id} block={b} />
          ))}
        </div>
      )}
      {rest.map((b) =>
        b.kind === "histogram" ? (
          <Histogram key={b.id} block={b} />
        ) : b.kind === "breakdown" ? (
          <Breakdown key={b.id} block={b} />
        ) : (
          <DataTable key={b.id} block={b} />
        ),
      )}
    </div>
  );
}

/** Collapsible editor wrapper, styled after the validation panel's toggle. */
export function AnalyticsPanel({ blocks }: { blocks: AnalyticsBlock[] }) {
  const [open, setOpen] = useState(false);
  if (blocks.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium hover:underline"
      >
        Analytics
        <span aria-hidden className="text-[0.65rem]">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="mt-2">
          <AnalyticsBlocks blocks={blocks} />
        </div>
      )}
    </div>
  );
}

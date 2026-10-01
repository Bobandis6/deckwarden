"use client";

/**
 * Hub staples list with the budget-tier toggle (P2.4). The tier filter is
 * client-side over the server-fetched top-N — no extra queries, and the hub
 * page stays ISR-cacheable because nothing here is per-viewer. Budget
 * figures are computed from the same real rows ("N at $5 or less"); an
 * empty tier says so honestly instead of padding the list. The tiers are the
 * site's one budget vocabulary (Y1, `@/lib/recommend/budget`) — inclusive,
 * so a card at exactly $5.00 shows under "≤ $5 a card".
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { Segmented } from "@/components/deck/segmented";
import { BUDGET_OPTIONS, type BudgetTier, withinBudget } from "@/lib/recommend/budget";

export interface StapleItem {
  id: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  /** numeric string from the DB, or null when unpriced. */
  cheapestUsd: string | null;
}

function underTier(staple: StapleItem, tier: BudgetTier): boolean {
  return withinBudget(staple.cheapestUsd === null ? null : Number(staple.cheapestUsd), tier);
}

export function StaplesTable({ staples }: { staples: StapleItem[] }) {
  const [tier, setTier] = useState<BudgetTier>("all");

  const counts = useMemo(
    () => ({
      under5: staples.filter((s) => underTier(s, "5")).length,
      under1: staples.filter((s) => underTier(s, "1")).length,
    }),
    [staples],
  );
  const shown = useMemo(() => staples.filter((s) => underTier(s, tier)), [staples, tier]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Budget" options={BUDGET_OPTIONS} value={tier} onChange={setTier} />
        <p className="text-muted-foreground text-xs tabular-nums">
          {counts.under5} of {staples.length} at $5 or less · {counts.under1} at $1 or less
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          None of these staples fit that budget right now.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Card</th>
                <th className="py-1.5 pr-3 font-medium">Type</th>
                <th className="py-1.5 pr-3 font-medium">MV</th>
                <th className="py-1.5 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="text-muted-foreground py-1.5 pr-3 text-xs tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Link href={`/cards/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground py-1.5 pr-3">{s.primaryType ?? "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{s.costValue ?? "—"}</td>
                  <td className="py-1.5 tabular-nums">
                    {s.cheapestUsd !== null ? `$${s.cheapestUsd}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

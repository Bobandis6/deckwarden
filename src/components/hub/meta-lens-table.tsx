/**
 * Meta Lens table (P3.10): the commander-specific sibling of StaplesTable —
 * measured tournament play instead of color-identity EDHREC rank. Server
 * component: no toggle, no per-viewer state, so the hub stays ISR. Ranking
 * is lists desc (the honest "most played"); the Top 4 column is DISCLOSED
 * context and never affects order (LATER row 38's fence). The section
 * heading, wording and Topdeck attribution live in the page beside the
 * other sections' wording.
 */
import Link from "next/link";

import { shareLabel, type MetaLensRow } from "@/lib/hub/meta-lens";

export function MetaLensTable({ rows, totalLists }: { rows: MetaLensRow[]; totalLists: number }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-1.5 pr-3 font-medium">#</th>
            <th className="py-1.5 pr-3 font-medium">Card</th>
            <th className="py-1.5 pr-3 font-medium">Played in</th>
            <th className="py-1.5 font-medium">Top 4</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="text-muted-foreground py-1.5 pr-3 text-xs tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-3">
                <Link href={`/cards/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-1.5 pr-3 tabular-nums">{shareLabel(r.lists, totalLists)}</td>
              <td className="text-muted-foreground py-1.5 tabular-nums">{r.top4}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

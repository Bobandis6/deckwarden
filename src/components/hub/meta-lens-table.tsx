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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shareLabel, type MetaLensRow } from "@/lib/hub/meta-lens";

export function MetaLensTable({ rows, totalLists }: { rows: MetaLensRow[]; totalLists: number }) {
  return (
    <div className="mt-3">
      {/* U10a (WAVE5.md D10): the Table primitive, the staples table's sibling on the same page. */}
      <Table className="min-w-[28rem]">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Card</TableHead>
            <TableHead>Played in</TableHead>
            <TableHead>Top 4</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground text-xs tabular-nums">{i + 1}</TableCell>
              <TableCell>
                <Link href={`/cards/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{shareLabel(r.lists, totalLists)}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{r.top4}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

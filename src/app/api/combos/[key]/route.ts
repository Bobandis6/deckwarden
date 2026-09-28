/**
 * GET /api/combos/[key] — one Commander Spellbook combo by its variant key
 * (X3, WAVE3.md D3): the seed behind the hub's "Build around this combo".
 * Answers `{ combo, cards }` — the ComboView (every card piece, the
 * commander among them, in name order) and one full CardWire per piece in
 * that same order — so the draft seeder places the `?leader=` piece in the
 * command zone and the rest in the main deck from this ONE GET, with no
 * resolve unit spent. Legality is Commander's: the only combo source is
 * Commander Spellbook, declared by the Magic adapter alone.
 *
 * Caching intent: dynamic rendering (the key is the whole input) with an
 * hour at the edge + a day stale-while-revalidate — combo and card data
 * move nightly at most, and one URL per combo keeps the CDN hit rate
 * honest. No rate limit: the cards/[id]/combos stance — a GET bounded by
 * real keys and edge-cached, costing three indexed reads (the lookup, the
 * wires, their legality). Public card data, never gated.
 *
 * An unknown key answers 404 WITH the cache header — deliberately unlike
 * cards/[id]/combos, whose unknown id is an honest empty 200: every
 * Spellbook key is public, so a 404 probes nothing, and the seeder must
 * tell a combo that is gone (the nightly hard-deletes stale keys that an
 * hour-old hub can still link) from one that exists. The miss is as
 * cacheable as a hit. A key off the stored shape is a 400 before any
 * statement runs.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FORMAT_ID } from "@/db/seed-data";
import { loadCardWires } from "@/lib/cards/wire";
import { loadComboByKey } from "@/lib/combos/queries";

export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

// Every stored key (66,135 on 2026-09-28) is card ids joined by "-", with
// template ids after "--" — 204 carry more than one template group — and
// 3–49 characters long.
const PARAMS = z.object({
  key: z
    .string()
    .max(64)
    .regex(/^[0-9]+(-{1,2}[0-9]+)*$/),
});

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/combos/[key]">) {
  const params = PARAMS.safeParse(await ctx.params);
  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid combo key", issues: params.error.issues },
      { status: 400 },
    );
  }

  const combo = await loadComboByKey(params.data.key);
  if (!combo) {
    return NextResponse.json({ error: "Unknown combo" }, { status: 404, headers: CACHE });
  }
  // loadCardWires answers in database order; the pieces' name order is the contract.
  const wires = await loadCardWires(
    combo.pieces.map((p) => p.id),
    FORMAT_ID.commander,
  );
  const byId = new Map(wires.map((w) => [w.id, w]));
  const cards = combo.pieces.flatMap((p) => {
    const wire = byId.get(p.id);
    return wire ? [wire] : [];
  });
  return NextResponse.json({ combo, cards }, { headers: CACHE });
}

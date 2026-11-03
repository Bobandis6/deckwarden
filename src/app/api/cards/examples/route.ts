/**
 * GET /api/cards/examples: the day's search examples (SEARCH-EXAMPLES), for
 * the header box's empty state. The island asks once, on its first focus,
 * and offers them while the box holds fewer than two characters; /cards
 * renders the same examples on the server and never calls this.
 *
 * Caching intent: static, revalidated hourly (ISR: `force-static` plus
 * `revalidate`). The answer depends on the UTC day alone, so every reader
 * shares one cached body, a query string cannot fork it, and no request
 * runs a statement or spends a limiter row (the reason this route has no
 * limiter, unlike its siblings: nothing here answers per request). The
 * day is read when the body is rendered, so it turns over within the hour
 * after 00:00 UTC, and a regeneration whose day has not changed writes the
 * same bytes. The rows behind it come through load-examples.ts' data
 * cache (this route's own entry; /cards keeps another, see there).
 */
import { NextResponse } from "next/server";

import { utcDayKey } from "@/lib/home/shelves";
import { loadSearchExamples } from "@/lib/search/load-examples";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const examples = await loadSearchExamples(utcDayKey(new Date()));
  return NextResponse.json({ examples });
}

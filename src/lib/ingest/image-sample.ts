/**
 * The Scryfall ingest's image sample-verify (scripts/ingest/scryfall.ts),
 * run after every card write has committed: HEAD each sampled printing's
 * derived image URL and, on a miss, read the card from the API for the
 * override to store. It is optional, so it is fail-soft and bounded like the
 * Tagger read in the same run (the 2026-11 security audit's run-2 record):
 * each read has a deadline, and a failed check is counted and logged as a
 * WARNING, never thrown — one upstream error used to mark a committed run
 * failed and skip the nightly steps behind it.
 */
import type { ScryfallCard } from "../games/mtg/scryfall-map";

/** One deadline per read; the sample is 20 printings. */
export const IMAGE_CHECK_TIMEOUT_MS = 15_000;

export type ImageOverride = { front: string | null; back: string | null };

export interface ImageSampleResult {
  checked: number;
  overrides: number;
  failed: number;
}

export async function verifyImageSample(
  ids: readonly string[],
  opts: {
    headers: Record<string, string>;
    writeOverride: (id: string, override: ImageOverride) => Promise<void>;
    /** Scryfall politeness between checks; tests pass 0. */
    pauseMs?: number;
  },
): Promise<ImageSampleResult> {
  const result: ImageSampleResult = { checked: 0, overrides: 0, failed: 0 };
  for (const id of ids) {
    try {
      const derived = `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
      const head = await fetch(derived, {
        method: "HEAD",
        headers: opts.headers,
        signal: AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS),
      });
      result.checked++;
      if (!head.ok) {
        const url = `https://api.scryfall.com/cards/${id}`;
        const res = await fetch(url, {
          headers: opts.headers,
          signal: AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
        const card = (await res.json()) as ScryfallCard;
        await opts.writeOverride(id, {
          front: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
          back: card.card_faces?.[1]?.image_uris?.normal ?? null,
        });
        result.overrides++;
        console.warn(`image_override written for ${id}`);
      }
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`WARNING: image sample-verify skipped ${id}: ${message}`);
    }
    await new Promise((r) => setTimeout(r, opts.pauseMs ?? 100));
  }
  return result;
}

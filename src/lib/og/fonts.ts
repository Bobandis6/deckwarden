/**
 * OG fonts (W2): satori takes static TTFs only — no woff2, no variable
 * fonts — so the next/font Literata files are unusable here. Two committed
 * instances under assets/fonts/ (OFL texts beside them): Literata-SemiBold
 * (600) for the serif voice — the title and the footer wordmark — and
 * Geist-Regular (400) for everything else. The sans must ride along because
 * passing `fonts` to ImageResponse REPLACES the bundled default rather than
 * extending it (this Next's @vercel/og renders with
 * `options.fonts || defaultFonts` — verified in
 * node_modules/next/dist/compiled/@vercel/og/index.node.js); our copy is the
 * same Geist-Regular bytes that default ships, so body text is unchanged.
 *
 * Paths are LITERAL `join(process.cwd(), "assets/fonts/…")` so Next's
 * output-file tracing copies the TTFs into the standalone build. The load
 * is cached at module level (one disk read per instance, not per unfurl)
 * and failure-tolerant: any error → `undefined` → the routes pass no
 * `fonts` and ImageResponse falls back to its bundled Geist, so an OG route
 * can never 500 over a font. The fallback stays legible because satori
 * matches family names case-insensitively: `fontFamily: "Geist"` hits the
 * bundled font (registered as "geist") and "Literata" falls back to it.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 600;
  style: "normal";
}

let cached: Promise<OgFont[] | undefined> | null = null;

export function loadOgFonts(): Promise<OgFont[] | undefined> {
  cached ??= (async () => {
    try {
      const [sans, serif] = await Promise.all([
        readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
        readFile(join(process.cwd(), "assets/fonts/Literata-SemiBold.ttf")),
      ]);
      return [
        { name: "Geist", data: sans, weight: 400, style: "normal" },
        { name: "Literata", data: serif, weight: 600, style: "normal" },
      ];
    } catch {
      return undefined;
    }
  })();
  return cached;
}

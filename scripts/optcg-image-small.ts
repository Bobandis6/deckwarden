/**
 * Writes the One Piece `small` rendition (P4.9) for mirror-optcg-images.sh.
 * It reads `<printing key>\t<full PNG path>` lines from the list file and
 * writes `<out dir>/<KEY>.webp` for each (renderOptcgSmallImage: WebP,
 * 146 × 204, alpha kept). The shell script stages the PNGs and uploads the
 * out dir in one recursive call; this script only resizes.
 *
 * A file that fails is warned and skipped, and the next night retries it.
 * Each WebP is written whole after it renders, so the out dir never holds a
 * partial file. The exit code is 1 only when there was work and nothing was
 * written: a resizer that cannot run at all.
 *
 * Run: pnpm optcg:image-small <list.tsv> <out dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderOptcgSmallImage } from "../src/lib/games/optcg/small-image";

/** Parallel resizes; libvips threads inside each, so four keep a 4-vCPU runner busy. */
const CONCURRENCY = 4;

async function main() {
  const [listPath, outDir] = process.argv.slice(2);
  if (!listPath || !outDir) throw new Error("usage: optcg-image-small <list.tsv> <out dir>");
  const jobs = readFileSync(listPath, "utf8")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length === 2 && parts[0] !== "" && parts[1] !== "")
    .map(([key, src]) => ({ key, src }));
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { key, src } = jobs[next++];
      try {
        const webp = await renderOptcgSmallImage(readFileSync(src));
        writeFileSync(join(outDir, `${key}.webp`), webp);
        written++;
      } catch (err) {
        failed++;
        console.warn(`WARN: small rendition failed for ${key} (${src}): ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`small renditions: ${jobs.length} to write, ${written} written, ${failed} failed`);
  if (jobs.length > 0 && written === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

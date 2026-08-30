/**
 * Content-sniffing gunzip for ingest downloads (P2.5).
 *
 * A `.gz` URL does not mean the bytes reaching us are gzip: when the server
 * declares `Content-Encoding: gzip` (Spellbook's S3 bucket does), Node's
 * fetch transparently decompresses the body, and gunzipping again dies with
 * "incorrect header check". When it doesn't (Scryfall's CDN serves .gz as
 * opaque binary), the bytes ARE gzip. So trust neither the suffix nor the
 * headers — sniff the 1f 8b magic bytes and gunzip only actual gzip.
 */
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

export async function maybeGunzip(input: Readable): Promise<Readable> {
  const it = input[Symbol.asyncIterator]() as AsyncIterator<Buffer>;

  // Collect at least 2 bytes to sniff (first chunk could be 1 byte).
  let head = Buffer.alloc(0);
  while (head.length < 2) {
    const next = await it.next();
    if (next.done) return Readable.from([head]); // 0–1 byte stream: nothing to gunzip
    head = head.length === 0 ? Buffer.from(next.value) : Buffer.concat([head, next.value]);
  }

  const rest = Readable.from(
    (async function* () {
      yield head;
      for (let n = await it.next(); !n.done; n = await it.next()) yield n.value;
    })(),
  );
  return head[0] === 0x1f && head[1] === 0x8b ? rest.pipe(createGunzip()) : rest;
}

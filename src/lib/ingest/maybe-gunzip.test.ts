import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { maybeGunzip } from "./maybe-gunzip";

async function drain(stream: Readable): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(chunk as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

/** Split a buffer into fixed-size chunks to exercise the sniff across boundaries. */
function chunkedReadable(buf: Buffer, size: number): Readable {
  return Readable.from(
    (async function* () {
      for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
    })(),
  );
}

describe("maybeGunzip", () => {
  const doc = `{"variants":[{"id":"a"}]}`;

  it("decompresses a gzip stream", async () => {
    const gz = gzipSync(Buffer.from(doc));
    expect(await drain(await maybeGunzip(chunkedReadable(gz, 7)))).toBe(doc);
  });

  it("passes plain bytes through untouched", async () => {
    expect(await drain(await maybeGunzip(chunkedReadable(Buffer.from(doc), 3)))).toBe(doc);
  });

  it("sniffs correctly when the first chunk is a single byte", async () => {
    const gz = gzipSync(Buffer.from(doc));
    expect(await drain(await maybeGunzip(chunkedReadable(gz, 1)))).toBe(doc);
    expect(await drain(await maybeGunzip(chunkedReadable(Buffer.from(doc), 1)))).toBe(doc);
  });

  it("handles empty and sub-2-byte streams without hanging", async () => {
    expect(await drain(await maybeGunzip(chunkedReadable(Buffer.alloc(0), 1)))).toBe("");
    expect(await drain(await maybeGunzip(chunkedReadable(Buffer.from("x"), 1)))).toBe("x");
  });
});

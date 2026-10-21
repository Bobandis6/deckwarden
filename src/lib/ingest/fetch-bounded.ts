/**
 * A bounded upstream read for the ingest scripts (S8, SECURITY-AUDIT-report.md
 * L13). Four nightly readers — Topdeck, Punk Records, MTGJSON's precons,
 * Limitless — buffered whatever the server sent with no size cap and no
 * deadline; the streaming Scryfall path and `scripts/ingest/tagger-read.ts`
 * already bound themselves. An oversized body fails cleanly on its own (V8's
 * string limit), so the one real failure was an upstream trickling bytes
 * for the whole job timeout, which cancelled the backup, gauge and purge
 * steps behind it. Here one deadline covers the headers AND the body (a
 * trickle is what an idle timeout would miss), and the body is counted as
 * it arrives — past `maxBytes` the stream is cancelled, never buffered.
 *
 * The callers keep their own status handling (429 waits, 5xx retries): the
 * Response's status and headers come back beside the text, which is read
 * whole and bounded whatever the status. A `too-large` error is final (the
 * same body again is the same size); a `timeout` is transient and the
 * callers retry it like a network error. Node only (Buffer).
 */

export type FetchBoundedKind = "too-large" | "timeout";

export class FetchBoundedError extends Error {
  readonly kind: FetchBoundedKind;
  constructor(kind: FetchBoundedKind, message: string) {
    super(message);
    this.name = "FetchBoundedError";
    this.kind = kind;
  }
}

export interface FetchBoundedOptions extends Omit<RequestInit, "signal"> {
  /** Decoded bytes the body may reach; one more and the read is cancelled. */
  maxBytes: number;
  /** One deadline for the request and the whole body, in milliseconds. */
  timeoutMs: number;
}

export interface BoundedResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** The whole body, UTF-8. */
  text: string;
}

function onAbort(err: unknown, signal: AbortSignal, url: string, timeoutMs: number): unknown {
  return signal.aborted
    ? new FetchBoundedError("timeout", `GET ${url}: no complete answer within ${timeoutMs} ms`)
    : err;
}

export async function fetchBounded(
  url: string,
  { maxBytes, timeoutMs, ...init }: FetchBoundedOptions,
): Promise<BoundedResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    throw onAbort(err, signal, url, timeoutMs);
  }
  const base = { status: res.status, ok: res.ok, headers: res.headers };

  // The declared size is the encoded one; a compressed body only grows when
  // decoded, so a declaration past the cap is already too much.
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new FetchBoundedError(
      "too-large",
      `GET ${url}: Content-Length ${declared} is over the ${maxBytes}-byte cap`,
    );
  }
  if (!res.body) return { ...base, text: "" };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new FetchBoundedError(
          "too-large",
          `GET ${url}: the body passed the ${maxBytes}-byte cap after ${received} bytes`,
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof FetchBoundedError) throw err;
    throw onAbort(err, signal, url, timeoutMs);
  }
  return { ...base, text: Buffer.concat(chunks).toString("utf8") };
}

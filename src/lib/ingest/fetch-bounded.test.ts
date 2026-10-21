// @vitest-environment node
/**
 * fetchBounded (S8, SECURITY-AUDIT-report.md L13): the body is counted as it
 * streams and cancelled one byte past the cap — never buffered whole first —
 * a stalled body or a stalled server rejects at the deadline, and a normal
 * body comes back whole with the status and headers the callers' retry
 * logic reads. `fetch` is a stub whose streams honour the request's signal
 * the way undici's do (a read rejects with the signal's reason).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchBoundedError, fetchBounded } from "./fetch-bounded";

type Source = { pulls: number; cancelled: boolean; stream: ReadableStream<Uint8Array> };

/** A stream of the given chunks that counts pulls, reports cancellation and stalls when asked. */
function source(
  chunks: Uint8Array[],
  opts: { stallAfter?: number; signal?: AbortSignal } = {},
): Source {
  const state: Source = { pulls: 0, cancelled: false, stream: undefined as never };
  let i = 0;
  state.stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls++;
        if (opts.stallAfter !== undefined && i >= opts.stallAfter) {
          return new Promise<void>((_, reject) => {
            opts.signal?.addEventListener("abort", () => reject(opts.signal?.reason));
          });
        }
        if (i < chunks.length) controller.enqueue(chunks[i++]);
        else controller.close();
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return state;
}

const bytes = (s: string) => new TextEncoder().encode(s);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchBounded", () => {
  it("returns a normal body whole, with the status and headers, forwarding the request init", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const src = source([bytes('[{"id":'), bytes('"é"}'), bytes("]")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return new Response(src.stream, {
          status: 200,
          headers: { ratelimit: "r=49; t=300", "content-type": "application/json" },
        });
      }),
    );
    const res = await fetchBounded("https://upstream.example/list", {
      maxBytes: 1024,
      timeoutMs: 5_000,
      headers: { Accept: "application/json", "User-Agent": "Deckwarden/1.0" },
    });
    expect(res).toMatchObject({ status: 200, ok: true, text: '[{"id":"é"}]' });
    expect(res.headers.get("ratelimit")).toBe("r=49; t=300");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://upstream.example/list");
    expect(new Headers(seen[0].init.headers).get("user-agent")).toBe("Deckwarden/1.0");
    expect(seen[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(src.cancelled).toBe(false);
  });

  it("a body of maxBytes + 1 rejects as too-large before the rest is pulled, and cancels the stream", async () => {
    const chunk = bytes("x".repeat(100));
    const src = source(Array.from({ length: 50 }, () => chunk)); // 5,000 bytes on offer
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(src.stream, { status: 200 })),
    );
    const err = await fetchBounded("https://upstream.example/big", {
      maxBytes: 1_000,
      timeoutMs: 5_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchBoundedError);
    expect((err as FetchBoundedError).kind).toBe("too-large");
    expect((err as Error).message).toMatch(/1000-byte cap after 1100 bytes/);
    // Eleven chunks reach 1,100 bytes; the other 39 were never pulled.
    expect(src.pulls).toBe(11);
    expect(src.cancelled).toBe(true);
  });

  it("exactly maxBytes is fine", async () => {
    const src = source([bytes("x".repeat(600)), bytes("y".repeat(400))]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(src.stream, { status: 200 })),
    );
    const res = await fetchBounded("https://upstream.example/fit", {
      maxBytes: 1_000,
      timeoutMs: 5_000,
    });
    expect(res.text).toHaveLength(1_000);
  });

  it("a Content-Length over the cap rejects before any chunk is read", async () => {
    const src = source([bytes("x".repeat(10))]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(src.stream, { status: 200, headers: { "content-length": "5000" } }),
      ),
    );
    const err = await fetchBounded("https://upstream.example/declared", {
      maxBytes: 1_000,
      timeoutMs: 5_000,
    }).catch((e: unknown) => e);
    expect((err as FetchBoundedError).kind).toBe("too-large");
    expect((err as Error).message).toMatch(/Content-Length 5000/);
    expect(src.pulls).toBe(0);
    expect(src.cancelled).toBe(true);
  });

  it("a stalled body rejects as a timeout at timeoutMs", async () => {
    let src: Source | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        src = source([bytes("partial")], { stallAfter: 1, signal: init.signal ?? undefined });
        return new Response(src.stream, { status: 200 });
      }),
    );
    const started = Date.now();
    const err = await fetchBounded("https://upstream.example/trickle", {
      maxBytes: 1_000,
      timeoutMs: 60,
    }).catch((e: unknown) => e);
    const elapsed = Date.now() - started;
    expect(err).toBeInstanceOf(FetchBoundedError);
    expect((err as FetchBoundedError).kind).toBe("timeout");
    expect((err as Error).message).toMatch(/within 60 ms/);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2_000);
  });

  it("a server that never answers the request rejects as a timeout too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    const err = await fetchBounded("https://upstream.example/silent", {
      maxBytes: 1_000,
      timeoutMs: 60,
    }).catch((e: unknown) => e);
    expect((err as FetchBoundedError).kind).toBe("timeout");
  });

  it("a non-OK status is an answer, not an error — the callers decide what to retry", async () => {
    const src = source([bytes('{"error":"slow down"}')]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(src.stream, { status: 429, headers: { "retry-after": "17" } }),
      ),
    );
    const res = await fetchBounded("https://upstream.example/limited", {
      maxBytes: 1_000,
      timeoutMs: 5_000,
    });
    expect(res).toMatchObject({ status: 429, ok: false, text: '{"error":"slow down"}' });
    expect(res.headers.get("retry-after")).toBe("17");
  });

  it("a network failure is rethrown as itself (the callers' retry loops already catch it)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      fetchBounded("https://upstream.example/down", { maxBytes: 1_000, timeoutMs: 5_000 }),
    ).rejects.toThrow(TypeError);
  });
});

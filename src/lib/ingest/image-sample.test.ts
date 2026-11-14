// @vitest-environment node
/**
 * verifyImageSample (the 2026-11 security audit's run-2 record): the
 * Scryfall run's image post-pass is fail-soft and bounded. A HEAD that is
 * rejected, an API answer that isn't ok, and a failed override write are
 * each counted and logged as a WARNING, and the next printing is still
 * checked; nothing is thrown. Every read carries an AbortSignal. `fetch` is
 * a stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyImageSample, type ImageOverride } from "./image-sample";

const A = "a1111111-1111-4111-8111-111111111111";
const B = "b2222222-2222-4222-8222-222222222222";
const C = "c3333333-3333-4333-8333-333333333333";
const HEADERS = { "User-Agent": "Deckwarden/1.0", Accept: "application/json" };

type Answer = Response | Error;
let answers: Map<string, Answer>;
let signals: (AbortSignal | null | undefined)[];
let writes: [string, ImageOverride][];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  answers = new Map();
  signals = [];
  writes = [];
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    signals.push(init?.signal);
    const answer = answers.get(`${init?.method ?? "GET"} ${url}`);
    if (!answer) throw new Error(`unexpected fetch ${url}`);
    if (answer instanceof Error) throw answer;
    return answer;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const image = (id: string) =>
  `HEAD https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
const api = (id: string) => `GET https://api.scryfall.com/cards/${id}`;

function run(
  ids: string[],
  writeOverride = async (id: string, o: ImageOverride) => {
    writes.push([id, o]);
  },
) {
  return verifyImageSample(ids, { headers: HEADERS, writeOverride, pauseMs: 0 });
}

describe("verifyImageSample", () => {
  it("a derived image that answers: checked, nothing written", async () => {
    answers.set(image(A), new Response(null, { status: 200 }));
    expect(await run([A])).toEqual({ checked: 1, overrides: 0, failed: 0 });
    expect(writes).toEqual([]);
  });

  it("a missing derived image: the API's URIs are written as the override", async () => {
    answers.set(image(A), new Response(null, { status: 404 }));
    answers.set(
      api(A),
      Response.json({ image_uris: { normal: "https://cards.scryfall.io/normal/x.jpg" } }),
    );
    expect(await run([A])).toEqual({ checked: 1, overrides: 1, failed: 0 });
    expect(writes).toEqual([[A, { front: "https://cards.scryfall.io/normal/x.jpg", back: null }]]);
  });

  it("an API 503, a rejected HEAD and a failed write are counted, logged and never thrown", async () => {
    answers.set(image(A), new Response(null, { status: 404 }));
    answers.set(api(A), new Response("unavailable", { status: 503 }));
    answers.set(image(B), new TypeError("fetch failed"));
    answers.set(image(C), new Response(null, { status: 404 }));
    answers.set(api(C), Response.json({ image_uris: { normal: "https://x/c.jpg" } }));
    const result = await run([A, B, C], async () => {
      throw new Error("write failed");
    });
    expect(result).toEqual({ checked: 2, overrides: 0, failed: 3 });
    const lines = warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(lines).toEqual([
      `WARNING: image sample-verify skipped ${A}: GET https://api.scryfall.com/cards/${A} → 503`,
      `WARNING: image sample-verify skipped ${B}: fetch failed`,
      `WARNING: image sample-verify skipped ${C}: write failed`,
    ]);
  });

  it("one failure does not stop the sample: the next printing is still checked", async () => {
    answers.set(image(A), new TypeError("fetch failed"));
    answers.set(image(B), new Response(null, { status: 200 }));
    expect(await run([A, B])).toEqual({ checked: 1, overrides: 0, failed: 1 });
  });

  it("every read carries a deadline", async () => {
    answers.set(image(A), new Response(null, { status: 404 }));
    answers.set(api(A), Response.json({}));
    await run([A]);
    expect(signals).toHaveLength(2);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });
});

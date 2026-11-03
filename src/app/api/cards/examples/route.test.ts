/**
 * GET /api/cards/examples (SEARCH-EXAMPLES): static and revalidated hourly,
 * answering the day's examples for the UTC day the body is rendered on.
 * The loader is stubbed (its own tests pin the cache and the rows).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SearchExample } from "@/lib/search/examples";

const loader = vi.hoisted(() => ({ loadSearchExamples: vi.fn() }));
vi.mock("@/lib/search/load-examples", () => loader);

import * as route from "./route";

const EXAMPLES: SearchExample[] = [
  { text: "Atraxa", game: "mtg", href: "/cards?q=Atraxa" },
  { text: "OP01-001", game: "optcg", href: "/cards?game=optcg&q=OP01-001" },
];

afterEach(() => {
  vi.useRealTimers();
  loader.loadSearchExamples.mockReset();
});

describe("GET /api/cards/examples", () => {
  it("is static, regenerated hourly, and exports nothing but Next's route fields", () => {
    expect(route.dynamic).toBe("force-static");
    expect(route.revalidate).toBe(3600);
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "revalidate"]);
  });

  it("answers the examples of the UTC day it renders on", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T23:59:59-07:00")); // 06:59 UTC on 11-04
    loader.loadSearchExamples.mockResolvedValue(EXAMPLES);
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ examples: EXAMPLES });
    expect(loader.loadSearchExamples).toHaveBeenCalledWith("2026-11-04");
  });
});

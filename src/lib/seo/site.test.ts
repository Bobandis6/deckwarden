import { afterEach, describe, expect, it } from "vitest";

import { absUrl, siteOrigin } from "./site";

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL"] as const;
const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

describe("siteOrigin", () => {
  it("prefers an explicit NEXT_PUBLIC_SITE_URL", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://staging.example.com", VERCEL_URL: "x.vercel.app" });
    expect(siteOrigin()).toBe("https://staging.example.com");
  });

  it("pins Vercel production to the real domain, never the deployment host", () => {
    setEnv({ VERCEL_ENV: "production", VERCEL_URL: "deckwarden-abc123.vercel.app" });
    expect(siteOrigin()).toBe("https://deckwarden.gg");
  });

  it("lets preview deployments self-reference so their unfurls resolve", () => {
    setEnv({ VERCEL_ENV: "preview", VERCEL_URL: "deckwarden-git-x.vercel.app" });
    expect(siteOrigin()).toBe("https://deckwarden-git-x.vercel.app");
  });

  it("defaults to the real domain off Vercel", () => {
    setEnv({});
    expect(siteOrigin()).toBe("https://deckwarden.gg");
  });
});

describe("absUrl", () => {
  it("builds fully qualified URLs from paths", () => {
    setEnv({});
    expect(absUrl("/d/abc123")).toBe("https://deckwarden.gg/d/abc123");
    expect(absUrl("/")).toBe("https://deckwarden.gg/");
  });
});

/**
 * src/instrumentation-client.ts (S2, SECURITY-AUDIT-report.md M3): the
 * browser init runs only with NEXT_PUBLIC_SENTRY_DSN and carries exactly
 * the privacy options — PII off, the scrubber, tracing off — with no
 * RequestData integration (the browser build has none). The SDK is a mock;
 * the module initialises at load, so each case loads it afresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

async function load() {
  vi.resetModules();
  const [client, options] = await Promise.all([
    import("./instrumentation-client"),
    import("@/lib/sentry/options"),
  ]);
  return { ...client, ...options };
}

beforeEach(() => {
  sentry.init.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation-client", () => {
  it("initialises nothing without the public DSN, and still wires the router hook", async () => {
    const { onRouterTransitionStart } = await load();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(onRouterTransitionStart).toBe(sentry.captureRouterTransitionStart);
  });

  it("initialises with the privacy options and nothing else", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o0.ingest.sentry.invalid/2");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    const { beforeSend } = await load();
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual({
      dsn: "https://public@o0.ingest.sentry.invalid/2",
      environment: "preview",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend,
    });
    expect(Object.keys(options).sort()).toEqual([
      "beforeSend",
      "dsn",
      "environment",
      "sendDefaultPii",
      "tracesSampleRate",
    ]);
  });
});

/**
 * @vitest-environment node
 *
 * src/instrumentation.ts (S2, SECURITY-AUDIT-report.md M3): the DSN gate
 * (no DSN, no init; SENTRY_DSN first, the public one as the fallback) and
 * the options it hands Sentry — serverSentryOptions, pinned key for key.
 * The SDK is a mock: what reaches `init` is the point. The module reads
 * the environment at load, so each case loads it afresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  requestDataIntegration: vi.fn((options?: unknown) => ({ name: "RequestData", options })),
  captureRequestError: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

/** A fresh module registry: the instrumentation and the options it imports, from the same generation. */
async function load() {
  vi.resetModules();
  const [instrumentation, options] = await Promise.all([
    import("./instrumentation"),
    import("@/lib/sentry/options"),
  ]);
  return { ...instrumentation, ...options };
}

beforeEach(() => {
  sentry.init.mockClear();
  sentry.requestDataIntegration.mockClear();
  vi.stubEnv("SENTRY_DSN", undefined);
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("register", () => {
  it("initialises nothing without a DSN, and still wires onRequestError", async () => {
    const { register, onRequestError } = await load();
    register();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.requestDataIntegration).not.toHaveBeenCalled();
    expect(onRequestError).toBe(sentry.captureRequestError);
  });

  it("hands Sentry the server options: tracing off, PII off, the scrubber, RequestData copying nothing, ContextLines emptied", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.invalid/1");
    vi.stubEnv("VERCEL_ENV", "production");
    const { register, beforeSend } = await load();
    register();
    expect(sentry.requestDataIntegration).toHaveBeenCalledTimes(1);
    expect(sentry.requestDataIntegration).toHaveBeenCalledWith({
      include: { cookies: false, headers: false, ip: false },
    });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledWith({
      dsn: "https://key@o0.ingest.sentry.invalid/1",
      environment: "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend,
      integrations: [
        sentry.requestDataIntegration.mock.results[0]?.value,
        { name: "ContextLines" },
      ],
    });
  });

  it("falls back to the public DSN and to NODE_ENV", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o0.ingest.sentry.invalid/2");
    const { register } = await load();
    register();
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: "https://public@o0.ingest.sentry.invalid/2",
      environment: "test",
      sendDefaultPii: false,
    });
  });
});

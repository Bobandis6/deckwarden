/**
 * @vitest-environment node
 *
 * The closed Better Auth routes (P2.9 round 2; the three token routes since
 * X1), pinned against the library itself on throwaway instances — no
 * database (Better Auth falls back to its memory adapter) and none of the env
 * src/lib/auth.ts needs at load. Two instances, because a single "closed →
 * 404" proves nothing on its own: a library upgrade that RENAMED the endpoint
 * would also 404 on the old path while the real one stayed open. So: the open
 * instance must answer the path (401 signed out — the route exists), the
 * closed one must 404 it, and every listed path must still be a real endpoint
 * path.
 *
 * Each probe uses the method the LIBRARY declares for its path and input that
 * passes the route's schema (a body for POST, a query for GET) — a wrong
 * method or refused input answers before the session check (400, measured on
 * GET /account-info) and the 401 would prove nothing.
 *
 * What this cannot prove is that auth.ts passes the list — that wiring is
 * pinned by scripts/account-delete-smoke.ts against a live server.
 */
import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";

import { AUTH_DISABLED_PATHS } from "./auth-disabled-paths";

const BASE = "http://localhost:3000";

function instance(disabledPaths: string[]) {
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    disabledPaths,
    telemetry: { enabled: false },
  });
}

/** Schema-valid input per route: a JSON body for POST, a query string for GET. */
const INPUTS: Record<string, { body?: unknown; query?: string }> = {
  "/update-user": { body: { name: "x", image: "https://example.invalid/x.png" } },
  "/get-access-token": { body: { accountId: "account-id" } },
  "/refresh-token": { body: { accountId: "account-id" } },
  "/account-info": { query: "accountId=account-id" },
};

/** path → the method the library declares for it. */
function declaredMethods(): Map<string, string> {
  const methods = new Map<string, string>();
  for (const endpoint of Object.values(instance([]).api)) {
    const { path, options } = endpoint as {
      path?: string;
      options?: { method?: string | string[] };
    };
    if (!path || !options?.method) continue;
    methods.set(path, Array.isArray(options.method) ? options.method[0] : options.method);
  }
  return methods;
}

/** Origin set on purpose: without it the origin check could answer before the route does. */
function probe(path: string, method: string): Request {
  const input = INPUTS[path] ?? {};
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(`${BASE}/api/auth${path}${input.query ? `?${input.query}` : ""}`, {
    method,
    headers: { "content-type": "application/json", origin: BASE },
    body: hasBody ? JSON.stringify(input.body ?? {}) : undefined,
  });
}

describe("AUTH_DISABLED_PATHS", () => {
  it("closes the unvalidated profile write and the three provider-token routes", () => {
    expect([...AUTH_DISABLED_PATHS].sort()).toEqual(
      ["/account-info", "/get-access-token", "/refresh-token", "/update-user"].sort(),
    );
  });

  it("every listed path is a real Better Auth endpoint path (catches an upstream rename)", () => {
    const methods = declaredMethods();
    for (const path of AUTH_DISABLED_PATHS) {
      expect(methods.has(path), `${path} is not an endpoint in this better-auth version`).toBe(
        true,
      );
    }
  });

  it("every listed route has probe input (a new entry must bring its own)", () => {
    for (const path of AUTH_DISABLED_PATHS) {
      expect(INPUTS[path], `${path} needs schema-valid input in INPUTS`).toBeDefined();
    }
  });

  it("open instance: the route exists (401 signed out); closed instance: 404", async () => {
    const open = instance([]);
    const closed = instance(AUTH_DISABLED_PATHS);
    const methods = declaredMethods();
    for (const path of AUTH_DISABLED_PATHS) {
      const method = methods.get(path) ?? "POST";
      expect((await open.handler(probe(path, method))).status, `open ${method} ${path}`).toBe(401);
      expect((await closed.handler(probe(path, method))).status, `closed ${method} ${path}`).toBe(
        404,
      );
    }
  });

  it("closing those paths leaves the rest of the router answering", async () => {
    const closed = instance(AUTH_DISABLED_PATHS);
    const ok = await closed.handler(new Request(`${BASE}/api/auth/ok`));
    expect(ok.status).toBe(200);
  });
});

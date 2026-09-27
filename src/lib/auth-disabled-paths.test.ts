/**
 * @vitest-environment node
 *
 * The closed Better Auth routes (P2.9 round 2), pinned against the library
 * itself on throwaway instances — no database (Better Auth falls back to its
 * memory adapter) and none of the env src/lib/auth.ts needs at load. Two
 * instances, because a single "closed → 404" proves nothing on its own: a
 * library upgrade that RENAMED the endpoint would also 404 on the old path
 * while the real one stayed open. So: the open instance must answer the path
 * (401 signed out — the route exists), the closed one must 404 it, and every
 * listed path must still be a real endpoint path.
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

/** Origin set on purpose: without it the origin check could answer before the route does. */
function post(path: string): Request {
  return new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: "x", image: "https://example.invalid/x.png" }),
  });
}

describe("AUTH_DISABLED_PATHS", () => {
  it("closes the unvalidated profile write", () => {
    expect(AUTH_DISABLED_PATHS).toContain("/update-user");
  });

  it("every listed path is a real Better Auth endpoint path (catches an upstream rename)", () => {
    const paths = new Set(
      Object.values(instance([]).api).map((endpoint) => (endpoint as { path?: string }).path),
    );
    for (const path of AUTH_DISABLED_PATHS) {
      expect(paths.has(path), `${path} is not an endpoint in this better-auth version`).toBe(true);
    }
  });

  it("open instance: the route exists (401 signed out); closed instance: 404", async () => {
    const open = instance([]);
    const closed = instance(AUTH_DISABLED_PATHS);
    for (const path of AUTH_DISABLED_PATHS) {
      expect((await open.handler(post(path))).status, `open ${path}`).toBe(401);
      expect((await closed.handler(post(path))).status, `closed ${path}`).toBe(404);
    }
  });

  it("closing those paths leaves the rest of the router answering", async () => {
    const closed = instance(AUTH_DISABLED_PATHS);
    const ok = await closed.handler(new Request(`${BASE}/api/auth/ok`));
    expect(ok.status).toBe(200);
  });
});

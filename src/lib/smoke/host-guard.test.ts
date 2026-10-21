// @vitest-environment node
/**
 * The smoke-script host guard (S9, SECURITY-AUDIT-report.md L19): a local
 * target passes, a remote one is refused unless `SMOKE_ALLOW_REMOTE=1` is set
 * for that run, and a value the parser cannot vouch for is refused whatever
 * the opt-in says. The script-side guard (`scripts/smoke/guard.ts`) prints
 * the message and exits 1 on `ok: false`; the wiring test pins that every
 * `BASE_URL`-taking script imports it first.
 */
import { describe, expect, it } from "vitest";

import { checkSmokeTarget, DEFAULT_BASE_URL, LOCAL_HOSTNAMES, REMOTE_OPT_IN } from "./host-guard";

const ok = (base: string, remote = false) => ({ ok: true, base, remote });

describe("checkSmokeTarget — local targets", () => {
  it("defaults to the local dev server when BASE_URL is unset or blank", () => {
    expect(DEFAULT_BASE_URL).toBe("http://localhost:3000");
    expect(checkSmokeTarget(undefined, undefined)).toEqual(ok("http://localhost:3000"));
    expect(checkSmokeTarget("", undefined)).toEqual(ok("http://localhost:3000"));
    expect(checkSmokeTarget("   ", undefined)).toEqual(ok("http://localhost:3000"));
  });

  it("allows localhost, 127.0.0.1 and [::1] on any port, over http or https", () => {
    expect(LOCAL_HOSTNAMES).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(checkSmokeTarget("http://localhost:3000", undefined)).toEqual(
      ok("http://localhost:3000"),
    );
    expect(checkSmokeTarget("http://localhost:3111", undefined)).toEqual(
      ok("http://localhost:3111"),
    );
    expect(checkSmokeTarget("https://localhost", undefined)).toEqual(ok("https://localhost"));
    expect(checkSmokeTarget("http://127.0.0.1:3000", undefined)).toEqual(
      ok("http://127.0.0.1:3000"),
    );
    expect(checkSmokeTarget("http://[::1]:3000", undefined)).toEqual(ok("http://[::1]:3000"));
    expect(checkSmokeTarget("http://[::1]", undefined)).toEqual(ok("http://[::1]"));
  });

  it("decides from the parsed hostname: case and the IPv4 short form normalise", () => {
    expect(checkSmokeTarget("http://LOCALHOST:3111/x/", undefined)).toEqual(
      ok("http://LOCALHOST:3111/x"),
    );
    expect(checkSmokeTarget("http://127.1", undefined)).toEqual(ok("http://127.1"));
  });

  it("hands back the value as given with one trailing slash stripped, whitespace trimmed", () => {
    expect(checkSmokeTarget("http://localhost:3000/", undefined)).toEqual(
      ok("http://localhost:3000"),
    );
    expect(checkSmokeTarget("http://localhost:3000//", undefined)).toEqual(
      ok("http://localhost:3000/"),
    );
    expect(checkSmokeTarget("  http://localhost:3000  ", undefined)).toEqual(
      ok("http://localhost:3000"),
    );
  });

  it("is not made 'remote' by the opt-in", () => {
    expect(checkSmokeTarget("http://localhost:3000", "1")).toEqual(ok("http://localhost:3000"));
  });
});

describe("checkSmokeTarget — remote targets", () => {
  const remote = [
    "https://example.com",
    "https://deckwarden.gg",
    "https://deckwarden.gg/",
    "http://app.localhost:3000",
    "http://localhost.",
    "http://0.0.0.0:3000",
    "http://127.0.0.2",
    "http://[::ffff:127.0.0.1]:3000",
    "http://10.255.255.1:9",
  ];

  it.each(remote)("refuses %s without the opt-in, naming the value and the switch", (value) => {
    const verdict = checkSmokeTarget(value, undefined);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("remote");
    expect(verdict.message).toContain(`BASE_URL=${value}`);
    expect(verdict.message).toContain("localhost, 127.0.0.1, [::1]");
    expect(verdict.message).toContain(`${REMOTE_OPT_IN}=1`);
  });

  it("only the exact value 1 lifts the refusal", () => {
    for (const value of ["true", "yes", "0", "", " 1", "TRUE"]) {
      expect(checkSmokeTarget("https://example.com", value).ok).toBe(false);
    }
    expect(REMOTE_OPT_IN).toBe("SMOKE_ALLOW_REMOTE");
    expect(checkSmokeTarget("https://example.com", "1")).toEqual(ok("https://example.com", true));
    expect(checkSmokeTarget("https://deckwarden.gg/", "1")).toEqual(
      ok("https://deckwarden.gg", true),
    );
  });
});

describe("checkSmokeTarget — malformed values", () => {
  const malformed = ["localhost:3000", "not a url", "ftp://localhost", "javascript:alert(1)"];

  it.each(malformed)("refuses %s whatever the opt-in says", (value) => {
    for (const optIn of [undefined, "1"]) {
      const verdict = checkSmokeTarget(value, optIn);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.reason).toBe("malformed");
      expect(verdict.message).toContain(JSON.stringify(value));
      expect(verdict.message).toContain(DEFAULT_BASE_URL);
    }
  });

  it("refuses credentials in the authority without echoing them, even for a local host", () => {
    for (const optIn of [undefined, "1"]) {
      const verdict = checkSmokeTarget("http://smoke:hunter2@localhost:3000", optIn);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.reason).toBe("malformed");
      expect(verdict.message).not.toContain("hunter2");
      expect(verdict.message).toContain("credentials");
    }
  });
});

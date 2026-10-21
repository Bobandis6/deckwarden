/**
 * The smoke-script host guard (S9, SECURITY-AUDIT-report.md L19). Every
 * script that takes `BASE_URL` — the sixteen `pnpm smoke:*` harnesses and
 * `pnpm search:canned` — asks this before its first request, through
 * `scripts/smoke/guard.ts`, which reads the environment, prints the refusal
 * and exits; this module only decides, so a test can hold every case.
 *
 * A local server is `localhost`, `127.0.0.1` or `[::1]` on any port over
 * http or https. Anything else is refused with one sentence unless
 * `SMOKE_ALLOW_REMOTE=1` is set for that one run — an explicit, per-run
 * opt-in, never a default. A value the URL parser cannot read as an absolute
 * http(s) URL, or one carrying credentials, is refused whatever the opt-in
 * says: the guard decides from the parsed hostname, and a value it cannot
 * parse is a value it cannot vouch for.
 */

export const DEFAULT_BASE_URL = "http://localhost:3000";

/** The hostnames a smoke may target without the opt-in, as Node's URL parser spells them. */
export const LOCAL_HOSTNAMES: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/** The per-run opt-in; only the exact value "1" counts. */
export const REMOTE_OPT_IN = "SMOKE_ALLOW_REMOTE";

export type SmokeTarget =
  | {
      ok: true;
      /** The base the scripts build their URLs on: the value as given, one trailing slash stripped. */
      base: string;
      /** True when the target is not local and the opt-in let it through. */
      remote: boolean;
    }
  | { ok: false; reason: "malformed" | "remote"; message: string };

function malformed(detail: string): SmokeTarget {
  return {
    ok: false,
    reason: "malformed",
    message: `smoke: refusing BASE_URL — ${detail} (a local target looks like ${DEFAULT_BASE_URL}).`,
  };
}

/**
 * Decide whether a smoke run may target `baseUrl`. An unset or blank value
 * means the default local server; whitespace around a value is ignored.
 */
export function checkSmokeTarget(
  baseUrl: string | undefined,
  allowRemote: string | undefined,
): SmokeTarget {
  const raw = (baseUrl ?? "").trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return malformed(`${JSON.stringify(raw)} is not an absolute URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return malformed(`${JSON.stringify(raw)} is not an http(s) URL`);
  }
  if (url.username !== "" || url.password !== "") {
    return malformed("the value carries credentials in its authority (not echoed)");
  }
  const base = raw.replace(/\/$/, "");
  if (LOCAL_HOSTNAMES.includes(url.hostname)) return { ok: true, base, remote: false };
  if (allowRemote === "1") return { ok: true, base, remote: true };
  return {
    ok: false,
    reason: "remote",
    message: `smoke: refusing BASE_URL=${raw} — not a local server (${LOCAL_HOSTNAMES.join(", ")} on any port); a deliberate remote run sets ${REMOTE_OPT_IN}=1 for that one run.`,
  };
}

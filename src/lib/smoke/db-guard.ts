/**
 * The smoke-script database guard (LATER row 295 — the database half of
 * S9's L19, SECURITY-AUDIT-report.md). The host guard (`host-guard.ts`)
 * keeps a local run's REQUESTS local; this keeps its DATABASE off production:
 * every script that opens `DATABASE_URL` asks this after its env load and
 * before its first query, through `scripts/smoke/db.ts`, which reads the
 * environment, prints the refusal and exits. This module only decides, so a
 * test can hold every case.
 *
 * A Neon host is `ep-<id>[-pooler].<…>.neon.tech` — the compute's endpoint
 * id is the FIRST label, with `-pooler` on the pooled string — and the
 * production id is not a secret, so `.env.local` carries it as
 * `PRODUCTION_DB_ENDPOINT` beside the development branch's `DATABASE_URL`
 * (`.env.example` says so). A `DATABASE_URL` whose first label is that id is
 * refused with one sentence unless `SMOKE_ALLOW_REMOTE=1` is set for that one
 * run; any other endpoint — a branch, a local Postgres — passes. With the
 * variable unset or blank there is nothing to compare against: the check is
 * off and says so (`checked: false`), it never guesses. A value the URL
 * parser cannot read as a postgres(ql):// URL with a host is refused
 * whatever the opt-in says, as the host guard refuses what it cannot vouch
 * for. No message ever carries the URL: a connection string holds the
 * password, so the sentences name the endpoint id and nothing else.
 */

/** The `.env.local` line that names the production compute's endpoint id (`ep-…`, no `-pooler`). */
export const PRODUCTION_ENDPOINT_VAR = "PRODUCTION_DB_ENDPOINT";

/** The same per-run opt-in the host guard reads; only the exact value "1" counts. */
export const REMOTE_OPT_IN = "SMOKE_ALLOW_REMOTE";

const SCHEMES: readonly string[] = ["postgres:", "postgresql:"];

export type SmokeDatabase =
  | {
      ok: true;
      /** False when `PRODUCTION_DB_ENDPOINT` is unset or blank: nothing was compared. */
      checked: false;
    }
  | {
      ok: true;
      checked: true;
      /** The endpoint id the host names, lower-cased, `-pooler` stripped. */
      endpoint: string;
      /** True when the host IS production and the opt-in let it through. */
      production: boolean;
    }
  | { ok: false; reason: "malformed" | "production"; message: string };

const HOW = `a local run points .env.local at a Neon development branch (.env.example says how)`;

function malformed(detail: string): SmokeDatabase {
  return {
    ok: false,
    reason: "malformed",
    message: `smoke: refusing DATABASE_URL — ${detail}; ${HOW}.`,
  };
}

/** An endpoint id as the comparison sees it: trimmed, lower-cased, one `-pooler` suffix stripped. */
export function endpointId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/-pooler$/, "");
}

/**
 * Decide whether a smoke run may open `databaseUrl`. `productionEndpoint` is
 * the `PRODUCTION_DB_ENDPOINT` value (unset or blank = the check is off);
 * `allowRemote` is the `SMOKE_ALLOW_REMOTE` value.
 */
export function checkSmokeDatabase(
  databaseUrl: string | undefined,
  productionEndpoint: string | undefined,
  allowRemote: string | undefined,
): SmokeDatabase {
  const production = endpointId(productionEndpoint ?? "");
  if (production === "") return { ok: true, checked: false };

  const raw = (databaseUrl ?? "").trim();
  if (raw === "") return malformed("it is not set");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return malformed("the value is not a URL the parser can read (not echoed)");
  }
  if (!SCHEMES.includes(url.protocol)) {
    return malformed("the value is not a postgres:// or postgresql:// URL (not echoed)");
  }
  if (url.hostname === "") return malformed("the value names no host (not echoed)");

  // The compute's endpoint id is the first host label; the pooled string adds `-pooler` to it.
  const endpoint = endpointId(url.hostname.split(".")[0]);
  if (endpoint !== production) return { ok: true, checked: true, endpoint, production: false };
  if (allowRemote === "1") return { ok: true, checked: true, endpoint, production: true };
  return {
    ok: false,
    reason: "production",
    message: `smoke: refusing DATABASE_URL — its host is the production endpoint ${production} (${PRODUCTION_ENDPOINT_VAR}); ${HOW}, and a deliberate production run sets ${REMOTE_OPT_IN}=1 for that one run.`,
  };
}

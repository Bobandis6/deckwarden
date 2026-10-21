// @vitest-environment node
/**
 * The smoke-script database guard (LATER row 295, the database half of
 * S9's L19): a `DATABASE_URL` whose host carries the production endpoint id
 * is refused unless `SMOKE_ALLOW_REMOTE=1` is set for that run, any other
 * endpoint passes, an unset `PRODUCTION_DB_ENDPOINT` means an unchecked pass,
 * and a value the parser cannot read is refused whatever the opt-in says —
 * never echoing the URL, which carries the password. The script-side guard
 * (`scripts/smoke/db.ts`) prints the message and exits 1 on `ok: false`; the
 * wiring test pins that every database-opening smoke calls it after its env
 * load.
 */
import { describe, expect, it } from "vitest";

import { checkSmokeDatabase, endpointId, PRODUCTION_ENDPOINT_VAR, REMOTE_OPT_IN } from "./db-guard";

const PROD = "ep-divine-star-avw7uddv";
const PASSWORD = "npg_hunter2secret";
const creds = `smoke_owner:${PASSWORD}`;

/** Every host shape Neon has handed out: six labels (pooled and direct) and the older four-label pair. */
const PROD_HOSTS = [
  `${PROD}-pooler.c-2.us-east-1.aws.neon.tech`,
  `${PROD}.c-2.us-east-1.aws.neon.tech`,
  `${PROD}-pooler.us-east-1.aws.neon.tech`,
  `${PROD}.us-east-1.aws.neon.tech`,
];

const url = (host: string, scheme = "postgresql") =>
  `${scheme}://${creds}@${host}/neondb?sslmode=require`;

const passes = (endpoint: string, production = false) => ({
  ok: true,
  checked: true,
  endpoint,
  production,
});

describe("checkSmokeDatabase — the production endpoint", () => {
  it.each(PROD_HOSTS)(
    "refuses %s without the opt-in, naming the id and the switch only",
    (host) => {
      const verdict = checkSmokeDatabase(url(host), PROD, undefined);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.reason).toBe("production");
      expect(verdict.message).toContain(`production endpoint ${PROD}`);
      expect(verdict.message).toContain(PRODUCTION_ENDPOINT_VAR);
      expect(verdict.message).toContain(`${REMOTE_OPT_IN}=1`);
      expect(verdict.message).toContain(".env.example");
      expect(verdict.message).not.toContain(PASSWORD);
      expect(verdict.message).not.toContain("smoke_owner");
      expect(verdict.message).not.toContain(host);
    },
  );

  it("decides from the first host label, whatever its case, under either scheme", () => {
    expect(checkSmokeDatabase(url(PROD_HOSTS[0].toUpperCase()), PROD, undefined).ok).toBe(false);
    expect(checkSmokeDatabase(url(PROD_HOSTS[0]), PROD.toUpperCase(), undefined).ok).toBe(false);
    expect(checkSmokeDatabase(url(PROD_HOSTS[0], "postgres"), PROD, undefined).ok).toBe(false);
    // the id given with the pooler suffix by mistake still names the same compute
    expect(checkSmokeDatabase(url(PROD_HOSTS[1]), `${PROD}-pooler`, undefined).ok).toBe(false);
    expect(endpointId(` ${PROD.toUpperCase()}-POOLER `)).toBe(PROD);
  });

  it("only the exact value 1 lifts the refusal, and the pass then says production", () => {
    for (const value of ["true", "yes", "0", "", " 1", "TRUE"]) {
      expect(checkSmokeDatabase(url(PROD_HOSTS[0]), PROD, value).ok).toBe(false);
    }
    expect(REMOTE_OPT_IN).toBe("SMOKE_ALLOW_REMOTE");
    expect(PRODUCTION_ENDPOINT_VAR).toBe("PRODUCTION_DB_ENDPOINT");
    for (const host of PROD_HOSTS) {
      expect(checkSmokeDatabase(url(host), PROD, "1")).toEqual(passes(PROD, true));
    }
  });
});

describe("checkSmokeDatabase — other endpoints", () => {
  const others = [
    "ep-quiet-lake-a1b2c3d4-pooler.c-2.us-east-1.aws.neon.tech",
    "ep-quiet-lake-a1b2c3d4.c-2.us-east-1.aws.neon.tech",
    "ep-quiet-lake-a1b2c3d4-pooler.us-east-1.aws.neon.tech",
    `${PROD}2-pooler.c-2.us-east-1.aws.neon.tech`,
    `${PROD}-pooler-pooler.c-2.us-east-1.aws.neon.tech`,
    `x.${PROD}.c-2.us-east-1.aws.neon.tech`,
  ];

  it.each(others)("passes %s as a checked, non-production host", (host) => {
    const verdict = checkSmokeDatabase(url(host), PROD, undefined);
    expect(verdict).toEqual(passes(endpointId(host.split(".")[0])));
    if (verdict.ok && verdict.checked) expect(verdict.endpoint).not.toBe(PROD);
  });

  it("passes a local Postgres on any host shape", () => {
    expect(checkSmokeDatabase("postgresql://u:p@localhost:5432/dw", PROD, undefined)).toEqual(
      passes("localhost"),
    );
    expect(checkSmokeDatabase("postgresql://u:p@127.0.0.1/dw", PROD, undefined)).toEqual(
      passes("127"),
    );
    expect(checkSmokeDatabase("postgres://u:p@[::1]/dw", PROD, undefined)).toEqual(passes("[::1]")); // no dots: the whole bracket form is the label, never the production id
  });

  it("is not made 'production' by the opt-in", () => {
    expect(checkSmokeDatabase(url(others[0]), PROD, "1")).toEqual(passes("ep-quiet-lake-a1b2c3d4"));
  });
});

describe("checkSmokeDatabase — the check is off", () => {
  it("passes unchecked when PRODUCTION_DB_ENDPOINT is unset or blank, whatever the URL says", () => {
    for (const endpoint of [undefined, "", "   "]) {
      expect(checkSmokeDatabase(url(PROD_HOSTS[0]), endpoint, undefined)).toEqual({
        ok: true,
        checked: false,
      });
      expect(checkSmokeDatabase(undefined, endpoint, undefined)).toEqual({
        ok: true,
        checked: false,
      });
      expect(checkSmokeDatabase("not a url", endpoint, "1")).toEqual({ ok: true, checked: false });
    }
  });
});

describe("checkSmokeDatabase — malformed values", () => {
  const malformed: [string | undefined, string][] = [
    [undefined, "not set"],
    ["", "not set"],
    ["   ", "not set"],
    ["not a url", "not a URL"],
    [`${creds}@${PROD_HOSTS[0]}/neondb`, "not a URL"],
    [`http://${creds}@${PROD_HOSTS[0]}/neondb`, "not a postgres://"],
    [`mysql://${creds}@${PROD_HOSTS[0]}/neondb`, "not a postgres://"],
    ["localhost:5432", "not a postgres://"],
    ["postgresql:///neondb", "names no host"],
  ];

  it.each(malformed)("refuses %j whatever the opt-in says, never echoing it", (value, detail) => {
    for (const optIn of [undefined, "1"]) {
      const verdict = checkSmokeDatabase(value, PROD, optIn);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.reason).toBe("malformed");
      expect(verdict.message).toContain(detail);
      expect(verdict.message).toContain(".env.example");
      expect(verdict.message).not.toContain(PASSWORD);
      expect(verdict.message).not.toContain("smoke_owner");
      if (value && value.trim() !== "") expect(verdict.message).not.toContain(value.trim());
    }
  });
});

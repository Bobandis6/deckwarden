// @vitest-environment node
/**
 * The one 400 contract for JSON bodies and the no-store answer (S8,
 * SECURITY-AUDIT-report.md I2): what every route that reads a body answers
 * for a body that is not JSON, for one the schema refuses, and what the
 * optional error sentence and issue cap do.
 */
import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { badRequest, NO_STORE, noStoreJson, parseJsonBody } from "./json";

const BODY = z.object({ name: z.string().min(1), qty: z.number().int() });

const post = (body: BodyInit | null, contentType = "application/json") =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : {},
    body,
  });

describe("noStoreJson", () => {
  it("answers JSON under Cache-Control: no-store with the status given", async () => {
    const res = noStoreJson({ ok: true }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("keeps the caller's other headers and forces the cache header", () => {
    const res = noStoreJson(
      { error: "slow down" },
      { status: 429, headers: { "Retry-After": "17", "Cache-Control": "public, max-age=60" } },
    );
    expect(res.headers.get("retry-after")).toBe("17");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("NO_STORE is the header object the non-JSON answers (a 204) reuse", () => {
    expect(NO_STORE).toEqual({ "Cache-Control": "no-store" });
  });
});

describe("badRequest", () => {
  it("is a 400 under no-store with `issues` only when given", async () => {
    const plain = badRequest("ids must be sorted and unique");
    expect(plain.status).toBe(400);
    expect(plain.headers.get("cache-control")).toBe("no-store");
    expect(await plain.json()).toEqual({ error: "ids must be sorted and unique" });

    const withIssues = badRequest("Unknown card ids for this game", ["stray"]);
    expect(await withIssues.json()).toEqual({
      error: "Unknown card ids for this game",
      issues: ["stray"],
    });
  });
});

describe("parseJsonBody", () => {
  it("returns the schema's output for a body it accepts", async () => {
    const body = await parseJsonBody(post(JSON.stringify({ name: "Sol Ring", qty: 1 })), BODY);
    expect(body).toEqual({ name: "Sol Ring", qty: 1 });
    expect(body instanceof NextResponse).toBe(false);
  });

  it("a body that is not JSON: 400 { error: 'Body must be JSON' } under no-store", async () => {
    for (const request of [post("not json"), post(""), post(null, "")]) {
      const body = await parseJsonBody(request, BODY);
      expect(body).toBeInstanceOf(NextResponse);
      const res = body as NextResponse;
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ error: "Body must be JSON" });
    }
  });

  it("a body the schema refuses: 400 { error: 'Invalid body', issues } with zod's issues", async () => {
    const body = await parseJsonBody(post(JSON.stringify({ name: "", qty: 1.5 })), BODY);
    expect(body).toBeInstanceOf(NextResponse);
    const res = body as NextResponse;
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = (await res.json()) as { error: string; issues: { path: unknown[] }[] };
    expect(json.error).toBe("Invalid body");
    expect(json.issues.map((i) => i.path)).toEqual([["name"], ["qty"]]);
    expect(json.issues).toEqual(BODY.safeParse({ name: "", qty: 1.5 }).error?.issues);
  });

  it("emptyBody: an empty body reads as the given value, still through the schema", async () => {
    const NOTE = z.object({ note: z.string().max(10).optional() });
    expect(await parseJsonBody(post(""), NOTE, { emptyBody: {} })).toEqual({});
    expect(await parseJsonBody(post(null, ""), NOTE, { emptyBody: {} })).toEqual({});
    expect(
      await parseJsonBody(post(JSON.stringify({ note: "v2" })), NOTE, { emptyBody: {} }),
    ).toEqual({
      note: "v2",
    });
    const notJson = (await parseJsonBody(post("{"), NOTE, { emptyBody: {} })) as NextResponse;
    expect(await notJson.json()).toEqual({ error: "Body must be JSON" });
    const refused = (await parseJsonBody(post(""), z.object({ confirm: z.string() }), {
      emptyBody: {},
    })) as NextResponse;
    expect(refused.status).toBe(400);
  });

  it("invalidError replaces the sentence; maxIssues 0 drops the list, N caps it", async () => {
    const custom = (await parseJsonBody(post("{}"), BODY, {
      invalidError: 'Body must be {"confirm": "delete my account"}',
      maxIssues: 0,
    })) as NextResponse;
    expect(custom.status).toBe(400);
    expect(await custom.json()).toEqual({
      error: 'Body must be {"confirm": "delete my account"}',
    });

    const capped = (await parseJsonBody(post("{}"), BODY, {
      invalidError: "Invalid body: rows must be 1 to 20,000 parsed collection lines",
      maxIssues: 1,
    })) as NextResponse;
    const json = (await capped.json()) as { error: string; issues: unknown[] };
    expect(json.error).toBe("Invalid body: rows must be 1 to 20,000 parsed collection lines");
    expect(json.issues).toHaveLength(1);
  });
});

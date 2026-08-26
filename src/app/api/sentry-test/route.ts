/**
 * GET /api/sentry-test — proves the Sentry pipeline end-to-end (P1.8 gate:
 * "Sentry showing a test event"). Throws a deliberate error so it flows
 * through instrumentation's onRequestError like a real failure would; inert
 * (plain JSON) while no DSN is configured, so local dev and CI stay quiet.
 *
 * Caching intent: force-dynamic + no-store — must actually execute per hit.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return NextResponse.json(
      { ok: false, reason: "Sentry DSN not configured — nothing to test." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  throw new Error("Deckwarden Sentry test event — everything is fine.");
}

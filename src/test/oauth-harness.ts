/**
 * The OAuth round trip against Better Auth itself, for throwaway instances on
 * the memory adapter (the callback-url.test.ts / sign-in-refresh.test.ts
 * harness, shared since S3): the button's POST to /sign-in/social, the
 * provider's two HTTP calls answered by a stubbed fetch, and the provider's
 * redirect back to /callback/<provider>. Nothing here asserts an outcome —
 * each test reads the callback's response itself (its status, Location and
 * cookies are the whole story of a sign-in).
 *
 * Discord answers a profile JSON (its `verified` flag is what the library
 * maps to emailVerified); Google answers an id token, which the library only
 * DECODES on the redirect path (core `social-providers/google.mjs`:
 * `decodeJwt(token.idToken)` — signature checks belong to the id-token
 * sign-in route), so an unsigned JWT with the right claims is a Google user.
 */
import { vi } from "vitest";

export const BASE = "http://localhost:3000";

export type SocialAuth = { handler: (request: Request) => Promise<Response> };

export type DiscordProfile = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  avatar?: string | null;
};

export type GoogleProfile = {
  sub: string;
  name: string;
  email: string;
  email_verified: boolean;
  picture?: string;
};

/** name=value pairs of every Set-Cookie on a response, as one Cookie header. */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

/** True when the response sets a non-empty session cookie (a sign-in happened). */
export function setsSessionCookie(res: Response): boolean {
  return res.headers
    .getSetCookie()
    .some((line) => /^[^=]*session_token=[^;]+/.test(line) && !/session_token=;/.test(line));
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** An unsigned id token with Google's claims — enough for the redirect path. */
export function googleIdToken(profile: GoogleProfile, clientId = "test-client"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
  const payload = {
    iss: "https://accounts.google.com",
    aud: clientId,
    iat: now,
    exp: now + 3600,
    ...profile,
  };
  return `${base64url(header)}.${base64url(payload)}.unsigned`;
}

function tokenResponse(extra: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: "provider-access-token",
    refresh_token: "provider-refresh-token",
    token_type: "Bearer",
    expires_in: 3600,
    scope: "identify email",
    ...extra,
  });
}

/** Stubs fetch so the provider's token and profile calls answer with `profile`. */
export function stubProvider(
  provider: "discord" | "google",
  profile: DiscordProfile | GoogleProfile,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      // Decoded: the library requests /users/%40me.
      const target = decodeURIComponent(String(input instanceof Request ? input.url : input));
      if (provider === "google") {
        if (target.startsWith("https://oauth2.googleapis.com/token")) {
          return tokenResponse({ id_token: googleIdToken(profile as GoogleProfile) });
        }
      } else {
        if (target.includes("/oauth2/token")) return tokenResponse();
        if (target.includes("/users/@me")) {
          const discord = profile as DiscordProfile;
          return Response.json({
            id: discord.id,
            username: discord.name.toLowerCase(),
            global_name: discord.name,
            discriminator: "0",
            avatar: discord.avatar ?? null,
            email: discord.email,
            verified: discord.verified,
          });
        }
      }
      return new Response(`unexpected request: ${target}`, { status: 500 });
    }),
  );
}

/**
 * One full round trip. Returns the callback's response: a 302 whose Location
 * is the callbackURL on success, or the error landing with `?error=<code>`.
 */
export async function socialSignIn(
  auth: SocialAuth,
  provider: "discord" | "google",
  profile: DiscordProfile | GoogleProfile,
  callbackURL = "/account",
): Promise<Response> {
  const started = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ provider, callbackURL }),
    }),
  );
  if (started.status !== 200) {
    throw new Error(`sign-in/social answered ${started.status}: ${await started.text()}`);
  }
  const { url } = (await started.json()) as { url: string };
  const state = String(new URL(url).searchParams.get("state"));

  stubProvider(provider, profile);
  try {
    return await auth.handler(
      new Request(
        `${BASE}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: cookieHeader(started) } },
      ),
    );
  } finally {
    vi.unstubAllGlobals();
  }
}

/** The `error` code the callback landed with, or null for a plain redirect. */
export function landedError(res: Response): { landing: string; code: string | null } {
  const location = new URL(String(res.headers.get("location")), BASE);
  return { landing: location.pathname, code: location.searchParams.get("error") };
}

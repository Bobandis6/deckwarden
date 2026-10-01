/**
 * Better Auth browser client (P2.1). Client components call
 * `authClient.signIn.social({ provider, callbackURL: "/account" })` — the
 * account page is always the landing spot because it runs the deck-claim
 * flow and lists the account's decks.
 */
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { USER_ADDITIONAL_FIELDS } from "@/lib/auth/user-fields";

// X5: types only — the session's user carries `avatar` and `username`
// (src/lib/auth.ts' additional fields); nothing changes at runtime.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: USER_ADDITIONAL_FIELDS })],
});

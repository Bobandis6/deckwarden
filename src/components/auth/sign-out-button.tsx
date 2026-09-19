"use client";

/**
 * Sign out (P2.1; logic shared with the header account menu through
 * useSignOut since W3): clears the Better Auth session cookie, then
 * refreshes so the server-rendered account page re-evaluates to the
 * signed-out view. Failure shows the retry copy in place instead of
 * refreshing into a half-signed-out page.
 */
import { Button } from "@/components/ui/button";
import { signOutLabel, useSignOut } from "@/components/auth/use-sign-out";

export function SignOutButton() {
  const { pending, failed, signOut } = useSignOut();

  return (
    <Button variant="outline" size="xs" disabled={pending} onClick={() => void signOut()}>
      {signOutLabel(pending, failed)}
    </Button>
  );
}

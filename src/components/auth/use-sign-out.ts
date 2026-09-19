"use client";

/**
 * Sign-out logic (W3, WAVE2.md D1) shared by the account-menu item and the
 * /account SignOutButton: pending flag → `authClient.signOut()` →
 * `router.refresh()` on success only, so every server-rendered
 * session-shaped surface re-evaluates to signed out. `failed` drives the
 * "Couldn't sign out — try again" copy in both hosts; `reset` clears it
 * when a menu reopens.
 */
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const reset = useCallback(() => setFailed(false), []);

  /** Resolves true on success (the caller may close its menu), false on failure. */
  const signOut = useCallback(async (): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setFailed(true);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }, [pending, router]);

  return { pending, failed, reset, signOut };
}

/** The three states' labels, shared so both hosts read identically. */
export function signOutLabel(pending: boolean, failed: boolean): string {
  if (pending) return "Signing out…";
  if (failed) return "Couldn't sign out — try again";
  return "Sign out";
}

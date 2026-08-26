"use client";

/**
 * Root error boundary (P1.8): unexpected render/data errors below the root
 * layout. Reported to Sentry client-side (server errors already flow through
 * instrumentation's onRequestError); `retry()` re-fetches and re-renders.
 */
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p className="text-muted-foreground font-mono text-sm">500</p>
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-center">
        The error has been reported. Your decks are safe — saves that failed will retry from the
        editor.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
          Back to Deckwarden
        </Button>
      </div>
      {error.digest && <p className="text-muted-foreground font-mono text-xs">{error.digest}</p>}
    </main>
  );
}

"use client";

/**
 * Root error boundary (P1.8; the Warden page since R5b, F8): unexpected
 * render/data errors below the root layout. Reported to Sentry client-side
 * (server errors already flow through instrumentation's onRequestError);
 * `retry()` re-fetches and re-renders. The boundary replaces the (site)
 * layout's subtree, so it renders the site header — and the footer, since
 * R4 — itself (a client file may import the server shell — it has no
 * server-only reads). Shield mark only,
 * one line of Warden voice.
 */
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { WARDEN_COPY } from "@/lib/warden-copy";

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

  const copy = WARDEN_COPY.error;
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <BrandMark className="size-14" />
        <p className="text-muted-foreground font-mono text-sm">{copy.eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground max-w-md">{copy.hint}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
            Back to Deckwarden
          </Button>
        </div>
        {error.digest && <p className="text-muted-foreground font-mono text-xs">{error.digest}</p>}
      </main>
      <SiteFooter />
    </>
  );
}

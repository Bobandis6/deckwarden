"use client";

/**
 * Last-resort error boundary (P1.8): catches failures in the root layout
 * itself. Replaces the whole document, so it declares its own <html>/<body>
 * and imports global styles explicitly (they don't cascade in here). Kept
 * dependency-light on purpose — if this is rendering, something core broke:
 * no site header here (R5b gave the root 404 and error pages the shell; this
 * one gets the inline shield mark only — a dependency-free SVG).
 */
import "./globals.css";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand-mark";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 antialiased">
        <title>Something went wrong · Deckwarden</title>
        <BrandMark className="size-14" />
        <p className="text-muted-foreground font-mono text-sm">500</p>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-center">
          The error has been reported. Reload the page, or come back in a minute.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => retry()}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          <Link href="/" className="rounded-md border px-4 py-2 text-sm font-medium">
            Back to Deckwarden
          </Link>
        </div>
        {error.digest && <p className="text-muted-foreground font-mono text-xs">{error.digest}</p>}
      </body>
    </html>
  );
}

"use client";

/**
 * Like + bookmark controls (P2.3), rendered in the share-page header.
 *
 * Signed in: optimistic flip, then reconcile to the API's authoritative
 * response ({liked, likesCount} / {bookmarked}); revert on failure. The
 * count lives only inside the like button, so no router.refresh is needed.
 * Signed out: the like count is still public signal, so the buttons render
 * as links into /account sign-in instead of dead controls.
 *
 * RemoveBookmarkButton is the /account list's row action — DELETE then
 * router.refresh(), because there the server-rendered list is the source of
 * truth (house pattern, folder-controls.tsx).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface EngagementViewer {
  liked: boolean;
  bookmarked: boolean;
}

async function putOrDelete(path: string, on: boolean): Promise<Response> {
  return fetch(path, { method: on ? "PUT" : "DELETE" });
}

export function EngagementButtons({
  deckId,
  likesCount,
  viewer,
}: {
  deckId: string;
  likesCount: number;
  /** null = signed out. */
  viewer: EngagementViewer | null;
}) {
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [bookmarked, setBookmarked] = useState(viewer?.bookmarked ?? false);
  // Server count excludes nothing — it already includes the viewer's own like.
  const [count, setCount] = useState(likesCount);
  const [error, setError] = useState<string | null>(null);

  if (!viewer) {
    return (
      <>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          title="Sign in to like decks"
          render={<Link href="/account" />}
        >
          {`♡ Like${count > 0 ? ` · ${count}` : ""}`}
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          title="Sign in to bookmark decks"
          render={<Link href="/account" />}
        >
          Bookmark
        </Button>
      </>
    );
  }

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setError(null);
    try {
      const res = await putOrDelete(`/api/decks/${deckId}/like`, next);
      if (!res.ok) throw new Error();
      const state: { liked: boolean; likesCount: number } = await res.json();
      setLiked(state.liked);
      setCount(state.likesCount);
    } catch {
      setLiked(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      setError("Couldn't save that — try again.");
    }
  };

  const toggleBookmark = async () => {
    const next = !bookmarked;
    setBookmarked(next);
    setError(null);
    try {
      const res = await putOrDelete(`/api/decks/${deckId}/bookmark`, next);
      if (!res.ok) throw new Error();
      const state: { bookmarked: boolean } = await res.json();
      setBookmarked(state.bookmarked);
    } catch {
      setBookmarked(!next);
      setError("Couldn't save that — try again.");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" aria-pressed={liked} onClick={() => void toggleLike()}>
        {`${liked ? "♥ Liked" : "♡ Like"}${count > 0 ? ` · ${count}` : ""}`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={bookmarked}
        onClick={() => void toggleBookmark()}
      >
        {bookmarked ? "Bookmarked ✓" : "Bookmark"}
      </Button>
      {error && (
        <p aria-live="polite" className="text-destructive w-full text-xs">
          {error}
        </p>
      )}
    </>
  );
}

export function RemoveBookmarkButton({ deckId, deckName }: { deckId: string; deckName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/bookmark`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      aria-label={`Remove bookmark: ${deckName}`}
      onClick={() => void remove()}
    >
      Remove
    </Button>
  );
}

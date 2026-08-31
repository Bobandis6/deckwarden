"use client";

/**
 * Deck details dialog (P2.7): description + notes, opened from the editor
 * header. Both ride the editor's normal debounced autosave (no Save button —
 * closing loses nothing), so this component is mostly controlled inputs.
 *
 * description stays the short unfurl blurb (og:description + JSON-LD, P2.6);
 * notes are the long-form primer rendered only on the share page. Length caps
 * mirror the PATCH route's zod.
 *
 * Deck deletion lives here too (P2.8 follow-up — the API predates the button
 * by a year of packages): window.confirm like the folder delete, then the
 * editor's onDelete does the call and navigates away on success.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface DeckDetails {
  description: string;
  notes: string;
}

export function DetailsDialog({
  details,
  deckName,
  onChange,
  onDelete,
  onClose,
}: {
  details: DeckDetails;
  deckName: string;
  onChange: (next: DeckDetails) => void;
  /** Resolves to an error message to show, or null on success (caller navigates). */
  onDelete: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (deleting) return;
    const label = deckName.trim() === "" ? "this deck" : `“${deckName.trim()}”`;
    if (!window.confirm(`Delete ${label}? This is immediate and permanent — there is no undo.`)) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const error = await onDelete();
    if (error !== null) {
      setDeleteError(error);
      setDeleting(false);
    }
    // On success the editor navigates away; staying "Deleting…" until unmount.
  };

  return (
    <Modal label="Deck details" onClose={onClose}>
      <div>
        <label className="text-muted-foreground text-xs font-medium" htmlFor="deck-description">
          Short description
        </label>
        <textarea
          id="deck-description"
          value={details.description}
          onChange={(e) => onChange({ ...details, description: e.target.value })}
          rows={2}
          maxLength={4000}
          placeholder="One or two sentences — this is what link previews and search results show."
          className="border-input focus-visible:ring-ring/50 mt-1 w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
        />
      </div>
      <div>
        <label className="text-muted-foreground text-xs font-medium" htmlFor="deck-notes">
          Notes
        </label>
        <textarea
          id="deck-notes"
          value={details.notes}
          onChange={(e) => onChange({ ...details, notes: e.target.value })}
          rows={10}
          maxLength={20000}
          placeholder="The long version: game plan, mulligan guide, why these cards. Shows on the share page."
          className="border-input focus-visible:ring-ring/50 mt-1 w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Saved automatically, like your cards.</p>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <p className="text-muted-foreground text-xs">
          Done with this deck? Deletion is immediate and permanent.
        </p>
        <Button
          variant="outline"
          size="xs"
          className="text-destructive shrink-0"
          disabled={deleting}
          onClick={() => void confirmDelete()}
        >
          {deleting ? "Deleting…" : "Delete deck…"}
        </Button>
      </div>
      {deleteError && <p className="text-destructive text-xs">{deleteError}</p>}
    </Modal>
  );
}

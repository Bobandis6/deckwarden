"use client";

/**
 * AccountDeckTile (W3, WAVE2.md D2): the /account deck tile with quick
 * actions — the shared DeckTile wrapped as a ContextMenuTrigger (right-
 * click, desktop) plus a visible ⋯ button in the actions slot (touch,
 * keyboard, discoverability), both rendering ONE DeckActionItems. `tile`
 * arrives computed on the server as plain data; the island only owns the
 * interactive state.
 *
 * Visibility: local state resynced to props with the adjust-during-render
 * pattern (new-deck-chooser.tsx precedent — state-from-props, never refs
 * in render) → optimistic flip → PATCH → Undo toast (5 s). NO
 * router.refresh(): the PATCH bumps updated_at and a refresh would reorder
 * the grid under the pointer; the tile's visibility word updates from the
 * local state instead. Failure reverts and toasts the error.
 *
 * Folder move: PATCH then refresh — the deck belongs in another server-
 * rendered group, so the regroup IS the point (the old <select>'s
 * behavior, now one radio submenu). Delete: AlertDialog with Cancel
 * focused first (the guard — hard delete, no Undo) → DELETE →
 * router.refresh() + "Deck deleted". Forks survive: the route NULLs the
 * self-FK in-transaction.
 *
 * The ⋯ button sits in the tile's actions row (DOM-first so it is the tab
 * stop right after the tile link; `order-last ms-auto` paints it on the
 * right) and announces as "Deck actions for {name}". The context menu is
 * desktop-only by design — iOS long-press on an anchor opens the preview.
 */
import { MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  DeckActionItems,
  type DeckActionDeck,
  type FolderOption,
} from "@/components/account/deck-action-items";
import { DeckTile } from "@/components/deck/deck-tile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { DeckVisibility } from "@/db/schema";
import type { DeckTileData } from "@/lib/decks/tiles";
import { cn } from "@/lib/utils";

export interface AccountDeckMeta extends DeckActionDeck {
  visibility: DeckVisibility;
  folderId: string | null;
}

/** The API's error body, or a generic sentence with the status. */
async function readError(res: Response, fallback: string): Promise<string> {
  const json: unknown = await res.json().catch(() => null);
  if (json && typeof json === "object" && "error" in json) return String(json.error);
  return `${fallback} (${res.status})`;
}

export function AccountDeckTile({
  tile,
  deck,
  folders,
}: {
  tile: DeckTileData;
  deck: AccountDeckMeta;
  folders: FolderOption[];
}) {
  const router = useRouter();

  // Adjust-during-render resync (state-from-props): a server refresh with a
  // new value re-latches the local state; local flips survive re-renders.
  const [visibility, setVisibility] = useState(deck.visibility);
  const [propVisibility, setPropVisibility] = useState(deck.visibility);
  if (deck.visibility !== propVisibility) {
    setPropVisibility(deck.visibility);
    setVisibility(deck.visibility);
  }
  const [folderId, setFolderId] = useState(deck.folderId);
  const [propFolderId, setPropFolderId] = useState(deck.folderId);
  if (deck.folderId !== propFolderId) {
    setPropFolderId(deck.folderId);
    setFolderId(deck.folderId);
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // One in-flight PATCH at a time (the old select's `busy` guard) — a ref,
  // read only inside handlers, so an ignored click never re-renders.
  const patchBusy = useRef(false);

  const patch = (body: Record<string, unknown>) =>
    fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const applyVisibility = async (next: DeckVisibility, prev: DeckVisibility, undoable: boolean) => {
    // Re-clicking the checked radio is a no-op — a PATCH would still bump
    // updated_at and reorder the grid on the next server render.
    if (next === prev || patchBusy.current) return;
    patchBusy.current = true;
    setVisibility(next);
    try {
      const res = await patch({ visibility: next });
      if (!res.ok) throw new Error(await readError(res, "Change failed"));
      if (undoable) {
        const id = toast.add({
          title: `“${deck.name}” is now ${next}`,
          type: "success",
          timeout: 5000,
          actionProps: {
            children: "Undo",
            onClick: () => {
              toast.close(id);
              void applyVisibility(prev, next, false);
            },
          },
        });
      } else {
        toast.add({ title: `“${deck.name}” is ${next} again`, type: "success", timeout: 3000 });
      }
    } catch (err) {
      setVisibility(prev);
      toast.add({
        title: err instanceof Error ? err.message : "Couldn't change visibility",
        type: "error",
        timeout: 5000,
      });
    } finally {
      patchBusy.current = false;
    }
  };

  const moveToFolder = async (next: string | null) => {
    if (patchBusy.current || next === folderId) return;
    patchBusy.current = true;
    const prev = folderId;
    setFolderId(next);
    try {
      const res = await patch({ folderId: next });
      if (!res.ok) throw new Error(await readError(res, "Move failed"));
      const folderName = next ? folders.find((f) => f.id === next)?.name : null;
      toast.add({
        title: folderName ? `Moved to “${folderName}”` : "Removed from its folder",
        type: "success",
        timeout: 3000,
      });
      router.refresh();
    } catch (err) {
      setFolderId(prev);
      toast.add({
        title: err instanceof Error ? err.message : "Couldn't move the deck",
        type: "error",
        timeout: 5000,
      });
    } finally {
      patchBusy.current = false;
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Delete failed"));
      setDeleteOpen(false);
      setDeleteBusy(false);
      toast.add({ title: "Deck deleted", type: "success", timeout: 5000 });
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleteBusy(false);
    }
  };

  const actionItems = (
    <DeckActionItems
      deck={deck}
      visibility={visibility}
      onVisibilityChange={(next) => void applyVisibility(next, visibility, true)}
      folderId={folderId}
      folders={folders}
      onFolderChange={(next) => void moveToFolder(next)}
      onDeleteRequest={() => {
        setDeleteError(null);
        setDeleteOpen(true);
      }}
    />
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <DeckTile
              tile={tile.visibility === null ? tile : { ...tile, visibility }}
              linkTitle={`Edit ${deck.name}`}
              actions={
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Deck actions for ${deck.name}`}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "icon-xs" }),
                        "text-muted-foreground hover:text-foreground order-last ms-auto",
                      )}
                    >
                      <MoreHorizontalIcon aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      {actionItems}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Link
                    href={`/d/${deck.publicId}`}
                    className="text-muted-foreground shrink-0 text-xs hover:underline"
                  >
                    Share page
                  </Link>
                </>
              }
            />
          }
        />
        <ContextMenuContent className="min-w-56">{actionItems}</ContextMenuContent>
      </ContextMenu>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next && !deleteBusy) setDeleteOpen(false);
        }}
      >
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete “${deck.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the deck, its version history and its share page. Forks keep
              their cards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive text-sm">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} size="sm" disabled={deleteBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? "Deleting…" : "Delete deck"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

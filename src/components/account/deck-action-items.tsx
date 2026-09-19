"use client";

/**
 * Deck quick actions (W3, WAVE2.md D2): the ONE item list both the tile's
 * visible ⋯ menu and its right-click context menu render — same file, so
 * the two can never drift. Navigation entries are LinkItems (real anchors:
 * Enter, middle-click and new-tab work); "Open in new tab" replaces the
 * native link menu the ContextMenu suppresses. Visibility is a top-level
 * radio group — a change is ONE click, so every radio sets `closeOnClick`
 * (Base UI RadioItems keep menus open by default). The folder submenu
 * replaces the old /account `<select>` (REC-3). Delete only *requests* —
 * the AlertDialog guard lives in the host island, outside the unmounting
 * menu.
 *
 * Copy writes the canonical share origin (D2 pins deckwarden.gg; absUrl
 * follows NEXT_PUBLIC_SITE_URL where set) and reports through the
 * module-level toast manager — the host surface mounts the Toaster.
 */
import { FolderIcon, GlobeIcon, Link2Icon, LockIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { DeckVisibility } from "@/db/schema";
import { absUrl } from "@/lib/seo/site";

/** A folder the submenu can file into (the old DeckFolderSelect's option shape). */
export interface FolderOption {
  id: string;
  name: string;
}

/** The row identity every action needs — plain data off the server row. */
export interface DeckActionDeck {
  id: string;
  publicId: string;
  name: string;
}

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public", Icon: GlobeIcon },
  { value: "unlisted", label: "Unlisted", Icon: Link2Icon },
  { value: "private", label: "Private", Icon: LockIcon },
] as const;

export function DeckActionItems({
  deck,
  visibility,
  onVisibilityChange,
  folderId,
  folders,
  onFolderChange,
  onDeleteRequest,
}: {
  deck: DeckActionDeck;
  visibility: DeckVisibility;
  onVisibilityChange: (next: DeckVisibility) => void;
  folderId: string | null;
  folders: FolderOption[];
  onFolderChange: (next: string | null) => void;
  onDeleteRequest: () => void;
}) {
  const editHref = `/decks/${deck.id}/edit`;
  const shareUrl = absUrl(`/d/${deck.publicId}`);

  const copyShareLink = () => {
    if (!navigator.clipboard) {
      toast.add({ title: "Couldn't copy the link", type: "error", timeout: 5000 });
      return;
    }
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.add({ title: "Link copied", type: "success", timeout: 3000 }),
      () => toast.add({ title: "Couldn't copy the link", type: "error", timeout: 5000 }),
    );
  };

  return (
    <>
      <DropdownMenuLinkItem render={<Link href={editHref} />} closeOnClick>
        Open in builder
      </DropdownMenuLinkItem>
      <DropdownMenuLinkItem
        render={<a href={editHref} target="_blank" rel="noreferrer" />}
        closeOnClick
      >
        Open in new tab
      </DropdownMenuLinkItem>
      <DropdownMenuLinkItem render={<Link href={`/d/${deck.publicId}`} />} closeOnClick>
        View share page
      </DropdownMenuLinkItem>
      <DropdownMenuItem onClick={copyShareLink}>
        <Link2Icon aria-hidden />
        {visibility === "private"
          ? "Copy share link (private — only you can open it)"
          : "Copy share link"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Visibility</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={visibility}
          onValueChange={(value) => onVisibilityChange(value as DeckVisibility)}
        >
          {VISIBILITY_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className="text-muted-foreground px-1.5 pb-1 text-xs">Unlisted: anyone with the link</p>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <FolderIcon aria-hidden />
          Move to folder
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <DropdownMenuRadioGroup
            value={folderId ?? ""}
            onValueChange={(value) => onFolderChange(value === "" ? null : String(value))}
          >
            <DropdownMenuRadioItem value="" closeOnClick>
              No folder
            </DropdownMenuRadioItem>
            {folders.map((folder) => (
              <DropdownMenuRadioItem key={folder.id} value={folder.id} closeOnClick>
                {folder.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onDeleteRequest}>
        <Trash2Icon aria-hidden />
        Delete deck…
      </DropdownMenuItem>
    </>
  );
}

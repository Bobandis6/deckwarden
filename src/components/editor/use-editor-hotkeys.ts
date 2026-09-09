"use client";

/**
 * The editor's global keys (R3, C5): `/` focuses search, `?` opens the
 * shortcut sheet. ONE window listener, owned by DeckEditor, replacing the
 * listener SearchPane used to own — which fired from a focused dialog
 * button, because a Base UI dialog's button is neither INPUT nor TEXTAREA.
 *
 * Two guards: `enabled` (the editor passes `dialog === null`, so every
 * dialog — Details, Import, Export, History, Share, the sheet itself —
 * switches the keys off while open) and the target check, which skips text
 * fields, contenteditable, and anything inside a dialog or menu that is
 * somehow open while `enabled` still reads true. Modified keys pass through
 * untouched (Ctrl+/ is the browser's). `?` typed into the search box types
 * a question mark; the hint line's keycap describes the deck-pane case.
 */
import { useEffect } from "react";

export interface EditorHotkeys {
  enabled: boolean;
  onSlash: () => void;
  onHelp: () => void;
}

const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TEXT_TAGS.has(target.tagName) || target.isContentEditable) return true;
  return target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

export function useEditorHotkeys({ enabled, onSlash, onHelp }: EditorHotkeys): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "/" && e.key !== "?") return;
      if (isTextTarget(e.target)) return;
      e.preventDefault();
      if (e.key === "/") onSlash();
      else onHelp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSlash, onHelp]);
}

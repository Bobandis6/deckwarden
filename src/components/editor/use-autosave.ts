"use client";

/**
 * Debounced autosave engine for the deck editor (P1.2).
 *
 * markDirty() starts a trailing debounce (~1s); flush() saves immediately.
 * Saves are chained on one promise so two flushes can never race, and edits
 * made while a save is in flight leave the state dirty so a follow-up flush
 * runs. The save callback reads current data from refs at execution time —
 * a save always sends the latest list, never a stale snapshot.
 *
 * Failure keeps the state dirty and reports "error"; retry() re-flushes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export interface Autosave {
  status: SaveStatus;
  markDirty: () => void;
  flush: () => Promise<void>;
  /** True while unsaved edits exist (for pagehide/unmount keepalive saves). */
  isDirty: () => boolean;
}

export function useAutosave(save: () => Promise<void>, delayMs = 1000): Autosave {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return chainRef.current;
    dirtyRef.current = false;
    setStatus("saving");
    chainRef.current = chainRef.current.then(async () => {
      try {
        await saveRef.current();
        if (!dirtyRef.current) setStatus("saved");
      } catch {
        dirtyRef.current = true;
        setStatus("error");
      }
    });
    return chainRef.current;
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), delayMs);
  }, [flush, delayMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { status, markDirty, flush, isDirty: () => dirtyRef.current };
}

"use client";

/**
 * Appearance menu (R1a; into the site header in R1b): Dark / Light / System,
 * the current choice checked, and since R2 the Background art switch. Lives
 * in SiteHeader on every (site) page and in EditorHeader on the editor
 * routes (R3 retired the interim AppearanceRow) — exactly one per page.
 * Base UI Menu via the installed dropdown-menu primitive — the items only
 * render while the popup is open, so the stored preferences (client-only)
 * never produce a hydration mismatch. Radio items keep menus open by
 * default; a theme is a one-shot choice, so those close on click. The
 * Background art checkbox keeps the menu open (Base UI's checkbox default):
 * a toggle invites a second look, and the effect shows behind the popup.
 * The setting is global — the reader's, not the page's — so the item shows
 * on every page, ambient surface or not. The label collapses to the icon
 * below `lg` (HEADER-SEARCH: below 1024 px the header's card search needs
 * that room; it was `sm`).
 *
 * U4a (WAVE5 D5): the items are `AppearanceItems`, so the phone editor's
 * More menu carries the same radio group and switch while the editor's
 * header drops its own control there — still one appearance control per
 * page. HEADER-SEARCH: the same items now sit in the site header's phone
 * Menu, and the header hides this trigger below `md` (`className`), giving
 * its 44 px to the search button.
 *
 * VIEW-TRANSITIONS (2026-11-02): a theme pick reveals from the item that
 * chose it (lib/theme/theme-reveal.ts): the item's centre is read in the
 * capture phase of the pointer and click events, before Base UI selects
 * the radio, and handed to the reveal with the flip. A pick that changes
 * nothing on screen (System while the system already matches) flips
 * plainly.
 */
import { ImageIcon, MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { saveAppearance, useAppearance } from "@/lib/theme/appearance";
import { revealThemeChange, type RevealOrigin } from "@/lib/theme/theme-reveal";

const OPTIONS = [
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

/** The menu's items: the theme radio group and the Background art switch (inside any open menu). */
export function AppearanceItems() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const appearance = useAppearance();
  // The radio item the reader pressed, read before Base UI selects it. A
  // keyboard pick arrives as the item's own click(), so it is covered too.
  const originRef = useRef<RevealOrigin | null>(null);
  const rememberOrigin = (event: SyntheticEvent) => {
    const item = (event.target as Element).closest('[role="menuitemradio"]');
    if (!item) return;
    const rect = item.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const pickTheme = (value: string) => {
    const next = value === "system" ? systemTheme : value;
    const visible = resolvedTheme === undefined || next !== resolvedTheme;
    revealThemeChange(() => setTheme(value), visible ? originRef.current : null);
    originRef.current = null;
  };
  return (
    <>
      <DropdownMenuRadioGroup
        value={theme ?? "dark"}
        onValueChange={(value) => pickTheme(String(value))}
        onPointerDownCapture={rememberOrigin}
        onPointerUpCapture={rememberOrigin}
        onClickCapture={rememberOrigin}
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuRadioItem key={value} value={value} closeOnClick>
            <Icon aria-hidden />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={appearance?.backgroundArt ?? true}
        onCheckedChange={(checked) => saveAppearance({ backgroundArt: checked })}
      >
        <ImageIcon aria-hidden />
        Background art
      </DropdownMenuCheckboxItem>
    </>
  );
}

export function AppearanceMenu({
  side = "bottom",
  className,
}: {
  side?: "top" | "bottom";
  /** The trigger's classes (the site header hides it below `md`). */
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className={className} />}>
        <SunMoonIcon aria-hidden />
        <span className="max-lg:sr-only">Appearance</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} aria-label="Appearance">
        <AppearanceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

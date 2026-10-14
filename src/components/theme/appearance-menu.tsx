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
 * below `sm`.
 *
 * U4a (WAVE5 D5): the items are `AppearanceItems`, so the phone editor's
 * More menu carries the same radio group and switch while the editor's
 * header drops its own control there — still one appearance control per
 * page.
 */
import { ImageIcon, MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { useTheme } from "next-themes";

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

const OPTIONS = [
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

/** The menu's items: the theme radio group and the Background art switch (inside any open menu). */
export function AppearanceItems() {
  const { theme, setTheme } = useTheme();
  const appearance = useAppearance();
  return (
    <>
      <DropdownMenuRadioGroup
        value={theme ?? "dark"}
        onValueChange={(value) => setTheme(String(value))}
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

export function AppearanceMenu({ side = "bottom" }: { side?: "top" | "bottom" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <SunMoonIcon aria-hidden />
        <span className="max-sm:sr-only">Appearance</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} aria-label="Appearance">
        <AppearanceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

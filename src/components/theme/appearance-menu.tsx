"use client";

/**
 * Appearance menu (R1a; into the site header in R1b): Dark / Light / System,
 * the current choice checked. Lives in SiteHeader on every (site) page and
 * in EditorHeader on the editor routes (R3 retired the interim
 * AppearanceRow) — exactly one per page. Base UI Menu via the installed dropdown-menu
 * primitive — the radio group only renders while the popup is open, so the
 * stored preference (client-only) never produces a hydration mismatch.
 * Radio items keep menus open by default; a theme is a one-shot choice, so
 * these close on click. The label collapses to the icon below `sm`.
 */
import { MonitorIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

export function AppearanceMenu({ side = "bottom" }: { side?: "top" | "bottom" }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <SunMoonIcon aria-hidden />
        <span className="max-sm:sr-only">Appearance</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} aria-label="Appearance">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

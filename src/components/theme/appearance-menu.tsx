"use client";

/**
 * Appearance menu (R1a): Dark / Light / System, the current choice checked.
 * Interim home is the site footer; R1b moves it into the site header (the
 * header does not exist yet). Base UI Menu via the installed dropdown-menu
 * primitive — the radio group only renders while the popup is open, so the
 * stored preference (client-only) never produces a hydration mismatch.
 * Radio items keep menus open by default; a theme is a one-shot choice, so
 * these close on click.
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

export function AppearanceMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="xs" />}>
        <SunMoonIcon aria-hidden />
        Appearance
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" aria-label="Appearance">
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

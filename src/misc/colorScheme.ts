import { reapplyColorTheme } from "./colorTheme";

export type ColorSchemePreference = "system" | "light" | "dark";

export function parseColorSchemePreference(
  value: string | null | undefined
): ColorSchemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

export function applyColorSchemePreference(pref: ColorSchemePreference) {
  const root = document.documentElement;
  root.dataset.colorScheme = pref;
  if (pref === "system") {
    root.style.removeProperty("color-scheme");
  } else {
    root.style.colorScheme = pref;
  }

  // Keep inline theme variables in sync with the effective scheme.
  reapplyColorTheme();
}


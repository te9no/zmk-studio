export type ColorTheme =
  | "zmk"
  | "ocean"
  | "forest"
  | "sakura"
  | "sunset"
  | "mono";

export function parseColorTheme(value: string | null | undefined): ColorTheme {
  switch (value) {
    case "zmk":
    case "ocean":
    case "forest":
    case "sakura":
    case "sunset":
    case "mono":
      return value;
    default:
      return "zmk";
  }
}

export function applyColorTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
}


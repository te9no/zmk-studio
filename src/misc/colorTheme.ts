export type ColorTheme =
  | "zmk"
  | "ocean"
  | "forest"
  | "sakura"
  | "sunset"
  | "mono";

type ThemeVars = {
  primary: string;
  primaryContent: string;
  secondary: string;
  accent: string;
  baseContent: string;
  base100: string;
  base200: string;
  base300: string;
};

const THEME_VARS: Record<ColorTheme, { light: ThemeVars; dark: ThemeVars }> = {
  zmk: {
    light: {
      primary: "124 58 237",
      primaryContent: "245 243 255",
      secondary: "236 72 153",
      accent: "20 184 166",
      baseContent: "31 41 55",
      base100: "255 255 255",
      base200: "242 242 242",
      base300: "229 230 230",
    },
    dark: {
      primary: "168 85 247",
      primaryContent: "10 5 20",
      secondary: "244 114 182",
      accent: "45 212 191",
      baseContent: "166 173 187",
      base100: "29 35 42",
      base200: "25 30 36",
      base300: "21 25 30",
    },
  },
  ocean: {
    light: {
      primary: "14 165 233",
      primaryContent: "240 249 255",
      secondary: "59 130 246",
      accent: "16 185 129",
      baseContent: "15 23 42",
      base100: "240 249 255",
      base200: "224 242 254",
      base300: "186 230 253",
    },
    dark: {
      primary: "56 189 248",
      primaryContent: "2 6 23",
      secondary: "96 165 250",
      accent: "52 211 153",
      baseContent: "226 232 240",
      base100: "2 6 23",
      base200: "3 10 26",
      base300: "15 23 42",
    },
  },
  forest: {
    light: {
      primary: "34 197 94",
      primaryContent: "240 253 244",
      secondary: "132 204 22",
      accent: "20 184 166",
      baseContent: "20 83 45",
      base100: "240 253 244",
      base200: "220 252 231",
      base300: "187 247 208",
    },
    dark: {
      primary: "74 222 128",
      primaryContent: "3 7 18",
      secondary: "163 230 53",
      accent: "45 212 191",
      baseContent: "220 252 231",
      base100: "6 30 18",
      base200: "4 24 14",
      base300: "20 83 45",
    },
  },
  sakura: {
    light: {
      primary: "236 72 153",
      primaryContent: "255 241 242",
      secondary: "244 63 94",
      accent: "168 85 247",
      baseContent: "60 10 30",
      base100: "255 241 242",
      base200: "254 226 226",
      base300: "254 205 211",
    },
    dark: {
      primary: "244 114 182",
      primaryContent: "23 3 11",
      secondary: "251 113 133",
      accent: "192 132 252",
      baseContent: "254 226 226",
      base100: "23 3 11",
      base200: "38 8 20",
      base300: "60 10 30",
    },
  },
  sunset: {
    light: {
      primary: "249 115 22",
      primaryContent: "255 247 237",
      secondary: "245 158 11",
      accent: "239 68 68",
      baseContent: "67 20 7",
      base100: "255 247 237",
      base200: "255 237 213",
      base300: "254 215 170",
    },
    dark: {
      primary: "251 146 60",
      primaryContent: "20 7 2",
      secondary: "252 211 77",
      accent: "248 113 113",
      baseContent: "255 237 213",
      base100: "20 7 2",
      base200: "35 12 4",
      base300: "67 20 7",
    },
  },
  mono: {
    light: {
      primary: "17 24 39",
      primaryContent: "255 255 255",
      secondary: "75 85 99",
      accent: "107 114 128",
      baseContent: "17 24 39",
      base100: "255 255 255",
      base200: "243 244 246",
      base300: "229 231 235",
    },
    dark: {
      primary: "229 231 235",
      primaryContent: "3 7 18",
      secondary: "156 163 175",
      accent: "209 213 219",
      baseContent: "229 231 235",
      base100: "3 7 18",
      base200: "15 23 42",
      base300: "31 41 55",
    },
  },
};

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

function getEffectiveScheme(): "light" | "dark" {
  const root = document.documentElement;
  const pref = root.dataset.colorScheme;
  if (pref === "light" || pref === "dark") {
    return pref;
  }
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toRgbList(value: string): string {
  // Use comma-separated lists for best compatibility with rgb(var(--x) / alpha).
  return value.trim().replace(/\s+/g, ", ");
}

export function applyColorTheme(theme: ColorTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;

  const vars = THEME_VARS[theme][getEffectiveScheme()];
  root.style.setProperty("--color-primary", toRgbList(vars.primary));
  root.style.setProperty("--color-primary-content", toRgbList(vars.primaryContent));
  root.style.setProperty("--color-secondary", toRgbList(vars.secondary));
  root.style.setProperty("--color-accent", toRgbList(vars.accent));
  root.style.setProperty("--color-base-content", toRgbList(vars.baseContent));
  root.style.setProperty("--color-base-100", toRgbList(vars.base100));
  root.style.setProperty("--color-base-200", toRgbList(vars.base200));
  root.style.setProperty("--color-base-300", toRgbList(vars.base300));
}

export function reapplyColorTheme() {
  applyColorTheme(parseColorTheme(document.documentElement.dataset.theme));
}


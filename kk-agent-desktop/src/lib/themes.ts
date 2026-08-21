import { getStoredJson, getStoredString, setStoredJson, setStoredString } from "@/lib/storage";

export interface Theme {
  id: string;
  name: string;
  description: string;
  custom?: boolean;
  colorMode?: ThemePreferenceMode;
  variables: Record<string, string>;
}

export type ThemeColorMode = "light" | "dark";
export type ThemePreferenceMode = ThemeColorMode | "system";

const THEME_VARIABLE_KEYS = [
  "--bg-base", "--bg-surface", "--bg-elevated", "--bg-hover",
  "--text-primary", "--text-secondary", "--text-muted",
  "--accent", "--accent-hover", "--accent-muted", "--accent-foreground",
  "--border", "--border-focus",
] as const;

const THEME_STORAGE_KEY = "kk-agent-theme";
const CUSTOM_THEMES_KEY = "kk-agent-custom-themes";
const THEME_MODE_OVERRIDES_KEY = "kk-agent-theme-mode-overrides";
const FALLBACK_ACCENT = "#c15f3c";

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return { r: Number.parseInt(expanded.slice(0, 2), 16), g: Number.parseInt(expanded.slice(2, 4), 16), b: Number.parseInt(expanded.slice(4, 6), 16) };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
  return { r: first.r + (second.r - first.r) * amount, g: first.g + (second.g - first.g) * amount, b: first.b + (second.b - first.b) * amount };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureContrast(color: Rgb, background: Rgb, toward: Rgb): Rgb {
  if (contrastRatio(color, background) >= 4.5) return color;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 16; index += 1) {
    const amount = (low + high) / 2;
    if (contrastRatio(mix(color, toward, amount), background) >= 4.5) high = amount;
    else low = amount;
  }
  return mix(color, toward, high);
}

export function resolveThemeColorMode(mode: ThemePreferenceMode | undefined): ThemeColorMode {
  if (mode === "light" || mode === "dark") return mode;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Builds a complete semantic palette from one colour and an explicit canvas mode. */
export function buildVariablesFromAccent(inputAccent: string, colorMode: ThemeColorMode = "dark"): Record<string, string> {
  const requestedAccent = parseHex(inputAccent) ?? parseHex(FALLBACK_ACCENT)!;
  const isLightCanvas = colorMode === "light";
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const canvas = isLightCanvas ? white : black;
  const accent = ensureContrast(requestedAccent, canvas, isLightCanvas ? black : white);
  const accentHex = toHex(accent);
  const accentForeground = contrastRatio(accent, white) >= contrastRatio(accent, black) ? "#ffffff" : "#101010";

  return isLightCanvas
    ? {
        "--bg-base": "#ffffff", "--bg-surface": "#fafafa", "--bg-elevated": "#ffffff", "--bg-hover": "#f2f2f2",
        "--text-primary": "#1b1b1b", "--text-secondary": "#5f5f5f", "--text-muted": "#858585",
        "--accent": accentHex, "--accent-hover": toHex(mix(accent, black, 0.14)), "--accent-muted": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.12)`, "--accent-foreground": accentForeground,
        "--border": "#d8d8d8", "--border-focus": accentHex,
      }
    : {
        "--bg-base": "#191919", "--bg-surface": "#212121", "--bg-elevated": "#2a2a2a", "--bg-hover": "#333333",
        "--text-primary": "#f2f2f2", "--text-secondary": "#c4c4c4", "--text-muted": "#8f8f8f",
        "--accent": accentHex, "--accent-hover": toHex(mix(accent, white, 0.18)), "--accent-muted": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.18)`, "--accent-foreground": accentForeground,
        "--border": "#3b3b3b", "--border-focus": accentHex,
      };
}

export const defaultThemes: Theme[] = [{
  id: "swagos",
  name: "Swagos",
  description: "Warm copper that follows your system appearance.",
  colorMode: "system",
  variables: buildVariablesFromAccent(FALLBACK_ACCENT, "light"),
}];

function getCustomThemes(): Theme[] { return getStoredJson<Theme[]>(CUSTOM_THEMES_KEY, []); }
function saveCustomThemes(themes: Theme[]): void { setStoredJson(CUSTOM_THEMES_KEY, themes); }
function getModeOverrides(): Record<string, ThemePreferenceMode> { return getStoredJson<Record<string, ThemePreferenceMode>>(THEME_MODE_OVERRIDES_KEY, {}); }
function saveModeOverrides(overrides: Record<string, ThemePreferenceMode>): void { setStoredJson(THEME_MODE_OVERRIDES_KEY, overrides); }
export function getAllThemes(): Theme[] {
  const overrides = getModeOverrides();
  return [
    ...defaultThemes.map((theme) => {
      const colorMode = overrides[theme.id] ?? theme.colorMode ?? "system";
      return { ...theme, colorMode, variables: buildVariablesFromAccent(theme.variables["--accent"], resolveThemeColorMode(colorMode)) };
    }),
    ...getCustomThemes(),
  ];
}
export function addCustomTheme(theme: Theme): void { const customs = getCustomThemes(); customs.push({ ...theme, custom: true }); saveCustomThemes(customs); }
export function deleteCustomTheme(id: string): void { saveCustomThemes(getCustomThemes().filter((theme) => theme.id !== id)); }
export function setThemeColorMode(id: string, colorMode: ThemePreferenceMode): void {
  const customThemes = getCustomThemes();
  const customTheme = customThemes.find((theme) => theme.id === id);
  if (customTheme) {
    customTheme.colorMode = colorMode;
    customTheme.variables = buildVariablesFromAccent(
      customTheme.variables["--accent"] ?? FALLBACK_ACCENT,
      resolveThemeColorMode(colorMode),
    );
    saveCustomThemes(customThemes);
    return;
  }
  saveModeOverrides({ ...getModeOverrides(), [id]: colorMode });
}
export function getSavedThemeId(): string { return getStoredString(THEME_STORAGE_KEY) || defaultThemes[0].id; }
function getThemeById(id: string): Theme { return getAllThemes().find((theme) => theme.id === id) || defaultThemes[0]; }

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const variables = buildVariablesFromAccent(
    theme.variables["--accent"] ?? FALLBACK_ACCENT,
    resolveThemeColorMode(theme.colorMode),
  );
  for (const key of THEME_VARIABLE_KEYS) root.style.setProperty(key, variables[key]);
  root.style.colorScheme = relativeLuminance(parseHex(variables["--bg-base"]) ?? parseHex("#ffffff")!) < 0.5 ? "dark" : "light";
}

export function saveAndApplyTheme(themeId: string): void { setStoredString(THEME_STORAGE_KEY, themeId); applyTheme(getThemeById(themeId)); }
let systemThemeListenerRegistered = false;

export function initTheme(): void {
  applyTheme(getThemeById(getSavedThemeId()));
  if (typeof window === "undefined" || systemThemeListenerRegistered) return;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => applyTheme(getThemeById(getSavedThemeId())));
  systemThemeListenerRegistered = true;
}

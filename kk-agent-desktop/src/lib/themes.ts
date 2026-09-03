import { getStoredString, setStoredString } from "@/lib/storage";

export interface AccentPreset {
  id: string;
  name: string;
  color: string;
}

type ThemeColorMode = "light" | "dark";
export type ThemePreferenceMode = ThemeColorMode | "system";

const THEME_VARIABLE_KEYS = [
  "--bg-base", "--bg-surface", "--bg-elevated", "--bg-hover",
  "--text-primary", "--text-secondary", "--text-muted",
  "--accent", "--accent-hover", "--accent-muted", "--accent-foreground",
  "--border", "--border-focus",
] as const;

const ACCENT_STORAGE_KEY = "kk-agent-accent";
const THEME_COLOR_MODE_STORAGE_KEY = "kk-agent-color-mode";
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

function resolveThemeColorMode(mode: ThemePreferenceMode | undefined): ThemeColorMode {
  if (mode === "light" || mode === "dark") return mode;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Builds a complete semantic palette from one colour and an explicit canvas mode. */
function buildVariablesFromAccent(inputAccent: string, colorMode: ThemeColorMode = "dark"): Record<string, string> {
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
        "--text-primary": "#353535", "--text-secondary": "#747474", "--text-muted": "#929292",
        "--accent": accentHex, "--accent-hover": toHex(mix(accent, black, 0.14)), "--accent-muted": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.12)`, "--accent-foreground": accentForeground,
        "--border": "#d8d8d8", "--border-focus": accentHex,
      }
    : {
        "--bg-base": "#191919", "--bg-surface": "#212121", "--bg-elevated": "#2a2a2a", "--bg-hover": "#333333",
        "--text-primary": "#e8e8e8", "--text-secondary": "#c2c2c2", "--text-muted": "#929292",
        "--accent": accentHex, "--accent-hover": toHex(mix(accent, white, 0.18)), "--accent-muted": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.18)`, "--accent-foreground": accentForeground,
        "--border": "#3b3b3b", "--border-focus": accentHex,
      };
}

export const accentPresets: AccentPreset[] = [
  { id: "neutral", name: "Neutral", color: "#777777" },
  { id: "copper", name: "Copper", color: FALLBACK_ACCENT },
  { id: "purple", name: "Purple", color: "#8a6a86" },
];
export function getSavedThemeColorMode(): ThemePreferenceMode {
  const mode = getStoredString(THEME_COLOR_MODE_STORAGE_KEY);
  return mode === "light" || mode === "dark" || mode === "system" ? mode : "light";
}

export function setThemeColorMode(colorMode: ThemePreferenceMode): void {
  setStoredString(THEME_COLOR_MODE_STORAGE_KEY, colorMode);
}

export function getSavedAccentId(): string { return getStoredString(ACCENT_STORAGE_KEY) || accentPresets[1].id; }
function getAccent(id: string): AccentPreset { return accentPresets.find((accent) => accent.id === id) || accentPresets[1]; }

function applyAccent(accent: AccentPreset): void {
  const root = document.documentElement;
  const variables = buildVariablesFromAccent(
    accent.color,
    resolveThemeColorMode(getSavedThemeColorMode()),
  );
  for (const key of THEME_VARIABLE_KEYS) root.style.setProperty(key, variables[key]);
  root.style.colorScheme = relativeLuminance(parseHex(variables["--bg-base"]) ?? parseHex("#ffffff")!) < 0.5 ? "dark" : "light";
}

export function saveAndApplyAccent(accentId: string): void { setStoredString(ACCENT_STORAGE_KEY, accentId); applyAccent(getAccent(accentId)); }
let systemThemeListenerRegistered = false;

export function initTheme(): void {
  applyAccent(getAccent(getSavedAccentId()));
  if (typeof window === "undefined" || systemThemeListenerRegistered) return;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => applyAccent(getAccent(getSavedAccentId())));
  systemThemeListenerRegistered = true;
}

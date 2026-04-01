import { getStoredJson, getStoredString, setStoredJson, setStoredString } from "@/lib/storage";

export interface Theme {
  id: string;
  name: string;
  description: string;
  custom?: boolean;
  variables: Record<string, string>;
}

const THEME_VARIABLE_KEYS = [
  "--accent",
  "--accent-hover",
  "--accent-muted",
  "--border-focus",
] as const;

const THEME_STORAGE_KEY = "kk-agent-theme";
const CUSTOM_THEMES_KEY = "kk-agent-custom-themes";

export const defaultThemes: Theme[] = [
  {
    id: "custom-1774905357884",
    name: "Swagos",
    description: "Warmer Kupfer-Look fuer Swagos.",
    variables: {
      "--accent": "#c15f3c",
      "--accent-hover": "#df7d5a",
      "--accent-muted": "rgba(193, 95, 60, 0.15)",
      "--border-focus": "#c15f3c",
    },
  },
];

export function getCustomThemes(): Theme[] {
  return getStoredJson<Theme[]>(CUSTOM_THEMES_KEY, []);
}

function saveCustomThemes(themes: Theme[]): void {
  setStoredJson(CUSTOM_THEMES_KEY, themes);
}

export function getAllThemes(): Theme[] {
  return [...defaultThemes, ...getCustomThemes()];
}

export function addCustomTheme(theme: Theme): void {
  const customs = getCustomThemes();
  customs.push({ ...theme, custom: true });
  saveCustomThemes(customs);
}

export function deleteCustomTheme(id: string): void {
  saveCustomThemes(getCustomThemes().filter((t) => t.id !== id));
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lightenHex(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function buildVariablesFromAccent(accent: string): Record<string, string> {
  return {
    "--accent": accent,
    "--accent-hover": lightenHex(accent, 30),
    "--accent-muted": hexToRgba(accent, 0.15),
    "--border-focus": accent,
  };
}

export function getSavedThemeId(): string {
  return getStoredString(THEME_STORAGE_KEY) || defaultThemes[0].id;
}

export function getThemeById(id: string): Theme {
  return getAllThemes().find((t) => t.id === id) || defaultThemes[0];
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const key of THEME_VARIABLE_KEYS) {
    const value = theme.variables[key];
    if (value) {
      root.style.setProperty(key, value);
    }
  }
}

export function saveAndApplyTheme(themeId: string): void {
  setStoredString(THEME_STORAGE_KEY, themeId);
  applyTheme(getThemeById(themeId));
}

export function initTheme(): void {
  applyTheme(getThemeById(getSavedThemeId()));
}

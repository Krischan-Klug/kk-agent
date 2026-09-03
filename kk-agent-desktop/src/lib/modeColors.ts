import type { ModeBehavior } from "kk-agent-contract";

export const MODE_COLOR_OPTIONS = [
  { value: "#60a5fa", label: "Blue" },
  { value: "#fbbf24", label: "Yellow" },
  { value: "#4ade80", label: "Green" },
  { value: "#f87171", label: "Red" },
  { value: "#858585", label: "Gray" },
] as const;

export function getModeColor(color: string | undefined, behavior: ModeBehavior): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return behavior === "plan" ? "#60a5fa" : "#fbbf24";
}

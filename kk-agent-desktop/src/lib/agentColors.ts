const DEFAULT_AGENT_COLOR = "#fbbf24";

export const AGENT_COLOR_OPTIONS = [
  { value: "#60a5fa", label: "Blue" },
  { value: DEFAULT_AGENT_COLOR, label: "Yellow" },
  { value: "#4ade80", label: "Green" },
  { value: "#f87171", label: "Red" },
  { value: "#858585", label: "Gray" },
] as const;

export function getAgentColor(color: string | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_AGENT_COLOR;
}

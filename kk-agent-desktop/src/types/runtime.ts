export interface RuntimeCapability {
  id: string;
  name: string;
  instruction: string;
  emoji?: string;
  runtime: { status: "running" | "stopped" | "unavailable"; error?: string };
  tools: Array<{ name: string; description: string }>;
}

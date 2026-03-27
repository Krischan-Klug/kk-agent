import { getActiveInstructions as getCustomActiveInstructions } from "../../mcp/service.js";
import { getActiveToolInstructions } from "../../tools/service.js";

const RUNTIME_SYSTEM_VARIABLES = [
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_MODEL",
  "iteration",
  "maxIterations",
  "mcpInstructions",
] as const;

/**
 * Build MCP instruction blocks for the given MCP IDs.
 * Agent-specific instructions override the global MCP instructions.
 */
export function buildMcpInstructions(
  activeMcpIds: string[],
  agentMcpInstructions?: Record<string, string>,
): string {
  const all = [...getActiveToolInstructions(), ...getCustomActiveInstructions()].filter((m) => activeMcpIds.includes(m.id));

  const blocks = all
    .map((m) => {
      const instruction = agentMcpInstructions?.[m.id] ?? m.instruction;
      if (!instruction) return null;
      return `## Tool: ${m.name}\n${instruction}`;
    })
    .filter(Boolean);

  return blocks.join("\n\n");
}

/**
 * System variables that are always available in prompts.
 */
export function getSystemVariables(extra: Record<string, string> = {}): Record<string, string> {
  const now = new Date();
  return {
    CURRENT_DATE: now.toLocaleDateString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    CURRENT_TIME: now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    CURRENT_TIMESTAMP: now.toISOString(),
    ...extra,
  };
}

export function getSystemVariableNames(): string[] {
  return [...RUNTIME_SYSTEM_VARIABLES];
}

/**
 * Replace all {{key}} placeholders in a string with values from the variables map.
 */
function resolveVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Build a complete system prompt.
 * Variables like {{iteration}}, {{maxIterations}}, {{CURRENT_DATE}}
 * are resolved in the base prompt.
 */
export function buildPrompt(
  agentBasePrompt: string,
  mcpInstructions: string,
  variables: Record<string, string>,
): string {
  const resolvedBase = resolveVariables(agentBasePrompt, variables);

  const parts = [resolvedBase];
  if (mcpInstructions) parts.push(mcpInstructions);

  return parts.join("\n\n---\n\n");
}

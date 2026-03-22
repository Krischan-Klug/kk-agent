import {
  buildPrompt as build,
  buildMcpInstructions as buildMcpInstr,
} from "./lib/builder.js";
import { getSystemVariables } from "./lib/builder.js";

/* ── Public API ── */

export function buildPrompt(
  agentBasePrompt: string,
  mcpInstructions: string,
  variables: Record<string, string>,
): string {
  return build(agentBasePrompt, mcpInstructions, variables);
}

export function buildMcpInstructions(
  activeMcpIds: string[],
  agentMcpInstructions?: Record<string, string>,
): string {
  return buildMcpInstr(activeMcpIds, agentMcpInstructions);
}

export { getSystemVariables };

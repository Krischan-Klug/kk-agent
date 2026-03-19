import {
  buildPrompt as build,
  buildMcpInstructions as buildMcpInstr,
} from "./lib/builder.js";
import { getSystemVariables } from "./lib/builder.js";

/* ── Public API (used by the phased agent loop) ── */

export function buildPrompt(
  agentBasePrompt: string,
  phaseExtension: string,
  mcpInstructions: string,
  variables: Record<string, string>,
): string {
  return build(agentBasePrompt, phaseExtension, mcpInstructions, variables);
}

export function buildMcpInstructions(
  activeMcpIds: string[],
  agentMcpInstructions?: Record<string, string>,
): string {
  return buildMcpInstr(activeMcpIds, agentMcpInstructions);
}

export { getSystemVariables };

import {
  buildPrompt as build,
  buildCapabilityInstructions as buildCapabilityInstr,
  type PromptBuildContext,
} from "./lib/builder.js";
import { getSystemVariables } from "./lib/builder.js";

/* ── Public API ── */

export function buildPrompt(
  agentBasePrompt: string,
  mcpInstructions: string,
  variables: Record<string, string>,
  context: PromptBuildContext = {},
): string {
  return build(agentBasePrompt, mcpInstructions, variables, context);
}

export function buildCapabilityInstructions(
  activeCapabilityIds: string[],
  agentInstructions?: Record<string, string>,
): string {
  return buildCapabilityInstr(activeCapabilityIds, agentInstructions);
}

export { getSystemVariables };

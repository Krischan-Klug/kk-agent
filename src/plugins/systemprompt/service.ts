import {
  buildPrompt as build,
  buildCapabilityInstructions as buildCapabilityInstr,
  type PromptBuildContext,
} from "./lib/builder.js";
import { getSystemVariables } from "./lib/builder.js";
import type { AgentPromptSections } from "../agent/types.js";

export function buildPrompt(
  promptSections: AgentPromptSections,
  modeInstruction: string,
  mcpInstructions: string,
  skillInstructions: string,
  variables: Record<string, string>,
  context: PromptBuildContext = {},
): string {
  return build(promptSections, modeInstruction, mcpInstructions, skillInstructions, variables, context);
}

export function buildCapabilityInstructions(
  activeCapabilityIds: string[],
  agentInstructions?: Record<string, string>,
): string {
  return buildCapabilityInstr(activeCapabilityIds, agentInstructions);
}

export { getSystemVariables };

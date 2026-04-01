import { getActiveInstructions as getCustomActiveInstructions } from "../../mcp/service.js";
import { getActiveToolInstructions, getInternalToolState, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import { getDefaults } from "../../lib/defaults.js";

const RUNTIME_SYSTEM_VARIABLES = [
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_MODEL",
  "iteration",
  "maxIterations",
  "mcpInstructions",
  "phase",
  "TASK_SUMMARY",
  "FEEDBACK",
] as const;

export interface PromptBuildContext {
  sessionId?: string;
  phase?: "planning" | "executing" | "verifying" | "completed" | "error";
  phasePrompt?: string;
  feedback?: string;
}

/**
 * Build capability instruction blocks for the given active tool and MCP IDs.
 * Agent-specific instructions override the global instructions.
 */
export function buildCapabilityInstructions(
  activeCapabilityIds: string[],
  agentInstructions?: Record<string, string>,
): string {
  const all = [...getActiveToolInstructions(), ...getCustomActiveInstructions()]
    .filter((capability) => activeCapabilityIds.includes(capability.id));

  const blocks = all
    .map((capability) => {
      const instruction = agentInstructions?.[capability.id] ?? capability.instruction;
      if (!instruction) return null;
      return `<tool_instruction id="${capability.id}" name="${capability.name}">\n${instruction}\n</tool_instruction>`;
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

function resolveDefaultPhasePrompt(phase?: PromptBuildContext["phase"]): string {
  const defaults = getDefaults().agent.phasePrompts;
  if (phase === "planning") return defaults.planningPrompt;
  if (phase === "verifying") return defaults.verifyingPrompt;
  return defaults.executingPrompt;
}

function buildPhaseSection(phase?: PromptBuildContext["phase"], phasePrompt?: string): string {
  const effectivePhase = phase ?? "executing";
  const defaults = getDefaults().agent;
  const completedGuidance = "<completed_phase_guidance>\nDie Aufgabe ist abgeschlossen. Fasse nur das Ergebnis sauber zusammen.\n</completed_phase_guidance>";
  const errorGuidance = "<error_phase_guidance>\nEs ist ein Fehler aufgetreten. Analysiere die Ursache und bleibe ehrlich.\n</error_phase_guidance>";
  const resolvedPhasePrompt = phasePrompt?.trim() || resolveDefaultPhasePrompt(effectivePhase);
  const guidanceSource =
    effectivePhase === "planning"
      ? defaults.phaseGuidance.planning
      : effectivePhase === "verifying"
        ? defaults.phaseGuidance.verifying
        : effectivePhase === "completed"
          ? completedGuidance
          : effectivePhase === "error"
            ? errorGuidance
            : defaults.phaseGuidance.executing;
  return [
    `<loop_phase_context phase="${effectivePhase}">`,
    "<current_phase>",
    effectivePhase,
    "</current_phase>",
    guidanceSource,
    resolvedPhasePrompt,
    "</loop_phase_context>",
  ].join("\n");
}

function buildTaskSection(sessionId?: string): string {
  const defaults = getDefaults().agent.promptSections;
  if (!sessionId) return "";
  return [
    "<task_context>",
    defaults.taskWithSession,
    "<current_tasks>",
    getTaskSummary(sessionId),
    "</current_tasks>",
    "</task_context>",
  ].join("\n");
}

function buildMemorySection(sessionId?: string): string {
  const defaults = getDefaults().agent.promptSections;
  if (!sessionId) return "";

  const memory = getMemoryPromptContext(sessionId);
  return [
    "<memory_context>",
    defaults.memoryWithSession,
    "<user_memory>",
    memory.userMemory,
    "</user_memory>",
    "<session_memory>",
    memory.sessionMemory,
    "</session_memory>",
    "</memory_context>",
  ].join("\n");
}

function buildToolRulesSection(sessionId?: string): string {
  const defaults = getDefaults().agent.promptSections;
  if (!sessionId) return "";

  const state = getInternalToolState(sessionId);
  return [
    "<tool_rules_context>",
    defaults.toolRulesWithSession,
    `<current_task_count>${state.tasks.length}</current_task_count>`,
    `<current_memory_counts session="${state.sessionFacts.length}" user="${state.userFacts.length}" />`,
    "</tool_rules_context>",
  ].join("\n");
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
  context: PromptBuildContext = {},
): string {
  const resolvedVariables: Record<string, string> = {
    TASK_SUMMARY: context.sessionId ? getTaskSummary(context.sessionId) : "",
    FEEDBACK: context.feedback ?? "",
    ...variables,
  };
  const resolvedBase = resolveVariables(agentBasePrompt, resolvedVariables);

  const parts = [
    "<agent_runtime_prompt>",
    resolvedBase,
    buildPhaseSection(context.phase, context.phasePrompt),
    buildToolRulesSection(context.sessionId),
    buildTaskSection(context.sessionId),
    buildMemorySection(context.sessionId),
  ];
  if (mcpInstructions) parts.push(mcpInstructions);
  parts.push("</agent_runtime_prompt>");

  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

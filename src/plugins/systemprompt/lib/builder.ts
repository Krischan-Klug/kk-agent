import { getActiveInstructions as getCustomActiveInstructions } from "../../mcp/service.js";
import { getActiveToolInstructions, getInternalToolState, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import { getDefaults } from "../../lib/defaults.js";
import type { AgentPromptSections, ChatMode } from "../../agent/types.js";

const RUNTIME_SYSTEM_VARIABLES = [
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_MODEL",
  "iteration",
  "maxIterations",
  "mode",
  "TASK_SUMMARY",
] as const;

export interface PromptBuildContext {
  sessionId?: string;
  mode?: ChatMode;
  toolAccessContext?: string;
}

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

function resolveVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function buildBaseSections(sections: AgentPromptSections, variables: Record<string, string>): string[] {
  return [
    "<identity>",
    resolveVariables(sections.identity, variables),
    "</identity>",
    "<system>",
    resolveVariables(sections.system, variables),
    "</system>",
    "<risky_actions>",
    resolveVariables(sections.riskyActions, variables),
    "</risky_actions>",
    "<tool_usage>",
    resolveVariables(sections.toolUsage, variables),
    "</tool_usage>",
    "<communication>",
    resolveVariables(sections.communication, variables),
    "</communication>",
  ];
}

function buildModeSection(modeInstruction: string, mode?: ChatMode, variables: Record<string, string> = {}): string {
  const effectiveMode = mode ?? "edit";
  return [
    `<mode_context mode="${effectiveMode}">`,
    resolveVariables(modeInstruction, variables),
    "</mode_context>",
  ].join("\n");
}

function buildRuntimeStatusSection(
  sessionId: string | undefined,
  mode: ChatMode | undefined,
  variables: Record<string, string>,
): string {
  if (!sessionId) return "";

  const defaults = getDefaults().agent.runtimeSections;
  const effectiveMode = mode ?? "edit";

  const parts = [
    "<runtime_status>",
    resolveVariables(defaults.runtimeStatusWithSession, variables),
    `<current_mode>${effectiveMode}</current_mode>`,
    `<current_iteration current="${resolveVariables("{{iteration}}", variables)}" max="${resolveVariables("{{maxIterations}}", variables)}" />`,
    "<current_task_summary>",
    resolveVariables("{{TASK_SUMMARY}}", variables),
    "</current_task_summary>",
  ];

  parts.push("</runtime_status>");
  return parts.join("\n");
}

function buildTaskSection(sessionId?: string): string {
  const defaults = getDefaults().agent.runtimeSections;
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
  const defaults = getDefaults().agent.runtimeSections;
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
  const defaults = getDefaults().agent.runtimeSections;
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

export function buildPrompt(
  promptSections: AgentPromptSections,
  modeInstruction: string,
  mcpInstructions: string,
  variables: Record<string, string>,
  context: PromptBuildContext = {},
): string {
  const resolvedVariables: Record<string, string> = {
    TASK_SUMMARY: context.sessionId ? getTaskSummary(context.sessionId) : "",
    ...variables,
  };

  const parts = [
    "<agent_runtime_prompt>",
    ...buildBaseSections(promptSections, resolvedVariables),
    buildModeSection(modeInstruction, context.mode, resolvedVariables),
    buildRuntimeStatusSection(context.sessionId, context.mode, resolvedVariables),
    context.toolAccessContext
      ? ["<tool_access_context>", context.toolAccessContext, "</tool_access_context>"].join("\n")
      : "",
    buildToolRulesSection(context.sessionId),
    buildTaskSection(context.sessionId),
    buildMemorySection(context.sessionId),
  ];
  if (mcpInstructions) parts.push(mcpInstructions);
  parts.push("</agent_runtime_prompt>");

  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

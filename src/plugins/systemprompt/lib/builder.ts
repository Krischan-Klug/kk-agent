import { getActiveInstructions as getCustomActiveInstructions } from "../../mcp/service.js";
import { getActiveToolInstructions, getInternalToolState, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import type { AgentPromptSections, ChatMode } from "../../agent/types.js";
import { getDefaults } from "../../lib/defaults.js";

interface SystemVariableDefinition {
  name: string;
  resolve: (context: ResolvedVariableContext) => string;
}

export interface PromptBuildContext {
  sessionId?: string;
  mode?: ChatMode;
  iteration?: number;
  maxIterations?: number;
}

interface ResolvedVariableContext extends PromptBuildContext {
  rawVariables: Record<string, string>;
  taskSummary: string;
  internalState: ReturnType<typeof getInternalToolState> | null;
  memoryContext: ReturnType<typeof getMemoryPromptContext> | null;
}

function buildTasksInstruction(context: ResolvedVariableContext): string {
  const tasks = context.internalState?.tasks ?? [];
  const openTasks = tasks.filter((task) => task.status !== "completed");

  if (openTasks.length === 0) {
    return getDefaults().misc.noTasksInstruction;
  }

  if (context.mode === "plan") {
    return "Es gibt offene Tasks. Nutze sie in diesem Mode als verbindlichen Planungskontext, verfeinere oder aktualisiere sie bei Bedarf, markiere in diesem Mode aber nichts als erledigt.";
  }

  return "Es gibt offene Tasks. Diese Tasks sind in diesem Mode dein verbindlicher Arbeitsauftrag. Arbeite sie aktiv ab, statt sie nur zu beschreiben, und schliesse erledigte Schritte mit solve_tasks ab.";
}

const SYSTEM_VARIABLE_DEFINITIONS: SystemVariableDefinition[] = [
  {
    name: "CURRENT_DATE",
    resolve: (context) => context.rawVariables.CURRENT_DATE ?? "",
  },
  {
    name: "CURRENT_TIME",
    resolve: (context) => context.rawVariables.CURRENT_TIME ?? "",
  },
  {
    name: "CURRENT_TIMESTAMP",
    resolve: (context) => context.rawVariables.CURRENT_TIMESTAMP ?? "",
  },
  {
    name: "CURRENT_MODEL",
    resolve: (context) => context.rawVariables.CURRENT_MODEL ?? "",
  },
  {
    name: "mode",
    resolve: (context) => context.mode ?? context.rawVariables.mode ?? "edit",
  },
  {
    name: "iteration",
    resolve: (context) => String(context.iteration ?? context.rawVariables.iteration ?? "1"),
  },
  {
    name: "maxIterations",
    resolve: (context) => String(context.maxIterations ?? context.rawVariables.maxIterations ?? "1"),
  },
  {
    name: "TASK_SUMMARY",
    resolve: (context) => context.taskSummary,
  },
  {
    name: "CURRENT_TASKS",
    resolve: (context) => context.taskSummary,
  },
  {
    name: "CURRENT_TASK_COUNT",
    resolve: (context) => String(context.internalState?.tasks.length ?? 0),
  },
  {
    name: "TASKS_INSTRUCTION",
    resolve: (context) => buildTasksInstruction(context),
  },
  {
    name: "USER_MEMORY",
    resolve: (context) => context.memoryContext?.userMemory ?? "Keine gespeicherten User-Fakten vorhanden.",
  },
  {
    name: "SESSION_MEMORY",
    resolve: (context) => context.memoryContext?.sessionMemory ?? "Keine Session-Fakten vorhanden.",
  },
  {
    name: "USER_MEMORY_COUNT",
    resolve: (context) => String(context.internalState?.userFacts.length ?? 0),
  },
  {
    name: "SESSION_MEMORY_COUNT",
    resolve: (context) => String(context.internalState?.sessionFacts.length ?? 0),
  },
  {
    name: "FILESYSTEM_ACCESS_SCOPE",
    resolve: (context) => context.rawVariables.FILESYSTEM_ACCESS_SCOPE ?? "nicht aktiv",
  },
  {
    name: "FILESYSTEM_BASE_PATH",
    resolve: (context) => context.rawVariables.FILESYSTEM_BASE_PATH ?? "nicht verfuegbar",
  },
  {
    name: "FILESYSTEM_ALLOWED_ROOT",
    resolve: (context) => context.rawVariables.FILESYSTEM_ALLOWED_ROOT ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_ACCESS_SCOPE",
    resolve: (context) => context.rawVariables.TERMINAL_ACCESS_SCOPE ?? "nicht aktiv",
  },
  {
    name: "TERMINAL_WORKING_DIRECTORY",
    resolve: (context) => context.rawVariables.TERMINAL_WORKING_DIRECTORY ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_ALLOWED_ROOT",
    resolve: (context) => context.rawVariables.TERMINAL_ALLOWED_ROOT ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_ELEVATION",
    resolve: (context) => context.rawVariables.TERMINAL_ELEVATION ?? "nicht aktiv",
  },
];

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
  return SYSTEM_VARIABLE_DEFINITIONS.map((definition) => definition.name);
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
  ];
}

function buildToolUsageSection(toolUsage: string, variables: Record<string, string>): string {
  return [
    "<tool_usage>",
    resolveVariables(toolUsage, variables),
    "</tool_usage>",
  ].join("\n");
}

function buildModeSection(modeInstruction: string, mode?: ChatMode, variables: Record<string, string> = {}): string {
  const effectiveMode = mode ?? "edit";
  return [
    `<mode_context mode="${effectiveMode}">`,
    resolveVariables(modeInstruction, variables),
    "</mode_context>",
  ].join("\n");
}
function buildResolvedSystemVariables(
  variables: Record<string, string>,
  context: PromptBuildContext,
): Record<string, string> {
  const taskSummary = context.sessionId ? getTaskSummary(context.sessionId) : "Keine aktiven Tasks vorhanden.";
  const internalState = context.sessionId ? getInternalToolState(context.sessionId) : null;
  const memoryContext = context.sessionId ? getMemoryPromptContext(context.sessionId) : null;
  const resolveContext: ResolvedVariableContext = {
    ...context,
    rawVariables: variables,
    taskSummary,
    internalState,
    memoryContext,
  };

  return Object.fromEntries(
    SYSTEM_VARIABLE_DEFINITIONS.map((definition) => [definition.name, definition.resolve(resolveContext)]),
  );
}

export function buildPrompt(
  promptSections: AgentPromptSections,
  modeInstruction: string,
  mcpInstructions: string,
  skillInstructions: string,
  variables: Record<string, string>,
  context: PromptBuildContext = {},
): string {
  const resolvedVariables = {
    ...variables,
    ...buildResolvedSystemVariables(variables, context),
  };

  const parts = [
    "<agent_runtime_prompt>",
    ...buildBaseSections(promptSections, resolvedVariables),
    buildModeSection(modeInstruction, context.mode, resolvedVariables),
    "<tasks>",
    resolveVariables(promptSections.tasks, resolvedVariables),
    "</tasks>",
    "<security>",
    resolveVariables(promptSections.security, resolvedVariables),
    "</security>",
    buildToolUsageSection(promptSections.toolUsage, resolvedVariables),
    resolveVariables(skillInstructions, resolvedVariables),
    "<communication>",
    resolveVariables(promptSections.communication, resolvedVariables),
    "</communication>",
  ];
  if (mcpInstructions) parts.push(resolveVariables(mcpInstructions, resolvedVariables));
  parts.push("</agent_runtime_prompt>");

  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

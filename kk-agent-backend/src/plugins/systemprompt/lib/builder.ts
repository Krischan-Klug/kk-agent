import { getActiveInstructions as getCustomActiveInstructions } from "../../mcp/service.js";
import { getActiveToolInstructions, getInternalToolState, getMemoryPromptContext, getTaskSummary } from "../../tools/service.js";
import type { AgentPromptSections } from "../../agent/types.js";
import { escapeXml, toCData } from "../../lib/xml.js";

interface SystemVariableDefinition {
  name: string;
  resolve: (context: ResolvedVariableContext) => string;
}

interface PromptBuildContext {
  sessionId?: string;
}

interface ResolvedVariableContext extends PromptBuildContext {
  rawVariables: Record<string, string>;
  taskSummary: string;
  internalState: ReturnType<typeof getInternalToolState> | null;
  memoryContext: ReturnType<typeof getMemoryPromptContext> | null;
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
    name: "FILESYSTEM_ROOT",
    resolve: (context) => context.rawVariables.FILESYSTEM_ROOT ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_ACCESS_SCOPE",
    resolve: (context) => context.rawVariables.TERMINAL_ACCESS_SCOPE ?? "nicht aktiv",
  },
  {
    name: "TERMINAL_APPROVAL_MODE",
    resolve: (context) => context.rawVariables.TERMINAL_APPROVAL_MODE ?? "nicht aktiv",
  },
  {
    name: "TERMINAL_ROOT",
    resolve: (context) => context.rawVariables.TERMINAL_ROOT ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_CWD",
    resolve: (context) => context.rawVariables.TERMINAL_CWD ?? "nicht verfuegbar",
  },
  {
    name: "TERMINAL_SHELL",
    resolve: (context) => context.rawVariables.TERMINAL_SHELL ?? "nicht verfuegbar",
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
      return `<tool_instruction id="${escapeXml(capability.id)}" name="${escapeXml(capability.name)}">\n${toCData(instruction)}\n</tool_instruction>`;
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
    buildOptionalTextSection("identity", sections.identity, variables),
    buildOptionalTextSection("core_policy", sections.system, variables),
  ];
}

function buildOptionalTextSection(
  name: string,
  value: string,
  variables: Record<string, string>,
): string {
  const resolved = resolveVariables(value, variables).trim();
  return resolved ? `<${name}>\n${toCData(resolved)}\n</${name}>` : "";
}

function resolveCDataVariables(xml: string, variables: Record<string, string>): string {
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, content: string) =>
    toCData(resolveVariables(content, variables)));
}

function buildOptionalCDataXmlSection(
  name: string,
  value: string,
  variables: Record<string, string>,
): string {
  const resolved = resolveCDataVariables(value, variables).trim();
  return resolved ? `<${name}>\n${resolved}\n</${name}>` : "";
}

function buildToolUsageSection(toolUsage: string, variables: Record<string, string>): string {
  return buildOptionalTextSection("tool_policy", toolUsage, variables);
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
  mcpInstructions: string,
  skillsCatalog: string,
  variables: Record<string, string>,
  context: PromptBuildContext = {},
  runtimeContext = "",
): string {
  const resolvedVariables = {
    ...variables,
    ...buildResolvedSystemVariables(variables, context),
  };

  // Keep stable policy before request-scoped runtime data so providers can
  // cache the reusable prefix.
  const stableParts = [
    "<agent_runtime_prompt>",
    ...buildBaseSections(promptSections, resolvedVariables),
    buildOptionalTextSection("action_policy", promptSections.security, resolvedVariables),
    buildToolUsageSection(promptSections.toolUsage, resolvedVariables),
    buildOptionalCDataXmlSection("capability_instructions", mcpInstructions, resolvedVariables),
    skillsCatalog,
    buildOptionalTextSection("communication", promptSections.communication, resolvedVariables),
    buildOptionalTextSection("context_policy", promptSections.runtime, resolvedVariables),
  ];

  const volatileParts = [
    "<!-- DYNAMIC_CONTEXT_BOUNDARY -->",
    runtimeContext.trim(),
    "</agent_runtime_prompt>",
  ];

  return [...stableParts, ...volatileParts]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
}

import { z } from "zod";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

const NonEmptyStringSchema = z.string().trim().min(1);
const OptionalTrimmedStringSchema = z.string().trim().optional();

const LlmRequestConfigSchema = z.object({
  common: z.object({
    endpoint: z.enum(["chat-completions", "responses"]).optional(),
    reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
    temperature: z.number().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  }).optional(),
  extraBody: z.object({
    "chat-completions": z.record(JsonValueSchema).optional(),
    responses: z.record(JsonValueSchema).optional(),
  }).optional(),
}).optional();

const ToolResultPolicySchema = z.object({
  previewThresholdChars: z.number().int().positive().optional(),
  previewChars: z.number().int().positive().optional(),
});

const SystemConfigSchema = z.object({
  accessScope: z.enum(["user", "system"]).optional(),
  basePath: z.string().optional(),
  workingDirectory: z.string().optional(),
  resultPolicy: ToolResultPolicySchema.optional(),
});

const AgentPromptSectionsSchema = z.object({
  identity: z.string(),
  system: z.string(),
  runtime: z.string(),
  tasks: z.string(),
  security: z.string(),
  toolUsage: z.string(),
  communication: z.string(),
});

const AutonomousBudgetSchema = z.object({
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxWallClockMs: z.number().int().positive().optional(),
  maxConsecutiveAutoContinues: z.number().int().positive().optional(),
});

const AgentModeConfigSchema = z.object({
  promptSections: AgentPromptSectionsSchema,
  modeInstruction: z.string(),
  toolIds: z.array(z.string()),
  mcpIds: z.array(z.string()),
  skillIds: z.array(z.string()),
  toolAccessScopes: z.record(z.enum(["user", "system"])),
  toolInstructions: z.record(z.string()),
  mcpInstructions: z.record(z.string()),
  skillInstructions: z.record(z.string()),
  allowedToolNames: z.array(z.string()),
  autonomousBudget: AutonomousBudgetSchema.optional(),
});

const AgentModeDefinitionSchema = z.object({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  behavior: z.enum(["plan", "edit", "autonomous"]),
  source: z.enum(["builtin", "custom"]),
  enabled: z.boolean(),
  config: AgentModeConfigSchema,
});

/* Primitive request bodies */

export const ToggleBodySchema = z.object({
  active: z.boolean(),
});

export const InstructionBodySchema = z.object({
  instruction: z.string(),
});

export const PromptResponseBodySchema = z.object({
  promptId: NonEmptyStringSchema,
  selectedKey: NonEmptyStringSchema,
});

/* Session */

export const ChatBodySchema = z.object({
  message: z.string(),
  attachmentIds: z.array(NonEmptyStringSchema).optional(),
});

export const CreateSessionBodySchema = z.object({
  agentId: NonEmptyStringSchema,
  providerId: OptionalTrimmedStringSchema,
  activeModeId: OptionalTrimmedStringSchema,
  model: OptionalTrimmedStringSchema,
  activeToolIds: z.array(NonEmptyStringSchema).optional(),
  activeMcpIds: z.array(NonEmptyStringSchema).optional(),
  activeSkillIds: z.array(NonEmptyStringSchema).optional(),
  llmRequestConfig: LlmRequestConfigSchema,
});

export const UpdateSessionBodySchema = z.object({
  agentId: OptionalTrimmedStringSchema,
  providerId: OptionalTrimmedStringSchema,
  activeModeId: OptionalTrimmedStringSchema,
  model: OptionalTrimmedStringSchema,
  activeToolIds: z.array(NonEmptyStringSchema).optional(),
  activeMcpIds: z.array(NonEmptyStringSchema).optional(),
  activeSkillIds: z.array(NonEmptyStringSchema).optional(),
  llmRequestConfig: LlmRequestConfigSchema,
});

/* MCP */

export const CreateMcpBodySchema = z.object({
  name: NonEmptyStringSchema,
  transport: z.enum(["stdio", "sse"]),
  command: OptionalTrimmedStringSchema,
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: OptionalTrimmedStringSchema,
  instruction: z.string().optional(),
  emoji: z.string().optional(),
  skillIds: z.array(NonEmptyStringSchema).optional(),
}).superRefine((body, ctx) => {
  if (body.transport === "stdio" && !body.command) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["command"], message: "command is required for stdio MCPs" });
  }
  if (body.transport === "sse" && !body.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "url is required for SSE MCPs" });
  }
});

export const UpdateMcpBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  active: z.boolean().optional(),
  transport: z.enum(["stdio", "sse"]).optional(),
  command: OptionalTrimmedStringSchema,
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: OptionalTrimmedStringSchema,
  instruction: z.string().optional(),
  emoji: z.string().optional(),
  systemConfig: SystemConfigSchema.optional(),
  skillIds: z.array(NonEmptyStringSchema).optional(),
});

/* Agent */

export const CreateAgentBodySchema = z.object({
  name: NonEmptyStringSchema,
  description: z.string().optional(),
  defaultModeId: OptionalTrimmedStringSchema,
  modes: z.array(AgentModeDefinitionSchema).optional(),
  variables: z.record(z.string()).optional(),
  defaultProviderId: OptionalTrimmedStringSchema,
  defaultModel: OptionalTrimmedStringSchema,
  llmRequestConfig: LlmRequestConfigSchema,
});

export const UpdateAgentBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  description: z.string().optional(),
  defaultModeId: OptionalTrimmedStringSchema,
  modes: z.array(AgentModeDefinitionSchema).optional(),
  variables: z.record(z.string()).optional(),
  defaultProviderId: OptionalTrimmedStringSchema,
  defaultModel: OptionalTrimmedStringSchema,
  llmRequestConfig: LlmRequestConfigSchema,
});

/* Skill */

export const CreateSkillBodySchema = z.object({
  name: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  instruction: NonEmptyStringSchema,
  active: z.boolean().optional(),
  recommendedToolIds: z.array(NonEmptyStringSchema).optional(),
  recommendedMcpIds: z.array(NonEmptyStringSchema).optional(),
  allowedModeBehaviors: z.array(z.enum(["plan", "edit", "autonomous"])).optional(),
});

export const UpdateSkillBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  description: OptionalTrimmedStringSchema,
  instruction: OptionalTrimmedStringSchema,
  active: z.boolean().optional(),
  recommendedToolIds: z.array(z.string()).optional(),
  recommendedMcpIds: z.array(z.string()).optional(),
  allowedModeBehaviors: z.array(z.enum(["plan", "edit", "autonomous"])).optional(),
});

/* Provider */

export const CreateProviderBodySchema = z.object({
  name: NonEmptyStringSchema,
  baseUrl: NonEmptyStringSchema,
  apiKey: z.string().optional(),
});

export const UpdateProviderBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  baseUrl: OptionalTrimmedStringSchema,
  apiKey: z.string().optional(),
});

export const ModelSettingsBodySchema = z.object({
  providerId: NonEmptyStringSchema,
  settings: z.object({
    llmRequestConfig: LlmRequestConfigSchema,
  }),
});

/* Tools / Memory / Tasks */

export const TaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
  notes: z.string().optional(),
});

export const TaskItemsBodySchema = z.object({
  tasks: z.array(TaskItemSchema).optional(),
});

export const MemoryFactSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const MemoryFactsBodySchema = z.object({
  facts: z.array(MemoryFactSchema).optional(),
});

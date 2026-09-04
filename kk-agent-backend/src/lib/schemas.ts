import { z } from "zod";

const NonEmptyStringSchema = z.string().trim().min(1);
const OptionalTrimmedStringSchema = z.string().trim().optional();

const LlmRequestConfigSchema = z
  .object({
    reasoning: z
      .object({
        effort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
        history: z.enum(["auto", "discard", "latest", "tool-turns", "all"]).optional(),
      })
      .optional(),
    sampling: z
      .object({
        temperature: z.number().min(0).max(2).optional(),
        topP: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .optional();

const ToolResultPolicySchema = z.object({
  previewThresholdChars: z.number().int().positive().optional(),
  previewChars: z.number().int().positive().optional(),
});

const InternalToolConfigSchema = z.object({
  resultPolicy: ToolResultPolicySchema.optional(),
});

export const SecuritySettingsBodySchema = z.object({
  accessScope: z.enum(["user", "system"]),
  approvalMode: z.enum(["ask_approval", "full_access"]),
});

const AgentPromptSectionsSchema = z.object({
  identity: z.string(),
  system: z.string(),
  runtime: z.string(),
  security: z.string(),
  toolUsage: z.string(),
  communication: z.string(),
});

const AgentConfigSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  promptSections: AgentPromptSectionsSchema,
  toolIds: z.array(z.string()),
  mcpIds: z.array(z.string()),
  skillIds: z.array(z.string()),
  toolAccessScopes: z.record(z.enum(["user", "system"])),
  toolInstructions: z.record(z.string()),
  mcpInstructions: z.record(z.string()),
  allowedToolNames: z.array(z.string()),
});

export const PromptResponseBodySchema = z.object({
  promptId: NonEmptyStringSchema,
  selectedKey: NonEmptyStringSchema,
});

/* Session */

export const ChatBodySchema = z.object({
  message: z.string(),
  assetIds: z.array(NonEmptyStringSchema).max(10).optional(),
});

export const CreateSessionBodySchema = z.object({
  agentId: NonEmptyStringSchema,
  providerId: OptionalTrimmedStringSchema,
  approvalMode: z.enum(["ask_approval", "full_access"]).optional(),
  model: OptionalTrimmedStringSchema,
  activeToolIds: z.array(NonEmptyStringSchema).optional(),
  activeMcpIds: z.array(NonEmptyStringSchema).optional(),
  activeSkillIds: z.array(NonEmptyStringSchema).optional(),
  llmRequestConfig: LlmRequestConfigSchema,
}).strict();

export const UpdateSessionBodySchema = z.object({
  agentId: OptionalTrimmedStringSchema,
  providerId: OptionalTrimmedStringSchema,
  approvalMode: z.enum(["ask_approval", "full_access"]).optional(),
  model: OptionalTrimmedStringSchema,
  activeToolIds: z.array(NonEmptyStringSchema).optional(),
  activeMcpIds: z.array(NonEmptyStringSchema).optional(),
  activeSkillIds: z.array(NonEmptyStringSchema).optional(),
  llmRequestConfig: LlmRequestConfigSchema,
});

/* MCP */

export const CreateMcpBodySchema = z
  .object({
    name: NonEmptyStringSchema,
    transport: z.enum(["stdio", "sse"]),
    command: OptionalTrimmedStringSchema,
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: OptionalTrimmedStringSchema,
    instruction: z.string().optional(),
    emoji: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.transport === "stdio" && !body.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: "command is required for stdio MCPs",
      });
    }
    if (body.transport === "sse" && !body.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "url is required for SSE MCPs",
      });
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
}).strict();

export const UpdateInternalToolBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  active: z.boolean().optional(),
  instruction: z.string().optional(),
  emoji: z.string().optional(),
  config: InternalToolConfigSchema.optional(),
});

/* Agent */

export const CreateAgentBodySchema = AgentConfigSchema.partial().extend({
  name: NonEmptyStringSchema,
  description: z.string().optional(),
  variables: z.record(z.string()).optional(),
  defaultProviderId: OptionalTrimmedStringSchema,
  defaultModel: OptionalTrimmedStringSchema,
  llmRequestConfig: LlmRequestConfigSchema,
}).strict();

export const UpdateAgentBodySchema = AgentConfigSchema.partial().extend({
  name: OptionalTrimmedStringSchema,
  description: z.string().optional(),
  variables: z.record(z.string()).optional(),
  defaultProviderId: OptionalTrimmedStringSchema,
  defaultModel: OptionalTrimmedStringSchema,
  llmRequestConfig: LlmRequestConfigSchema,
});

/* Provider */

export const CreateProviderBodySchema = z.object({
  name: NonEmptyStringSchema,
  baseUrl: NonEmptyStringSchema,
  apiKey: z.string().optional(),
}).strict();

export const UpdateProviderBodySchema = z.object({
  name: OptionalTrimmedStringSchema,
  baseUrl: OptionalTrimmedStringSchema,
  apiKey: z.string().optional(),
}).strict();

export const ModelSettingsBodySchema = z.object({
  providerId: NonEmptyStringSchema,
  settings: z.object({
    profileId: NonEmptyStringSchema.optional(),
    contextLimit: z.number().int().positive().optional(),
    llmRequestConfig: LlmRequestConfigSchema,
  }).strict(),
}).strict();

/* Tools / Memory / Tasks */

const TaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
  notes: z.string().optional(),
});

export const TaskItemsBodySchema = z.object({
  tasks: z.array(TaskItemSchema).optional(),
});

const MemoryFactSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const MemoryFactsBodySchema = z.object({
  facts: z.array(MemoryFactSchema).optional(),
});

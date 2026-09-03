import type { InternalToolConfig, InternalToolDefinition, InternalToolId } from "../types.js";

type InternalToolDefinitionInput = {
  id: InternalToolId;
  name: string;
  instruction: string;
  emoji: string;
  config?: InternalToolConfig;
};

export function defineInternalTool({
  id,
  name,
  instruction,
  emoji,
  config = {},
}: InternalToolDefinitionInput): InternalToolDefinition {
  return {
    id,
    name,
    active: true,
    instruction,
    emoji,
    config,
  };
}

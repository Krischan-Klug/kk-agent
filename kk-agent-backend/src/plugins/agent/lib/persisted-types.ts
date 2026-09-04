import type {
  AgentConfig,
  AgentDefinition,
} from "../types.js";

export interface PersistedAgentsState {
  schemaVersion: number;
  agents: PersistedAgentDefinition[];
}

export interface PersistedAgentDefinition
  extends Omit<AgentDefinition, keyof AgentConfig> {
  configOverrides?: Partial<AgentConfig>;
}

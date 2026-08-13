import type {
  AgentDefinition,
  AgentModeConfig,
  ModeBehavior,
} from "../types.js";
import type { AgentModeSource } from "kk-agent-contract";

export interface PersistedAgentsState {
  schemaVersion: number;
  agents: PersistedAgentDefinition[];
}

export interface PersistedAgentDefinition
  extends Omit<AgentDefinition, "modes"> {
  modes: PersistedAgentModeDefinition[];
}

export interface PersistedAgentModeDefinition {
  id: string;
  label: string;
  behavior: ModeBehavior;
  source: AgentModeSource;
  enabled: boolean;
  configOverrides?: Partial<AgentModeConfig>;
}

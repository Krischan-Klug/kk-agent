import type {
  AgentDefinition,
  AgentModeConfig,
  ModeBehavior,
} from "../types.js";
import type { AgentModeSource } from "@krischan-klug/kk-agent-contract";

export interface PersistedAgentsState {
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

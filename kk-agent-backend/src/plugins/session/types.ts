import type { ProviderTransportState } from "../provider/lib/types.js";
import type { AgentRun, ModelInputDebug, SessionState } from "kk-agent-contract";

export type {
  CreateSessionBody,
  SessionState,
  SessionPromptDebug,
  StreamEvent as SSEEvent,
} from "kk-agent-contract";

export interface PersistedAgentRun extends AgentRun {
  modelInputs: ModelInputDebug[];
}

export interface SessionRecord extends Omit<SessionState, "runs"> {
  runs: PersistedAgentRun[];
  schemaVersion: number;
  providerState?: ProviderTransportState;
  loadedSkillIds: string[];
}

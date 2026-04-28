import type { ProviderTransportState } from "../provider/lib/types.js";
import type { SessionState } from "@krischan-klug/kk-agent-contract";

export type {
  CreateSessionBody,
  SessionState,
  SessionPromptDebug,
  StreamEvent as SSEEvent,
} from "@krischan-klug/kk-agent-contract";

export interface SessionRecord extends SessionState {
  providerState?: ProviderTransportState;
}

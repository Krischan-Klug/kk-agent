import type { ProviderTransportState, ProviderTurnDebug } from "../provider/lib/types.js";
import type { SessionState } from "@krischan-klug/kk-agent-contract";

export type {
  AttachmentDisplayMeta,
  AttachmentMeta,
  CreateSessionBody,
  SessionState,
  SessionPromptDebug,
  StreamEvent as SSEEvent,
  UpdateSessionBody,
} from "@krischan-klug/kk-agent-contract";

export interface SessionRecord extends SessionState {
  providerState?: ProviderTransportState;
}

export interface ChatBody {
  message: string;
  attachmentIds?: string[];
}

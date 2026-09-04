import { randomUUID } from "node:crypto";
import type {
  AgentLoopState,
  RunErrorCategory,
  RunEvent,
  RunEventKind,
  RunEventSeverity,
  RunEventVisibility,
  TranscriptMessage,
} from "kk-agent-contract";
import type { LoopCheckpoint, LoopOptions, ToolRuntimeContext } from "../types.js";
import { classifyProviderError } from "../../provider/lib/errors.js";
import { getErrorMessage } from "../../../lib/error.js";

export interface TerminalOutcome {
  status: Exclude<LoopCheckpoint["status"], "running" | "completed">;
  kind: Extract<RunEventKind, "run_limit" | "run_failed" | "run_aborted" | "output_limit">;
  severity: RunEventSeverity;
  errorCategory: RunErrorCategory;
  code: string;
  message: string;
  detail?: string;
  anchorMessageId?: string;
}

export class RunFailure extends Error {
  constructor(readonly outcome: TerminalOutcome) {
    super(outcome.detail ?? outcome.message);
    this.name = "RunFailure";
  }
}

export class AbortedError extends Error {
  constructor() {
    super("Loop aborted by signal");
    this.name = "AbortedError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError();
}

export async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function cloneToolContext(context: ToolRuntimeContext): ToolRuntimeContext {
  return { ...context, values: structuredClone(context.values) };
}

export function buildLoopState(opts: LoopOptions): AgentLoopState {
  const now = new Date().toISOString();
  return {
    runId: opts.runId,
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    step: 0,
    attempt: 0,
    toolBatch: 0,
    startedAt: now,
    updatedAt: now,
  };
}

export function updateLoopState(
  state: AgentLoopState,
  opts: Pick<LoopOptions, "onLoopState">,
  patch: Partial<AgentLoopState>,
): void {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  opts.onLoopState?.({ ...state });
}

function latestAnchorMessageId(messages: TranscriptMessage[], fallback: string): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" || message?.role === "user") return message.id;
  }
  return fallback;
}

export async function emitRunEvent(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  counters: Pick<AgentLoopState, "step" | "attempt">,
  input: {
    kind: RunEventKind;
    severity: RunEventSeverity;
    visibility?: RunEventVisibility;
    terminal?: boolean;
    errorCategory?: RunErrorCategory;
    message: string;
    code?: string;
    detail?: string;
    anchorMessageId?: string;
  },
): Promise<void> {
  const event: RunEvent = {
    id: randomUUID(),
    runId: opts.runId,
    sessionId: opts.sessionId,
    anchorMessageId: input.anchorMessageId ?? latestAnchorMessageId(messages, opts.userMessageId),
    kind: input.kind,
    severity: input.severity,
    visibility: input.visibility ?? "debug",
    terminal: input.terminal ?? false,
    errorCategory: input.errorCategory,
    message: input.message,
    code: input.code,
    detail: input.detail?.slice(0, 4000),
    step: counters.step,
    attempt: counters.attempt,
    createdAt: new Date().toISOString(),
  };
  await opts.onRunEvent?.(event);
}

function isProviderConfigurationError(error: unknown, status?: number): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return status === 400
    || status === 401
    || status === 403
    || status === 404
    || message.includes("api key")
    || message.includes("authentication")
    || message.includes("unauthorized")
    || message.includes("model not found")
    || message.includes("provider config");
}

export function providerRunFailure(error: unknown): RunFailure {
  const classified = classifyProviderError(error);
  const detail = getErrorMessage(error);
  if (classified.kind === "model_unloaded") {
    return new RunFailure({
      status: "failed",
      kind: "run_failed",
      severity: "error",
      errorCategory: "configuration",
      code: "provider_model_unloaded",
      message: "The selected model is not loaded. Load it in the provider and start the run again.",
      detail,
    });
  }
  if (classified.kind === "prompt_too_long") {
    return new RunFailure({
      status: "failed",
      kind: "run_failed",
      severity: "error",
      errorCategory: "limit",
      code: "provider_context_limit_exhausted",
      message: "The run could not continue because the model context limit was exhausted.",
      detail,
    });
  }
  if (isProviderConfigurationError(error, classified.status)) {
    return new RunFailure({
      status: "failed",
      kind: "run_failed",
      severity: "error",
      errorCategory: "configuration",
      code: "provider_configuration_required",
      message: "The provider needs attention. Check its model, credentials, and configuration, then try again.",
      detail,
    });
  }
  return new RunFailure({
    status: "failed",
    kind: "run_failed",
    severity: "error",
    errorCategory: "provider_fatal",
    code: "provider_recovery_exhausted",
    message: "The provider could not complete the run after recovery attempts. The completed partial work was preserved.",
    detail,
  });
}

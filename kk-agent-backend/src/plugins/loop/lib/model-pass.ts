import { randomUUID } from "node:crypto";
import type { ModelInputDebug, TranscriptMessage } from "kk-agent-contract";
import { repairTranscript } from "kk-agent-contract";
import type { LoopOptions } from "../types.js";
import type { PreparedProviderRequest } from "../../provider/lib/types.js";
import { callProviderStream, getModelCompactionProfile } from "../../provider/service.js";
import { buildPrompt, getSystemVariables } from "../../systemprompt/lib/builder.js";
import {
  buildCompactionMessages,
  COMPACTION_INSTRUCTIONS,
  estimateTextTokens,
} from "./context-compaction.js";
import { runContextCompaction } from "./context-compaction-runner.js";
import { getErrorMessage } from "../../../lib/error.js";

function buildInstructions(systemPrompt: string, retryInstruction?: string): string {
  return [
    systemPrompt.trim(),
    retryInstruction?.trim()
      ? `<retry_directive>\n${retryInstruction.trim()}\n</retry_directive>`
      : "",
  ].filter(Boolean).join("\n\n");
}

export function buildModelPassInput(
  opts: LoopOptions,
  runtimeContext: string,
  retryInstruction?: string,
): { instructions: string; estimatedFixedTokens: number } {
  const runtimeConfig = opts.runtimeConfig;
  const variables: Record<string, string> = {
    ...getSystemVariables({ CURRENT_MODEL: opts.model }),
    ...(runtimeConfig.runtimeVariables ?? {}),
    ...opts.agentVariables,
  };
  const systemPrompt = buildPrompt(
    runtimeConfig.promptSections,
    runtimeConfig.mcpInstructions,
    runtimeConfig.skillsCatalog,
    variables,
    { sessionId: opts.sessionId },
    runtimeContext,
  );
  const instructions = buildInstructions(systemPrompt, retryInstruction);
  const estimatedFixedTokens = estimateTextTokens(instructions)
    + estimateTextTokens(JSON.stringify(runtimeConfig.allTools))
    + 64;
  return { instructions, estimatedFixedTokens };
}

async function recordPreparedModelInput(
  opts: LoopOptions,
  prepared: PreparedProviderRequest,
  step: number,
  attempt: number,
  purpose: "agent" | "compaction" | "recovery",
): Promise<string | undefined> {
  const id = randomUUID();
  await opts.onModelInput?.({
    id,
    purpose,
    step,
    attempt,
    createdAt: new Date().toISOString(),
    endpoint: prepared.endpoint,
    profileId: prepared.resolvedLlmRequestConfig.profileId,
    instructions: prepared.instructions,
    messages: structuredClone(prepared.messages),
    projectedContent: Object.fromEntries(
      Object.entries(prepared.modelContentByMessageId ?? {}).map(([messageId, parts]) => [
        messageId,
        parts.map((part) => part.type === "text"
          ? { type: "text" as const, text: part.text }
          : { type: "image" as const, detail: part.detail, binaryOmitted: true as const }),
      ]),
    ),
    tools: (prepared.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: structuredClone(tool.parameters),
    })),
    requestConfig: structuredClone(prepared.resolvedLlmRequestConfig),
    providerRequestBody: structuredClone(prepared.providerRequestBody),
  });
  return id;
}

export async function runModelPass(
  opts: LoopOptions,
  messages: TranscriptMessage[],
  providerState: LoopOptions["providerState"],
  retryInstruction?: string,
  runtimeContext = "",
  step = 0,
  attempt = 0,
  purpose: "agent" | "recovery" = "agent",
) {
  const runtimeConfig = opts.runtimeConfig;
  const modelPassInput = buildModelPassInput(opts, runtimeContext, retryInstruction);

  let receivedProviderStats = false;
  const streamedMessageIds = new Set<string>();
  let response;
  try {
    response = await callProviderStream({
      providerId: opts.providerId,
      model: opts.model,
      instructions: modelPassInput.instructions,
      messages: repairTranscript(messages),
      tools: runtimeConfig.allTools.length > 0 ? runtimeConfig.allTools : undefined,
      llmRequestConfig: opts.llmRequestConfig,
      transportState: providerState,
      modelContentByMessageId: opts.modelContentByMessageId,
      signal: opts.abortSignal,
    }, (chunk) => {
      if (chunk.type === "assistant_block_delta") {
        streamedMessageIds.add(chunk.messageId);
        opts.onAssistantBlockDelta?.(chunk.messageId, chunk.block);
        return;
      }
      if (chunk.type === "assistant_message") {
        streamedMessageIds.add(chunk.message.id);
        opts.onAssistantMessage?.(chunk.message);
        return;
      }
      if (chunk.type === "stats") {
        receivedProviderStats = true;
        opts.onStats?.(chunk.stats);
      }
    }, async (prepared) => {
      await recordPreparedModelInput(opts, prepared, step, attempt, purpose);
    });
  } catch (error) {
    if (streamedMessageIds.size > 0) opts.onAssistantAttemptDiscarded?.([...streamedMessageIds]);
    throw error;
  }

  if (!receivedProviderStats) {
    opts.onStats?.({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, source: "unknown" });
  }
  return response;
}

export async function compactModelContext(
  opts: LoopOptions,
  contextMessages: TranscriptMessage[],
  contextLimit: number,
  step: number,
  attempt: number,
): Promise<{
  summary: string;
  debugInputId?: string;
  outcome: NonNullable<ModelInputDebug["outcome"]>;
}> {
  const profile = getModelCompactionProfile(opts.providerId, opts.model);
  return runContextCompaction({
    messages: contextMessages,
    contextLimit,
    profile,
    onOutcome: async (debugInputId, outcome) => {
      await opts.onModelInputOutcome?.(debugInputId, outcome);
    },
    execute: async (passRequest) => {
      const compactionMessages = buildCompactionMessages(
        passRequest.evidence,
        passRequest.repairCandidate,
      );
      let debugInputId: string | undefined;
      try {
        const response = await callProviderStream({
          providerId: opts.providerId,
          model: opts.model,
          purpose: "compaction",
          instructions: COMPACTION_INSTRUCTIONS,
          messages: compactionMessages,
          llmRequestConfig: {
            ...opts.llmRequestConfig,
            reasoning: { effort: profile.reasoningEffort, history: "discard" },
          },
          maxOutputTokens: profile.maxOutputTokens,
          signal: opts.abortSignal,
        }, () => undefined, async (prepared) => {
          debugInputId = await recordPreparedModelInput(opts, prepared, step, attempt, "compaction");
        });
        return { response, debugInputId };
      } catch (error) {
        if (debugInputId) {
          await opts.onModelInputOutcome?.(debugInputId, {
            status: "failed",
            compactionPass: passRequest.pass,
            compactionStage: passRequest.stage,
            evidenceChars: passRequest.evidence.length,
            validationErrors: [getErrorMessage(error)],
          });
        }
        throw error;
      }
    },
  });
}

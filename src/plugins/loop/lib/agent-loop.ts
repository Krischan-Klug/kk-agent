import type { UnifiedMessage, UnifiedToolDefinition } from "../../provider/lib/types.js";
import type { LoopOptions, LoopResult, LoopMessage } from "../types.js";
import type { AgentLoopState } from "../../agent/types.js";
import { callProviderStream } from "../../provider/service.js";
import { buildPrompt } from "../../systemprompt/service.js";
import { getSystemVariables } from "../../systemprompt/lib/builder.js";
import { compactContext, DEFAULT_COMPACTION_PROMPT } from "./compaction.js";

/* ── Constants ── */

const INVALID_TOOL_RETRY_BUDGET = 2;
const EMPTY_RESPONSE_RETRY_BUDGET = 1;
const LENGTH_RETRY_BUDGET = 1;

const INVALID_TOOL_CALL_PATTERNS = [
  /<tool_call\b/i,
  /<function=/i,
  /<parameter=/i,
  /<\/function>/i,
  /<\/tool_call>/i,
];

const EMPTY_RESPONSE_RETRY_INSTRUCTION = [
  "Dein letzter Versuch war leer oder praktisch inhaltslos.",
  "Gib jetzt entweder eine normale inhaltliche Antwort oder einen echten strukturierten tool_call aus.",
  "Antworte nicht leer und wiederhole keine Meta-Ausgabe.",
].join(" ");

const INVALID_TOOL_RETRY_INSTRUCTION = [
  "Dein letzter Versuch hat einen Tool-Aufruf nur als Text oder Thinking ausgegeben.",
  "Wichtig: Tools duerfen nur ueber strukturierte tool_calls der API aufgerufen werden.",
  "Freitext, XML, Markdown oder Thinking werden nicht als Tool-Aufruf interpretiert.",
  "Antworte jetzt entweder mit einer normalen Antwort oder sende einen echten strukturierten Tool-Call.",
].join(" ");

const LENGTH_RETRY_INSTRUCTION = [
  "Deine letzte Antwort wurde wegen Token-Limit abgeschnitten.",
  "Fahre nahtlos fort und wiederhole keine bereits ausgegebenen Inhalte.",
  "Wenn ein kuerzeres Ergebnis reicht, fasse dich jetzt kompakter.",
].join(" ");

const POST_COMPACTION_INSTRUCTION = [
  "Der vorherige Kontext wurde intern komprimiert.",
  "Die kompaktierte Summary ist interner Arbeitskontext und keine neue Nutzernachricht.",
  "Fuehre dieselbe Aufgabe weiter.",
  "Beginne nicht neu, wiederhole keine Begruessung und gib keine Meta-Antwort zur Compaction.",
].join(" ");

/* ── Helpers ── */

function looksLikeInvalidToolAttempt(content: string, reasoning?: string): boolean {
  const combined = `${content}\n${reasoning ?? ""}`;
  return INVALID_TOOL_CALL_PATTERNS.some((pattern) => pattern.test(combined));
}

function hasVisibleContent(content: string): boolean {
  return content.trim().length > 0;
}

function serializeMessagesForModel(messages: LoopMessage[]): UnifiedMessage[] {
  return messages
    .filter((m) => !(m.role === "system" && m.kind === "compaction"))
    .map((m) => ({
      role: m.role,
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls,
    }));
}

function getLastMessageContent(messages: LoopMessage[], role: LoopMessage["role"]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return undefined;
}

function toUnifiedTools(tools: LoopOptions["allTools"]): UnifiedToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/* ── Main Loop ── */

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const visibleMessages: LoopMessage[] = [...opts.messages];
  const contextMessages: LoopMessage[] = [...opts.messages];
  const tools = toUnifiedTools(opts.allTools);

  let iteration = 0;
  let lastContent = "";
  let lastMeaningfulContent = "";
  let invalidToolAttemptCount = 0;
  let emptyResponseRetryCount = 0;
  let lengthRetryCount = 0;
  let retryInstruction: string | undefined;
  let pendingCompaction = false;
  let postCompactionInstruction: string | undefined;

  const loopState: AgentLoopState = {
    sessionId: opts.sessionId,
    agentId: opts.agentId,
    status: "running",
    iteration: 0,
    maxIterations: opts.maxIterations,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  opts.onLoopState?.(loopState);

  const cumulativeStats = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  while (iteration < opts.maxIterations) {
    iteration++;

    // ── Compaction ──
    if (pendingCompaction) {
      const prompt = opts.compactionPrompt ?? DEFAULT_COMPACTION_PROMPT;
      const compactionMarker: LoopMessage = {
        role: "system",
        kind: "compaction",
        content: `Kontext komprimiert bei Iteration ${iteration - 1}/${opts.maxIterations}`,
      };
      visibleMessages.push(compactionMarker);
      opts.onCompaction?.(compactionMarker);

      const compacted = await compactContext(
        serializeMessagesForModel(contextMessages),
        prompt,
        opts.model,
        {
          iteration: Math.max(iteration - 1, 1),
          maxIterations: opts.maxIterations,
          lastUserMessage: getLastMessageContent(contextMessages, "user"),
          lastAssistantMessage: getLastMessageContent(contextMessages, "assistant"),
        },
      );
      contextMessages.length = 0;
      contextMessages.push(...compacted.map((m) => ({
        role: m.role as LoopMessage["role"],
        content: m.content,
        kind: m.role === "system" ? ("internal_summary" as const) : undefined,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls,
      })));
      cumulativeStats.inputTokens = 0;
      pendingCompaction = false;
      postCompactionInstruction = POST_COMPACTION_INSTRUCTION;
    }

    // ── Build system prompt ──
    const variables: Record<string, string> = {
      ...getSystemVariables(),
      iteration: String(iteration),
      maxIterations: String(opts.maxIterations),
      mcpInstructions: opts.mcpInstructions,
      ...opts.agentVariables,
    };
    const systemPrompt = buildPrompt(opts.systemPrompt, opts.mcpInstructions, variables);

    // ── Prepare messages ──
    const messagesWithSystem: UnifiedMessage[] = [
      { role: "system", content: systemPrompt },
      ...(retryInstruction ? [{ role: "system" as const, content: retryInstruction }] : []),
      ...(postCompactionInstruction ? [{ role: "system" as const, content: postCompactionInstruction }] : []),
      ...serializeMessagesForModel(contextMessages),
    ];
    retryInstruction = undefined;
    postCompactionInstruction = undefined;

    // ── Call LLM (streaming) ──
    const streamedChunks: Array<{ type: "content" | "reasoning"; content: string }> = [];

    const response = await callProviderStream(
      {
        model: opts.model,
        messages: messagesWithSystem,
        tools: tools.length > 0 ? tools : undefined,
        reasoningEffort: opts.reasoningEffort,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      },
      (chunk) => {
        if (chunk.type === "content" && chunk.content) {
          streamedChunks.push({ type: "content", content: chunk.content });
        } else if (chunk.type === "reasoning" && chunk.content) {
          streamedChunks.push({ type: "reasoning", content: chunk.content });
        } else if (chunk.type === "stats" && chunk.stats) {
          cumulativeStats.inputTokens = chunk.stats.inputTokens;
          cumulativeStats.outputTokens += chunk.stats.outputTokens;
          cumulativeStats.reasoningTokens += chunk.stats.reasoningTokens;
          opts.onStats?.({ ...cumulativeStats });
        }
      },
    );

    // ── Compaction threshold check ──
    if (opts.maxContextTokens && cumulativeStats.inputTokens > 0) {
      const threshold = opts.compactionThreshold ?? 0.8;
      if (cumulativeStats.inputTokens >= opts.maxContextTokens * threshold) {
        pendingCompaction = true;
      }
    }

    const messageContent = response.content.trim();
    const messageReasoning = response.reasoning?.trim() || undefined;
    const toolsCalled = response.tool_calls ?? [];

    // ── Length retry (simple: once) ──
    if (response.finishReason === "length" && lengthRetryCount < LENGTH_RETRY_BUDGET) {
      lengthRetryCount++;
      retryInstruction = LENGTH_RETRY_INSTRUCTION;
      continue;
    }
    if (response.finishReason !== "length") {
      lengthRetryCount = 0;
    }

    // ── Invalid tool attempt retry ──
    const invalidToolAttempt =
      response.finishReason !== "tool_calls"
      && toolsCalled.length === 0
      && looksLikeInvalidToolAttempt(messageContent, messageReasoning);

    if (invalidToolAttempt) {
      invalidToolAttemptCount++;
      if (invalidToolAttemptCount <= INVALID_TOOL_RETRY_BUDGET) {
        opts.onRetryNotice?.("Modellantwort wurde verworfen: Tool-Aufruf nur als Text statt strukturierter tool_call. Korrekturversuch.");
        retryInstruction = INVALID_TOOL_RETRY_INSTRUCTION;
        continue;
      }
      loopState.status = "error";
      loopState.updatedAt = new Date().toISOString();
      opts.onLoopState?.(loopState);
      throw new Error("Model emitted pseudo-formatted tool calls instead of structured tool_calls.");
    }
    invalidToolAttemptCount = 0;

    // ── Empty response retry ──
    const emptyResponse =
      response.finishReason === "stop"
      && toolsCalled.length === 0
      && !hasVisibleContent(messageContent)
      && !messageReasoning;

    if (emptyResponse) {
      emptyResponseRetryCount++;
      if (emptyResponseRetryCount <= EMPTY_RESPONSE_RETRY_BUDGET) {
        opts.onRetryNotice?.("Modellantwort war leer. Korrekturversuch.");
        retryInstruction = EMPTY_RESPONSE_RETRY_INSTRUCTION;
        continue;
      }
      loopState.status = "error";
      loopState.updatedAt = new Date().toISOString();
      opts.onLoopState?.(loopState);
      throw new Error("Model returned an empty response twice in a row.");
    }
    emptyResponseRetryCount = 0;

    // ── Emit streamed content (delayed until validated) ──
    for (const chunk of streamedChunks) {
      if (chunk.type === "content") {
        opts.onContent?.(chunk.content);
      } else {
        opts.onReasoning?.(chunk.content);
      }
    }

    // ── Save assistant message ──
    lastContent = messageContent;
    if (hasVisibleContent(messageContent)) {
      lastMeaningfulContent = messageContent;
    }

    const assistantMessage: LoopMessage = {
      role: "assistant",
      content: messageContent,
      reasoning: messageReasoning,
      tool_calls: toolsCalled.length > 0 ? toolsCalled : undefined,
    };

    if (toolsCalled.length > 0 || hasVisibleContent(messageContent) || messageReasoning) {
      visibleMessages.push(assistantMessage);
      contextMessages.push(assistantMessage);
    }

    // ── Execute tool calls ──
    if (response.finishReason === "tool_calls" && toolsCalled.length > 0) {
      for (const tc of toolsCalled) {
        opts.onToolCall?.(tc);
        const result = await opts.executeTool(tc.name, tc.arguments);
        opts.onToolResult?.(tc.id, result);

        const toolMessage: LoopMessage = {
          role: "tool",
          content: result.content,
          tool_call_id: tc.id,
        };
        visibleMessages.push(toolMessage);
        contextMessages.push(toolMessage);
      }
    }

    // ── Update loop state ──
    loopState.iteration = iteration;
    loopState.updatedAt = new Date().toISOString();
    opts.onLoopState?.(loopState);

    // ── Completion check: no tool calls = done ──
    if (response.finishReason !== "tool_calls") {
      break;
    }
  }

  // ── Finalize ──
  loopState.status = "completed";
  loopState.iteration = iteration;
  loopState.updatedAt = new Date().toISOString();
  opts.onLoopState?.(loopState);

  return {
    messages: visibleMessages,
    finalResponse: lastMeaningfulContent || lastContent,
    iterations: iteration,
  };
}

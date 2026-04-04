import { randomUUID } from "node:crypto";
import type { TranscriptStopReason } from "../../lib/transcript.js";
import type {
  AssembledAssistantTurn,
  AssembledOutputItem,
  NormalizedToolCall,
  ProviderNotice,
  TokenStats,
  ToolCallParseIssue,
  UnifiedToolDefinition,
} from "./types.js";

function createCallId(): string {
  return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (typeof target === "string" && typeof source === "string") {
    return target + source;
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const merged: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }
    return merged;
  }

  return source;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLikelyIncompleteJson(raw: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of raw) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "[") depth++;
    if (char === "}" || char === "]") depth--;
  }

  return inString || depth > 0;
}

export function splitConcatenatedJson(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [""];

  const segments: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let sawRoot = false;

  for (const char of trimmed) {
    current += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") {
      depth++;
      sawRoot = true;
      continue;
    }

    if (char === "}" || char === "]") {
      depth--;
      if (depth === 0 && sawRoot) {
        segments.push(current.trim());
        current = "";
        sawRoot = false;
      }
    }
  }

  if (current.trim().length > 0) {
    return [trimmed];
  }

  return segments.length > 0 ? segments : [trimmed];
}

function createIssue(input: {
  callId?: string;
  toolName?: string;
  code: ToolCallParseIssue["code"];
  message: string;
  rawArguments?: string;
  severity?: ToolCallParseIssue["severity"];
}): ToolCallParseIssue {
  return {
    id: randomUUID(),
    callId: input.callId,
    toolName: input.toolName,
    code: input.code,
    message: input.message,
    rawArguments: input.rawArguments,
    severity: input.severity ?? "error",
  };
}

export function issueToNotice(issue: ToolCallParseIssue): ProviderNotice {
  return {
    level: issue.severity === "warning" ? "warning" : "error",
    code: issue.code,
    toolCallId: issue.callId,
    toolName: issue.toolName,
    message: issue.message,
  };
}

function parseToolArguments(
  rawArguments: string,
  callId: string,
  toolName: string,
): { value?: Record<string, unknown>; issue?: ToolCallParseIssue } {
  const normalized = rawArguments.trim();
  if (!normalized) {
    return { value: {} };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!isPlainObject(parsed)) {
      return {
        issue: createIssue({
          callId,
          toolName,
          code: "non_object_arguments",
          message: `Tool "${toolName}" returned non-object arguments and was skipped.`,
          rawArguments,
        }),
      };
    }
    return { value: parsed };
  } catch {
    return {
      issue: createIssue({
        callId,
        toolName,
        code: isLikelyIncompleteJson(normalized) ? "incomplete_arguments" : "invalid_arguments",
        message: `Tool "${toolName}" emitted malformed arguments and was skipped.`,
        rawArguments,
      }),
    };
  }
}

function normalizeToolCall(
  raw: {
    id?: string;
    name?: string;
    rawArguments?: string;
    index: number;
  },
  registry: Set<string>,
  supportsConcatenatedJsonSplit: boolean,
): { calls: NormalizedToolCall[]; issues: ToolCallParseIssue[] } {
  const callId = raw.id?.trim() || createCallId();
  const toolName = raw.name?.trim();
  const issues: ToolCallParseIssue[] = [];

  if (!toolName) {
    issues.push(createIssue({
      callId,
      code: "missing_tool_name",
      message: `A streamed tool call at index ${raw.index} had no name and was skipped.`,
    }));
    return { calls: [], issues };
  }

  if (registry.size > 0 && !registry.has(toolName)) {
    issues.push(createIssue({
      callId,
      toolName,
      code: "unknown_tool_name",
      message: `Tool "${toolName}" is not registered for this turn and was skipped.`,
      rawArguments: raw.rawArguments,
    }));
    return { calls: [], issues };
  }

  const rawArguments = raw.rawArguments ?? "";
  const segments = supportsConcatenatedJsonSplit ? splitConcatenatedJson(rawArguments) : [rawArguments];
  if (segments.length > 1) {
    issues.push(createIssue({
      callId,
      toolName,
      code: "split_arguments",
      severity: "warning",
      message: `Tool "${toolName}" emitted concatenated JSON arguments and was split into ${segments.length} calls.`,
      rawArguments,
    }));
  }

  const calls: NormalizedToolCall[] = [];
  segments.forEach((segment, segmentIndex) => {
    const parsed = parseToolArguments(segment, callId, toolName);
    if (!parsed.value) {
      if (parsed.issue) issues.push(parsed.issue);
      return;
    }

    calls.push({
      id: segmentIndex === 0 ? callId : createCallId(),
      name: toolName,
      arguments: parsed.value,
      rawArguments: segment,
      index: raw.index,
    });
  });

  return { calls, issues };
}

function dedupeToolCalls(toolCalls: NormalizedToolCall[]): { toolCalls: NormalizedToolCall[]; issues: ToolCallParseIssue[] } {
  const deduped: NormalizedToolCall[] = [];
  const duplicates = new Map<string, { toolCall: NormalizedToolCall; count: number }>();
  const seen = new Set<string>();

  for (const toolCall of toolCalls) {
    const signature = `${toolCall.name}::${JSON.stringify(toolCall.arguments)}`;
    if (seen.has(signature)) {
      const existing = duplicates.get(signature);
      if (existing) {
        existing.count += 1;
      } else {
        duplicates.set(signature, { toolCall, count: 1 });
      }
      continue;
    }
    seen.add(signature);
    deduped.push(toolCall);
  }

  const issues = [...duplicates.values()].map(({ toolCall, count }) => createIssue({
    callId: toolCall.id,
    toolName: toolCall.name,
    code: "duplicate_call_collapsed",
    severity: "warning",
    message: `Collapsed ${count} duplicate tool call(s) for "${toolCall.name}" with identical arguments in the same assistant turn.`,
    rawArguments: toolCall.rawArguments,
  }));

  return { toolCalls: deduped, issues };
}

function collectMessageText(item: AssembledOutputItem): string {
  const parts = Array.isArray(item.content) ? item.content : [];
  let text = "";
  for (const part of parts) {
    if (!isPlainObject(part)) continue;
    const partType = typeof part.type === "string" ? part.type : "";
    if ((partType === "output_text" || partType === "text") && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
}

function collectReasoningText(item: AssembledOutputItem): string {
  const primary = Array.isArray(item.summary) && item.summary.length > 0 ? item.summary : item.content;
  const parts = Array.isArray(primary) ? primary : [];
  let text = "";
  for (const part of parts) {
    if (!isPlainObject(part)) continue;
    if (typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
}

export function finalizeChatCompletionsTurn(input: {
  messageId: string;
  text: string;
  reasoning: string;
  rawToolCalls: Array<{ id?: string; name?: string; rawArguments?: string; index: number }>;
  finishReason: TranscriptStopReason;
  usage?: TokenStats;
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): AssembledAssistantTurn {
  const registry = new Set((input.tools ?? []).map((tool) => tool.name));
  const issues: ToolCallParseIssue[] = [];
  const toolCalls: NormalizedToolCall[] = [];

  for (const rawToolCall of input.rawToolCalls) {
    const normalized = normalizeToolCall(rawToolCall, registry, input.supportsConcatenatedJsonSplit === true);
    issues.push(...normalized.issues);
    toolCalls.push(...normalized.calls);
  }

  const deduped = dedupeToolCalls(toolCalls.sort((left, right) => left.index - right.index));
  issues.push(...deduped.issues);

  return {
    messageId: input.messageId,
    text: input.text,
    reasoning: input.reasoning,
    toolCalls: deduped.toolCalls,
    finishReason: deduped.toolCalls.length > 0 && input.finishReason === "stop" ? "tool_use" : input.finishReason,
    usage: input.usage,
    notices: issues.map(issueToNotice),
    parseIssues: issues,
  };
}

export function finalizeResponsesOutput(input: {
  messageId: string;
  output: AssembledOutputItem[];
  usage?: TokenStats;
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): AssembledAssistantTurn {
  const registry = new Set((input.tools ?? []).map((tool) => tool.name));
  const issues: ToolCallParseIssue[] = [];
  const toolCalls: NormalizedToolCall[] = [];
  let text = "";
  let reasoning = "";

  input.output.forEach((item, index) => {
    switch (item.type) {
      case "message":
        text += collectMessageText(item);
        break;
      case "reasoning":
        reasoning += collectReasoningText(item);
        break;
      case "function_call": {
        const normalized = normalizeToolCall(
          {
            id: typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : undefined,
            name: typeof item.name === "string" ? item.name : undefined,
            rawArguments: typeof item.arguments === "string" ? item.arguments : "",
            index,
          },
          registry,
          input.supportsConcatenatedJsonSplit === true,
        );
        issues.push(...normalized.issues);
        toolCalls.push(...normalized.calls);
        break;
      }
      default:
        break;
    }
  });

  const deduped = dedupeToolCalls(toolCalls.sort((left, right) => left.index - right.index));
  issues.push(...deduped.issues);

  return {
    messageId: input.messageId,
    text,
    reasoning,
    toolCalls: deduped.toolCalls,
    finishReason: deduped.toolCalls.length > 0 ? "tool_use" : "stop",
    usage: input.usage,
    output: input.output,
    notices: issues.map(issueToNotice),
    parseIssues: issues,
  };
}

export function handleResponsesStreamingEvent(
  data: Record<string, unknown>,
  currentOutput: AssembledOutputItem[],
): {
  output: AssembledOutputItem[];
  metadata?: { usage?: Record<string, unknown>; done?: boolean; error?: string; responseId?: string; conversationId?: string };
} {
  const eventType = typeof data.type === "string" ? data.type : "";

  if (eventType === "response.output_item.added") {
    const item = isPlainObject(data.item) ? data.item as AssembledOutputItem : undefined;
    if (!item) return { output: currentOutput };
    return { output: [...currentOutput, item] };
  }

  if (eventType === "response.content_part.added") {
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    const part = isPlainObject(data.part) ? data.part : undefined;
    if (!part || outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    const next = [...currentOutput];
    const item = { ...next[outputIndex]! };
    next[outputIndex] = item;
    const content = Array.isArray(item.content) ? [...item.content] : [];
    content.push(part);
    item.content = content;
    return { output: next };
  }

  if (eventType === "response.reasoning_summary_part.added") {
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    const part = isPlainObject(data.part) ? data.part : undefined;
    if (!part || outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    const next = [...currentOutput];
    const item = { ...next[outputIndex]! };
    next[outputIndex] = item;
    const summary = Array.isArray(item.summary) ? [...item.summary] : [];
    summary.push(part);
    item.summary = summary;
    return { output: next };
  }

  if (eventType.startsWith("response.") && eventType.endsWith(".delta")) {
    const segments = eventType.split(".");
    const deltaType = segments[1] ?? "";
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    const delta = data.delta;
    if (outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    const next = [...currentOutput];
    const item = { ...next[outputIndex]! };
    next[outputIndex] = item;

    if (deltaType === "function_call_arguments" && item.type === "function_call") {
      item.arguments = `${typeof item.arguments === "string" ? item.arguments : ""}${typeof delta === "string" ? delta : ""}`;
      return { output: next };
    }

    if (item.type === "message") {
      const contentIndex = typeof data.content_index === "number" ? data.content_index : 0;
      const content = Array.isArray(item.content) ? [...item.content] : [];
      while (content.length <= contentIndex) {
        content.push({ type: "output_text", text: "" });
      }
      const part: Record<string, unknown> = isPlainObject(content[contentIndex])
        ? { ...content[contentIndex] }
        : { type: "output_text", text: "" };
      content[contentIndex] = part;
      const key = deltaType === "output_text" || deltaType === "text" ? "text" : deltaType;
      part[key] = deepMerge(part[key], delta);
      item.content = content;
      return { output: next };
    }

    if (item.type === "reasoning") {
      if (deltaType === "reasoning_summary_text") {
        const summaryIndex = typeof data.summary_index === "number" ? data.summary_index : 0;
        const summary = Array.isArray(item.summary) ? [...item.summary] : [];
        while (summary.length <= summaryIndex) {
          summary.push({ type: "summary_text", text: "" });
        }
        const part: Record<string, unknown> = isPlainObject(summary[summaryIndex])
          ? { ...summary[summaryIndex] }
          : { type: "summary_text", text: "" };
        summary[summaryIndex] = part;
        part.text = String(deepMerge(part.text ?? "", delta));
        item.summary = summary;
        return { output: next };
      }

      if (deltaType === "reasoning_text") {
        const contentIndex = typeof data.content_index === "number" ? data.content_index : 0;
        const content = Array.isArray(item.content) ? [...item.content] : [];
        while (content.length <= contentIndex) {
          content.push({ type: "reasoning_text", text: "" });
        }
        const part: Record<string, unknown> = isPlainObject(content[contentIndex])
          ? { ...content[contentIndex] }
          : { type: "reasoning_text", text: "" };
        content[contentIndex] = part;
        part.text = String(deepMerge(part.text ?? "", delta));
        item.content = content;
        return { output: next };
      }
    }

    const key = deltaType === "output_text" || deltaType === "text" ? "text" : deltaType;
    item[key] = deepMerge(item[key], delta);
    return { output: next };
  }

  if (eventType === "response.output_item.done") {
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    const item = isPlainObject(data.item) ? data.item as AssembledOutputItem : undefined;
    if (!item) return { output: currentOutput };
    const next = [...currentOutput];
    if (outputIndex >= 0 && outputIndex < next.length) next[outputIndex] = item;
    else next.push(item);
    return { output: next };
  }

  if (eventType.startsWith("response.") && eventType.endsWith(".done")) {
    const segments = eventType.split(".");
    const doneType = segments[1] ?? "";
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    if (outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    if (doneType === "content_part") {
      const part = isPlainObject(data.part) ? data.part : undefined;
      const contentIndex = typeof data.content_index === "number" ? data.content_index : 0;
      if (!part) return { output: currentOutput };
      const next = [...currentOutput];
      const item = { ...next[outputIndex]! };
      next[outputIndex] = item;
      const content = Array.isArray(item.content) ? [...item.content] : [];
      if (contentIndex >= 0 && contentIndex < content.length) {
        content[contentIndex] = part;
        item.content = content;
      }
      return { output: next };
    }

    if (doneType === "reasoning_summary_part") {
      const part = isPlainObject(data.part) ? data.part : undefined;
      const summaryIndex = typeof data.summary_index === "number" ? data.summary_index : 0;
      if (!part) return { output: currentOutput };
      const next = [...currentOutput];
      const item = { ...next[outputIndex]! };
      next[outputIndex] = item;
      const summary = Array.isArray(item.summary) ? [...item.summary] : [];
      if (summaryIndex >= 0 && summaryIndex < summary.length) {
        summary[summaryIndex] = part;
        item.summary = summary;
      }
      return { output: next };
    }
  }

  if (eventType === "response.completed") {
    const response = isPlainObject(data.response) ? data.response : undefined;
    const finalOutput = Array.isArray(response?.output)
      ? response.output.filter((entry): entry is AssembledOutputItem => isPlainObject(entry) && typeof entry.type === "string")
      : currentOutput;
    const conversationId =
      typeof response?.conversation_id === "string"
        ? response.conversation_id
        : typeof response?.conversation === "string"
          ? response.conversation
          : isPlainObject(response?.conversation) && typeof response.conversation.id === "string"
            ? response.conversation.id
            : undefined;
    return {
      output: finalOutput,
      metadata: {
        usage: isPlainObject(response?.usage) ? response!.usage as Record<string, unknown> : undefined,
        done: true,
        responseId: typeof response?.id === "string" ? response.id : undefined,
        conversationId,
      },
    };
  }

  if (eventType === "response.failed") {
    const response = isPlainObject(data.response) ? data.response : undefined;
    const error = isPlainObject(response?.error) && typeof response.error.message === "string"
      ? response.error.message
      : "Responses stream failed.";
    return {
      output: currentOutput,
      metadata: { error },
    };
  }

  return { output: currentOutput };
}

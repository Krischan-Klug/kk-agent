import { randomUUID } from "node:crypto";
import type {
  AssembledOutputItem,
  NormalizedToolCall,
  ToolCallParseIssue,
  UnifiedToolDefinition,
} from "./types.js";
import { isPlainObject } from "./object-utils.js";

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

function createCallId(): string {
  return `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
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

export function normalizeChatCompletionsToolCalls(input: {
  rawToolCalls: Array<{ id?: string; name?: string; rawArguments?: string; index: number }>;
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): { toolCalls: NormalizedToolCall[]; issues: ToolCallParseIssue[] } {
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
  return { toolCalls: deduped.toolCalls, issues };
}

export function normalizeResponsesToolCalls(input: {
  output: AssembledOutputItem[];
  tools?: UnifiedToolDefinition[];
  supportsConcatenatedJsonSplit?: boolean;
}): { toolCalls: NormalizedToolCall[]; issues: ToolCallParseIssue[] } {
  const registry = new Set((input.tools ?? []).map((tool) => tool.name));
  const issues: ToolCallParseIssue[] = [];
  const toolCalls: NormalizedToolCall[] = [];

  input.output.forEach((item, index) => {
    if (item.type !== "function_call") return;
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
  });

  const deduped = dedupeToolCalls(toolCalls.sort((left, right) => left.index - right.index));
  issues.push(...deduped.issues);
  return { toolCalls: deduped.toolCalls, issues };
}

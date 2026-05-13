import type { AssembledOutputItem } from "./types.js";
import { isPlainObject } from "./object-utils.js";

function isAssembledOutputItem(value: unknown): value is AssembledOutputItem {
  return isPlainObject(value) && typeof value.type === "string";
}

function getOutputIndex(data: Record<string, unknown>, currentOutput: AssembledOutputItem[]): number {
  return typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
}

function updateOutputItem(
  currentOutput: AssembledOutputItem[],
  outputIndex: number,
  update: (item: AssembledOutputItem) => void,
): AssembledOutputItem[] {
  if (outputIndex < 0 || outputIndex >= currentOutput.length) return currentOutput;
  const next = [...currentOutput];
  const item = { ...next[outputIndex]! };
  next[outputIndex] = item;
  update(item);
  return next;
}

function appendObjectPart(
  currentOutput: AssembledOutputItem[],
  data: Record<string, unknown>,
  field: "content" | "summary",
): AssembledOutputItem[] {
  const part = isPlainObject(data.part) ? data.part : undefined;
  if (!part) return currentOutput;
  return updateOutputItem(currentOutput, getOutputIndex(data, currentOutput), (item) => {
    const parts = Array.isArray(item[field]) ? [...item[field]] : [];
    parts.push(part);
    item[field] = parts;
  });
}

function replaceObjectPart(
  currentOutput: AssembledOutputItem[],
  data: Record<string, unknown>,
  field: "content" | "summary",
  indexField: "content_index" | "summary_index",
): AssembledOutputItem[] {
  const part = isPlainObject(data.part) ? data.part : undefined;
  const partIndex = typeof data[indexField] === "number" ? data[indexField] : 0;
  if (!part) return currentOutput;
  return updateOutputItem(currentOutput, getOutputIndex(data, currentOutput), (item) => {
    const parts = Array.isArray(item[field]) ? [...item[field]] : [];
    if (partIndex >= 0 && partIndex < parts.length) {
      parts[partIndex] = part;
      item[field] = parts;
    }
  });
}

function mergeTransportValue(target: unknown, source: unknown): unknown {
  if (typeof target === "string" && typeof source === "string") {
    return target + source;
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const merged: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      merged[key] = key in merged ? mergeTransportValue(merged[key], value) : value;
    }
    return merged;
  }

  return source;
}

export function handleResponsesStreamingEvent(
  data: Record<string, unknown>,
  currentOutput: AssembledOutputItem[],
): {
  output: AssembledOutputItem[];
  metadata?: { usage?: Record<string, unknown>; done?: boolean; error?: string; responseId?: string };
} {
  const eventType = typeof data.type === "string" ? data.type : "";

  if (eventType === "response.output_item.added") {
    const item = isPlainObject(data.item) && isAssembledOutputItem(data.item) ? data.item : undefined;
    if (!item) return { output: currentOutput };
    return { output: [...currentOutput, item] };
  }

  if (eventType === "response.content_part.added") {
    return { output: appendObjectPart(currentOutput, data, "content") };
  }

  if (eventType === "response.reasoning_summary_part.added") {
    return { output: appendObjectPart(currentOutput, data, "summary") };
  }

  if (eventType.startsWith("response.") && eventType.endsWith(".delta")) {
    const segments = eventType.split(".");
    const deltaType = segments[1] ?? "";
    const outputIndex = getOutputIndex(data, currentOutput);
    const delta = data.delta;
    if (outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    const next = updateOutputItem(currentOutput, outputIndex, (item) => {
      if (deltaType === "function_call_arguments" && item.type === "function_call") {
        item.arguments = `${typeof item.arguments === "string" ? item.arguments : ""}${typeof delta === "string" ? delta : ""}`;
        return;
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
        part[key] = mergeTransportValue(part[key], delta);
        item.content = content;
        return;
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
          part.text = String(mergeTransportValue(part.text ?? "", delta));
          item.summary = summary;
          return;
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
          part.text = String(mergeTransportValue(part.text ?? "", delta));
          item.content = content;
          return;
        }
      }

      const key = deltaType === "output_text" || deltaType === "text" ? "text" : deltaType;
      item[key] = mergeTransportValue(item[key], delta);
    });
    return { output: next };
  }

  if (eventType === "response.output_item.done") {
    const outputIndex = typeof data.output_index === "number" ? data.output_index : currentOutput.length - 1;
    const item = isPlainObject(data.item) && isAssembledOutputItem(data.item) ? data.item : undefined;
    if (!item) return { output: currentOutput };
    const next = [...currentOutput];
    if (outputIndex >= 0 && outputIndex < next.length) next[outputIndex] = item;
    else next.push(item);
    return { output: next };
  }

  if (eventType.startsWith("response.") && eventType.endsWith(".done")) {
    const segments = eventType.split(".");
    const doneType = segments[1] ?? "";
    const outputIndex = getOutputIndex(data, currentOutput);
    if (outputIndex < 0 || outputIndex >= currentOutput.length) return { output: currentOutput };

    if (doneType === "content_part") {
      return { output: replaceObjectPart(currentOutput, data, "content", "content_index") };
    }

    if (doneType === "reasoning_summary_part") {
      return { output: replaceObjectPart(currentOutput, data, "summary", "summary_index") };
    }
  }

  if (eventType === "response.completed") {
    const response = isPlainObject(data.response) ? data.response : undefined;
    const finalOutput = Array.isArray(response?.output)
      ? response.output.filter((entry): entry is AssembledOutputItem => isPlainObject(entry) && typeof entry.type === "string")
      : currentOutput;
    return {
      output: finalOutput,
      metadata: {
        usage: isPlainObject(response?.usage) ? (response!.usage as Record<string, unknown>) : undefined,
        done: true,
        responseId: typeof response?.id === "string" ? response.id : undefined,
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

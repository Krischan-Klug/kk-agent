import type { SessionState } from "../types.js";
import { getTextContent } from "../../provider/lib/types.js";
import type { LoopMessage } from "../../loop/types.js";

export function generateSessionName(content: string): string {
  const clean = content.trim();
  if (!clean) return "";
  if (clean.length <= 40) return clean.split("\n")[0];
  const cut = clean.slice(0, 40);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
}

export function toLoopMessages(messages: SessionState["messages"]): LoopMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    reasoning: message.reasoning,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  }));
}

export function fromLoopMessages(messages: LoopMessage[]): SessionState["messages"] {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === "string" ? message.content : getTextContent(message.content),
    reasoning: message.reasoning,
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  }));
}

export function mergeMessageDisplayState(
  nextMessages: SessionState["messages"],
  previousMessages: SessionState["messages"],
): SessionState["messages"] {
  return nextMessages.map((message, index) => {
    const previous = previousMessages[index];
    if (!previous || previous.role !== message.role || !previous.attachments?.length) {
      return message;
    }

    return {
      ...message,
      content: previous.content,
      attachments: previous.attachments,
    };
  });
}

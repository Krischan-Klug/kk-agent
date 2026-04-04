import type { SessionState } from "../types.js";
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
  return messages.map((message) => ({ ...message, content: [...message.content] }));
}

export function fromLoopMessages(messages: LoopMessage[]): SessionState["messages"] {
  return messages.map((message) => ({ ...message, content: [...message.content] }));
}

export function mergeMessageDisplayState(
  nextMessages: SessionState["messages"],
  _previousMessages: SessionState["messages"],
): SessionState["messages"] {
  return nextMessages;
}


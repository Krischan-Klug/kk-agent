import type { TranscriptMessage } from "../../lib/transcript.js";

export function generateSessionName(content: string): string {
  const clean = content.trim();
  if (!clean) return "";
  if (clean.length <= 40) return clean.split("\n")[0];
  const cut = clean.slice(0, 40);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
}

export function cloneMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
  return messages.map((message) => ({ ...message, content: [...message.content] }));
}



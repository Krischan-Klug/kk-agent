import { randomUUID } from "node:crypto";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { emitPrompt, waitForResponse, getCurrentSessionId } from "./interaction-store.js";
import type { UserPromptPayload } from "./interaction-store.js";

export async function executeUserInteractionTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  if (toolName !== "ask_user") return null;

  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    return { content: "No active session context for user interaction.", isError: true };
  }

  const question = String(args.question ?? "").trim();
  if (!question) {
    return { content: "question is required", isError: true };
  }

  const choices = args.choices as Array<{ key: string; label: string }> | undefined;
  if (!Array.isArray(choices) || choices.length < 2) {
    return { content: "At least 2 choices are required", isError: true };
  }

  const promptId = randomUUID();
  const payload: UserPromptPayload = { purpose: "question", promptId, question, choices };

  emitPrompt(sessionId, payload);

  return waitForResponse(sessionId, promptId);
}

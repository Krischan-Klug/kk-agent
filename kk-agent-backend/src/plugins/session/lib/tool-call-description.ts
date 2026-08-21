const TOOL_CALL_DESCRIPTION_KEY = "tool_call_description";

function formatToolName(toolName: string): string {
  return toolName
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export function withHarnessToolCallDescription(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const current = input[TOOL_CALL_DESCRIPTION_KEY];
  if (typeof current === "string" && current.trim().length > 0) return input;
  return {
    ...input,
    [TOOL_CALL_DESCRIPTION_KEY]: formatToolName(toolName) || "Tool",
  };
}

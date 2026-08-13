import type { ResolvedLlmRequestConfig } from "../types.js";

export function buildRequestConfigBody(
  resolved: ResolvedLlmRequestConfig | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!resolved) return body;

  const { common } = resolved;
  if (common.reasoningEffort) {
    if (common.endpoint === "responses") {
      body.reasoning = { effort: common.reasoningEffort };
    } else {
      body.reasoning_effort = common.reasoningEffort;
    }
  }
  if (common.temperature !== undefined) body.temperature = common.temperature;
  if (common.topP !== undefined) body.top_p = common.topP;

  return body;
}

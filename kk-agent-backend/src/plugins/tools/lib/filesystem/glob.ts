import { resolve } from "node:path";
import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { globWithRipgrep, isRipgrepAvailable } from "./ripgrep.js";
import { resolveFilesystemPath } from "./path-utils.js";
import { GLOB_RESULT_LIMIT, globToRegex, walkForGlob } from "./search.js";

export async function executeGlob(
  config: McpServerConfig,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const start = resolveFilesystemPath(config, args.path);
  const pattern = String(args.pattern ?? "").trim();
  if (!pattern) throw new Error("pattern is required");

  let results: string[] = [];
  let truncated = false;

  const useRipgrep = await isRipgrepAvailable();
  if (useRipgrep) {
    try {
      const rgResult = await globWithRipgrep({ root: start, pattern, limit: GLOB_RESULT_LIMIT });
      results = rgResult.paths.map((p) => resolve(start, p));
      truncated = rgResult.truncated;
    } catch {
      // fallback to JS traversal
      results = [];
    }
  }

  if (results.length === 0) {
    const manualResults: string[] = [];
    await walkForGlob(start, start, globToRegex(pattern), manualResults);
    results = manualResults;
    truncated = results.length >= GLOB_RESULT_LIMIT;
    if (truncated) results = results.slice(0, GLOB_RESULT_LIMIT);
  }

  const footer = truncated
    ? `\n\n[limit reached - showing first ${GLOB_RESULT_LIMIT} matches]`
    : "";

  return {
    content: (results.length ? results.join("\n") : "No files matched.") + footer,
    isError: false,
    metadata: {
      pattern,
      numFiles: results.length,
      truncated,
    },
  };
}

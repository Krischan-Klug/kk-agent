import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { grepWithRipgrep, isRipgrepAvailable } from "./ripgrep.js";
import { resolveFilesystemPath } from "./path-utils.js";
import { GLOB_RESULT_LIMIT, GREP_RESULT_LIMIT, buildRegex, walkForGrep, type GrepMatch } from "./search.js";

export async function executeGrep(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
  abortSignal?: AbortSignal,
): Promise<ToolCallResult> {
  const pattern = String(args.pattern ?? "").trim();
  if (!pattern) throw new Error("pattern is required");

  const start = resolveFilesystemPath(config, args.path);
  const glob = typeof args.glob === "string" ? args.glob.trim() || undefined : undefined;
  const type = typeof args.type === "string" ? args.type.trim() || undefined : undefined;
  const outputMode =
    typeof args.output_mode === "string" && ["content", "files_with_matches", "count"].includes(args.output_mode)
      ? args.output_mode
      : "files_with_matches";
  const caseSensitive = args.case_sensitive === true;
  const multiline = args.multiline === true;
  const headLimitRaw = typeof args.head_limit === "number" ? Math.max(0, Math.floor(args.head_limit)) : GREP_RESULT_LIMIT;
  const headLimit = headLimitRaw === 0 ? Number.MAX_SAFE_INTEGER : headLimitRaw;
  const offset = typeof args.offset === "number" ? Math.max(0, Math.floor(args.offset)) : 0;

  let results: GrepMatch[] = [];
  let truncated = false;

  const useRipgrep = await isRipgrepAvailable();
  if (useRipgrep) {
    try {
      const rgResult = await grepWithRipgrep({
        root: start,
        pattern,
        glob,
        type,
        outputMode: (outputMode === "count" ? "content" : outputMode) as "content" | "files_with_matches",
        headLimit: outputMode === "files_with_matches" ? GLOB_RESULT_LIMIT : headLimit + offset,
        offset: 0,
        caseSensitive,
        multiline,
        maxResultBytes: 2_000_000,
        abortSignal,
      });
      results = rgResult.matches;
      truncated = rgResult.truncated;
    } catch (error) {
      if (abortSignal?.aborted) throw error;
      results = [];
    }
  }

  if (results.length === 0 && !useRipgrep) {
    const manualResults: GrepMatch[] = [];
    await walkForGrep(
      start,
      start,
      buildRegex(pattern, caseSensitive, multiline),
      glob,
      type,
      multiline,
      manualResults,
      abortSignal,
    );
    results = manualResults;
    truncated = results.length >= GREP_RESULT_LIMIT;
    if (truncated) results = results.slice(0, GREP_RESULT_LIMIT);
  }

  if (results.length === 0) {
    return {
      content: "No matches found.",
      isError: false,
      metadata: { pattern, count: 0 },
    };
  }

  if (outputMode === "count") {
    return {
      content: String(results.length),
      isError: false,
      metadata: { pattern, count: results.length },
    };
  }

  if (outputMode === "files_with_matches") {
    const files = [...new Set(results.map((match) => match.file))];
    const sliced = files.slice(offset, offset + (headLimit === Number.MAX_SAFE_INTEGER ? files.length : headLimit));
    const footer =
      files.length > offset + sliced.length
        ? `\n\n[showing ${sliced.length} of ${files.length} matching files]`
        : "";
    return {
      content: sliced.join("\n") + footer,
      isError: false,
      metadata: {
        pattern,
        numFiles: sliced.length,
        totalFiles: files.length,
        truncated: files.length > offset + sliced.length,
      },
    };
  }

  const sliced = results.slice(offset, offset + (headLimit === Number.MAX_SAFE_INTEGER ? results.length : headLimit));
  const capped = sliced.map((match) => {
    const content = match.content.length > 500 ? match.content.slice(0, 500) + "..." : match.content;
    return `${match.file}:${match.line}: ${content}`;
  });
  const footer =
    results.length > offset + sliced.length
      ? `\n\n[showing ${sliced.length} of ${results.length} matches]`
      : "";

  return {
    content: capped.join("\n") + footer,
    isError: false,
    metadata: {
      pattern,
      count: sliced.length,
      totalMatches: results.length,
      truncated: results.length > offset + sliced.length,
    },
  };
}

import { extname } from "node:path";
import type { InternalToolDefinition } from "../../types.js";
import type { ToolExecutionResult, ToolRuntimeContext } from "../../../loop/types.js";
import {
  getSessionAssetById,
  ingestAsset,
  readAssetData,
} from "../../../session/lib/assets.js";
import { runPythonSandbox, type PythonInputFile } from "./runner.js";
import { PYTHON_DEFAULT_TIMEOUT_SECONDS } from "./config.js";

function readAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))];
}

function safeFilename(filename: string, used: Set<string>): string {
  const normalized = filename.replace(/[<>:"/\\|?*\x00-\x1f]+/gu, "_").trim() || "input";
  const extension = extname(normalized);
  const stem = extension ? normalized.slice(0, -extension.length) : normalized;
  let candidate = normalized;
  let index = 2;
  while (used.has(candidate.toLocaleLowerCase())) candidate = `${stem}-${index++}${extension}`;
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

async function resolveInputFiles(assetIds: string[], context?: ToolRuntimeContext): Promise<PythonInputFile[]> {
  if (assetIds.length === 0) return [];
  if (!context?.sessionId) throw new Error("Python asset inputs require an active session.");
  if (assetIds.length > 8) throw new Error("Python accepts at most 8 input assets.");
  const used = new Set<string>();
  return Promise.all(assetIds.map(async (assetId) => {
    const asset = getSessionAssetById(context.sessionId!, assetId);
    if (!asset) throw new Error(`Asset "${assetId}" was not found in this session.`);
    return { assetId, filename: safeFilename(asset.filename, used), data: await readAssetData(context.sessionId!, assetId) };
  }));
}

function withPublishedAssets(context: ToolRuntimeContext, assetIds: string[]): ToolRuntimeContext {
  const current = Array.isArray(context.values.publishedAssetIds)
    ? context.values.publishedAssetIds.filter((id): id is string => typeof id === "string")
    : [];
  return { ...context, values: { ...context.values, publishedAssetIds: [...new Set([...current, ...assetIds])] } };
}

export async function executePythonTool(
  _config: InternalToolDefinition,
  toolName: string,
  args: Record<string, unknown>,
  context?: ToolRuntimeContext,
): Promise<ToolExecutionResult | null> {
  if (toolName !== "Python") return null;
  try {
    const code = typeof args.code === "string" ? args.code : "";
    const inputFiles = await resolveInputFiles(readAssetIds(args.input_asset_ids), context);
    const timeoutSeconds = typeof args.timeout_seconds === "number" && Number.isFinite(args.timeout_seconds)
      ? args.timeout_seconds
      : PYTHON_DEFAULT_TIMEOUT_SECONDS;
    const execution = await runPythonSandbox(
      code,
      inputFiles,
      timeoutSeconds,
      context?.abortSignal,
      context?.sessionId,
    );
    if (!execution.ok) {
      const inputs = inputFiles.length ? `\nInputs:\n${inputFiles.map((file) => `- ${file.assetId}: /input/${file.filename}`).join("\n")}` : "";
      return {
        content: `Python failed: ${execution.error ?? "Unknown execution error."}${inputs}${execution.stderr.trim() ? `\nStderr:\n${execution.stderr.trim()}` : ""}`,
        isError: true,
        metadata: {
          errorKind: execution.errorKind ?? "execution_error",
          durationMs: execution.durationMs,
          packages: execution.packages,
          inputs: Object.fromEntries(inputFiles.map((file) => [file.assetId, `/input/${file.filename}`])),
        },
      };
    }

    const published = [];
    const skipped = [];
    for (const artifact of execution.artifacts) {
      if (artifact.data.length === 0) {
        skipped.push(`${artifact.filename} (empty)`);
        continue;
      }
      if (!context?.sessionId) {
        skipped.push(`${artifact.filename} (no active session)`);
        continue;
      }
      try {
        published.push(await ingestAsset(context.sessionId, {
          filename: artifact.filename,
          buffer: artifact.data,
          source: "assistant",
        }));
      } catch (error) {
        skipped.push(`${artifact.filename} (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    const sections = [
      "Python execution succeeded.",
      `Duration: ${execution.durationMs} ms`,
      `Packages: ${execution.packages.length ? execution.packages.join(", ") : "standard library only"}`,
      ...(inputFiles.length ? ["Inputs:", ...inputFiles.map((file) => `- ${file.assetId}: /input/${file.filename}`)] : []),
      ...(execution.stdout.trim() ? ["Stdout:", execution.stdout.trim()] : []),
      ...(execution.stderr.trim() ? ["Stderr:", execution.stderr.trim()] : []),
      ...(execution.result !== null ? ["Result:", execution.result] : []),
      ...(published.length ? ["Artifacts:", ...published.map((asset) => `- ${asset.filename} (assetId=${asset.id})`)] : []),
      ...(skipped.length ? ["Skipped outputs:", ...skipped.map((entry) => `- ${entry}`)] : []),
    ];
    const assetIds = published.map((asset) => asset.id);
    return {
      content: sections.join("\n"),
      ...(assetIds.length && context ? { contextModifier: (current) => withPublishedAssets(current, assetIds) } : {}),
      metadata: {
        durationMs: execution.durationMs,
        packages: execution.packages,
        result: execution.result,
        assetIds,
        artifacts: published,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: `Python failed: ${message}`, isError: true, metadata: { errorKind: "invalid_input" } };
  }
}
